/**
 * Sosyal gönderi planı — "sırada ne paylaşılacak".
 *
 * ── Neden kurala bağlı bir kuyruk ─────────────────────────────────────────
 * "Düzenli post" demek, her sabah "bugün ne paylaşsam" diye düşünmemek demek.
 * Kaynak zaten Kokpit'in içinde: yeni eklenen renk, serinin kat sistemi,
 * kullanım alanı kareleri, seri paleti. Eksik olan tek şey SIRAYDI.
 *
 * ── Neden rotasyon ────────────────────────────────────────────────────────
 * Hep en yeni içeriği paylaşmak akışı tek tipe düşürür: on renk eklenince on
 * gün üst üste "yeni renk" postu çıkar. Tipler sırayla dönüyor; bir tipin
 * gösterecek konusu yoksa sıradaki tipe geçiliyor, gün boş kalmıyor.
 *
 * ── Neden tekrar edilmiş konu elenir ──────────────────────────────────────
 * Aynı rengin kat sistemi karesini iki hafta arka arkaya paylaşmak, takipçiye
 * "içerik bitti" dedirtir. Son yayınlananlar hariç tutuluyor; hepsi
 * kullanıldıysa en eskiden başlanıyor (kuyruk hiç durmuyor).
 *
 * Saf modül: veritabanı yok, tarih üretimi yok — "bugün" çağırandan gelir ki
 * test edilebilsin.
 */

/** İçerik tipleri — kullanıcı hepsini seçti, sıra bu. */
export const POST_KINDS = ["renk", "katsistemi", "kullanim", "palet"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const POST_KIND_LABEL: Record<PostKind, string> = {
  renk: "Yeni renk tanıtımı",
  katsistemi: "Kat sistemi — nasıl uygulanır",
  kullanim: "Kullanım alanları",
  palet: "Seri paleti ve ambalaj gamı",
};

/** Haftanın hangi günleri post çıkar (0=Pazar). Pazartesi · Çarşamba · Cuma. */
export const POST_DAYS = [1, 3, 5];

export type PlanCandidate = {
  /** Master (ürün) kimliği — kare bu üründen üretilecek. */
  masterId: number;
  seriesId: number;
  colorId: number;
  /** Rengin katalogdaki sırası; yeni renk büyük sayı alır. */
  colorAddedRank?: number;
  /** Bu üründe kullanılabilir kare sayısı — kullanım kolajı için. */
  usageImages?: number;
};

export type PlanInput = {
  /** Planlanacak gün, "YYYY-MM-DD" (İstanbul günü). */
  day: string;
  /** Katalogdaki üretilebilir ürünler. */
  candidates: PlanCandidate[];
  /** Daha önce planlanmış/paylaşılmış gönderiler — tekrarı elemek için. */
  history: Array<{ kind: PostKind; colorId: number | null; plannedFor: string }>;
  /** Bu tipler kapalıysa hiç planlanmaz. Verilmezse hepsi açık. */
  enabledKinds?: PostKind[];
};

export type PlannedPost = {
  kind: PostKind;
  plannedFor: string;
  masterId: number;
  seriesId: number;
  colorId: number;
};

/** Gün "YYYY-MM-DD" biçiminde mi ve post günü mü? */
export function isPostDay(day: string, weekday: number): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && POST_DAYS.includes(weekday);
}

/**
 * Sıradaki içerik tipi — geçmişteki son tipten SONRAKİ.
 *
 * Geçmiş boşsa listenin başından başlanır. Kapalı tipler atlanır; hepsi
 * kapalıysa null (kuyruk durur, kullanıcı bir tip açana kadar).
 */
export function nextKind(
  history: Array<{ kind: PostKind }>,
  enabled: PostKind[] = [...POST_KINDS],
): PostKind | null {
  const open = POST_KINDS.filter(k => enabled.includes(k));
  if (open.length === 0) return null;
  const last = history.length > 0 ? history[history.length - 1].kind : null;
  if (last == null) return open[0];
  const idx = POST_KINDS.indexOf(last);
  // Tam turu dön: kapalı tipleri atlayarak ilk açık tipi bul.
  for (let step = 1; step <= POST_KINDS.length; step += 1) {
    const candidate = POST_KINDS[(idx + step) % POST_KINDS.length];
    if (open.includes(candidate)) return candidate;
  }
  return open[0];
}

