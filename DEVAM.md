# Devam Notu — Art of Colour Kokpit

Bu dosya, yeni bir sohbette kaldığımız yerden **ucuza** devam etmek içindir.
Yeni sohbette sadece şunu yaz: **"DEVAM.md'yi oku ve kaldığımız yerden devam edelim."**

## Proje nedir
Art of Colour (butik Türk boya markası: oto rötuş, airbrush, hobi boyaları) için
işletme yönetim uygulaması. React + tRPC + Drizzle/MySQL + Express. Canlı:
https://artofcolour-kokpit.onrender.com/ (Render, ücretsiz plan). Veritabanı: TiDB Cloud.

## AI Takımı (yeni)
Proje artık ajan takımıyla yönetiliyor: `CLAUDE.md` (CTO protokolü),
`.claude/TAKIM.md` (kadro + evrim günlüğü), `.claude/agents/*.md` (12 uzman),
`.claude/knowledge/art-of-colour.md` (şirket bilgi tabanı). Büyük işlerde
orkestratör `proje-yoneticisi`dir.

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
- Sipariş panosu (kanban kaldırıldı → otomatik akışlı liste + arama/filtre), sipariş kalemleri, elden satış
- Menü gruplama, native confirm → AlertDialog, Geliştirme panosu (fikir→ürün akışı),
  Görevler & Alışveriş, Şablonlar, Alış Faturaları
- Ürünler & türevler: yüzey × ambalaj × renk × **set/paket** türetme, satış başlığı,
  reçete kopyalama, arama, **CSV dışa aktarım (görsel linkleriyle)**, toplu fiyat, etiket yazdırma
- Ürün görselleri (ana/ambalaj/kullanım) + **herkese açık link**: `/api/img/{id}/{tür}`
- Şablon kütüphanesi, Ürün Geliştirme sihirbazı, Formül defteri, Üretim planlayıcı
- Stok/hammadde, fatura girişi (AI fatura okuma), Maliyet & KDV, Strateji & Rapor
- **Satış Analizi** (grafikler), **Görevler & Eksikler**
- **Müşteriler (CRM):** ad/telefon/adres kaydı; sipariş formunda seçince telefon+adres
  otomatik gelir, fatura ve kargo etiketine yapısal adres/telefon yazılır
- **Ödeme & Tahsilat:** siparişte ödendi/kısmi/bekliyor, kartta hızlı "Ödendi" + rozet;
  Kokpit'te **tahsil edilecek** toplamı. Trendyol siparişleri "ödendi" sayılır
- **Giderler:** kira/kargo/reklam/komisyon vb. + Kokpit'te bu ay ciro/gider/net kâr
- **Komut paleti (⌘K):** sayfa + ürün/sipariş/müşteri/hammadde arayıp gitme
- **Strateji Kâr/Zarar:** 30 gün ciro/gider/net + tahsil edilecek + veri-güdümlü uyarılar
- **Sipariş panosu:** arama (müşteri/no/telefon) + ödeme & kanal filtresi; kısmi ödeme tutarı;
  sütun altı toplam+bekleyen; kartta WhatsApp butonu + adres ikonu
- **Asistan/WhatsApp finans:** tahsilat, borçlu müşteri, bu ay ciro/gider/net soru-cevabı
- **Giderler:** düzenleme + kategori kırılımı · **Müşteriler:** sipariş geçmişi + WhatsApp
- **Kokpit:** Bekleyen Tahsilatlar kartı · **Analiz:** gider/net/tahsilat/marj KPI'ları
- **Ürünler:** kartta stok + düşük/sıfır stok renklendirmesi
- **Ön muhasebe — Kasa & Cari (yeni):** Kasa/Banka hesapları + bakiye, birleşik para
  hareketleri (tahsilat/ödeme/gelir/gider), müşteri **cari ekstresi** (borç-alacak-bakiye),
  karttan **Tahsilat Ekle** (siparişin ödeme durumunu otomatik günceller), Kokpit'te kasa kartı.
  Tablolar: `accounts`, `transactions` (migration 0013).
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

## Açık işler / sırada ne var (takım denetimi: 15.07.2026, kanıtlı liste todo.md sonunda)
Sağlık: `pnpm check` 0 hata, 38/38 test geçiyor, kod içi TODO/FIXME borcu yok.

**Kullanıcıdan bekleyenler (kod hazır, sadece canlıda test):**
1. **Hepsiburada 401:** API bilgileri Render'a girilmeli. Hepsiburada anında anahtar
   VERMEZ — panelden "API Entegrasyon İşlemleri" talebi + onay sonrası kullanıcı adı/secret
   gelir. Alınca: (a) Render'a gir, (b) Ayarlar > "Bağlantıyı Test Et". Mevcut 401 kod
   hatası değil, kimlik eksikliği (401/403 ayrımı kodda var).
2. **Trendyol'u canlıda oturt:** anahtarlar girilince "Bağlantıyı Test Et" 200 dönmeli;
   sipariş akışı + "Trendyol'a Gönder" (stok/fiyat, kod tamam: pushTrendyolStockPrice)
   doğrulanmalı.
3. **Trendyol resmi etiket canlı test:** senkron `cargoTrackingNumber` doldurunca kamyon
   butonu ZPL→Labelary→PDF getirmeli (kod + kendi-barkod fallback tam; `LABELARY_URL`
   env ile değiştirilebilir). Bu ortam dışarı çıkamadığı için canlıda test edilmedi.
4. **Sesli uyandırma canlı test:** Picovoice AccessKey ile (iki motor da kodda mevcut;
   kurulum SESLI.md).

**Geliştirme sırası (takım denetiminin bulguları):**
5. **GÜVENLİK — WhatsApp webhook imzası ✔ yapıldı:** `X-Hub-Signature-256` HMAC
   doğrulaması eklendi (`verifyWebhookSignature`, timingSafeEqual, ham gövde üzerinden).
   `WHATSAPP_APP_SECRET` tanımlıysa sahte istek 401; tanımsızsa eski davranış + açılışta
   uyarı. **Render'a `WHATSAPP_APP_SECRET` girilmeli** (Meta → Settings → Basic).
6. **Asistan yazma intent'leri:** "gider ekle"/"tahsilat aldım" intent enum'unda yok —
   sadece soru-cevap var; altyapı (kasa/gider API'leri) hazır.
7. **Hepsiburada stok/fiyat gönderme** + "Servis Anahtarı" desteği kodda hiç yok.
8. **Finans birim testleri:** vatReport, cari bakiyeler, tahsilat→ödeme senkronu, kasa
   bakiyesi, senkron kilidi test kapsamı dışında.
9. **Sonraki entegratörler:** N11/Çiçeksepeti (iskelet yok), iade yönetimi, sıfırdan
   ürün açma, pazaryeri bazlı toplu net kâr raporu (tekil hesaplayıcı Costs.tsx'te var).

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
- Yeni: `client/src/pages/{Customers,Expenses}.tsx`, `client/src/components/CommandPalette.tsx`.
  Migration 0012 (customers, expenses tabloları + orders'a ödeme/adres alanları).
- Kurulum rehberleri: `PAZARYERI.md` (pazaryeri + fatura + görsel link), `WHATSAPP.md`.
