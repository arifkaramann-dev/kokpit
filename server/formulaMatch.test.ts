import { describe, expect, it } from "vitest";
import { matchFormula, planFormulaBindings, type MatchableFormula, type MatchableMaster } from "./formulaMatch";

const CANDY = 10;
const METEOR = 20;
const RED = 1;
const BLUE = 2;
const AIRBRUSH = 100;
const SPREY = 200;

const f = (id: number, p: Partial<MatchableFormula> = {}): MatchableFormula => ({
  id,
  outputType: "mamul",
  seriesId: null,
  colorId: null,
  familyId: null,
  readiness: null,
  baseQty: 1000,
  ...p,
});

const m = (id: number, p: Partial<MatchableMaster> = {}): MatchableMaster => ({
  id,
  seriesId: CANDY,
  colorId: RED,
  familyId: AIRBRUSH,
  readiness: "konsantre",
  packagingVolumeMl: 100,
  currentFormulaId: null,
  ...p,
});

describe("matchFormula — en özel reçete kazanır", () => {
  it("boş eksen her değere uyar", () => {
    const hit = matchFormula(m(1), [f(50)]);
    expect(hit?.formula.id).toBe(50);
    expect(hit?.specificity).toBe(0);
  });

  it("dolu eksen eşleşmezse reçete elenir", () => {
    expect(matchFormula(m(1), [f(50, { seriesId: METEOR })])).toBeNull();
  });

  it("renk bazlı reçete, seri bazlı genel reçeteyi yener", () => {
    const hit = matchFormula(m(1), [
      f(50, { seriesId: CANDY }),
      f(51, { seriesId: CANDY, colorId: RED }),
    ]);
    expect(hit?.formula.id).toBe(51);
    expect(hit?.specificity).toBe(2);
  });

  it("genel seri reçetesi özelleşmemiş renkte kullanılır", () => {
    const formulas = [f(50, { seriesId: CANDY }), f(51, { seriesId: CANDY, colorId: RED })];
    expect(matchFormula(m(1, { colorId: BLUE }), formulas)?.formula.id).toBe(50);
  });

  it("r2u ile konsantre ayrı reçeteye bağlanabilir", () => {
    const formulas = [
      f(50, { seriesId: CANDY, readiness: "konsantre" }),
      f(51, { seriesId: CANDY, readiness: "r2u" }),
    ];
    expect(matchFormula(m(1, { readiness: "r2u" }), formulas)?.formula.id).toBe(51);
    expect(matchFormula(m(1, { readiness: "konsantre" }), formulas)?.formula.id).toBe(50);
  });

  it("form bazlı reçete yalnız o forma uygulanır", () => {
    const formulas = [f(50, { familyId: SPREY })];
    expect(matchFormula(m(1, { familyId: AIRBRUSH }), formulas)).toBeNull();
    expect(matchFormula(m(1, { familyId: SPREY }), formulas)?.formula.id).toBe(50);
  });

  it("yarı mamul reçetesi master'a bağlanmaz — BOM'un ara katmanıdır", () => {
    expect(matchFormula(m(1), [f(50, { outputType: "yari_mamul" })])).toBeNull();
  });

  it("eşit özgüllükte önce tanımlanan kazanır (kararlı sonuç)", () => {
    const hit = matchFormula(m(1), [f(90, { seriesId: CANDY }), f(50, { seriesId: CANDY })]);
    expect(hit?.formula.id).toBe(50);
  });
});

describe("planFormulaBindings", () => {
  const formulas = [f(50, { seriesId: CANDY, baseQty: 1000 })];

  it("ambalaj hacminden ölçek türetir — tek reçete tüm boyutları besler", () => {
    const { bindings } = planFormulaBindings({
      masters: [
        m(1, { packagingVolumeMl: 100 }),
        m(2, { packagingVolumeMl: 500 }),
        m(3, { packagingVolumeMl: 30 }),
      ],
      formulas,
    });
    expect(bindings.map(b => b.formulaScale)).toEqual([0.1, 0.5, 0.03]);
    expect(new Set(bindings.map(b => b.formulaId))).toEqual(new Set([50]));
  });

  it("hacimsiz ambalajda ölçek 1 kalır", () => {
    const { bindings } = planFormulaBindings({
      masters: [m(1, { packagingVolumeMl: 0 })],
      formulas,
    });
    expect(bindings[0].formulaScale).toBe(1);
  });

  it("zaten bağlı master'a varsayılan olarak dokunmaz", () => {
    const { bindings } = planFormulaBindings({
      masters: [m(1, { currentFormulaId: 50 }), m(2)],
      formulas,
    });
    expect(bindings.map(b => b.masterId)).toEqual([2]);
  });

  it("rebindExisting ile farklı reçeteye taşınır, aynı kalana dokunulmaz", () => {
    const { bindings } = planFormulaBindings({
      masters: [m(1, { currentFormulaId: 50 }), m(2, { currentFormulaId: 99 })],
      formulas,
      rebindExisting: true,
    });
    expect(bindings.map(b => b.masterId)).toEqual([2]);
  });

  it("eşleşmeyen master'lar bildirilir — sessizce kapasitesiz kalmaz", () => {
    const { bindings, unmatched } = planFormulaBindings({
      masters: [m(1), m(2, { seriesId: METEOR })],
      formulas,
    });
    expect(bindings.map(b => b.masterId)).toEqual([1]);
    expect(unmatched).toEqual([2]);
  });
});
