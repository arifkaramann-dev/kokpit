# Kurul Toplantı Tutanakları — Art of Colour Kokpit

Beş kurulun ortak toplantı kayıtları. Her toplantı: kurul görüşleri → ortak karar
→ oylama. Üst belge: `.claude/KURULLAR.md`.

---

## 1. Toplantı — 2026-07-22 · Kuruluş & İlk Önceliklendirme

**Katılım:** 🏛 Ürün Kurulu · 💻 Teknik Kurul · 🎨 UX Lab · 🤖 AI Lab · 🚀 Yapımcı
**Başkan (dönem):** `proje-yoneticisi`
**Gündem:** Sistem öğrenildi. En önemli 20 geliştirme oy çokluğuyla sıralanacak.

### Kurul görüşleri (her kurul ayrı)

**🏛 Ürün Kurulu —** Şirketin iki cephesi var: yasal zorunluluk ve rakip paritesi.
e-Fatura yasal eşiğin üstünde artık ertelenemez ve Bizimhesap paritesindeki en
büyük açık. En yüksek marjlı kanal kendi mağazamız (komisyonsuz) — Qukasoft/web
mağaza kirasını ikame eder. Boya dikeyi tek gerçek savunma hattımız: lot/parti +
kalite kontrol (pH/viskozite/örtücülük/ΔE) ne Bizimhesap'ta ne Qukasoft'ta var.
N11/Çiçeksepeti kodu hazır — sadece gelir bırakıyoruz. **Oy: yasal → gelir kanalı → moat.**

**💻 Teknik Kurul —** Özellik hızını iki borç kısıtlıyor: görseller DB'de base64
(MEDIUMTEXT) — liste uçlarını yavaşlatıyor, body-limit'i kilitliyor, yedeği
şişiriyor; ve db.ts hâlâ monolit (routers bölündü, db para yollarıyla sıkı bağlı).
İkisi de "yeni özellik" değil, üstüne inşa edeceğimiz zemin. Render free uykuya
dalınca zamanlayıcı ölüyor — uptime monitörü olmadan AI Lab'ın nöbetçileri
güvenilmez. Güvenlik: `WHATSAPP_APP_SECRET` canlıda doğrulanmalı + periyodik
bağımlılık taraması. **Oy: önce zemin, sonra kule.**

**🎨 UX Lab —** Menü 26+ öğe; patron aradığını bulamıyor — IA sadeleştirme sürekli
iş. Patron sahada, telefonda çalışıyor: sipariş/tahsilat/üretim akışları mobilde
ikinci sınıf. Storefront'u açacaksak jenerik CMS değil, ürün çekirdeğinden
beslenen gerçek bir tasarım ister. S3 geçişi bizim de işimiz: görsel yükleme/
gösterme deneyimi base64'te tıkanıyor. **Oy: sadeleştir, mobilleştir, mağazayı tasarla.**

**🤖 AI Lab —** Elimizde çalışan ama canlıda DOĞRULANMAMIŞ cevher var: tool-use
asistan ajanı (8 araç + onay katmanı) ve nöbetçiler (brifing, tahsilat takipçisi,
stok nöbeti, Q&A oto-cevap). `ANTHROPIC_API_KEY` ile canlıda test edilmeli;
oto-cevap güven eşiği gerçek soru verisiyle kalibre edilmeli. Nöbetçiler uptime'a
bağımlı — o yüzden uptime bizim de bir numaralı oyumuz. Bilgi tabanını doldurmak
asistanın cevap kalitesini doğrudan yükseltir. **Oy: kurulmuş zekâyı canlıya al ve besle.**

**🚀 Yapımcı —** Repoda "bitti" ama "teslim edilmedi" devasa bir kuyruk var:
Trendyol/HB/N11/ÇS bağlantı testleri, resmi kargo etiketi, e-Fatura köprüsü,
Geliver, sesli. Kod hazır, anahtar/canlı bekliyor. En hızlı değer yazılmış kodu
sahaya indirmek. S3 ve db.ts'i de taşırım ama önce "built vs shipped" açığını
kapatalım. **Oy: yazdığımızı çalıştıralım.**

### Oylama yöntemi

Her kurul, şirket için en önemli gördüğü maddelere oy verdi (kendi alanı + şirket
kritik çapraz maddeler). Sıralama = toplam kurul oyu (oy çokluğu). Eşitlik bozucu
(kurulların mutabık kaldığı): **yasal/bloklayan → otomasyonu ayakta tutan → gelir
→ risk/istikrar → efor (düşük önce).**

