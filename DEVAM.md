# Devam Notu — Art of Colour Kokpit

Bu dosya, yeni bir sohbette kaldığımız yerden **ucuza** devam etmek içindir.
Yeni sohbette sadece şunu yaz: **"DEVAM.md'yi oku ve kaldığımız yerden devam edelim."**

## Proje nedir
Art of Colour (butik Türk boya markası: oto rötuş, airbrush, hobi boyaları) için
işletme yönetim uygulaması. React + tRPC + Drizzle/MySQL + Express. Canlı:
https://artofcolour-kokpit.onrender.com/ (Render, ücretsiz plan). Veritabanı: TiDB Cloud.

## AI Takımı (yeni)
Proje artık ajan takımıyla yönetiliyor: `CLAUDE.md` (CTO protokolü),
`.claude/TAKIM.md` (kadro + evrim günlüğü), `.claude/agents/*.md` (13 uzman),
`.claude/knowledge/art-of-colour.md` (şirket bilgi tabanı). Büyük işlerde
orkestratör `proje-yoneticisi`dir.

**Kurullar (5 kalıcı sohbet, 2026-07-22):** 13 ajanın üstünde 5 kurul orkestrasyon
katmanı — `.claude/KURULLAR.md`, tüzük+hafıza `.claude/boards/*.md`, komutlar
`/urun-kurulu /teknik-kurul /ux-lab /ai-lab /yapimci` (dizin `/kurullar`). 1. kurul
toplantısında en önemli 20 geliştirme oy çokluğuyla sıralandı
(`.claude/boards/KURUL-TOPLANTILARI.md`). Uygulanan ilk dilimler (dış bağımlılıksız,
doğrulanmış): **Çek/Senet Nöbetçisi** (scheduler 09:00 + Kokpit aksiyon şeridi +
Sabah Brifingi), **banka mutabakatı + kupon motoru test ağı**, **boya kalite
kontrol beyni** `shared/quality.ts`. 302 test. Kalan maddeler canlı/patron/DB-sprint
kuyruğunda (kurul TaskList + tutanak).

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
- **Asistan**: WhatsApp + uygulama içi sohbet + mikrofon; satış/stok/sipariş/görev/soru-cevap
  + yazma komutları: **gider ekle** ve **tahsilat aldım** (cari + siparişe otomatik işlenir).
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

