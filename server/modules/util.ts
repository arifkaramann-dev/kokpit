// routers.ts bölünmesi (Sprint 2 / V2 Faz 0.4): modüllerin ortak küçük yardımcıları.

/* ------------------------- Helpers ------------------------- */

export function toDecimalFields<T extends Record<string, unknown>>(
  data: T,
  fields: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) {
    if (typeof out[f] === "number") out[f] = String(out[f]);
  }
  return out;
}