### EN ÖNEMLİ 20 GELİŞTİRME (oy çokluğuyla sıralı)

| # | Geliştirme | Oy | Veren kurullar | Kategori |
|---|---|---|---|---|
| 1 | e-Fatura/e-Arşiv canlı (Bizimhesap köprüsü, FirmID) | 4 | 🏛💻🤖🚀 | Yasal/parite 🔴 |
| 2 | Uptime monitörü (/api/health) — zamanlayıcıyı ayakta tut | 4 | 🏛💻🤖🚀 | İstikrar / hızlı kazanım |
| 3 | Ürün görsellerinin S3'e taşınması (base64→S3) | 4 | 💻🎨🤖🚀 | Temel borç |
| 4 | Çoklu depo (multi-warehouse) | 3 | 🏛💻🚀 | Parite 🔴 |
| 5 | Storefront güçlendirme (kendi web mağazası) | 3 | 🏛🎨🚀 | En yüksek marj kanal |
| 6 | Stok lot/parti + kalite kontrol (pH/viskozite/ΔE) | 2 | 🏛💻 | Boya moat |
| 7 | Asistan tool-use ajanı canlı doğrulama + genişletme | 2 | 🏛🤖 | Amiral AI |
| 8 | Pazaryeri Q&A oto-cevap güven eşiği kalibrasyonu | 2 | 🏛🤖 | AI kaldıraç |
| 9 | N11 + Çiçeksepeti canlı bağlantı | 2 | 🏛🚀 | Gelir kanalı |
| 10 | Trendyol/HB canlı doğrulama + resmi kargo etiketi | 2 | 🏛🚀 | Gelir / canlı |
| 11 | db.ts modül bölünmesi + servis katmanı | 2 | 💻🚀 | Çekirdek borç |
| 12 | Güvenlik taraması + WHATSAPP_APP_SECRET + bağımlılık denetimi | 2 | 💻🚀 | Risk |
| 13 | Test kapsamı genişletme (finans/senkron) | 2 | 💻🚀 | Güvenlik ağı |
| 14 | Kampanya motoru + SEO/GA4/pixel | 2 | 🏛🎨 | Büyüme |
| 15 | AI görsel üretimi derinleştirme (ilan/mockup) | 2 | 🎨🤖 | İçerik |
| 16 | Ürün bilgi tabanı doldurma (asistan/RAG beslemesi) | 2 | 🏛🤖 | Asistan kalitesi |
| 17 | Menü/IA sadeleştirme (26+ öğe) | 1 | 🎨 | UX temeli |
| 18 | Mobil/PWA kritik akış derinleştirme | 1 | 🎨 | Sahada kullanım |
| 19 | Proaktif nöbetçi genişlemesi (yeni brifing/uyarı) | 1 | 🤖 | Otomasyon değeri |
| 20 | Kokpit aksiyon şeridi + KPI iyileştirme | 1 | 🎨 | Günlük ekran |

**Barajın altı (sonraki dönem):** Sesli uyandırma canlı test (🤖), Geliver kargo
canlı (🚀), onay/boş durum deseni tutarlılık (🎨), kalan list uçları sayfalama (💻).

### Ortak karar (fazlama)

Ham oy sırası önceliği verir; ortak karar bunu **efor + bağımlılıkla** dengeler:

- **Hemen (bu hafta, düşük efor / yüksek kaldıraç):** #2 Uptime (patron ~30 dk
  cron-job.org + küçük iz kodu), #12 `WHATSAPP_APP_SECRET` doğrulama. Kurulmuş her
  şeyi korur.
- **Faz 1 — "Bitti ama canlı değil" borcunu kapat (🚀 ağırlıklı):** #7, #8, #9,
  #10 ve #1'in canlı bağlanması. Kod büyük ölçüde hazır → en hızlı değer.
- **Faz 2 — Yasal + temel borç:** #1 e-Fatura tamamla, #3 S3 göçü, #11 db.ts
  bölünmesi. Üstüne inşa edilecek zemin.
- **Faz 3 — Parite + moat + büyüme:** #4 çoklu depo, #6 lot/parti + kalite kontrol,
  #5 storefront tasarımı, #14 kampanya/SEO.
- **Sürekli/paralel:** #13 test, #16 bilgi tabanı, UX hattı (#17-20, #15).

**Devir:** İlk 3 madde (#1-#3) 🚀 Yapımcı iş fişine alınacak. Riskli maddeler
zorunlu duraklardan geçer: para → `finans-muhasebe-uzmani`+`qa`; şema (#4,#6) →
`veritabani-mimari`; canlı pazaryeri → Render doğrulaması.
