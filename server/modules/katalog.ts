/**
 * Katalog v3 router'ı — Master / Listing / ChannelListing ve kapasite.
 *
 * Eski `products` router'ı yerinde kalır; bu modül yanına kurulur ki geçiş
 * sırasında çalışan sistem bozulmasın. İş mantığının tamamı saf fonksiyonlarda
 * (catalogPlan, catalogCodes, capacity); burada yalnız veri okuma/yazma var.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  bottleneckReport,
  computeCapacity,
  listingQty,
  type CapacityFormula,
  type CapacityMaterial,
  type MaterialType,
} from "../capacity";
import { buildChannelBarcode, buildChannelSku } from "../catalogCodes";
import { cubeKey, planListings, planMasters, type Readiness } from "../catalogPlan";
import { generateContentBlock, templateContentBlock } from "../contentAi";
import { computeMasterCosts, marginOf } from "../costing";
import { planFormulaBindings, type MatchableFormula } from "../formulaMatch";
import {
  pickBlock,
  planContentBlocks,
  resolveListingContent,
  type ContentBlockLike,
} from "../listingContent";
import { masterHealth, rollupBySeries } from "../masterHealth";
import { planProduction, resolveOrderLines } from "../productionPlan";
import { planPublications, summarizeSkips } from "../publishPlan";
import { GENERIC_USE_CASE_CODE, seedCatalogDimensions } from "../seedCatalog";

/** productSeries JSON alanındaki {label,value} veya düz metin dizisini çözer. */
function parseStringArray(value: unknown): string[] {
  let arr: unknown[] = [];
  if (Array.isArray(value)) arr = value;
  else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      return [];
    }
  }
  return arr
    .map(x =>
      x && typeof x === "object"
        ? String((x as Record<string, unknown>).label ?? (x as Record<string, unknown>).value ?? "").trim()
        : String(x).trim(),
    )
    .filter(Boolean);
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Kapasite hesabı için gereken her şeyi tek seferde okur.
 * 5.000 kalemde tam yeniden hesap milisaniyeler sürer; artımlı
 * geçersizleştirme kurmak bu ölçekte gereksiz karmaşıklık olur.
 */
async function loadCapacityInputs() {
  const [materials, formulas, formulaInputs, packagings, packagingInputs, masters] =
    await Promise.all([
      db.listMaterials(),
      db.listFormulas(),
      db.listFormulaInputs(),
      db.listPackagings(),
      db.listPackagingInputs(),
      db.listMasterProducts(),
    ]);

  const inputsByFormula = new Map<number, { inputMaterialId: number; qtyPerBase: number }[]>();
  for (const fi of formulaInputs as { formulaId: number; inputMaterialId: number; qtyPerBase: string }[]) {
    inputsByFormula.set(fi.formulaId, [
      ...(inputsByFormula.get(fi.formulaId) ?? []),
      { inputMaterialId: fi.inputMaterialId, qtyPerBase: num(fi.qtyPerBase) },
    ]);
  }

  const packInputsById = new Map<number, { materialId: number; qtyPerUnit: number }[]>();
  for (const pi of packagingInputs as { packagingId: number; materialId: number; qtyPerUnit: string }[]) {
    packInputsById.set(pi.packagingId, [
      ...(packInputsById.get(pi.packagingId) ?? []),
      { materialId: pi.materialId, qtyPerUnit: num(pi.qtyPerUnit) },
    ]);
  }

  return {
    materials: (materials as Record<string, unknown>[]).map(
      (m): CapacityMaterial => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as MaterialType) ?? "hammadde",
        stockQty: m.stockQty as string,
        reservedQty: m.reservedQty as string,
        safetyQty: m.safetyQty as string,
      }),
    ),
    formulas: (formulas as Record<string, unknown>[]).map(
      (f): CapacityFormula => ({
        id: f.id as number,
        outputType: f.outputType as "yari_mamul" | "mamul",
        outputMaterialId: (f.outputMaterialId as number | null) ?? null,
        baseQty: f.baseQty as string,
        wastePercent: f.wastePercent as string,
        inputs: inputsByFormula.get(f.id as number) ?? [],
      }),
    ),
    packagings: (packagings as Record<string, unknown>[]).map(p => ({
      id: p.id as number,
      materialId: (p.materialId as number | null) ?? null,
      inputs: packInputsById.get(p.id as number) ?? [],
    })),
    masters: (masters as Record<string, unknown>[]).map(m => ({
      id: m.id as number,
      formulaId: (m.formulaId as number | null) ?? null,
      formulaScale: m.formulaScale as string,
      packagingId: (m.packagingId as number | null) ?? null,
    })),
    rawMasters: masters as Record<string, unknown>[],
    rawMaterials: materials as Record<string, unknown>[],
  };
}

