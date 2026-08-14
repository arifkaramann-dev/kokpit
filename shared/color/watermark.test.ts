import { describe, expect, it } from "vitest";
import { DEFAULT_WATERMARK, resolveWatermark, type TemplateLayout } from "./layout";

const layout = (watermark?: TemplateLayout["watermark"]): TemplateLayout => ({
  width: 1400,
  height: 1400,
  background: "#ffffff",
  layers: [],
  watermark,
});

/**
 * Filigranın iki kritik kuralı var ve ikisi de sessizce bozulabilir:
 * (1) çıplak şablonda ASLA çizilmez — çizilirse pazaryeri ilanı reddedilir,
 * (2) tanımsız alan "kapalı" değil "fabrika ayarı" demektir — aksi halde
 * alan doğmadan önce kaydedilmiş yerleşimler korumasız kalırdı.
 */
describe("resolveWatermark", () => {
  it("çıplak şablonda hiç çizilmez", () => {
    expect(resolveWatermark(layout(), { bare: true })).toBeNull();
    // Kullanıcı açmış olsa bile: kural şablonun kendisinde.
    expect(
      resolveWatermark(layout({ ...DEFAULT_WATERMARK, enabled: true }), { bare: true }),
    ).toBeNull();
  });

  it("tanımsız filigranı fabrika ayarı sayar", () => {
    expect(resolveWatermark(layout())).toEqual(DEFAULT_WATERMARK);
  });

  it("kapatılmış filigranı çizdirmez", () => {
    expect(resolveWatermark(layout({ ...DEFAULT_WATERMARK, enabled: false }))).toBeNull();
  });

  it("ölçüleri geçerli aralığa sıkıştırır", () => {
    const w = resolveWatermark(layout({ ...DEFAULT_WATERMARK, scale: 4, opacity: 2 }));
    expect(w).not.toBeNull();
    expect(w!.scale).toBe(1);
    expect(w!.opacity).toBe(1);

    const small = resolveWatermark(layout({ ...DEFAULT_WATERMARK, scale: 0, opacity: -1 }));
    expect(small!.scale).toBe(0.05);
    expect(small!.opacity).toBe(0);
  });

  it("kullanıcının ayarlarını korur", () => {
    const w = resolveWatermark(
      layout({ enabled: true, mode: "center", scale: 0.5, opacity: 0.2, tint: "paint", angle: 0 }),
    );
    expect(w).toEqual({
      enabled: true,
      mode: "center",
      scale: 0.5,
      opacity: 0.2,
      tint: "paint",
      angle: 0,
    });
  });
});
