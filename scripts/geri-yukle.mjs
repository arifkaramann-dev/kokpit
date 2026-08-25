// Yedeği geri yükler — TiDB'den alınan dump'ı yerele taşımak için de bu.
//
// Kullanım:  pnpm yerel:geri-yukle yedek/kokpit-2026-08-25-1430.sql
//
// ── DİKKAT ─────────────────────────────────────────────────────────────────
// Yüklemeden önce mevcut veritabanı SİLİNİR ve yeniden oluşturulur. Yanlış
// dosyayla çalıştırmak elindeki veriyi geri dönülemez şekilde götürür; bu
// yüzden betik önce mevcut hâlin yedeğini alıyor.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dosya = process.argv[2];
if (!dosya) {
  console.error("Kullanım: pnpm yerel:geri-yukle <dosya.sql>");
  process.exit(1);
}
if (!fs.existsSync(dosya)) {
  console.error(`[geri-yükle] Dosya bulunamadı: ${dosya}`);
  process.exit(1);
}

const mysql = (args, input) =>
  spawnSync("docker", ["compose", "exec", "-T", "veritabani", ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });

try {
  // Güvenlik ağı: üstüne yazmadan önce mevcut hâli sakla. Yanlış dosyayla
  // çalıştırılan bir geri yükleme, yedeği olmayan tek anı yaratırdı.
  console.log("[geri-yükle] Önce mevcut veritabanının yedeği alınıyor…");
  execFileSync("node", ["scripts/yedek.mjs"], { stdio: "inherit" });

  console.log("[geri-yükle] Veritabanı sıfırlanıyor…");
  const sifirla = mysql(
    ["mariadb", "-uroot", "-pkokpit", "-e", "DROP DATABASE IF EXISTS kokpit; CREATE DATABASE kokpit;"],
  );
  if (sifirla.status !== 0) throw new Error(sifirla.stderr?.toString() || "sıfırlama başarısız");

  console.log(`[geri-yükle] ${path.basename(dosya)} yükleniyor…`);
  const yukle = mysql(["mariadb", "-uroot", "-pkokpit", "kokpit"], fs.readFileSync(dosya));
  if (yukle.status !== 0) throw new Error(yukle.stderr?.toString() || "yükleme başarısız");

  console.log("[geri-yükle] Tamam. Uygulamayı yeniden başlat: pnpm yerel:yeniden");
} catch (error) {
  console.error("[geri-yükle] Hata:", error.message);
  process.exit(1);
}
