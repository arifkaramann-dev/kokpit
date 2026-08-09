/**
 * Renk Stüdyosu — bir ürünün renginde görsel üretir ve ürüne kaydeder.
 *
 * ── Akış ──────────────────────────────────────────────────────────────────
 *   ürün (master) seç  →  rengi üründen gelir
 *     →  AI o renkte objeyi üretir
 *     →  önizle, beğenmezsen yeniden üret
 *     →  bu ürüne ya da o rengin tüm ürünlerine kaydet
 *
 * ── Referans obje ─────────────────────────────────────────────────────────
 * Üretim isteğe bağlı olarak bir REFERANS görselle yapılır. Referans yoksa AI
 * her renkte farklı bir şekil çizer ve katalogda yeşil damla ile magenta damla
 * farklı formda çıkar; müşteri iki kareyi yan yana koyduğunda rengi değil şekil
 * farkını görür. Referans verildiğinde modele "bu objeyi şu renkte üret"
 * denir, şekil ve kompozisyon sabit kalır.
 *
 * Referans objeler `sampleMasters` tablosunda durur ve bir kez kurulur.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { activeImageProvider, generateProductImage } from "../imageProviders";
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

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Geçersiz renk kodu");

/** `data:image/png;base64,AAA...` → { b64, mimeType } */
function splitDataUrl(value: string): { b64: string; mimeType: string } {
  const comma = value.indexOf(",");
  const mimeType = value.slice(5, value.indexOf(";")) || "image/png";
  return { b64: value.slice(comma + 1), mimeType };
}

/**
 * Bitiş türünü modele anlatan sıfat.
 *
 * `colors.finish` bir SATIŞ etiketidir ama görsel üretiminde de karşılığı var:
 * metalik boya pulcuk parıltısıyla, sedef iridesan geçişle, candy derin camsı
 * katmanla görünür. Bunu isteme yazmazsak model hepsini düz boya çizer ve
 * seriler arasındaki fark kaybolur.
 */
const FINISH_HINT: Record<string, string> = {
  duz: "solid gloss finish",
  metalik: "metallic finish with fine aluminium flake sparkle",
  sedef: "pearlescent finish with iridescent colour shift",
  candy: "candy finish, deep translucent glassy layer over a metallic base",
  neon: "vivid fluorescent neon finish",
  seffaf: "translucent clear-tinted finish",
};

export const renkStudyoRouter = router({
  // -------------------------------------------------------------------------
  // Referans objeler
  // -------------------------------------------------------------------------

  /**
   * Üretim yapılandırılmış mı?
   *
   * Ekran bunu açılışta soruyor: sağlayıcı anahtarı yoksa kullanıcı düğmeye
   * basıp hata almadan önce ne eksik olduğunu görmeli.
   */
  status: protectedProcedure.query(() => ({ provider: activeImageProvider() })),

  /** Referans obje listesi — görsel verisi olmadan (liste hafif kalsın). */
  references: protectedProcedure.query(() => db.listSampleMasters()),

  /**
   * Kendi referans fotoğrafını yükle.
   *
   * AI üretiminden önce gelir: elde gerçek bir ürün/numune çekimi varsa
   * referans olarak onu vermek en tutarlı sonucu üretir, çünkü katalogdaki
   * şekil gerçekten var olan şekildir.
   */
  saveReference: protectedProcedure
    .input(
      z.object({
        objectType: objectTypeKey,
        label: z.string().trim().min(1).max(128),
        data: dataUrl,
        baseHex: hex.optional(),
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

  deleteReference: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await db.deleteSampleMaster(input.id);
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Üretim
  // -------------------------------------------------------------------------

  /**
   * Verilen renkte görsel üretir. KAYDETMEZ — data URL döner, kullanıcı
   * önizler ve beğenirse ayrı bir çağrıyla kaydeder.
   *
   * Beğenilmeyen her üretimi veritabanına yazmak kataloğu çöple doldururdu;
   * kaydetme kararı insanın.
   */
  generateForColor: protectedProcedure
    .input(
      z.object({
        hex,
        colorName: z.string().trim().max(128).optional(),
        finish: z.string().trim().max(32).optional(),
        /** Şekli sabitleyen referans obje. Yoksa model serbest çizer. */
        referenceId: z.number().int().positive().nullish(),
        /** Ne çizileceği. Referans varsa da yön vermek için kullanılır. */
        subject: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      const finishHint = input.finish ? FINISH_HINT[input.finish] : undefined;

      const parts = [
        input.subject,
        `painted in the exact colour ${input.hex}`,
        input.colorName ? `(${input.colorName})` : null,
        finishHint,
        "plain pure white background, studio lighting, centred, no text, no watermark, product photography",
      ].filter(Boolean);

      // Referans varsa şekli oradan al, YALNIZ rengi değiştir. Bu cümle
      // olmadan model referansı "ilham" sayıp formu değiştiriyor.
      const prompt = input.referenceId
        ? `Keep the shape, angle, lighting and composition of the reference image exactly as they are. Change ONLY the paint colour: ${parts.join(", ")}.`
        : parts.join(", ");

      let reference: string | null = null;
      if (input.referenceId) {
        const ref = await db.getSampleMasterById(input.referenceId);
        if (!ref?.data) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Referans obje bulunamadı" });
        }
        reference = ref.data;
      }

      try {
        const result = await generateProductImage({
          prompt,
          reference: reference ? splitDataUrl(reference) : null,
        });
        return { data: result.dataUrl, provider: result.provider, prompt };
      } catch (err) {
        // Sağlayıcı mesajı (kota bitti, anahtar geçersiz, içerik reddedildi)
        // kullanıcının görmesi gereken tek bilgi — yutulmaz.
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Görsel üretilemedi",
        });
      }
    }),

  // -------------------------------------------------------------------------
  // Kaydetme
  // -------------------------------------------------------------------------

  /** Görseli TEK bir ürüne kaydeder. */
  saveToMaster: protectedProcedure
    .input(
      z.object({
        masterId: z.number().int().positive(),
        data: dataUrl,
        role: z.string().trim().max(32).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      await db.addMasterImage({
        masterId: input.masterId,
        data: input.data,
        role: input.role ?? "studyo",
      });
      return { added: 1 };
    }),

  /**
   * Görseli o rengin TÜM ürünlerine kaydeder.
   *
   * Bir rengin 30/100/250/500 ml'si aynı görseli kullanır; tek tek eklemek
   * dört kat iş demekti. Aynı görsele sahip ürün atlanır — tekrar çalıştırmak
   * mükerrer satır açmaz.
   */
  saveToColor: protectedProcedure
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
          message: "Bu renge bağlı ürün yok. Önce katalogda bu renkte ürün üretilmeli.",
        });
      }
      return result;
    }),
});