export const katalogRouter = router({
  /* ---- Boyutlar --------------------------------------------------------- */

  dimensions: protectedProcedure.query(async () => {
    const [colors, families, packagings, useCases, channels, sp, sf] = await Promise.all([
      db.listColors(),
      db.listProductFamilies(),
      db.listPackagings(),
      db.listUseCases(),
      db.listSalesChannels(),
      db.listSeriesPackagings(),
      db.listSeriesFamilies(),
    ]);
    return { colors, families, packagings, useCases, channels, seriesPackagings: sp, seriesFamilies: sf };
  }),

  /**
   * Boyutları şirketin mevcut sözlüğünden tohumlar (seriler, şablonlar,
   * hammadde kayıtları). Idempotent — tekrar çalıştırmak zarar vermez.
   */
  seedDimensions: protectedProcedure.mutation(() => seedCatalogDimensions()),

  /**
   * Boyut ekleme/düzenleme — Tanımlar sayfası. Renk, ambalaj, form ve kullanım
   * alanı artık TEK kaynak; eskiden aynı sözlük hem Şablonlar'da hem burada
   * duruyor ve senkron olmuyordu.
   */
  saveDimension: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["colors", "families", "packagings", "useCases"]),
        id: z.number().nullable().optional(),
        code: z.string().min(1),
        name: z.string().min(1),
        // Renk
        hex: z.string().nullable().optional(),
        finish: z.enum(["duz", "metalik", "sedef", "candy", "neon", "seffaf"]).optional(),
        seriesId: z.number().nullable().optional(),
        // Ambalaj
        volumeMl: z.number().min(0).optional(),
        materialId: z.number().nullable().optional(),
        // Form / ambalaj SKU eki
        skuSegment: z.string().nullable().optional(),
        // Kullanım alanı
        titlePattern: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { kind, id, ...rest } = input;
      const data: Record<string, unknown> = { code: rest.code.trim(), name: rest.name.trim() };
      if (rest.sortOrder !== undefined) data.sortOrder = rest.sortOrder;
      if (rest.isActive !== undefined) data.isActive = rest.isActive ? 1 : 0;
      if (kind === "colors") {
        data.hex = rest.hex ?? null;
        if (rest.finish) data.finish = rest.finish;
        data.seriesId = rest.seriesId ?? null;
      }
      if (kind === "packagings") {
        if (rest.volumeMl !== undefined) data.volumeMl = String(rest.volumeMl);
        data.materialId = rest.materialId ?? null;
        data.skuSegment = rest.skuSegment ?? null;
      }
      if (kind === "families") data.skuSegment = rest.skuSegment ?? null;
      if (kind === "useCases") data.titlePattern = rest.titlePattern ?? null;

      if (id) {
        await db.updateDimension(kind, id, data);
        return { id };
      }
      return { id: await db.createDimension(kind, data) };
    }),

  /** Kullanımdaki boyut silinemez — küp koordinatını öksüz bırakırdı. */
  deleteDimension: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["colors", "families", "packagings", "useCases"]),
        id: z.number(),
      }),
    )
    .mutation(async ({ input }) => {
      const used = await db.countDimensionUsage(input.kind, input.id);
      if (used > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bu tanım ${used} kayıtta kullanılıyor — önce onları değiştirin. Silmek yerine "pasif" yapabilirsiniz.`,
        });
      }
      await db.deleteDimension(input.kind, input.id);
      return { ok: true };
    }),

  seriesCompatibility: protectedProcedure
    .input(
      z.object({
        seriesId: z.number(),
        packagingIds: z.array(z.number()),
        familyIds: z.array(z.number()),
      }),
    )
    .mutation(async ({ input }) => {
      await db.setSeriesPackagings(input.seriesId, input.packagingIds);
      await db.setSeriesFamilies(input.seriesId, input.familyIds);
      return { ok: true };
    }),

  /* ---- Master üretimi --------------------------------------------------- */

  /**
   * Seyrek küpün kesişiminden master üretir. `dryRun` ile önce ne olacağını
   * gösterir — 24.300 kayıt açma kazasının önündeki asıl koruma budur.
   */
  generateMasters: protectedProcedure
    .input(
      z.object({
        seriesIds: z.array(z.number()).default([]),
        readiness: z.array(z.enum(["konsantre", "r2u"])).default(["konsantre"]),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(5000).default(2000),
      }),
    )
    .mutation(async ({ input }) => {
      const [series, colors, families, packagings, sp, sf, existing] = await Promise.all([
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
        db.listSeriesPackagings(),
        db.listSeriesFamilies(),
        db.listMasterProducts(),
      ]);

      const packBySeries = new Map<number, number[]>();
      for (const r of sp as { seriesId: number; packagingId: number }[]) {
        packBySeries.set(r.seriesId, [...(packBySeries.get(r.seriesId) ?? []), r.packagingId]);
      }
      const famBySeries = new Map<number, number[]>();
      for (const r of sf as { seriesId: number; familyId: number }[]) {
        famBySeries.set(r.seriesId, [...(famBySeries.get(r.seriesId) ?? []), r.familyId]);
      }

      const planSeries = (series as { id: number; name: string; prefix: string | null }[])
        .filter(s => (packBySeries.get(s.id)?.length ?? 0) > 0 && (famBySeries.get(s.id)?.length ?? 0) > 0)
        .map(s => ({
          id: s.id,
          name: s.name,
          prefix: s.prefix,
          packagingIds: packBySeries.get(s.id) ?? [],
          familyIds: famBySeries.get(s.id) ?? [],
          readiness: input.readiness as Readiness[],
        }));

      if (planSeries.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Hiçbir serinin ambalaj/form uyumluluğu tanımlı değil. Önce 'Boyutları Tohumla' çalıştırın.",
        });
      }

      const plan = planMasters({
        series: planSeries,
        colors: (colors as { id: number; code: string; name: string; seriesId: number | null }[]).map(c => ({
          id: c.id,
          code: c.code,
          name: c.name,
          seriesId: c.seriesId,
        })),
        families: families as never,
        packagings: (packagings as { id: number; code: string; name: string; skuSegment: string | null; volumeMl: string }[]).map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          skuSegment: p.skuSegment,
          volumeMl: num(p.volumeMl),
        })),
        existingKeys: new Set(
          (existing as Record<string, unknown>[]).map(m =>
            cubeKey({
              seriesId: m.seriesId as number,
              colorId: m.colorId as number,
              familyId: m.familyId as number,
              packagingId: m.packagingId as number,
              readiness: m.readiness as Readiness,
            }),
          ),
        ),
        onlySeriesIds: input.seriesIds,
      });

      if (plan.conflicts.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Kod çakışması: ${plan.conflicts
            .slice(0, 3)
            .map(c => c.internalSku)
            .join(", ")} — seri ön eki veya ambalaj SKU eki tekrar ediyor.`,
        });
      }

      if (input.dryRun) {
        return {
          dryRun: true,
          willCreate: plan.create.length,
          alreadyExists: plan.existing.length,
          sample: plan.create.slice(0, 20).map(m => m.internalSku),
          created: 0,
        };
      }

      if (plan.create.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${plan.create.length} master çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      let created = 0;
      for (const m of plan.create) {
        await db.createMasterProduct({
          seriesId: m.seriesId,
          colorId: m.colorId,
          familyId: m.familyId,
          packagingId: m.packagingId,
          readiness: m.readiness,
          baseCode: m.baseCode,
          internalSku: m.internalSku,
          formulaScale: String(m.formulaScale),
          status: "taslak",
        } as never);
        created++;
      }
      return { dryRun: false, willCreate: plan.create.length, alreadyExists: plan.existing.length, created, sample: [] };
    }),

  masters: protectedProcedure.query(() => db.listMasterProducts()),

  /* ---- İlan üretimi ----------------------------------------------------- */

  /**
   * Master × kullanım alanı matrisinden ilan üretir. Kimlik
   * (masterId, useCaseId) olduğu için ikinci çalıştırma mükerrer açmaz —
   * eski varyant üreticisinin sil-ve-yeniden-aç yaklaşımı tam da bu yüzden
   * pazaryeri bağlarını koparıyordu.
   */
  generateListings: protectedProcedure
    .input(
      z.object({
        masterIds: z.array(z.number()).default([]),
        useCaseIds: z.array(z.number()).default([]),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, series, colors, families, packagings, useCases, existing] = await Promise.all([
        db.listMasterProducts(),
        db.listProductSeries(),
        db.listColors(),
        db.listProductFamilies(),
        db.listPackagings(),
        db.listUseCases(),
        db.listListings(),
      ]);

      const generic = (useCases as { id: number; code: string }[]).find(
        u => u.code === GENERIC_USE_CASE_CODE,
      );
      if (!generic) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "'Genel' kullanım alanı yok — önce 'Boyutları Tohumla' çalıştırın.",
        });
      }

      const nameById = <T extends { id: number; name: string }>(rows: unknown) =>
        new Map((rows as T[]).map(r => [r.id, r.name]));
      const seriesName = nameById(series);
      const colorName = nameById(colors);
      const familyName = nameById(families);
      const packagingName = nameById(packagings);

      const wanted = input.masterIds.length ? new Set(input.masterIds) : null;
      const contexts = (masters as Record<string, unknown>[])
        .filter(m => !wanted || wanted.has(m.id as number))
        .map(m => ({
          masterId: m.id as number,
          seriesName: seriesName.get(m.seriesId as number) ?? null,
          colorName: colorName.get(m.colorId as number) ?? null,
          familyName: familyName.get(m.familyId as number) ?? null,
          packagingName: packagingName.get(m.packagingId as number) ?? null,
        }));

      const chosenUseCases = (useCases as { id: number; code: string; name: string; titlePattern: string | null }[])
        .filter(u => u.id === generic.id || !input.useCaseIds.length || input.useCaseIds.includes(u.id));

      const plan = planListings({
        masters: contexts,
        useCases: chosenUseCases,
        genericUseCaseId: generic.id,
        existingKeys: new Set(
          (existing as { masterId: number; useCaseId: number }[]).map(l => `${l.masterId}:${l.useCaseId}`),
        ),
      });

      if (input.dryRun) {
        return {
          dryRun: true,
          willCreate: plan.create.length,
          willUpdate: plan.update.length,
          created: 0,
          sample: plan.create.slice(0, 20).map(l => l.title),
        };
      }

      // İçerik: blok → seri şablonu zinciriyle çözülür ve ilanın kendi
      // koordinatıyla kişiselleştirilir. Eskiden buraya yalnız başlık ve slug
      // yazılıyordu; ilanlar boş gövdeyle açılıyordu.
      const blocks = (await db.listContentBlocks()) as unknown as ContentBlockLike[];
      const masterById = new Map(masters.map(m => [m.id as number, m]));
      const seriesById = new Map(
        (series as Record<string, unknown>[]).map(s => [s.id as number, s]),
      );
      const colorNameById = nameById(colors);
      const familyNameById = nameById(families);
      const packagingNameById = nameById(packagings);
      const useCaseNameById = nameById(useCases);

      let created = 0;
      let withContent = 0;
      for (const l of plan.create) {
        const m = masterById.get(l.masterId);
        const s = m ? seriesById.get(m.seriesId as number) : undefined;
        const vars = {
          marka: "Artofcolour",
          seri: s ? String(s.name ?? "") : null,
          renk: m ? (colorNameById.get(m.colorId as number) ?? null) : null,
          form: m ? (familyNameById.get(m.familyId as number) ?? null) : null,
          ambalaj: m ? (packagingNameById.get(m.packagingId as number) ?? null) : null,
          kullanim: l.isPrimary ? null : (useCaseNameById.get(l.useCaseId) ?? null),
        };
        const content = resolveListingContent({
          block: m
            ? pickBlock(blocks, {
                seriesId: m.seriesId as number,
                useCaseId: l.useCaseId,
                familyId: m.familyId as number,
              })
            : null,
          series: s
            ? {
                shortDescription: (s.shortDescription as string | null) ?? null,
                longDescription: (s.longDescription as string | null) ?? null,
                applicationText: (s.applicationText as string | null) ?? null,
                labelTemplate: (s.labelTemplate as string | null) ?? null,
              }
            : null,
          vars,
        });
        if (content.source !== "yok") withContent++;

        await db.createListing({
          masterId: l.masterId,
          useCaseId: l.useCaseId,
          title: l.title,
          slug: l.slug,
          isPrimary: l.isPrimary ? 1 : 0,
          shortDescription: content.shortDescription,
          longDescription: content.longDescription,
          applicationText: content.applicationText,
          status: "taslak",
        } as never);
        created++;
      }
      return {
        dryRun: false,
        willCreate: plan.create.length,
        willUpdate: plan.update.length,
        created,
        withContent,
        sample: [],
      };
    }),

  /* ---- İçerik blokları --------------------------------------------------- */

  contentBlocks: protectedProcedure.query(async () => {
    const [blocks, series, useCases, families] = await Promise.all([
      db.listContentBlocks(),
      db.listProductSeries(),
      db.listUseCases(),
      db.listProductFamilies(),
    ]);
    const sName = new Map((series as { id: number; name: string }[]).map(s => [s.id, s.name]));
    const uName = new Map((useCases as { id: number; name: string }[]).map(u => [u.id, u.name]));
    const fName = new Map((families as { id: number; name: string }[]).map(f => [f.id, f.name]));
    return (blocks as Record<string, unknown>[]).map(b => ({
      id: b.id as number,
      seriesId: b.seriesId as number,
      useCaseId: b.useCaseId as number,
      familyId: (b.familyId as number | null) ?? null,
      seriesName: sName.get(b.seriesId as number) ?? "?",
      useCaseName: uName.get(b.useCaseId as number) ?? "?",
      familyName: b.familyId != null ? (fName.get(b.familyId as number) ?? "?") : null,
      shortDescription: (b.shortDescription as string | null) ?? null,
      longDescription: (b.longDescription as string | null) ?? null,
      applicationText: (b.applicationText as string | null) ?? null,
      labelText: (b.labelText as string | null) ?? null,
      titlePattern: (b.titlePattern as string | null) ?? null,
      source: b.source as string,
      generatedAt: b.generatedAt as Date | null,
    }));
  }),

  /**
   * İçerik bloklarını üretir. AI seri × kullanım alanı başına BİR KEZ çağrılır;
   * metin renk/ambalajdan bağımsız yazdırılıp değişkenle kişiselleştirilir.
   * Böylece 63 çağrı binlerce ilanı doldurur — eski akış varyant başına
   * çağırdığı için 85 varyantta timeout'a giriyordu.
   */
  generateContentBlocks: protectedProcedure
    .input(
      z.object({
        seriesIds: z.array(z.number()).default([]),
        regenerate: z.boolean().default(false),
        perFamily: z.boolean().default(false),
        useAi: z.boolean().default(true),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(200).default(80),
      }),
    )
    .mutation(async ({ input }) => {
      const [masters, blocks, listings, series, useCases, families, sp] = await Promise.all([
        db.listMasterProducts(),
        db.listContentBlocks(),
        db.listListings(),
        db.listProductSeries(),
        db.listUseCases(),
        db.listProductFamilies(),
        db.listSeriesPackagings(),
      ]);

      // Hangi master hangi kullanım alanlarında ilanlanmış — blok yalnız
      // gerçekten kullanılan kombinasyonlar için üretilir, boşa AI çağrılmaz.
      const useCasesByMaster = new Map<number, Set<number>>();
      for (const l of listings as { masterId: number; useCaseId: number }[]) {
        const set = useCasesByMaster.get(l.masterId) ?? new Set<number>();
        set.add(l.useCaseId);
        useCasesByMaster.set(l.masterId, set);
      }
      const allUseCaseIds = (useCases as { id: number }[]).map(u => u.id);
      const wantedSeries = input.seriesIds.length ? new Set(input.seriesIds) : null;

      const planInput = (masters as Record<string, unknown>[])
        .filter(m => !wantedSeries || wantedSeries.has(m.seriesId as number))
        .map(m => ({
          seriesId: m.seriesId as number,
          familyId: m.familyId as number,
          // İlan açılmamışsa tüm kullanım alanları aday sayılır — içerik önce
          // hazırlanıp sonra ilan üretmek doğru sıra.
          useCaseIds: Array.from(useCasesByMaster.get(m.id as number) ?? new Set(allUseCaseIds)),
        }));

      const todo = planContentBlocks({
        masters: planInput,
        existing: blocks as unknown as ContentBlockLike[],
        regenerate: input.regenerate,
        perFamily: input.perFamily,
      });

      if (input.dryRun) {
        return { dryRun: true, willGenerate: todo.length, generated: 0, aiFailed: 0 };
      }
      if (todo.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${todo.length} blok çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      const sById = new Map((series as Record<string, unknown>[]).map(s => [s.id as number, s]));
      const uById = new Map((useCases as { id: number; name: string }[]).map(u => [u.id, u]));
      const fById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));
      const packBySeries = new Map<number, number[]>();
      for (const r of sp as { seriesId: number; packagingId: number }[]) {
        packBySeries.set(r.seriesId, [...(packBySeries.get(r.seriesId) ?? []), r.packagingId]);
      }

      let generated = 0;
      let aiFailed = 0;
      for (const t of todo) {
        const s = sById.get(t.seriesId);
        const u = uById.get(t.useCaseId);
        if (!s || !u) continue;
        const ctx = {
          seriesName: String(s.name ?? ""),
          seriesNotes: (s.notes as string | null) ?? null,
          useCaseName: u.name,
          familyName: t.familyId != null ? (fById.get(t.familyId)?.name ?? null) : null,
          surfaces: parseStringArray(s.applicationSurfaces),
        };

        // AI başarısız olursa şablona düşülür — hiçbir ilan boş kalmasın.
        const ai = input.useAi ? await generateContentBlock(ctx) : null;
        if (input.useAi && !ai) aiFailed++;
        const content = ai ?? templateContentBlock(ctx);

        await db.upsertContentBlock(t, {
          ...content,
          source: ai ? "ai" : "sablon",
          generatedAt: new Date(),
        });
        generated++;
      }
      return { dryRun: false, willGenerate: todo.length, generated, aiFailed };
    }),

  saveContentBlock: protectedProcedure
    .input(
      z.object({
        seriesId: z.number(),
        useCaseId: z.number(),
        familyId: z.number().nullable().optional(),
        titlePattern: z.string().nullable().optional(),
        shortDescription: z.string().nullable().optional(),
        longDescription: z.string().nullable().optional(),
        applicationText: z.string().nullable().optional(),
        labelText: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { seriesId, useCaseId, familyId, ...content } = input;
      const id = await db.upsertContentBlock(
        { seriesId, useCaseId, familyId: familyId ?? null },
        { ...content, source: "elle" },
      );
      return { id };
    }),

  listings: protectedProcedure.query(() => db.listListings()),

  /* ---- Kanal yayını ----------------------------------------------------- */

  /**
   * İlanı bir kanalda yayına hazırlar. Pazaryeri SKU'su ve barkodu BURADA
   * bir kez üretilip saklanır; gönderim anında yeniden hesaplanmaz — türetme
   * kuralı değişirse tüm eşleşmeler kalıcı kopar.
   */
  publishListing: protectedProcedure
    .input(
      z.object({
        listingId: z.number(),
        channelId: z.number(),
        channelCategoryId: z.string().nullable().optional(),
        price: z.number().min(0).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      const [listings, channels, existing] = await Promise.all([
        db.listListings(),
        db.listSalesChannels(),
        db.listChannelListings(),
      ]);
      const listing = (listings as { id: number; masterId: number }[]).find(l => l.id === input.listingId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "İlan bulunamadı" });
      const channel = (channels as { id: number; code: string }[]).find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const already = (existing as { listingId: number; channelId: number }[]).find(
        c => c.listingId === input.listingId && c.channelId === input.channelId,
      );
      if (already) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bu ilan zaten bu kanalda yayında." });
      }

      // Mükerrer ilan kilidi: aynı master, aynı kanal, aynı kategori.
      const clash = (existing as { masterId: number; channelId: number; channelCategoryId: string | null }[]).find(
        c =>
          c.masterId === listing.masterId &&
          c.channelId === input.channelId &&
          (c.channelCategoryId ?? null) === (input.channelCategoryId ?? null),
      );
      if (clash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Bu ürünün bu kanalda aynı kategoride ilanı zaten var. Pazaryerleri aynı kategorideki mükerrer ilanı yaptırıma tabi tutar — farklı kategori seçin.",
        });
      }

      const seq = await db.nextChannelSequence();
      const id = await db.createChannelListing({
        listingId: input.listingId,
        masterId: listing.masterId,
        channelId: input.channelId,
        channelSku: buildChannelSku(channel.code, seq),
        channelBarcode: buildChannelBarcode(seq),
        channelCategoryId: input.channelCategoryId ?? null,
        price: String(input.price),
        syncState: "kirli",
        status: "taslak",
      } as never);
      return { id, channelSku: buildChannelSku(channel.code, seq), channelBarcode: buildChannelBarcode(seq) };
    }),

  channelListings: protectedProcedure.query(() => db.listChannelListings()),

  /** Kullanım alanı × kanal → pazaryeri kategorisi. Toplu yayının ön koşulu. */
  channelCategories: protectedProcedure.query(() => db.listUseCaseChannelCategories()),

  setChannelCategory: protectedProcedure
    .input(
      z.object({
        useCaseId: z.number(),
        channelId: z.number(),
        categoryId: z.string().min(1),
        categoryName: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const id = await db.setUseCaseChannelCategory(
        input.useCaseId,
        input.channelId,
        input.categoryId.trim(),
        input.categoryName ?? null,
      );
      return { id };
    }),

  /**
   * Toplu kanal yayını. Tek tek açmak 500 master × 3 ilan × 2 kanal = 3.000
   * tıklama demekti.
   *
   * Kodlar burada bir kez üretilip saklanır; gönderimde yeniden hesaplanmaz.
   * Mükerrer ilan kilidi (master × kanal × kategori) plan aşamasında önden
   * yakalanır ki toplu işlem ortasında veritabanı hatasına düşmesin.
   */
  bulkPublish: protectedProcedure
    .input(
      z.object({
        channelId: z.number(),
        seriesIds: z.array(z.number()).default([]),
        includeUnbuildable: z.boolean().default(false),
        dryRun: z.boolean().default(true),
        limit: z.number().min(1).max(3000).default(1000),
      }),
    )
    .mutation(async ({ input }) => {
      const [listings, masters, existing, categories, channels] = await Promise.all([
        db.listListings(),
        db.listMasterProducts(),
        db.listChannelListings(),
        db.listUseCaseChannelCategories(),
        db.listSalesChannels(),
      ]);
      const channel = (channels as { id: number; code: string }[]).find(c => c.id === input.channelId);
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Kanal bulunamadı" });

      const wantedSeries = input.seriesIds.length ? new Set(input.seriesIds) : null;
      const masterRows = (masters as Record<string, unknown>[]).filter(
        m => !wantedSeries || wantedSeries.has(m.seriesId as number),
      );
      const allowedMasters = new Set(masterRows.map(m => m.id as number));

      const plan = planPublications({
        listings: (listings as Record<string, unknown>[])
          .filter(l => allowedMasters.has(l.masterId as number))
          .map(l => ({
            id: l.id as number,
            masterId: l.masterId as number,
            useCaseId: l.useCaseId as number,
            status: l.status as "taslak" | "aktif" | "arsiv",
            // Boş gövdeli ilan pazaryerine gönderilemez.
            hasContent: !!(
              (l.shortDescription as string | null)?.trim() ||
              (l.longDescription as string | null)?.trim()
            ),
          })),
        masters: masterRows.map(m => ({
          id: m.id as number,
          status: m.status as "taslak" | "aktif" | "arsiv",
          basePrice: num(m.basePrice),
          buildableQty: Number(m.buildableQty ?? 0),
        })),
        existing: (existing as Record<string, unknown>[]).map(e => ({
          listingId: e.listingId as number,
          masterId: e.masterId as number,
          channelId: e.channelId as number,
          channelCategoryId: (e.channelCategoryId as string | null) ?? null,
        })),
        channelId: input.channelId,
        categoryOf: new Map(
          (categories as { useCaseId: number; channelId: number; categoryId: string }[])
            .filter(c => c.channelId === input.channelId)
            .map(c => [c.useCaseId, c.categoryId]),
        ),
        includeUnbuildable: input.includeUnbuildable,
      });

      if (input.dryRun) {
        return {
          dryRun: true,
          willPublish: plan.create.length,
          published: 0,
          skipped: summarizeSkips(plan.skip),
        };
      }
      if (plan.create.length > input.limit) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${plan.create.length} yayın çok fazla (sınır ${input.limit}). Seri seçimini daraltın.`,
        });
      }

      let seq = await db.nextChannelSequence();
      let published = 0;
      for (const c of plan.create) {
        await db.createChannelListing({
          listingId: c.listingId,
          masterId: c.masterId,
          channelId: c.channelId,
          channelSku: buildChannelSku(channel.code, seq),
          channelBarcode: buildChannelBarcode(seq),
          channelCategoryId: c.channelCategoryId,
          price: String(c.price),
          syncState: "kirli",
          status: "taslak",
        } as never);
        seq++;
        published++;
      }
      return {
        dryRun: false,
        willPublish: plan.create.length,
        published,
        skipped: summarizeSkips(plan.skip),
      };
    }),

  /* ---- Kapasite --------------------------------------------------------- */

  /**
   * Üretilebilir adedi hesaplar, master'lara yazar ve miktarı değişen
   * yayınları kirli işaretler. Kirli satırları işçi toplu gönderir.
   */
  recomputeCapacity: protectedProcedure
    .input(z.object({ persist: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);

      const capById = new Map(
        data.rawMasters.map(m => [m.id as number, Number(m.virtualStockCap ?? 10)]),
      );
      const prevById = new Map(data.rawMasters.map(m => [m.id as number, Number(m.buildableQty ?? 0)]));

      // Yalnız ilana yazılacak SAYI değişenler kirlenir: tavan sayesinde
      // kapasite 600'den 40'a düşse bile ilan 10'da kalır, gönderim gerekmez.
      const dirtyMasters = report.masters
        .filter(m => {
          const cap = capById.get(m.masterId) ?? 10;
          return listingQty(m.buildable, cap) !== listingQty(prevById.get(m.masterId) ?? 0, cap);
        })
        .map(m => m.masterId);

      let written = 0;
      let dirtied = 0;
      if (input.persist) {
        written = await db.writeBuildableQty(
          report.masters.map(m => ({ masterId: m.masterId, buildable: m.buildable })),
        );
        dirtied = await db.markChannelListingsDirty(dirtyMasters);
      }

      return {
        masters: report.masters.length,
        written,
        dirtied,
        cycles: report.cycles,
        zeroed: report.masters.filter(m => m.buildable <= 0).length,
        bottlenecks: bottleneckReport(report).slice(0, 20),
      };
    }),

  /** Darboğaz raporu — hangi kalemi almazsan kaç ürünün önü tıkalı. */
  bottlenecks: protectedProcedure.query(async () => {
    const data = await loadCapacityInputs();
    const report = computeCapacity(data);
    const unitCost = new Map(
      data.rawMaterials.map(m => [m.id as number, num(m.unitCost)]),
    );
    return bottleneckReport(report).map(r => ({
      ...r,
      unitCost: unitCost.get(r.materialId) ?? 0,
    }));
  }),

  /** Bir master'ın kapasitesi ve darboğazı (ürün kartı için). */
  capacityOf: protectedProcedure
    .input(z.object({ masterId: z.number() }))
    .query(async ({ input }) => {
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);
      const row = report.masters.find(m => m.masterId === input.masterId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Master bulunamadı" });
      return row;
    }),

  /* ---- Hammadde rezervasyonu -------------------------------------------- */

  /**
   * Sipariş için hammadde rezerve eder. Atomik WHERE koşulu aşırı satış
   * kalkanıdır: yetmezse rezerv açılmaz ve eksik kalemler bildirilir.
   * Sipariş yine de kabul edilir (müşteri kaybedilmez), yalnız işaretlenir.
   */
  reserveForOrder: protectedProcedure
    .input(
      z.object({
        items: z.array(z.object({ masterId: z.number(), qty: z.number().positive() })).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const data = await loadCapacityInputs();
      const formulaById = new Map(data.formulas.map(f => [f.id, f]));
      const masterById = new Map(data.masters.map(m => [m.id, m]));
      const packById = new Map(data.packagings.map(p => [p.id, p]));
      const matName = new Map(data.materials.map(m => [m.id, m.name]));

      // Master başına hammadde ihtiyacını topla (aynı kalem birden çok üründe).
      const need = new Map<number, number>();
      for (const item of input.items) {
        const master = masterById.get(item.masterId);
        if (!master?.formulaId) continue;
        const f = formulaById.get(master.formulaId);
        if (!f) continue;
        const waste = Math.min(Math.max(num(f.wastePercent), 0), 99);
        const scale = num(master.formulaScale) || 1;
        for (const inp of f.inputs) {
          const per = (num(inp.qtyPerBase) * scale) / (1 - waste / 100);
          need.set(inp.inputMaterialId, (need.get(inp.inputMaterialId) ?? 0) + per * item.qty);
        }
        const pack = master.packagingId != null ? packById.get(master.packagingId) : undefined;
        if (pack?.materialId != null) {
          need.set(pack.materialId, (need.get(pack.materialId) ?? 0) + item.qty);
        }
        for (const pi of pack?.inputs ?? []) {
          need.set(pi.materialId, (need.get(pi.materialId) ?? 0) + num(pi.qtyPerUnit) * item.qty);
        }
      }

      const reserved: { materialId: number; qty: number }[] = [];
      const short: { materialId: number; name: string; qty: number }[] = [];
      for (const [materialId, qty] of Array.from(need.entries())) {
        if (qty <= 0) continue;
        const ok = await db.reserveMaterial(materialId, qty);
        if (ok) reserved.push({ materialId, qty });
        else short.push({ materialId, name: matName.get(materialId) ?? `#${materialId}`, qty });
      }

      // Kısmi rezervasyon bırakma: bir kalem yetmediyse hepsini geri aç ki
      // yarım rezerv başka siparişlerin kapasitesini boşuna kilitlemesin.
      if (short.length > 0) {
        for (const r of reserved) await db.releaseMaterial(r.materialId, r.qty);
        return { ok: false, reserved: 0, short };
      }
      return { ok: true, reserved: reserved.length, short: [] };
    }),

  releaseForOrder: protectedProcedure
    .input(z.object({ items: z.array(z.object({ materialId: z.number(), qty: z.number().positive() })) }))
    .mutation(async ({ input }) => {
      for (const i of input.items) await db.releaseMaterial(i.materialId, i.qty);
      return { released: input.items.length };
    }),

  /* ---- Reçeteler (çok seviyeli BOM) ------------------------------------- */

  /** Reçeteler + girdileri + hangi master'lara bağlı oldukları. */
  formulas: protectedProcedure.query(async () => {
    const [formulas, inputs, masters] = await Promise.all([
      db.listFormulas(),
      db.listFormulaInputs(),
      db.listMasterProducts(),
    ]);
    type InputRow = { id: number; formulaId: number; inputMaterialId: number; qtyPerBase: string };
    const byFormula = new Map<number, InputRow[]>();
    for (const i of inputs as InputRow[]) {
      byFormula.set(i.formulaId, [...(byFormula.get(i.formulaId) ?? []), i]);
    }
    const usage = new Map<number, number>();
    for (const m of masters as { formulaId: number | null }[]) {
      if (m.formulaId != null) usage.set(m.formulaId, (usage.get(m.formulaId) ?? 0) + 1);
    }
    return formulas.map(f => ({
      id: f.id,
      name: f.name,
      outputType: f.outputType,
      outputMaterialId: f.outputMaterialId,
      seriesId: f.seriesId,
      colorId: f.colorId,
      familyId: f.familyId,
      readiness: f.readiness,
      baseQty: f.baseQty,
      baseUnit: f.baseUnit,
      wastePercent: f.wastePercent,
      notes: f.notes,
      inputs: byFormula.get(f.id) ?? [],
      masterCount: usage.get(f.id) ?? 0,
    }));
  }),

  saveFormula: protectedProcedure
    .input(
      z.object({
        id: z.number().nullable().optional(),
        name: z.string().min(1),
        outputType: z.enum(["yari_mamul", "mamul"]).default("mamul"),
        outputMaterialId: z.number().nullable().optional(),
        seriesId: z.number().nullable().optional(),
        colorId: z.number().nullable().optional(),
        familyId: z.number().nullable().optional(),
        readiness: z.enum(["konsantre", "r2u"]).nullable().optional(),
        baseQty: z.number().positive().default(1000),
        baseUnit: z.string().default("ml"),
        wastePercent: z.number().min(0).max(99).default(0),
        notes: z.string().nullable().optional(),
        inputs: z
          .array(
            z.object({
              inputMaterialId: z.number(),
              qtyPerBase: z.number().min(0),
              note: z.string().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input }) => {
      if (input.outputType === "yari_mamul" && !input.outputMaterialId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Yarı mamul reçetesi hangi kalemi ürettiğini bildirmeli — çıktı kalemini seçin.",
        });
      }
      // Kendi kendini besleyen reçete BOM'da sonsuz döngü demektir.
      if (
        input.outputType === "yari_mamul" &&
        input.inputs.some(i => i.inputMaterialId === input.outputMaterialId)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reçete kendi çıktısını girdi olarak kullanamaz (döngü).",
        });
      }

      const payload = {
        name: input.name.trim(),
        outputType: input.outputType,
        outputMaterialId: input.outputType === "yari_mamul" ? input.outputMaterialId : null,
        seriesId: input.seriesId ?? null,
        colorId: input.colorId ?? null,
        familyId: input.familyId ?? null,
        readiness: input.readiness ?? null,
        baseQty: String(input.baseQty),
        baseUnit: input.baseUnit,
        wastePercent: String(input.wastePercent),
        notes: input.notes ?? null,
      };

      const id = input.id
        ? (await db.updateFormula(input.id, payload as never), input.id)
        : await db.createFormula(payload as never);
      await db.setFormulaInputs(id, input.inputs);
      return { id };
    }),

  /**
   * Master'ları koordinatına uyan reçeteye bağlar ve ambalaj hacminden ölçeği
   * hesaplar. 5.000 master'ı elle bağlamak gerçekçi olmadığı için gerekli;
   * en özel reçete kazanır (renk bazlı > seri bazlı).
   */
  bindFormulas: protectedProcedure
    .input(z.object({ rebindExisting: z.boolean().default(false), dryRun: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const [formulas, masters, packagings] = await Promise.all([
        db.listFormulas(),
        db.listMasterProducts(),
        db.listPackagings(),
      ]);
      const volumeById = new Map(
        (packagings as { id: number; volumeMl: string }[]).map(p => [p.id, num(p.volumeMl)]),
      );

      const plan = planFormulaBindings({
        masters: (masters as Record<string, unknown>[]).map(m => ({
          id: m.id as number,
          seriesId: m.seriesId as number,
          colorId: m.colorId as number,
          familyId: m.familyId as number,
          readiness: m.readiness as Readiness,
          packagingVolumeMl: volumeById.get(m.packagingId as number) ?? 0,
          currentFormulaId: (m.formulaId as number | null) ?? null,
        })),
        formulas: (formulas as Record<string, unknown>[]).map(
          (f): MatchableFormula => ({
            id: f.id as number,
            outputType: f.outputType as "yari_mamul" | "mamul",
            seriesId: (f.seriesId as number | null) ?? null,
            colorId: (f.colorId as number | null) ?? null,
            familyId: (f.familyId as number | null) ?? null,
            readiness: (f.readiness as Readiness | null) ?? null,
            baseQty: num(f.baseQty),
          }),
        ),
        rebindExisting: input.rebindExisting,
      });

      if (input.dryRun) {
        return { dryRun: true, bound: 0, willBind: plan.bindings.length, unmatched: plan.unmatched.length };
      }
      for (const b of plan.bindings) {
        await db.updateMasterProduct(b.masterId, {
          formulaId: b.formulaId,
          formulaScale: String(b.formulaScale),
        } as never);
      }
      return {
        dryRun: false,
        bound: plan.bindings.length,
        willBind: plan.bindings.length,
        unmatched: plan.unmatched.length,
      };
    }),

  /* ---- Ürün takibi ------------------------------------------------------ */

  /**
   * Ürün listesi + takip sütunları: eksikler · getiri (maliyet/marj) ·
   * hedef pazar (açılmış ilanlar) · pazarlama fırsatı (açılmamış kullanım
   * alanı ve kanal).
   *
   * Tek uçta toplanıyor çünkü hepsi aynı veriden türüyor; ayrı ayrı
   * sorgulamak aynı tabloları defalarca okumak olurdu.
   */
  trackList: protectedProcedure.query(async () => {
    const [listings, channelListings, useCases, channels, colors, packagings, series, families, listingImages] =
      await Promise.all([
        db.listListings(),
        db.listChannelListings(),
        db.listUseCases(),
        db.listSalesChannels(),
        db.listColors(),
        db.listPackagings(),
        db.listProductSeries(),
        db.listProductFamilies(),
        db.listListingImages(),
      ]);
    const data = await loadCapacityInputs();

    const costs = computeMasterCosts({
      masters: data.masters,
      materials: data.rawMaterials.map(m => ({
        id: m.id as number,
        name: String(m.name ?? ""),
        type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
        unitCost: (m.unitCost as string) ?? 0,
      })),
      formulas: data.formulas,
      packagings: data.packagings,
    });
    const costById = new Map(costs.map(c => [c.masterId, c]));

    const imageCount = new Map<number, number>();
    for (const img of listingImages as { listingId: number }[]) {
      imageCount.set(img.listingId, (imageCount.get(img.listingId) ?? 0) + 1);
    }

    const healthListings = (listings as Record<string, unknown>[]).map(l => ({
      id: l.id as number,
      masterId: l.masterId as number,
      useCaseId: l.useCaseId as number,
      title: String(l.title ?? ""),
      shortDescription: (l.shortDescription as string | null) ?? null,
      longDescription: (l.longDescription as string | null) ?? null,
      status: l.status as "taslak" | "aktif" | "arsiv",
      imageCount: imageCount.get(l.id as number) ?? 0,
    }));
    const healthChannels = (channelListings as Record<string, unknown>[]).map(c => ({
      listingId: c.listingId as number,
      masterId: c.masterId as number,
      channelId: c.channelId as number,
      status: c.status as "taslak" | "canli" | "durduruldu",
    }));

    // Fiyat: master'ın taban fiyatı; kanalda özel fiyat varsa en yükseği.
    const priceByMaster = new Map<number, number>();
    for (const m of data.rawMasters) priceByMaster.set(m.id as number, num(m.basePrice));
    for (const c of channelListings as { masterId: number; price: string }[]) {
      const p = num(c.price);
      if (p > (priceByMaster.get(c.masterId) ?? 0)) priceByMaster.set(c.masterId, p);
    }

    const allUseCaseIds = (useCases as { id: number }[]).map(u => u.id);
    const allChannelIds = (channels as { id: number }[]).map(c => c.id);
    const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
    const packById = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p]));
    const seriesById = new Map((series as { id: number; name: string }[]).map(s => [s.id, s]));
    const familyById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));

    const rows = data.rawMasters.map(m => {
      const masterId = m.id as number;
      const cost = costById.get(masterId);
      const price = priceByMaster.get(masterId) ?? 0;
      const health = masterHealth({
        master: {
          id: masterId,
          formulaId: (m.formulaId as number | null) ?? null,
          buildableQty: Number(m.buildableQty ?? 0),
          gtin: (m.gtin as string | null) ?? null,
          status: m.status as "taslak" | "aktif" | "arsiv",
        },
        listings: healthListings,
        channelListings: healthChannels,
        allUseCaseIds,
        allChannelIds,
        costKnown: (cost?.totalCost ?? 0) > 0 && (cost?.unknownInputs.length ?? 0) === 0,
        hasPrice: price > 0,
      });
      const color = colorById.get(m.colorId as number);
      return {
        masterId,
        internalSku: String(m.internalSku ?? ""),
        seriesId: m.seriesId as number,
        series: seriesById.get(m.seriesId as number)?.name ?? null,
        family: familyById.get(m.familyId as number)?.name ?? null,
        packaging: packById.get(m.packagingId as number)?.name ?? null,
        colorName: color?.name ?? null,
        colorHex: color?.hex ?? null,
        readiness: String(m.readiness ?? "konsantre"),
        status: String(m.status ?? "taslak"),
        buildable: Number(m.buildableQty ?? 0),
        cost: cost?.totalCost ?? 0,
        unknownInputs: cost?.unknownInputs ?? [],
        price,
        ...marginOf(price, cost?.totalCost ?? 0),
        health,
      };
    });

    return {
      rows: rows.sort((a, b) => a.health.score - b.health.score),
      series: rollupBySeries(
        rows.map(r => ({ seriesId: r.seriesId, health: r.health, buildable: r.buildable })),
      ).map(s => ({ ...s, seriesName: seriesById.get(s.seriesId)?.name ?? `#${s.seriesId}` })),
      useCases,
      channels,
    };
  }),

  /** Tek master'ın kartı — künye, reçete, kapasite, ilanlar, fiyat tek yerde. */
  masterCard: protectedProcedure
    .input(z.object({ masterId: z.number() }))
    .query(async ({ input }) => {
      const master = await db.getMasterProduct(input.masterId);
      if (!master) throw new TRPCError({ code: "NOT_FOUND", message: "Ürün bulunamadı" });

      const [listings, channelListings, useCases, channels, colors, packagings, series, families, formulas, formulaInputs] =
        await Promise.all([
          db.listListingsByMaster(input.masterId),
          db.listChannelListings(),
          db.listUseCases(),
          db.listSalesChannels(),
          db.listColors(),
          db.listPackagings(),
          db.listProductSeries(),
          db.listProductFamilies(),
          db.listFormulas(),
          db.listFormulaInputs(),
        ]);
      const data = await loadCapacityInputs();
      const report = computeCapacity(data);
      const capacity = report.masters.find(r => r.masterId === input.masterId) ?? null;

      const [cost] = computeMasterCosts({
        masters: data.masters.filter(m => m.id === input.masterId),
        materials: data.rawMaterials.map(m => ({
          id: m.id as number,
          name: String(m.name ?? ""),
          type: (m.type as "hammadde" | "yari_mamul" | "ambalaj" | "masraf") ?? "hammadde",
          unitCost: (m.unitCost as string) ?? 0,
        })),
        formulas: data.formulas,
        packagings: data.packagings,
      });

      const formula = master.formulaId
        ? (formulas as Record<string, unknown>[]).find(f => f.id === master.formulaId)
        : null;
      const matName = new Map(data.rawMaterials.map(m => [m.id as number, String(m.name ?? "")]));
      const recipe = formula
        ? (formulaInputs as { formulaId: number; inputMaterialId: number; qtyPerBase: string }[])
            .filter(i => i.formulaId === formula.id)
            .map(i => ({
              materialId: i.inputMaterialId,
              name: matName.get(i.inputMaterialId) ?? `#${i.inputMaterialId}`,
              qtyPerBase: num(i.qtyPerBase),
              // Bu master için gerçek birim ihtiyaç (ambalaj hacmiyle ölçekli).
              qtyPerUnit: num(i.qtyPerBase) * num(master.formulaScale),
            }))
        : [];

      const myChannels = (channelListings as Record<string, unknown>[]).filter(
        c => c.masterId === input.masterId,
      );
      const usedUseCases = new Set((listings as { useCaseId: number }[]).map(l => l.useCaseId));

      const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
      return {
        master,
        identity: {
          series: (series as { id: number; name: string }[]).find(s => s.id === master.seriesId)?.name ?? null,
          family: (families as { id: number; name: string }[]).find(f => f.id === master.familyId)?.name ?? null,
          packaging: (packagings as { id: number; name: string; volumeMl: string }[]).find(p => p.id === master.packagingId) ?? null,
          color: colorById.get(master.colorId) ?? null,
        },
        formula: formula ? { id: formula.id, name: formula.name, baseQty: formula.baseQty, baseUnit: formula.baseUnit } : null,
        recipe,
        capacity,
        cost,
        listings,
        channelListings: myChannels,
        // Pazarlama fırsatı: henüz ilan açılmamış kullanım alanları.
        openUseCases: (useCases as { id: number; name: string }[]).filter(u => !usedUseCases.has(u.id)),
        channels,
      };
    }),

  /**
   * Taban (web) fiyatı. Kanal yayınında fiyat girilmezse bu kullanılır —
   * her kanala ayrı fiyat girmek zorunda kalınmasın.
   */
  setBasePrice: protectedProcedure
    .input(
      z.object({
        masterId: z.number(),
        basePrice: z.number().min(0).max(1000000),
        discountPercent: z.number().min(0).max(100).default(0),
        /** true: fiyatı olmayan kanal yayınlarına da yaz. */
        applyToChannels: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateMasterProduct(input.masterId, {
        basePrice: String(input.basePrice),
        discountPercent: String(input.discountPercent),
      } as never);

      let updated = 0;
      if (input.applyToChannels) {
        const rows = (await db.listChannelListings()) as { id: number; masterId: number; price: string }[];
        for (const c of rows.filter(c => c.masterId === input.masterId && num(c.price) <= 0)) {
          // Fiyat değişimi pazaryerine gönderilmeli — kirli işaretlenir.
          await db.updateChannelListing(c.id, {
            price: String(input.basePrice),
            discountPercent: String(input.discountPercent),
            syncState: "kirli",
          } as never);
          updated++;
        }
      }
      return { updated };
    }),

  /** Kanala özel fiyat — taban fiyattan farklıysa. */
  setChannelPrice: protectedProcedure
    .input(
      z.object({
        channelListingId: z.number(),
        price: z.number().min(0).max(1000000),
        discountPercent: z.number().min(0).max(100).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateChannelListing(input.channelListingId, {
        price: String(input.price),
        discountPercent: String(input.discountPercent),
        syncState: "kirli",
      } as never);
      return { ok: true };
    }),

  /* ---- Üretim brifingi -------------------------------------------------- */

  /**
   * "Bu siparişler için ne üreteceğim, neyim eksik?"
   *
   * Bugün sipariş gelince sistem hiçbir şey söylemiyor; içerik dökümü yalnız
   * ad ve adet basıyor. Bu uç sipariş satırlarını master'a bağlar, çok
   * seviyeli reçeteden malzeme ihtiyacını patlatır ve eksikleri listeler.
   */
  briefing: protectedProcedure
    .input(
      z.object({
        // Boş ise açık siparişler (yeni + üretimde) alınır.
        orderIds: z.array(z.number()).default([]),
      }),
    )
    .query(async ({ input }) => {
      const [orders, listings, channelListings, colors, packagings, series, families] =
        await Promise.all([
          db.listOrders(),
          db.listListings(),
          db.listChannelListings(),
          db.listColors(),
          db.listPackagings(),
          db.listProductSeries(),
          db.listProductFamilies(),
        ]);

      const openOrders = (orders as { id: number; orderNo: string; status: string; customerName: string }[]).filter(
        o => (input.orderIds.length ? input.orderIds.includes(o.id) : o.status === "new" || o.status === "production"),
      );
      if (openOrders.length === 0) {
        return {
          orders: [],
          lines: [],
          demand: [],
          plan: { needs: [], shortages: [], steps: [], missingFormula: [], canProduce: true },
          unmatched: [],
        };
      }

      const items = await db.listOrderItemsBulk(openOrders.map(o => o.id));

      // Çözümleme için ilan başlıkları + pazaryeri kodları.
      const refsByListing = new Map<number, string[]>();
      for (const c of channelListings as { listingId: number; channelSku: string; channelBarcode: string }[]) {
        refsByListing.set(c.listingId, [
          ...(refsByListing.get(c.listingId) ?? []),
          c.channelSku,
          c.channelBarcode,
        ]);
      }
      const resolvable = (listings as { id: number; masterId: number; title: string }[]).map(l => ({
        masterId: l.masterId,
        listingId: l.id,
        title: l.title,
        channelRefs: refsByListing.get(l.id) ?? [],
      }));

      const resolved = resolveOrderLines(
        (items as { id: number; orderId: number; productName: string; quantity: string }[]).map(i => ({
          id: i.id,
          orderId: i.orderId,
          productName: i.productName,
          quantity: num(i.quantity),
        })),
        resolvable,
      );

      // Master başına toplam talep.
      const demandMap = new Map<number, number>();
      for (const r of resolved) {
        if (r.masterId == null) continue;
        demandMap.set(r.masterId, (demandMap.get(r.masterId) ?? 0) + r.line.quantity);
      }

      const data = await loadCapacityInputs();
      const plan = planProduction({
        demand: Array.from(demandMap.entries()).map(([masterId, qty]) => ({ masterId, qty })),
        masters: data.masters.map(m => ({ ...m, formulaScale: num(m.formulaScale) })),
        formulas: data.formulas,
        packagings: data.packagings,
        materials: data.materials,
      });

      // Üretim listesi: renk ve ambalaj bilgisiyle — bugünkü içerik dökümünde
      // renk seçeneği bile yoktu, oysa boyada üretilecek şey tam olarak o.
      const masterById = new Map(data.rawMasters.map(m => [m.id as number, m]));
      const colorById = new Map((colors as { id: number; name: string; hex: string | null }[]).map(c => [c.id, c]));
      const packById = new Map((packagings as { id: number; name: string }[]).map(p => [p.id, p]));
      const seriesById = new Map((series as { id: number; name: string }[]).map(s => [s.id, s]));
      const familyById = new Map((families as { id: number; name: string }[]).map(f => [f.id, f]));

      const demand = Array.from(demandMap.entries()).map(([masterId, qty]) => {
        const m = masterById.get(masterId);
        const color = m ? colorById.get(m.colorId as number) : undefined;
        return {
          masterId,
          qty,
          internalSku: (m?.internalSku as string) ?? "",
          series: m ? (seriesById.get(m.seriesId as number)?.name ?? null) : null,
          family: m ? (familyById.get(m.familyId as number)?.name ?? null) : null,
          packaging: m ? (packById.get(m.packagingId as number)?.name ?? null) : null,
          colorName: color?.name ?? null,
          colorHex: color?.hex ?? null,
          readiness: (m?.readiness as string) ?? "konsantre",
          buildable: Number(m?.buildableQty ?? 0),
        };
      });

      return {
        orders: openOrders.map(o => ({ id: o.id, orderNo: o.orderNo, customerName: o.customerName, status: o.status })),
        lines: resolved.map(r => ({
          id: r.line.id,
          orderId: r.line.orderId,
          productName: r.line.productName,
          quantity: r.line.quantity,
          masterId: r.masterId,
          via: r.via,
        })),
        demand: demand.sort((a, b) => b.qty - a.qty),
        plan,
        unmatched: resolved
          .filter(r => r.masterId == null)
          .map(r => ({ id: r.line.id, orderId: r.line.orderId, productName: r.line.productName, quantity: r.line.quantity })),
      };
    }),

  /**
   * Hammadde tipini değiştirir. Yarı mamuller bugün "hammadde" olarak duruyor
   * (MİX BOYA, BAZKAT BOYA, baz binder…); tipleri işaretlenmeden çok seviyeli
   * BOM devreye girmez.
   */
  setMaterialType: protectedProcedure
    .input(
      z.object({
        materialId: z.number(),
        type: z.enum(["hammadde", "yari_mamul", "ambalaj", "masraf"]),
      }),
    )
    .mutation(async ({ input }) => {
      await db.updateMaterial(input.materialId, { type: input.type } as never);
      return { ok: true };
    }),
});
