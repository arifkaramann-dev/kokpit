/**
 * Renk Stüdyosu — renk × ambalaj → pazaryeri kart görseli.
 *
 * ── Hat ───────────────────────────────────────────────────────────────────
 *   1. Numune master'ı   obje tipi başına BİR kez üretilir/yüklenir (bu modül)
 *   2. Renklendirme      master'ın rengi hedefe zorlanır (shared/color/recolor)
 *   3. Kompozisyon       beyaz fon + gerçek ambalaj fotoğrafı + numune + marka
 *   4. Depolama          rengin tüm master ürünlerine bağlanır (masterImages)
 *
 * 2 ve 3 istemcide çalışır: ikisi de canvas gerektirir ve sunucuda canvas yok.
 * Bu modül 1 ve 4'ü yürütür — üretim/saklama ve ürüne bağlama.
 *
 * ── Neden numune master'ı ─────────────────────────────────────────────────
 * Her rengi ayrı ayrı AI'a ürettirmek hem pahalı (renk başına bir çağrı) hem
 * tutarsız: AI her seferinde farklı şekil çiziyor, katalogda yeşil damla ile
 * magenta damla farklı formda çıkıyor ve müşteri rengi değil şekil farkını
 * görüyor. Tek master + matematiksel renklendirme ikisini de çözer.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateImage } from "../_core/imageGeneration";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

/** Data URL biçimi — istemciden gelen her görsel bunu karşılamalı. */
const dataUrl = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Geçersiz görsel verisi");

const objectTypeKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Obje tipi yalnız küçük harf, rakam ve tire içerebilir");

/**
 * Dış adresteki görseli data URL'e çevirir.
 *
 * Neden zorunlu: istemci bu görseli canvas'a çizip `getImageData` ile piksel
 * okuyacak. Çapraz kaynaktan gelen bir görsel canvas'ı "kirletir" ve okuma
 * güvenlik hatasıyla düşer. Kendi sunucumuzdan servis etmek tek yol.
 *
 * Ayrıca kalıcılık: üretim servisinin adresi süreli olabilir, katalog ise
 * kalıcı olmak zorunda.
 */
async function inlineImage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Üretilen görsel indirilemedi (HTTP ${res.status})`,
    });
  }
  const mime = res.headers.get("content-type")?.split(";")[0] || "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export const renkStudyoRouter = router({
  /** Numune master listesi — görsel verisi olmadan (liste hafif kalsın). */
  masters: protectedProcedure.query(() => db.listSampleMasters()),

  /**
   * Kendi numune fotoğrafını yükle.
   *
   * AI üretiminden ÖNCE gelir: elde gerçek bir numune çekimi varsa onu
   * kullanmak her zaman daha iyidir — hem bedava hem markanın gerçek görünümü.
   */
  saveMaster: protectedProcedure
    .input(
      z.object({
        objectType: objectTypeKey,
        label: z.string().trim().min(1).max(128),
        data: dataUrl,
        baseHex: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.saveSampleMaster({
        objectType: input.objectType,
        label: input.label,
        data: input.data,
        baseHex: input.baseHex ?? null,
        prompt: null,
      });
      return { id };
    }),

  /**
   * Numune master'ını AI ile üret.
   *
   * İstem nötr renk ister: master ne kadar nötrse yeniden renklendirme o kadar
   * geniş bir renk aralığında doğal durur. Doymuş bir master'dan çok farklı
   * bir renge gitmek, kaynak rengin izini bırakabilir.
   */
  generateMaster: protectedProcedure
    .input(
      z.object({
        objectType: objectTypeKey,
        label: z.string().trim().min(1).max(128),
        prompt: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const { url } = await generateImage({
        prompt: `${input.prompt}. Neutral mid-grey paint colour, plain pure white background, studio lighting, centred, no text, no watermark, product photography.`,
        quality: "high",
      });
      if (!url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Görsel üretilemedi",
        });
      }
      const data = await inlineImage(url);
      const id = await db.saveSampleMaster({
        objectType: input.objectType,
        label: input.label,
        data,
        baseHex: null,
        prompt: input.prompt,
      });
      return { id };
    }),

  deleteMaster: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.deleteSampleMaster(input.id);
      return { ok: true };
    }),

  /**
   * Üretilen kart görselini rengin TÜM master ürünlerine bağlar.
   *
   * Neden tek tek değil: bir rengin 30/100/250/500 ml'si aynı kart görselini
   * kullanır. `assignImageToColor` aynı görsele sahip master'ı atlar, yani
   * tekrar çalıştırmak mükerrer satır açmaz.
   */
  saveCard: protectedProcedure
    .input(
      z.object({
        colorId: z.number().int().positive(),
        seriesId: z.number().int().positive().nullish(),
        data: dataUrl,
        role: z.string().trim().max(32).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await db.assignImageToColor({
        colorId: input.colorId,
        seriesId: input.seriesId ?? null,
        data: input.data,
        role: input.role ?? "studyo",
      });
      if (result.added === 0 && result.skipped === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Bu renge bağlı master ürün yok. Önce katalogda bu renkte ürün üretilmeli.",
        });
      }
      return result;
    }),
});
