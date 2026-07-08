// Deploy açılışında DATABASE_URL'deki veritabanı yoksa oluşturur.
// drizzle-kit migrate hedef veritabanına bağlanmak zorunda olduğundan,
// bu betik ondan ÖNCE çalışır (bkz. render.yaml startCommand).
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[ensure-db] DATABASE_URL tanımlı değil, atlanıyor.");
  process.exit(1);
}

const parsed = new URL(url);
const dbName = parsed.pathname.replace(/^\//, "");
if (!dbName) {
  console.error("[ensure-db] Bağlantı adresinde veritabanı adı yok (ör. .../kokpit).");
  process.exit(1);
}

// Aynı adrese veritabanı seçmeden bağlan (yoksa "unknown database" hatası alırdık).
const serverUrl = new URL(url);
serverUrl.pathname = "/";

try {
  const conn = await mysql.createConnection(serverUrl.toString());
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replaceAll("`", "")}\``);
  await conn.end();
  console.log(`[ensure-db] '${dbName}' veritabanı hazır.`);
} catch (error) {
  console.error("[ensure-db] Veritabanı oluşturulamadı:", error.message);
  process.exit(1);
}
