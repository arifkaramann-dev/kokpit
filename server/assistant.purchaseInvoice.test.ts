import { describe, expect, it } from "vitest";
import { canonicalPartyName } from "./financeUtils";

describe("canonicalPartyName (asistan alış faturası → tedarikçi eşleştirme)", () => {
  const suppliers = [{ name: "Erdem Boya" }, { name: "İzmir Ambalaj" }, { name: "ABC Kimya" }];

  it("tam eşleşmede kayıtlı adı döndürür", () => {
    expect(canonicalPartyName(suppliers, "Erdem Boya")).toBe("Erdem Boya");
  });

  it("büyük/küçük harf ve Türkçe duyarsız eşleşir", () => {
    expect(canonicalPartyName(suppliers, "erdem boya")).toBe("Erdem Boya");
    expect(canonicalPartyName(suppliers, "izmir ambalaj")).toBe("İzmir Ambalaj");
  });

  it("kısmi eşleşmede kayıtlı tam adı döndürür", () => {
    expect(canonicalPartyName(suppliers, "Erdem")).toBe("Erdem Boya");
    expect(canonicalPartyName(suppliers, "Erdem Boya A.Ş.")).toBe("Erdem Boya");
  });

  it("eşleşme yoksa girilen adı olduğu gibi (kırpılmış) döndürür", () => {
    expect(canonicalPartyName(suppliers, "  Yeni Tedarikçi  ")).toBe("Yeni Tedarikçi");
  });

  it("boş girdide de çökmez", () => {
    expect(canonicalPartyName(suppliers, "   ")).toBe("");
  });
});
