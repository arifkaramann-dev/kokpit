import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // shared/ hem sunucu hem arayüz tarafından kullanılır; testleri kapsam
    // dışında kalırsa iki tarafı birden besleyen mantık sessizce bozulur.
    //
    // client/ de dahil: `client/src/lib` altında tarayıcıdan bağımsız saf
    // mantık var (barkod hesabı, ambalaj yedeği) ve kapsam dışında bırakıldığı
    // için `barcode.test.ts` uzun süre HİÇ KOŞMAMIŞTI — yazılmış ama çalışmayan
    // test, olmayan testten daha kötü: kapsandığını sanıyorsun.
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.spec.ts",
    ],
  },
});
