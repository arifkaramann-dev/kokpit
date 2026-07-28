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
import { planFormulaBindings, type MatchableFormula } from "../formulaMatch";
import { GENERIC_USE_CASE_CODE, seedCatalogDimensions } from "../seedCatalog";

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

      let created = 0;
      for (const l of plan.create) {
        await db.createListing({
          masterId: l.masterId,
          useCaseId: l.useCaseId,
          title: l.title,
          slug: l.slug,
          isPrimary: l.isPrimary ? 1 : 0,
          status: "taslak",
        } as never);
        created++;
      }
      return { dryRun: false, willCreate: plan.create.length, willUpdate: plan.update.length, created, sample: [] };
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
