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
  "bağlayıcı/reçine",
  "katkı maddesi",
  "şişe/ambalaj",
  "etiket",
  "kutu/koli",
  "diğer",
];

export const UNITS = ["gr", "kg", "ml", "lt", "adet"];

export const ORDER_STATUSES = [
  { value: "new", label: "Yeni", color: "bg-blue-500" },
  { value: "production", label: "Üretimde", color: "bg-amber-500" },
  { value: "ready", label: "Kargoya Hazır", color: "bg-violet-500" },
  { value: "done", label: "Tamamlandı", color: "bg-emerald-500" },
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number]["value"];

export const CHANNELS = [
  "web",
  "trendyol",
  "hepsiburada",
  "instagram",
  "telefon",
  "whatsapp",
  "pazaryeri",
  "diğer",
];
