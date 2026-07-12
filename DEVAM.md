# Devam Notu — Art of Colour Kokpit

Bu dosya, yeni bir sohbette kaldığımız yerden **ucuza** devam etmek içindir.
Yeni sohbette sadece şunu yaz: **"DEVAM.md'yi oku ve kaldığımız yerden devam edelim."**

## Proje nedir
Art of Colour (butik Türk boya markası: oto rötuş, airbrush, hobi boyaları) için
işletme yönetim uygulaması. React + tRPC + Drizzle/MySQL + Express. Canlı:
https://artofcolour-kokpit.onrender.com/ (Render, ücretsiz plan). Veritabanı: TiDB Cloud.

## Çalışma kuralları (önemli)
- **Doğrudan `main`'e gönder** (PR yok). Değişiklikten sonra commit + `main`'e push.
- **Az kredi, çok iş:** doğrulamayı riske göre yap — küçük/güvenli değişiklikte sadece
  `pnpm check`; tam test/build/tarayıcı testini yalnızca riskli işlerde (veritabanı,
  para/fatura, pazaryeri, yarış durumu) yap. Ekran görüntüsünü sadece gerekince al.
  Mesajları kısa tut.
- Geliştirme ortamı pazaryerlerine/ TiDB'ye **çıkamaz** (güvenlik duvarı); pazaryeri
  bağlantıları ancak **canlıda (Render)** test edilir. Yerelde MariaDB + mock sunucu kullan.
- Gizli bilgiler sadece Render → Environment'ta; repoya girmez.

## Şu ana kadar yapılanlar (özet)
- Kendi e-posta/şifre girişi, Render dağıtımı, otomatik DB kurulumu
- Sipariş Panosu (kanban), sipariş kalemleri, elden satış
- Ürünler & türevler: yüzey × ambalaj × renk × **set/paket** türetme, satış başlığı,
  reçete kopyalama, arama, **CSV dışa aktarım (görsel linkleriyle)**, toplu fiyat, etiket yazdırma
- Ürün görselleri (ana/ambalaj/kullanım) + **herkese açık link**: `/api/img/{id}/{tür}`
- Şablon kütüphanesi, Ürün Geliştirme sihirbazı, Formül defteri, Üretim planlayıcı
- Stok/hammadde, fatura girişi (AI fatura okuma), Maliyet & KDV, Strateji & Rapor
- **Satış Analizi** (grafikler), **Görevler & Eksikler**
- **Asistan**: WhatsApp + uygulama içi sohbet + mikrofon; satış/stok/sipariş/görev/soru-cevap.
  **Sesli uyandırma** ("Hey Kokpit"): opt-in, sürekli dinleyip anahtar kelimeden sonra komutu
  gönderir (Web Speech API, sadece Chrome; tercih localStorage'da). Elle mikrofon uyandırma açıkken kapalı.
- **Fatura kesme** (KDV dökümlü, yazdırılabilir) + Ayarlar (şirket bilgileri)
- **Pazaryeri:** Trendyol + Hepsiburada sipariş çekme, birleşik senkron, yarış durumu
  kilidi, "Mükerrerleri temizle", "Bağlantıyı Test Et", **Trendyol'a stok/fiyat gönderme**
- **Kargo etiketi/barkod:** her sipariş kartından yazdırılabilir 10×15 cm kargo etiketi
  (gönderen/alıcı + taranabilir **Code 128 barkod**, sipariş no'dan; harici kütüphane yok)
- **Trendyol resmi kargo etiketi:** Trendyol siparişinde kargo takip no varsa "ortak etiket"
  API'sinden ZPL çekilir, **Labelary** ile PDF'e çevrilip yazdırılır; takip no yoksa/başarısızsa
  kendi barkodlu etiketimize düşer. Senkron artık kargo takip no/sağlayıcı/link'i saklar
  (orders tablosuna `cargoTrackingNumber/ProviderName/TrackingLink` eklendi, migration 0011).

## Açık işler / sırada ne var
1. **Hepsiburada 401:** Hepsiburada API bilgileri Render'a girilmeli. Hepsiburada
   Trendyol gibi anında anahtar VERMEZ — panelden "API Entegrasyon İşlemleri" talebi
   açılıp onay + canlı test sonrası kullanıcı adı/secret veriliyor. Ayrıca "Servis
   Anahtarı" olabilir. Kullanıcı bunları alınca: (a) Render'a gir, (b) Ayarlar >
   "Bağlantıyı Test Et" ile HTTP durumunu gör, (c) Servis Anahtarı gerekiyorsa koda ekle.
2. **Trendyol'u canlıda tam oturt:** Render'a Trendyol bilgileri girilince
   "Bağlantıyı Test Et" HTTP 200 dönmeli; sipariş akışı + "Trendyol'a Gönder" (stok/fiyat) doğrulanmalı.
3. **Trendyol resmi etiketini canlıda doğrula:** Sipariş kargoya verilip senkron çalışınca
   `cargoTrackingNumber` dolmalı; kart → kamyon butonu resmi PDF etiketi getirmeli. Yalnızca
   "ortak etiket" anlaşmalı kargolarda çalışır. Bu ortam Trendyol'a/Labelary'ye çıkamadığı için
   **canlıda test edilmedi**. Not: common-label şu an sadece ZPL veriyor; PDF'e Labelary ile çeviriyoruz
   (gerekirse `LABELARY_URL` env ile değiştirilebilir).
4. **Sonraki entegratör adımları:** Hepsiburada'ya stok/fiyat gönderme, sıfırdan ürün
   açma (kategori/marka/görsel/özellik), N11 / Çiçeksepeti eklemek.
5. **Sesli uyandırma** ✔ yapıldı (Asistan sayfası, "Hey Kokpit"). Not: Web Speech API sürekli
   dinleme sadece sekme açıkken ve Chrome'da çalışır; gerçek arka plan "Hey Siri" seviyesi için
   ayrı bir wake-word motoru (ör. Picovoice Porcupine) gerekir — istenirse ayrı adım.

## Teknik notlar (yeni sohbet için)
- Branch: `claude/web-site-development-tx6n7h` ama **doğrudan main'e** push ediliyor.
- Komutlar: `pnpm check` (tip), `pnpm test` (vitest), `pnpm build`, `pnpm db:migrate`.
- Yerel test: MariaDB `mysql://kokpit:kokpit@127.0.0.1:3306/kokpit`; giriş
  artofcolourresmi@gmail.com / ArtOfColour2026!. Pazaryeri testleri mock HTTP sunucusuyla.
- Env değişkenleri: `TRENDYOL_SELLER_ID/API_KEY/API_SECRET`,
  `HEPSIBURADA_MERCHANT_ID/USERNAME/PASSWORD`, `ANTHROPIC_API_KEY`,
  `WHATSAPP_*`, `DATABASE_URL`, `JWT_SECRET`, `OWNER_EMAIL/PASSWORD/NAME`.
- İlgili dosyalar: `server/{trendyol,hepsiburada,marketplace,assistant,whatsapp,images}.ts`,
  `server/routers.ts`, `server/db.ts`, `drizzle/schema.ts`, `client/src/pages/*`.
- Kurulum rehberleri: `PAZARYERI.md` (pazaryeri + fatura + görsel link), `WHATSAPP.md`.
