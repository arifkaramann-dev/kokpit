export function formatTL(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "0,00 ₺";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(num);
}

export function formatQty(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return "0";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(n) ? 0 : n;
}

export const MATERIAL_CATEGORIES = [
  "pigment",
  "solvent",
  "selülozik boya",
  "mix boya",
  "akrilik boya",
  "şişe",
  "etiket",
  "ambalaj",
  "diğer",
];

export const UNITS = ["gr", "kg", "ml", "lt", "adet"];

export const ORDER_STATUSES = [
  { value: "new", label: "Yeni", color: "bg-blue-500" },
  { value: "production", label: "Üretimde", color: "bg-amber-500" },
  { value: "ready", label: "Kargoya Hazır", color: "bg-violet-500" },
  { value: "done", label: "Tamamlandı", color: "bg-emerald-500" },
] as const;

/** İptal/iade akışın parçası değildir: ciro/cari dışında, ayrı bölümde gösterilir. */
export const CANCELLED_STATUS = { value: "cancelled", label: "İptal / İade", color: "bg-rose-500" } as const;

export const ALL_ORDER_STATUSES = [...ORDER_STATUSES, CANCELLED_STATUS] as const;

export type OrderStatus = (typeof ALL_ORDER_STATUSES)[number]["value"];

export const CHANNELS = [
  "web",
  "elden",
  "trendyol",
  "hepsiburada",
  "instagram",
  "telefon",
  "whatsapp",
  "pazaryeri",
  "diğer",
];
