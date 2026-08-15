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
import { IMAGE_MODELS, activeImageProvider, generateProductImage } from "../imageProviders";
import { protectedProcedure, router } from "../_core/trpc";
import { imageUrlOf, masterImagePath } from "../masterFields";
import * as db from "../db";
import { planSocialPosts } from "../socialQueue";
import { colorLabelOf } from "@shared/productName";
import { POST_KIND_LABEL, type PostKind } from "@shared/socialPlan";

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
  status: protectedProcedure.query(() => {
    const provider = activeImageProvider();
    return { provider, models: provider ? IMAGE_MODELS[provider] : [] };
  }),

  /** Referans obje listesi — görsel verisi olmadan (liste hafif kalsın). */
  references: protectedProcedure.query(() => db.listSampleMasters({ kind: "referans" })),

  /**
   * Bir ürünün kayıtlı görselleri — pazarlama karesinin OBJE kaynağı.
   *
   * Şablon üretimi artık üretim adımından ayrı: kullanıcı daha önce
   * kaydettiği bir kareyi seçip şablonları yeniden basabiliyor. Aksi halde
   * yerleşimi değiştirdikten sonra kartları yenilemek için AI'ı tekrar
   * çalıştırmak (ve para harcamak) gerekiyordu.
   *
   * `masterCard` da bu görselleri döner ama yanında lojistik, fiyat ve
   * kimlik hesaplar; stüdyonun ihtiyacı yalnız adres listesi.
   */
  masterImages: protectedProcedure
    .input(z.object({ masterId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await db.listMasterImageRefs(input.masterId);
      return rows
        .map(r => ({
          id: r.id,
          role: r.role ?? null,
          sortOrder: Number(r.sortOrder ?? 0),
          /**
           * Görseli biz mi barındırıyoruz.
           *
           * ŞART: şablon çizimi canvas'tan piksel okuyor (fon beyazlatma, renk
           * ölçümü). Çapraz kaynak bir görsel canvas'ı kirletir ve
           * `getImageData` güvenlik hatası verir — yani pazaryerinden gelen dış
           * adresli bir görsel obje kaynağı olarak KULLANILAMAZ. İstemci bunu
           * bilmeli, hatayı üretim anında görmemeli.
           */
          hosted: r.url == null,
          url: imageUrlOf({ id: r.id, url: r.url ?? null, sortOrder: Number(r.sortOrder ?? 0) }),
        }))
        .filter((r): r is typeof r & { url: string } => !!r.url)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    }),

  /**
   * Şablon varlıkları — kullanıcının yüklediği ambalaj, logo, doku.
   *
   * Referanslardan ayrı listeleniyor: biri üretime girer (şekli sabitler),
   * diğeri karta çizilir. Aynı listede karışırlarsa kullanıcı üretimde
   * logosunu, kartta gümüş bazını seçer.
   */
  assets: protectedProcedure.query(() => db.listSampleMasters({ kind: "gorsel" })),

  saveAsset: protectedProcedure
    .input(
      z.object({
        objectType: objectTypeKey,
        label: z.string().trim().min(1).max(128),
        data: dataUrl,
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.saveSampleMaster({ ...input, kind: "gorsel", prompt: null });
      return { id };
    }),

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

  /**
   * Bir serideki renklerin stüdyo kareleri — palet şablonunun çizdiği görseller.
   *
   * Renk başına tek adres; kimliği değil ADRESİ dönüyoruz ki istemci
   * `/api/img/master/{id}` kurmak zorunda kalmasın ve barındırma yolu
   * değişirse tek yerden değişsin.
   */
  colorImages: protectedProcedure
    .input(z.object({ seriesId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const rows = await db.listColorObjectImages(input.seriesId);
      return rows.map(r => ({ colorId: r.colorId, url: masterImagePath(r.imageId) }));
    }),

  /**
   * Ölçülen renk kodunu katalog rengine yazar.
   *
   * ── Neden ─────────────────────────────────────────────────────────────────
   * Katalogdaki renklerin çoğunun hex'i boştu ("renk kaynağı fotoğraf") ve
   * stüdyo her üretimde rengi obje karesinden ÖLÇÜP atıyordu. Yani renk kodu
   * zaten hesaplanıyor, sadece hiçbir yere yazılmıyordu: künyede "—", palette
   * gri kutu, vitrinde renksiz filtre. Ölçülen değeri bir kez yazmak bütün bu
   * ekranları dolduruyor.
   *
   * Varsayılan olarak yalnız BOŞ hex doldurulur: elle girilmiş bir renk kodu,
   * fotoğraftan ölçülmüş tahminden daha güvenilirdir. Üzerine yazmak açık bir
   * karar (`overwrite`) gerektirir.
   */
  setColorHex: protectedProcedure
    .input(
      z.object({
        colorId: z.number().int().positive(),
        hex,
        /** true: tanımlı hex'in üstüne yaz. */
        overwrite: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const colors = (await db.listColors()) as Array<{ id: number; hex: string | null }>;
      const color = colors.find(c => c.id === input.colorId);
      if (!color) throw new TRPCError({ code: "NOT_FOUND", message: "Renk bulunamadı" });

      const current = color.hex?.trim() || null;
      if (current && !input.overwrite) return { saved: false, hex: current };

      const next = input.hex.toLowerCase();
      if (current === next) return { saved: false, hex: current };

      await db.updateDimension("colors", input.colorId, { hex: next });
      return { saved: true, hex: next };
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
        /**
         * Katalogdaki renk kodu. ZORUNLU DEĞİL.
         *
         * Referans fotoğraf varsa rengin kaynağı odur; hex hiç gerekmez.
         * Katalogdaki birçok rengin hex'i boş olabilir ve bu, boyanın
         * fotoğrafı elimizdeyken üretimi engellememeli.
         */
        hex: hex.optional(),
        colorName: z.string().trim().max(128).optional(),
        finish: z.string().trim().max(32).optional(),
        /**
         * Boyanın referans fotoğrafları — model rengi ve kaplamayı BUNLARDAN
         * okur. Tek kare yanıltabilir (parlama ya da gölge rengi kaydırır),
         * farklı açılardan birkaç kare çok daha güvenilir anlatır.
         */
        referenceImages: z.array(dataUrl).max(6).optional(),
        /**
         * Kayıtlı ŞEKİL referansı — üretilecek objenin formu.
         *
         * Renk referanslarından ayrı tutuluyor ve isteme İLK sırada giriyor:
         * OpenAI düzenleme ucunda ilk görsel yeniden çizilecek olan, sonrakiler
         * bağlam. Hepsini aynı torbaya atınca model hangisinin şekil hangisinin
         * renk olduğunu bilemiyor ve ikisini karıştırıyordu.
         */
        referenceId: z.number().int().positive().nullish(),
        /** Ne çizileceği. Referans varsa da yön vermek için kullanılır. */
        subject: z.string().trim().min(1).max(500),
        /**
         * Serbest ek yönerge — istemin sonuna olduğu gibi eklenir.
         *
         * Hazır kalıplar her durumu karşılamıyor ("daha koyu bir zemin",
         * "üstten çekim", "damla daha küçük olsun"). Kullanıcının modele
         * doğrudan bir şey söyleyebilmesi, her istek için kod değiştirmekten
         * iyidir.
         */
        extra: z.string().trim().max(500).optional(),
        /**
         * Model kimliği. Boşsa sağlayıcının varsayılanı kullanılır.
         *
         * Bilinen listeye karşı DOĞRULANMAZ: sağlayıcı yeni bir model
         * çıkardığında kod değişmeden kullanılabilsin. Tanınmayan bir kimlik
         * gelirse hatayı sağlayıcı verir ve mesajı kullanıcıya ulaşır.
         */
        model: z
          .string()
          .trim()
          .max(64)
          .regex(/^[a-z0-9][a-z0-9.\-]*$/i, "Geçersiz model kimliği")
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const finishHint = input.finish ? FINISH_HINT[input.finish] : undefined;

      const colourRefs = input.referenceImages ?? [];

      let shapeRef: string | null = null;
      if (input.referenceId) {
        const ref = await db.getSampleMasterById(input.referenceId);
        if (!ref?.data) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Referans obje bulunamadı" });
        }
        shapeRef = ref.data;
      }

      // Şekil referansı İLK sırada: düzenleme ucunda ilk görsel yeniden
      // çizilecek olan, sonrakiler bağlam.
      const refs = shapeRef ? [shapeRef, ...colourRefs] : [...colourRefs];

      // İki farklı istem, çünkü iki farklı soru soruluyor.
      //
      // Referans VARSA rengin kaynağı referanstır, hex değil: boyanın gerçek
      // fotoğrafı, katalogdaki hex kodunun anlatamadığı şeyi (pulcuk çakması,
      // açıyla derinleşme, kaplamanın dokusu) taşır. Hex yalnız destekleyici
      // ipucu olarak veriliyor; çelişirse referans kazanmalı.
      //
      // Referans YOKSA elimizdeki tek bilgi hex ve kaplama etiketi.
      if (!refs.length && !input.hex) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Renk kaynağı yok: ya boyanın referans fotoğrafını yükle ya da rengin hex kodunu tanımla.",
        });
      }

      // Referans varken kaplama İDDİA EDİLMEZ.
      //
      // Buradaki ilk hâli modele önce "kaplamayı referanstan oku" diyor, sonra
      // iki cümle aşağıda "kaplama düz parlaktır" diye dayatıyordu. Katalogdaki
      // `finish` alanı yanlış olabiliyor (SKU'su candy olan bir ürünün alanı
      // `duz` kalmış olabilir) ve o yanlış değer referansın önüne geçiyordu.
      //
      // Kural: referans varsa renk de kaplama da referanstan gelir. Katalog
      // bilgisi yalnız "ipucu" olarak ve açıkça ikincil olduğu söylenerek
      // geçer; çelişirse referans kazanır.
      const catalogue = [
        input.colorName ? `named ${input.colorName}` : null,
        input.hex ? `catalogue colour ${input.hex}` : null,
        finishHint ? `catalogue finish "${finishHint}"` : null,
      ].filter(Boolean);

      const hint = catalogue.length
        ? [
            `For context only, the catalogue lists this paint as ${catalogue.join(", ")}.`,
            "The catalogue may be out of date — if it disagrees with the reference images, follow the reference images.",
          ]
        : [];

      // Şekil referansı varsa görsellerin ROLLERİ açıkça söylenir; yoksa
      // hepsi renk kaynağıdır. Model "birinci görsel şu, kalanlar bu" diye
      // duymazsa ikisini karıştırıp referans şekli de rengi de yok sayıyor.
      const roles = shapeRef
        ? [
            "The FIRST image is the object to reproduce: keep its shape, silhouette, camera angle, framing and lighting exactly as they are.",
            colourRefs.length
              ? "The REMAINING images show the target paint. Identify its exact colour and finish from them and apply that paint to the object from the first image. Change ONLY the paint."
              : "Change ONLY the paint colour of that object.",
          ]
        : [
            "Look at the reference images and identify the exact paint colour and finish of the painted surface.",
            `Generate a photorealistic studio photograph of ${input.subject} painted in that exact colour and finish.`,
          ];

      const prompt = refs.length
        ? [
            ...roles,
            "Match the hue, saturation, lightness, metallic flake and depth of the reference paint as closely as possible.",
            ...hint,
            "White seamless studio background, professional automotive catalogue lighting with large softboxes,",
            "sharp elongated highlights along the body, visible clearcoat depth. No text, no watermark, no people.",
          ].join(" ")
        : [
            input.subject,
            `painted in the exact colour ${input.hex}`,
            input.colorName ? `(${input.colorName})` : null,
            finishHint,
            "plain pure white background, studio lighting, centred, no text, no watermark, product photography",
          ]
            .filter(Boolean)
            .join(", ");

      // Ek yönerge EN SONA: sonraki talimat öncekini ezdiği için, kullanıcının
      // sözü hazır kalıpların üstünde kalsın.
      const finalPrompt = input.extra ? `${prompt} ${input.extra}` : prompt;

      try {
        const result = await generateProductImage({
          prompt: finalPrompt,
          references: refs.map(splitDataUrl),
          model: input.model ?? null,
        });
        return {
          data: result.dataUrl,
          provider: result.provider,
          model: result.model,
          prompt: finalPrompt,
        };
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
  // Şablon yerleşimleri
  // -------------------------------------------------------------------------

  /**
   * Kullanıcının düzenlediği yerleşimler.
   *
   * Yalnız DÜZENLENMİŞ olanlar dönüyor; dokunulmamış şablonlar istemcideki
   * fabrika tarifinden geliyor. Böylece varsayılan tasarım iyileştiğinde
   * kullanıcının hiç açmadığı şablonlar da kendiliğinden iyileşir.
   */
  layouts: protectedProcedure.query(() => db.listTemplateLayouts()),

  saveLayout: protectedProcedure
    .input(
      z.object({
        templateId: z.string().trim().min(1).max(64),
        /**
         * Yerleşim tarifi.
         *
         * Şeması sunucuda doğrulanmıyor: katman türleri ve özellikleri
         * evriliyor ve her eklemede sunucu şemasını da güncellemek, iki yerin
         * birbirinden kayması demek. Çizen taraf istemci; tanımadığı katmanı
         * atlıyor, bozuk yerleşim kartı çökertmiyor.
         */
        layout: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.saveTemplateLayout(input.templateId, input.layout);
      return { id };
    }),

  resetLayout: protectedProcedure
    .input(z.object({ templateId: z.string().trim().min(1).max(64) }))
    .mutation(async ({ input }) => {
      await db.deleteTemplateLayout(input.templateId);
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Kaydetme
  // -------------------------------------------------------------------------

  /**
   * Birden çok görseli TEK ürüne kaydeder.
   *
   * Altı pazarlama karesini tek tek kaydettirmek, her renk için altı tıklama
   * demekti. Sıra korunuyor: `role` alanına şablon kimliği yazıldığı için
   * hangi karenin hangi şablondan geldiği sonradan da belli.
   */
  saveManyToMaster: protectedProcedure
    .input(
      z.object({
        masterId: z.number().int().positive(),
        images: z
          .array(z.object({ data: dataUrl, role: z.string().trim().max(32).optional() }))
          .min(1)
          .max(20),
        /**
         * Aynı roldeki eski kareleri SİL.
         *
         * Şablon düzeltilip kareler yeniden basıldığında eskisinin yanına
         * eklemek ürün kartını her denemede şişiriyor ve hangisinin güncel
         * olduğunu belirsizleştiriyordu. Rol başına tek güncel kare.
         */
        replaceSameRole: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      let replaced = 0;
      if (input.replaceSameRole) {
        const roles = Array.from(
          new Set(input.images.map(i => i.role).filter((r): r is string => !!r)),
        );
        replaced = await db.deleteMasterImagesByRole(input.masterId, roles);
      }
      for (const img of input.images) {
        await db.addMasterImage({
          masterId: input.masterId,
          data: img.data,
          role: img.role ?? "studyo",
        });
      }
      return { added: input.images.length, replaced };
    }),

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

  /* ---- Düzenli Instagram kuyruğu ---------------------------------------- */

  /**
   * Kuyruk — planlanan, onaylanan ve paylaşılan gönderiler.
   *
   * Kare verisi DÖNMEZ, yalnız adresi: kuyruk ekranı otuz gönderi
   * listeliyor ve her birinin base64'ünü taşımak megabaytlarca veri demekti.
   */
  socialQueue: protectedProcedure.query(async () => {
    const [posts, colors, series] = await Promise.all([
      db.listSocialPosts(60),
      db.listColors(),
      db.listProductSeries(),
    ]);
    const colorById = new Map(
      (colors as { id: number; name: string; nameEn: string | null }[]).map(c => [c.id, c]),
    );
    const seriesById = new Map((series as { id: number; name: string }[]).map(s => [s.id, s]));
    return (posts as Record<string, unknown>[]).map(p => ({
      id: p.id as number,
      kind: p.kind as PostKind,
      status: p.status as "taslak" | "onaylandi" | "paylasildi" | "atlandi",
      plannedFor: String(p.plannedFor ?? ""),
      masterId: (p.masterId as number | null) ?? null,
      seriesId: (p.seriesId as number | null) ?? null,
      colorId: (p.colorId as number | null) ?? null,
      caption: (p.caption as string | null) ?? null,
      hashtags: (p.hashtags as string | null) ?? null,
      imageUrl: p.imageId != null ? masterImagePath(p.imageId as number) : null,
      storyImageUrl: p.storyImageId != null ? masterImagePath(p.storyImageId as number) : null,
      kindLabel: POST_KIND_LABEL[p.kind as PostKind],
      colorLabel: colorLabelOf(colorById.get((p.colorId as number) ?? -1)),
      seriesName: seriesById.get((p.seriesId as number) ?? -1)?.name ?? null,
    }));
  }),

  /**
   * Kuyruğu ileriye doğru doldurur — planlayıcının da çağırdığı işin aynısı.
   *
   * ── Neden ileriye ─────────────────────────────────────────────────────────
   * Yalnız bugünü planlamak, sunucu uykudayken geçen bir günü telafi
   * edemiyor (Render ücretsiz planda süreç uyuyabiliyor). İleriye doğru
   * planlamak kuyruğu görünür de yapıyor: kullanıcı önümüzdeki iki haftada
   * ne paylaşacağını bugünden görüyor ve beğenmediğini atlıyor.
   *
   * İdempotent: aynı gün+tip için ikinci kayıt açılmaz.
   */
  planSocialQueue: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(60).default(21) }).default({ days: 21 }))
    .mutation(({ input }) => planSocialPosts(input.days)),

  /** Gönderi metnini/durumunu günceller — onay, atlama, elle düzeltme. */
  updateSocialPost: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["taslak", "onaylandi", "paylasildi", "atlandi"]).optional(),
        caption: z.string().max(2200).nullable().optional(),
        hashtags: z.string().max(600).nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const post = await db.getSocialPost(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Gönderi bulunamadı" });
      const data: Record<string, unknown> = {};
      if (input.caption !== undefined) data.caption = input.caption;
      if (input.hashtags !== undefined) data.hashtags = input.hashtags;
      if (input.status !== undefined) {
        data.status = input.status;
        // "Paylaşıldı" zamanı ölçüt: haftada kaç post gittiğini gösteren tek
        // veri bu. Geri alınırsa (taslağa dönerse) damga da silinir.
        data.postedAt = input.status === "paylasildi" ? new Date() : null;
      }
      await db.updateSocialPost(input.id, data);
      return { ok: true };
    }),

  /**
   * Üretilen kareyi gönderiye bağlar.
   *
   * Kare `masterImages` tarafında yaşıyor; kuyruk yalnız kimliğini tutuyor.
   * İki yerde saklansaydı biri güncellenip diğeri eskirdi.
   */
  attachSocialImage: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        data: dataUrl,
        /** Story karesi mi kare gönderi mi. */
        story: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const post = await db.getSocialPost(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Gönderi bulunamadı" });
      if (post.masterId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Gönderinin ürünü yok." });
      }
      const imageId = await db.addMasterImage({
        masterId: post.masterId,
        data: input.data,
        role: input.story ? "sosyal-story" : "sosyal",
      });
      await db.updateSocialPost(input.id, input.story ? { storyImageId: imageId } : { imageId });
      return { imageId };
    }),
});
