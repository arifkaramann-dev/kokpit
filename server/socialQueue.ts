/**
 * Sosyal kuyruğun doldurulması — planı veritabanına yazan taraf.
 *
 * Karar mantığı saf modülde (`shared/socialPlan.ts`); burada yalnız katalog
 * okunuyor, gün listesi çıkarılıyor ve eksik günler açılıyor.
 *
 * ── Neden ayrı dosya ──────────────────────────────────────────────────────
 * Aynı işi iki yer çağırıyor: zamanlayıcı (her sabah) ve kullanıcının
 * "kuyruğu doldur" düğmesi. İkisinin ayrı kopyası olsaydı biri düzeltilip
 * diğeri geride kalırdı — bu projede daha önce tam olarak bu oldu.
 */

import { coatSystemOf } from "@shared/color/coatSystem";
import { colorLabelOf } from "@shared/productName";
import { makeColorCodeIndex } from "@shared/colorCode";
import {
  POST_DAYS,
  fallbackCaption,
  hashtagsFor,
  planPost,
  type PlanCandidate,
  type PostKind,
} from "@shared/socialPlan";
import * as db from "./db";

/** İstanbul gününü "YYYY-MM-DD" olarak verir — zamanlayıcıyla aynı kural. */
export function istanbulDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** O günün haftanın kaçıncı günü olduğu (0=Pazar), İstanbul saatiyle. */
function istanbulWeekday(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export type PlanResult = {
  created: number;
  /** Planlanan gönderilerin özeti — bildirimde ve ekranda gösterilir. */
  planned: Array<{ plannedFor: string; kind: PostKind; colorLabel: string }>;
  /** Aday ürün bulunamadı: katalog boş ya da tümü kullanılmış. */
  exhausted: boolean;
};

/**
 * Önümüzdeki `days` gün için eksik gönderileri açar.
 *
 * Geçmiş günlere DOKUNULMAZ: dün paylaşılmayan bir gönderiyi bugün üretmek,
 * kuyruğu geriye doğru şişirmekten başka işe yaramaz.
 */
export async function planSocialPosts(days = 21): Promise<PlanResult> {
  const [masters, colors, series, existing, seriesColorNumbers, colorImages] = await Promise.all([
    db.listMasterProducts(),
    db.listColors(),
    db.listProductSeries(),
    db.listSocialPosts(200),
    db.listSeriesColorNumbers(),
    db.listMasterImageCounts(),
  ]);

  const colorById = new Map(
    (colors as { id: number; name: string; nameEn: string | null; colorNo: number | null }[]).map(
      c => [c.id, c],
    ),
  );
  const seriesById = new Map(
    (series as { id: number; name: string; coatSystem?: unknown }[]).map(s => [s.id, s]),
  );
  const codeIndex = makeColorCodeIndex({
    series: series as { id: number; prefix: string | null }[],
    overrides: seriesColorNumbers as { seriesId: number; colorId: number; colorNo: number }[],
  });

  // Renk sırası "yenilik" ölçütü: katalog sırası artan, en son eklenen en
  // büyük kimliği taşıyor.
  const rankByColor = new Map<number, number>();
  for (const c of colors as { id: number }[]) rankByColor.set(c.id, c.id);

  const usageByMaster = new Map<number, number>();
  for (const row of colorImages as { masterId: number; count: number }[]) {
    usageByMaster.set(row.masterId, Number(row.count ?? 0));
  }

  // Aday havuzu: yalnız AKTİF ürünler. Taslak ya da arşiv ürünü paylaşmak,
  // satılmayan bir şeyi tanıtmak demek.
  const candidates: PlanCandidate[] = (masters as Record<string, unknown>[])
    .filter(m => m.status === "aktif")
    .map(m => ({
      masterId: m.id as number,
      seriesId: m.seriesId as number,
      colorId: m.colorId as number,
      colorAddedRank: rankByColor.get(m.colorId as number) ?? 0,
      usageImages: usageByMaster.get(m.id as number) ?? 0,
    }));

  const history = (existing as Record<string, unknown>[])
    .map(p => ({
      kind: p.kind as PostKind,
      colorId: (p.colorId as number | null) ?? null,
      plannedFor: String(p.plannedFor ?? ""),
    }))
    .sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));

  const taken = new Set(
    (existing as Record<string, unknown>[]).map(p => `${String(p.plannedFor)}:${String(p.kind)}`),
  );

  const out: PlanResult = { created: 0, planned: [], exhausted: false };
  const now = Date.now();

  for (let i = 0; i < days; i += 1) {
    const at = new Date(now + i * 86_400_000);
    if (!POST_DAYS.includes(istanbulWeekday(at))) continue;
    const day = istanbulDay(at);
    // O gün için zaten bir gönderi varsa (hangi tip olursa olsun) atla:
    // günde tek post, kullanıcının seçtiği tempo bu.
    if (Array.from(taken).some(k => k.startsWith(`${day}:`))) continue;

    const plan = planPost({ day, candidates, history });
    if (!plan) {
      out.exhausted = true;
      break;
    }

    const color = colorById.get(plan.colorId);
    const s = seriesById.get(plan.seriesId);
    const colorLabel = colorLabelOf(color);
    const caption = fallbackCaption({
      kind: plan.kind,
      colorLabel,
      colorCode: codeIndex.codeOf(plan.seriesId, plan.colorId, color?.colorNo ?? null),
      seriesName: s?.name ?? null,
      coatSystem: s
        ? coatSystemOf({ name: s.name, coatSystem: s.coatSystem })
            .map(l => l.label)
            .join(" → ")
        : null,
    });

    const id = await db.createSocialPostIfAbsent({
      kind: plan.kind,
      plannedFor: plan.plannedFor,
      seriesId: plan.seriesId,
      colorId: plan.colorId,
      masterId: plan.masterId,
      caption,
      hashtags: hashtagsFor(s?.name ?? null),
    });
    if (id == null) continue;

    taken.add(`${day}:${plan.kind}`);
    history.push({ kind: plan.kind, colorId: plan.colorId, plannedFor: day });
    out.created += 1;
    out.planned.push({ plannedFor: day, kind: plan.kind, colorLabel });
  }

  return out;
}