/**
 * Bir gün için gönderi planlar.
 *
 * Konu seçimi tipe göre değişiyor:
 *   renk        → en yeni eklenen renk (tanıtılacak olan o)
 *   katsistemi  → herhangi bir ürün; şema serinin verisinden geliyor
 *   kullanim    → yalnız kullanım karesi OLAN ürünler (kolaj boş çıkmasın)
 *   palet       → seri başına tek ürün yeter, palet zaten seriyi anlatıyor
 *
 * Aday yoksa null döner — uydurma bir gönderi planlamaktansa o gün boş kalır
 * ve kullanıcıya "içerik bitti" denir.
 */
export function planPost(input: PlanInput): PlannedPost | null {
  const enabled = input.enabledKinds ?? [...POST_KINDS];
  const kind = nextKind(input.history, enabled);
  if (!kind) return null;

  let pool = input.candidates;
  if (kind === "kullanim") pool = pool.filter(c => (c.usageImages ?? 0) > 0);
  if (pool.length === 0) return null;

  // Aynı tipte daha önce kullanılmış renkler geride kalsın; hepsi
  // kullanıldıysa en eski kullanılan öne geçer (kuyruk hiç tükenmiyor).
  const usedAt = new Map<number, string>();
  for (const h of input.history) {
    if (h.kind !== kind || h.colorId == null) continue;
    const prev = usedAt.get(h.colorId);
    if (!prev || prev < h.plannedFor) usedAt.set(h.colorId, h.plannedFor);
  }

  const scored = [...pool].sort((a, b) => {
    const ua = usedAt.get(a.colorId) ?? "";
    const ub = usedAt.get(b.colorId) ?? "";
    // Hiç kullanılmamış ("") en öne; sonra en eski kullanılan.
    if (ua !== ub) return ua < ub ? -1 : 1;
    if (kind === "renk") {
      // Yeni renk tanıtımında en yeni eklenen öne çıkar.
      return (b.colorAddedRank ?? 0) - (a.colorAddedRank ?? 0);
    }
    return a.masterId - b.masterId;
  });

  const pick = scored[0];
  return {
    kind,
    plannedFor: input.day,
    masterId: pick.masterId,
    seriesId: pick.seriesId,
    colorId: pick.colorId,
  };
}

/**
 * Gönderi metni — AI yoksa da dolu.
 *
 * Başlık ve etiketler serinin kendi bilgisinden kuruluyor; AI'ın işi bunu
 * güzelleştirmek, sıfırdan yazmak değil. AI çağrısı başarısız olsa bile
 * kuyruk boş metinle durmaz.
 */
export function fallbackCaption(input: {
  kind: PostKind;
  colorLabel: string;
  colorCode?: string | null;
  seriesName?: string | null;
  coatSystem?: string | null;
}): string {
  const seri = input.seriesName?.trim() || "Art of Colour";
  const kod = input.colorCode?.trim() ? ` (${input.colorCode.trim()})` : "";
  switch (input.kind) {
    case "renk":
      return `${seri} ailesine yeni renk: ${input.colorLabel}${kod}. Detaylı bilgi ve sipariş için profildeki bağlantı.`;
    case "katsistemi":
      return input.coatSystem?.trim()
        ? `${seri} nasıl uygulanır? ${input.coatSystem}. Doğru sıra, doğru sonuç.`
        : `${seri} nasıl uygulanır — kat kat, doğru sırayla.`;
    case "kullanim":
      return `${input.colorLabel}${kod} nerelerde kullanılıyor? ${seri} ile boyanmış işlerden birkaçı.`;
    case "palet":
    default:
      return `${seri} paleti — tüm renkler ve ambalaj boyları tek karede.`;
  }
}

/** Etiketler: markadan sabit + seriden türetilen. */
export function hashtagsFor(seriesName: string | null | undefined): string {
  const base = ["#artofcolour", "#boya", "#airbrush", "#ototuning", "#hobiboyası", "#3dbaskı"];
  const seri = String(seriesName ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[^a-zçğıöşü0-9]/g, "");
  if (seri) base.unshift(`#${seri}`);
  return base.join(" ");
}
