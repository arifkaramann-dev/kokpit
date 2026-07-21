# 💻 Teknik Kurul (CTO Board)

> Kalıcı sohbet: **teknik sağlık**. Bu dosya bu kurulun tüzüğü + hafızasıdır.
> Komut: `/teknik-kurul`. Üst belge: `.claude/KURULLAR.md`.

**Üyeler:** `backend-gelistirici`, `veritabani-mimari`, `guvenlik-denetcisi`,
`devops-muhendisi`, `muhasebe-entegrasyon-uzmani` (entegrasyon adaptörü tarafı).

## Kapsam (sadece bunlar)

- **Mimari kararlar:** modül sınırları, servis katmanı, `server/_core/*` (dikkatli), tRPC yapısı.
- **Kod kalitesi & teknik borç:** refactor, monolit bölme, ölü kod, tip güvenliği.
- **Performans:** sorgu/indeks, sayfalama, N+1, önbellek, bundle boyutu.
- **Güvenlik:** auth/JWT/cookie, yetki, gizli bilgi hijyeni, webhook imzası, girdi doğrulama, bağımlılık denetimi.
- **DevOps:** Render deploy, `render.yaml`, env yönetimi, migration'ın canlıda koşması, uptime.
- **Veri modeli sağlığı:** `drizzle/schema.ts` değişiklikleri (`veritabani-mimari` kapısından), FK/indeks/bütünlük.

## Kapsam DIŞI (ilgili kurula devret)

- Hangi özellik/öncelik → **🏛 Ürün Kurulu**
- Ekran/akış/görsel tasarım → **🎨 UX Lab**
- AI/asistan/otomasyon mantığı → **🤖 AI Lab**
- Onaylı işin kodlanması/testi/PR'ı → **🚀 Yapımcı** (mimari kararı burada verilir, seri üretim orada)

## Girdi (okunacak kaynaklar)

`docs/KOKPIT-V2-ANALIZ.md` (Faz 0 borçları), `docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md`,
`server/modules/*`, `server/db.ts`, `server/_core/*`, `drizzle/schema.ts`, `render.yaml`, `DEVAM.md`.

## Çıktı (bu kurul ne üretir)

- Mimari karar kaydı (bu dosyanın karar günlüğü) + gerekçe.
- Teknik borç sıralaması ve Yapımcı'ya iş fişi (kabul kriteri + risk durakları).
- Güvenlik bulguları ve düzeltme önceliği.

## Çalışma ritmi

Riskli değişiklikte (para/şema/pazaryeri/yarış durumu) tam test/build; küçük
işte `pnpm check`. Şemaya dokunan HER iş `veritabani-mimari`den, auth'a dokunan
HER iş `guvenlik-denetcisi`nden geçer. Periyodik güvenlik taraması bu kurulun işi.

## Açık gündem (yaşayan liste)

- [ ] 0.3 Ürün görsellerinin S3'e taşınması (base64/MEDIUMTEXT → S3; `/api/img` URL'leri korunur) — depolama kimlik bilgisi bekliyor.
- [ ] 0.4 `db.ts` modül dizinlerine bölünme + servis katmanı (routers.ts bölündü; db.ts para yolları sıkı bağlı, ayrı denetimli sprint).
- [ ] 0.6 Body limit'in uca göre daraltılması (S3 göçünden sonra; görseller şu an tRPC'den base64 gidiyor).
- [ ] Güvenlik: `WHATSAPP_APP_SECRET` Render'da tanımlı mı doğrula; periyodik gizli bilgi/bağımlılık taraması planla.
- [ ] DevOps: uptime monitörü (cron-job.org → `/api/health`, 10 dk) — Render free uykusu zamanlayıcıyı durdurur.

## Karar günlüğü (yaşayan hafıza)

| Tarih | Karar | Gerekçe | Devir |
|---|---|---|---|
| 2026-07-21 | Teknik Kurul kuruldu; teknik borç + mimari + güvenlik + deploy tek bağlamda toplandı. | Bu dört disiplin sürekli ve birbirine bağlı; "nasıl (teknik)" kararı ürün/tasarım sohbetinden ayrılmalıydı. | — |
