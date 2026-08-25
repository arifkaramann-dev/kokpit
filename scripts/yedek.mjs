// Yerel veritabanının yedeğini alır: yedek/kokpit-YYYY-AA-GG-SSdd.sql
//
// ── Neden ayrı bir betik ───────────────────────────────────────────────────
// Veri artık kendi bilgisayarında duruyor. Render + TiDB kurulumunda yedek
// sağlayıcının işiydi; burada kimsenin işi değil — yani senin işin. Tek
// komutla alınamayan bir yedek, alınmayan yedektir.
//
// Kullanım:  pnpm yerel:yedek
//
// Not: `mariadb-dump` kaplamanın içinden çalışıyor, bilgisayarına ayrıca
// MySQL kurman gerekmiyor.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const klasor = path.resolve("yedek");
fs.mkdirSync(klasor, { recursive: true });

const d = new Date();
const iki = (n) => String(n).padStart(2, "0");
const ad = `kokpit-${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}-${iki(
  d.getHours(),
)}${iki(d.getMinutes())}.sql`;
const hedef = path.join(klasor, ad);

try {
  // `-T` şart: sözde terminal açılırsa çıktıya kontrol karakterleri karışıyor
  // ve dosya bozuk bir SQL olarak kaydediliyor.
  const cikti = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "veritabani",
      "mariadb-dump",
      "-uroot",
      "-pkokpit",
      "--single-transaction",
      "--routines",
      "--events",
      "kokpit",
    ],
    { maxBuffer: 1024 * 1024 * 1024 },
  );

  if (!cikti.length) throw new Error("Yedek boş döndü — veritabanı çalışıyor mu?");
  fs.writeFileSync(hedef, cikti);

  const mb = (cikti.length / 1024 / 1024).toFixed(1);
  console.log(`[yedek] ${hedef} (${mb} MB)`);
  console.log("[yedek] Bu dosyayı bulut sürücüne ya da harici diske kopyala.");
} catch (error) {
  console.error("[yedek] Alınamadı:", error.message);
  console.error("[yedek] Önce sistemin açık olduğundan emin ol: pnpm yerel");
  process.exit(1);
}