- **Fiyat & Kâr Motoru (/fiyat, YENİ):** tüm ürünler tek tabloda — formülden maliyet
  (tek sorguda), kanal profiline (komisyon/KDV/işlem bedeli, ayarlanabilir) göre net kâr
  ve marj; zararda filtresi; satır içi fiyat düzenleme. **Kâr modeli v2 (finans onaylı,
  15.07.2026):** hesap KDV-hariç baza indirgendi (satış KDV'sinin tamamı gider değil;
  komisyon/işlem/kargo KDV'leri indirilir), ödeme bedeli %, işlem bedeli ve stopaj (%1)
  eklendi; kanal profillerinde tür ayrımı (pazaryeri / web sitesi / elden) + web sitesi
  için banka POS'u (BSMV, KDV indirimsiz) / ödeme kuruluşu seçimi. Trendyol resmi
  hesaplayıcısıyla kuruş kuruş aynı sonuç (referans vaka testte). Marj artık KDV-hariç
  satışa göre; saf mantık `shared/pricing.ts` calcChannelProfit. **Toplu fiyatlama:** % zam,
  hedef marj, maliyet×çarpan, sabit tutar + x,90 yuvarlama + önizleme. **Excel/CSV ile
  fiyat güncelleme** (barkod/ID eşleşmeli, diff önizlemeli). Seçili/tüm ürünleri
  **Trendyol'a ve Hepsiburada'ya** tek tıkla stok/fiyat gönderme (HB Listing API
  price-uploads/stock-uploads, `HEPSIBURADA_SERVICE_KEY` desteği). Saf mantık
  `shared/pricing.ts` (23 test).
- **Ürün kartı otomatik doldurma (17.07.2026, ÜRÜN KAYIT Excel paritesi):**
  `productSeries` tablosu (seri bazlı **kâr oranı + KDV + hazır açıklamalar**;
  Şablonlar sayfasında "Ürün Serileri" bölümünden yönetilir) + products'a pazaryeri
  alanları eklendi: sku, category, profitMargin, vatRate, desi, paintType,
  features(JSON), shortDescription, longDescription, applicationText,
  imageUrls(JSON), videoUrl, mockupUrl, labelWarnings (migration 0020).
  Ürün formunda **"Otomatik Doldur"** (reçete maliyeti × seri kârı → fiyat önerisi,
  SKU/barkod, seri açıklamaları; `products.autofill`) ve **"AI ile Yaz"**
  (Claude: açıklamalar + etiket yazısı/uyarıları + 5 özellik; `products.aiFill`).
  Türev sihirbazı ve ürünleştirme (devProjects.convert) da bu alanları doldurur.
  Excel verileri repoda: `scripts/data/urun-kayit.json`; canlıya aktarım:
  **`pnpm import:urun-kayit`** (idempotent — Render'da bir kez çalıştırılmalı).
  Saf mantık `server/autofill.ts` (12 test). Görsel ÜRETİMİ (ana görselden ürün
  görseli) henüz yok — ayrı görsel API'si gerektirir, faz 2.

## KOKPİT V2 — stratejik analiz hazır (15.07.2026)
`docs/KOKPIT-V2-ANALIZ.md`: mevcut durum analizi, Odoo/Quka/Shopify/ERPNext/Zoho/
Monday karşılaştırması, 30 modüllük değerlendirme tablosu, V2 mimarisi (modüler +
plugin + AI-first + çok şirket) ve **4 fazlı yol haritası** (Faz 0: veri modeli
borçları — partner-ID göçü, orderItems.productId, FK/indeks, S3 görseller;
Faz 1: tool-use AI ajanı + proaktif brifing/nöbetçiler; Faz 2: iade/soru-cevap/
e-Fatura/teklif/N11; Faz 3: çok kullanıcı/şirket + REST API + plugin).
V2 uygulamasına başlarken önce bu belgeyi oku. Yeni ajan: `ux-tasarimci`.

**Faz 0 / Sprint 0.1 ✔ yapıldı (15.07.2026):** migration 0016 —
(a) cari ID kolonları: `orders.customerId`, `transactions.customerId/supplierId`,
`purchases.supplierId`, `orderItems.productId` + isim eşleşmeli backfill
UPDATE'leri; (b) 21 ikincil indeks (orders/transactions/orderItems/products/
formulaItems/stockMovements/purchases/customers/suppliers/productImages);
(c) tüm yazma yolları ID çözümlüyor (createOrder/updateOrder/createTransaction/
createPurchase/replaceOrderItems — pazaryeri kalemlerinde barkod→ad eşleşmesi,
saf mantık `orderUtils.resolveProductIdForItem`, 6 test); (d) cari ekstre/
bakiye ID-öncelikli (isim değişse de cari kopmaz; ID'siz eski kayıtlar isimle
yakalanır); (e) güvenlik: oturum cookie `sameSite=lax`, temel güvenlik
başlıkları (nosniff/frame-deny/referrer). 89/89 test, 0 tip hatası, build ✓.
**Migration canlıda deploy'la otomatik koşar (`pnpm db:migrate`).**

**Faz 0.2 + Faz 1 çekirdeği + iade yönetimi ✔ yapıldı (15.07.2026, mega-sprint):**
- **Mamul stok & üretim (0017):** `productMovements` (satışta düş, iptalde iade,
  üretimde ekle; eksi stok = "üretilecek" sinyali) + `productionRuns` (üretim
  emri geçmişi, `production.runs` ucu). Tüm kalem yazımları `replaceOrderItems`
  üzerinden stok yürütür; durum geçişleri `updateOrder`'da.
- **İade yönetimi:** siparişlerde `cancelled` durumu; Trendyol/HB senkronunda
  iptal/iade edilen paket yerel siparişi otomatik iptal eder (stok iadesiyle).
  İptaller ciro/alacak/KDV/cari/analiz hesaplarının TAMAMINDAN hariç. Sipariş
  kartında "İptal / İade et" + geri alma; panoda ayrı İptal/İade bölümü.
- **Bildirim merkezi (0017):** `notifications` tablosu + zil UI (mikrofonun
  üstünde, okunmamış rozeti). `notifyOwner` bildirim + WhatsApp'a kopya
  (WHATSAPP_ALLOWED_NUMBERS ilk numara), 24 saat tekrar-önleme.
- **Zamanlayıcı (`server/scheduler.ts`):** 15 dk'da bir pazaryeri OTO-senkron
  (yeni sipariş → bildirim+WhatsApp; hata → uyarı), saatlik Stok Nöbetçisi
  (kritik hammadde → eksik listesine otomatik + bildirim; eksi mamul →
  "üretim gerekli"), her sabah 08:00 TR Sabah Brifingi (ciro/gider/net, kasa,
  alacaklar, açık işler). İzler settings'te; `SCHEDULER_DISABLED=1` ile kapanır.
  Render free uykuya dalarsa durur → /api/health'e uptime monitörü şart.
- **PWA:** service worker eklendi (navigasyon network-first, hash'li asset
  cache-first, API'ye dokunmaz) + prod kaydı; manifest/ikonlar zaten vardı.
- **companyId (0018):** 25 iş tablosuna `companyId INT NOT NULL DEFAULT 1` —
  çok-şirket hazırlığı, davranış değişikliği yok.
- Doğrulama: 0 tip hatası, 89/89 test, build ✓. **main'e deploy edildi.**

**Mega Sprint "Satış Döngüsü & Kârlılık" ✔ yapıldı (16.07.2026):**
- **Teklif modülü (/teklifler, 0019):** `quotes`/`quoteItems` tabloları; teklif oluştur
  (müşteri otomatik dolum + kalem satırları), durum akışı (taslak/gönderildi/kabul/
  red/süresi doldu), **kabul → tek tıkla siparişe dönüştürme** (kanal "elden", stok
  düşümü replaceOrderItems'ta, teklif "converted" + orderId bağı), yazdırılabilir
  FİYAT TEKLİFİ (KDV dökümlü, `lib/quote.ts`) + WhatsApp paylaşımı. Teklifler
  stok/ciro/cari/KDV hesaplarına GİRMEZ. Menü (Satış & Müşteri) + ⌘K kayıtlı.
- **Mamul kritik stok eşiği (0019):** `products.criticalQty`; Ürünler'de "Düşük Stok"
  filtresi, eşiğe göre renklendirme (sabit <5 eşiği kalktı), türev satırında stok;
  Stok Nöbetçisi artık eşik altı mamulleri de bildirir (eksi stok + eşik).
- **Tahsilat Takipçisi (Faz 1):** her gün 09:00 TR, 30+ gündür ödenmemiş siparişler
  müşteri bazında gruplanır → bildirim + WhatsApp'a hazır hatırlatma taslağı
  (`runCollectionChaser`; saf mantık `financeUtils.overdueReceivables`).
- **Kanal Kârlılığı raporu:** Analiz sayfasında kanal bazlı GERÇEK net kâr tablosu
  (`report.channelProfit`, 30/90/365 gün): kâr modeli v2 ile sipariş başına hesap —
  işlem bedeli/kargo sipariş başına BİR kez, yüzdesel kesintiler toplam üzerinden;
  kanal→profil eşleşmesi (tam ad→kısmi→elden), maliyeti bilinmeyen kalemler işaretli.
- **Finans saf fonksiyonları (`server/financeUtils.ts`):** kasa bakiyesi, müşteri/
  tedarikçi cari bakiyeleri, KDV özeti, tahsilat→ödeme durumu senkronu ve vadesi
  geçen alacaklar db.ts'ten çıkarıldı (davranış birebir) + **27 yeni birim testi**
  (finance.test.ts, report.channel.test.ts). Toplam 116/116 test, 0 tip hatası, build ✓.

**Hata avı sprint'i ✔ yapıldı (16.07.2026):** program eklenmeden 7 hata düzeltildi —
(1) HB siparişleri artık `paymentStatus: "paid"` (alacak kartını/Tahsilat
Takipçisi'ni şişirmiyor, Trendyol'la aynı kural); (2) pazaryeri senkronu sipariş
durumunu artık yalnızca İLERİ taşır (`orderUtils.shouldSyncOrderStatus` — elle
"Üretimde"ye alınan sipariş geri "Yeni"ye basılmaz); (3) asistan tahsilatı iptal
edilmiş siparişe bağlanamaz (`findOpenOrderForCollection` status filtresi);
(4) `istanbulHour` `hourCycle:"h23"` (gece yarısı "24" dönüp brifingi 00:00'da
tetikleyebiliyordu); (5) `dedupeOrders` artık `deleteOrder` üzerinden siler
(mükerrerin düştüğü mamul stok iade edilir); (6) `deleteProduct` görsel
(base64/MEDIUMTEXT) + mamul hareket artıklarını da temizler; (7) dönüşmüş teklif
düzenlenemez (siparişle sessiz ayrışma engellendi). 124/124 test, build ✓.

**Ürün & Üretim sprint'i ✔ yapıldı (16.07.2026):** modül baştan sona denetlendi,
8 eksik kapatıldı (migration gerekmedi, mevcut tablolar yetti):
- **Üretim Kuyruğu:** eksi stok / kritik eşik altındaki mamuller Üretim sayfasının
  tepesinde önerilen adetle listelenir (Stok Nöbetçisi kuralıyla aynı); "X adet
  planla" tıklayınca planlayıcı dolar. Reçetesiz ürünler işaretli.
- **Üretim geçmişi + geri alma:** `production.runs` artık ekranda (tarih/ürün/
  adet/not); yanlış emir "geri al" ile düzeltilir (`production.undo`: hammadde
  güncel reçeteye göre iade, mamul stok düşümü, kayıt silinmez — nota ⛔ damgası).
- **Planlayıcı akıllandı:** hiyerarşik ürün seçici (ana → türev, reçetesizler
  "(reçete yok)"), mevcut hammaddeyle üretilebilecek azami adet, adet başı maliyet;
  üretim kaydı artık ürün stoğu/kokpit/geçmiş önbelleklerini de tazeliyor.
- **Mamul stok defteri UI:** ürün satırında kutu ikonu → giriş/çıkış (not ile,
  `products.adjustStock`) + hareket geçmişi (`products.movements`). Ürün kartından
  mutlak stok değişikliği de artık otomatik hareket kaydı düşer (defter ayrışmaz).
- **Hammadde derinliği:** Stok sayfasında arama, toplam envanter değeri, formda
  tedarikçi seçimi (schema'daki supplierId nihayet bağlandı), hareket geçmişi +
  "hangi reçetelerde kullanılıyor" dialogu (`materials.usage`).
- **Reçete kopyalama:** Formül Defteri'nde "Reçete Kopyala" — kaynak ürün + çarpan
  (2'li set→2, yarım boy→0,5), mevcut kalemler değiştirilir (`formula.copyFrom`).
  Kalem satırında maliyet payı %.
- **Ürünler:** arama artık barkod/renk kodunu da bulur; "HB'ye Gönder" butonu
  (Trendyol'un yanında). Doğrulama: 0 tip hatası, 124/124 test, build ✓.

**Üretim sayfası yenilendi ✔ (17.07.2026):** kullanıcı "hâlâ çok kötü" dedi,
sayfa baştan tasarlandı (migration yok; `formula.all` + `produce.note` +
`runs.limit` uçları eklendi):
- **Özet şerit:** bu ay / son 30 gün üretim (adet+emir, geri alınanlar hariç),
  kuyruk durumu (kaçı hemen üretilebilir), kritik hammadde sayısı (→ /stok).
- **Kuyruk akıllandı:** her satırda renk sıvaması, ana→türev etiketi ve hammadde
  hazırlık rozeti ("hammadde hazır" / "en fazla N" / "hammadde yok" / "reçete
  yok") — `formula.all` ile istemcide üretilebilirlik hesabı. 8+ satır katlanır.
- **Planlayıcı:** aranabilir ürün seçici (Command+Popover: isim/seri/renk kodu,
  sıvama, stok, reçete rozeti), hızlı adet çipleri ("Eşiğe tamamla" / "Azami"),
  darboğaz hammadde rozeti, eksik hammaddede tedarikçi ipucu, maliyet/marj
  paneli (toplam, adet başı, satış değeri, birim kâr + %), parti/lot notu
  (`produce.note` — zorlama notuyla " · " birleşir). Pasif ürünler artık seçici
  ve kuyruğa girmez.
- **Geçmiş:** ürün/not araması, boş durumlar, "daha eski kayıtları göster"
  (limit 50→+100, azami 500), mobilde yatay kaydırma. 0 tip hatası, 124/124 test.

**"Problemlerimiz" sprint'i ✔ yapıldı (21.07.2026, patron notlarından 8 başlık):**
- **Trendyol ortak etiket `COMMON_LABEL_NOT_ALLOWED`:** kalıcı yetki hatası artık
  tanınıyor (`isCommonLabelNotAllowed`, testli) → ayara damga vurulup 7 gün API
  yorulmadan kendi etikete düşülüyor (sonra otomatik yeniden dener); kullanıcıya
  hata değil bilgi tostu. Yetki için kategori sorumlusuna başvuru notu
  PATRON-GOREVLERI'nde. Uç artık `{pdfBase64|null, fallback, message}` döner.
- **WhatsApp "cevap gelmiyor" tanısı:** izinli numara eşleşmesi son-10-hane
  oldu (05xx/905xx/+90 farkı çözüldü, saf `isAllowedNumberMatch` + 7 test);
  tüm webhook/mesaj/gönderim olayları bellekte loglanıyor; **Ayarlar →
  "WhatsApp Tanı"** kartı (yapılandırma kontrol listesi + son olaylar + test
  mesajı butonu, `whatsapp.diagnostics/sendTest`). WHATSAPP.md'ye karar ağacı.
- **Sipariş içerik dökümü:** panoda **"İçerik Dökümü"** butonu (Yeni/Aktif/
  Filtrelenen tümü) + kart menüsünde tek sipariş; kalem kalem A4 toplama fişi
  (işaret kutulu), sipariş başına sayfa, tarayıcıdan PDF (`lib/orderContents.ts`,
  `orders.itemsBulk` tek sorgu).
- **Maliyet parametreleri işlendi (patron rakamları):** işçilik 150 ₺/saat,
  genel gider 15.000 ₺/ay, ortalama 150 adet/ay → **100 ₺/adet** pay otomatik
  (`deriveUnitLaborOverhead`, shared/pricing, 6 test; elle değer ezer). Ayarlar'da
  "Maliyet Parametreleri" kartı; Fiyat Motoru/Maliyet/Kanal Kârlılığı/sihirbaz
  `unitLaborOverheadEffective` kullanıyor.
- **Hepsiburada canlıya geçiş testi:** `HEPSIBURADA_ENV=sit` ile tüm uçlar SIT'e
  döner (OMS/listing/mpop; oto-senkron kapanır, test verisi panoya karışmaz);
  **Ayarlar → "Hepsiburada Test Ortamı"** paneli: katalog gönder→trackingId,
  envanter listele→stok/fiyat push→uploadId'ler, test siparişi→listele→paketle→
  packageNumber (`server/hepsiburadaTest.ts`, `hbTest.*` uçları). Rehber PAZARYERI.md.
- **Geliver kargo:** `server/kargo.ts` gerçek adaptör (POST /shipments → en ucuz
  teklif /transactions ile satın al → takip no siparişe, etiket URL açılır;
  `GELIVER_TEST_MODE=1` ücretsiz deneme). Kart menüsünde "Geliver gönderisi"
  (onaylı). Patron rehberi: **KARGO.md** (token: app.geliver.io/apitokens).
- **e-Fatura = Bizimhesap:** karar + adaptör (`buildBizimhesapInvoice`, 4 birim
  test; addinvoice alan adları resmi apidocs ile birebir). Gerekli tek şey
  destek talebiyle **FirmID** → `EFATURA_PROVIDER=bizimhesap` + `BIZIMHESAP_FIRM_ID`.
  Cevap netleşti: GİB'e "direkt" kesim yok, doğru mimari Kokpit→Bizimhesap→GİB.
  Rehber: **EFATURA.md**. PayTR patron kararıyla ertelendi.
- Doğrulama: 0 tip hatası, 252/252 test, build ✓.

**Kapsamlı özellik analizi & plan ✔ (21.07.2026):** tüm modüller denetlendi —
envanter/olgunluk tablosu, teknik borçlar (routers/db monoliti, base64 görseller,
sayfalamasız list uçları, ölü ComponentShowcase), UX bulguları (menü yoğunluğu,
Maliyet↔Fiyat çakışması, Kokpit aksiyon şeridi eksiği, sessiz hatalar) ve
3 sprint + canlı doğrulama hattı planı: **docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md**.
**ÜÇ SPRINT DE UYGULANDI (21.07.2026, aynı gün):** ayrıntılı işaretli liste todo.md
"ANALİZ SPRINTLERİ" bölümünde. Özet:
- Sprint 1: Kokpit aksiyon şeridi + zamanlayıcı sağlık rozeti; global hata toast'u;
  menü IA (Maliyet→/fiyat sekmesi + redirect, Şablonlar/Görevler taşındı); Ayarlar
  "Bağlantı Durumu" kartı (settings.integrationStatus); ComponentShowcase silindi.
- Sprint 2: orders/transactions sayfalama ("daha eski yükle"); routers.ts → 59 satır
  barrel + server/modules/* (5 domain dosyası, davranış birebir); oturum 30 gün +
  auth.logoutAll (sunucu tarafı iptal, _core/sdk'da iat kontrolü) + Güvenlik kartı;
  senkron kilidi/scheduler vadesi/oturum iptali saf fonksiyon + 9 test. db.ts
  bölünmesi ve S3 göçü bilinçli ertelendi (gerekçe todo.md'de).
- Sprint 3: **asistan tool-use ajanı** (assistantAgent.ts: 8 araç, onaylı işlemler
  "evet/hayır" onay katmanından geçer, hata durumunda eski intent akışına düşer;
  WhatsApp + uygulama içi aynı kapı: runAssistant) — canlıda ANTHROPIC_API_KEY ile
  test edilecek; CRM Satış Boru Hattı (/firsatlar, migration 0023); kamerayla barkod
  okuma (Ürünler); A1/A3'ün kodda zaten tamamlanmış olduğu doğrulanıp işaretlendi.
- Doğrulama: 0 tip hatası, 264/264 test, build ✓. Çalışma dalı:
  claude/feature-analysis-planning-oq2vv7 (bu oturumun talimatı gereği; main'e
  merge patron onayıyla).

**Kod dışı bekleyenler (kullanıcı/dış taraf):** HB test bilgileri (e-postayla
gelecek → PAZARYERI.md süreci), Bizimhesap FirmID (destek talebi), Geliver
API token (KARGO.md), Trendyol ortak etiket yetkisi (kategori sorumlusu,
opsiyonel), N11-Çiçeksepeti API anahtarları, uptime monitörü kurulumu
(cron-job.org → /api/health, 10 dk'da bir), adet başı işçilik dakikası (Ayarlar).
Sırada (kod): görsellerin S3'e taşınması (0.3), routers/db modül bölünmesi (0.4),
asistanın tool-use ajanına dönüşümü, pazaryeri soru-cevap kuyruğu.

## Açık işler / sırada ne var (takım denetimi: 15.07.2026, kanıtlı liste todo.md sonunda)
Sağlık: `pnpm check` 0 hata, 74/74 test geçiyor, kod içi TODO/FIXME borcu yok.

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
6. **Asistan yazma intent'leri ✔ yapıldı:** "gider ekle" (expense_add) ve "tahsilat
   aldım" (collection_add) eklendi. Tahsilat müşteri carisine + ödenmemiş en eski
   siparişe işlenir (ödeme durumu otomatik güncellenir), varsayılan kasa hesabına yazılır.
   7 birim testi; yardım metni güncel.
7. **Hepsiburada stok/fiyat gönderme ✔ yapıldı** (Fiyat & Kâr Motoru F4): Listing API
   push'u + `HEPSIBURADA_SERVICE_KEY` desteği. **Render'a Servis Anahtarı girilmeli**,
   canlıda test edilecek (barkod = merchantSku varsayımı doğrulanmalı).
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
