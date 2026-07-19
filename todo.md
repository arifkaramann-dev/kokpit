# Art of Colour Kokpit — TODO

## Altyapı
- [x] Veritabanı şeması: siparişler, sipariş kalemleri, hammaddeler, ana ürünler, türev ürünler, formül kalemleri, tedarikçiler, kampanyalar
- [x] Migration üretimi ve veritabanına uygulanması
- [x] Tema/tasarım sistemi (index.css, font, renk paleti — sade ve işlevsel, boya markasına uygun canlı vurgu rengi)
- [x] DashboardLayout ile sidebar navigasyon ve rota yapısı (App.tsx)

## Modül 1: Sipariş Panosu
- [x] Sipariş CRUD (müşteri adı, kanal, tutar, notlar, kalemler)
- [x] Kanban panosu: Yeni / Üretimde / Kargoya Hazır / Tamamlandı sütunları
- [x] Sürükle-bırak ile durum değiştirme (optimistic update)
- [x] Kanban yerine otomatik akışlı sipariş listesi (arama + ödeme/kanal filtreleri) — güncel görünüm
- [x] Sipariş detay/düzenleme dialogu

## Modül 2: Hammadde ve Stok Takibi
- [x] Hammadde CRUD (ad, kategori: pigment/solvent/şişe/etiket/diğer, birim, stok miktarı, kritik eşik, birim maliyet)
- [x] Stok giriş/çıkış hareketi (miktar güncelleme)
- [x] Kritik stok uyarısı (eşik altına düşünce görsel uyarı + dashboard'da gösterim)

## Modül 3: Ana Ürün ve Türev Ürün Sistemi (esnek)
- [x] Ana ürün CRUD (ad, seri, renk kodu, temel satış fiyatı)
- [x] Sınırsız/esnek türev ekleme: türev adı, serbest metin yüzey/kullanım alanı tipi, katkı maddeleri ve oran farkları
- [x] Türev tipi önceden sabit DEĞİL — kullanıcı istediği yüzey tipini kendisi tanımlar
- [x] Her türev bağımsız formül taşır

## Modül 4: Ürün Formül Defteri
- [x] Ana ürün ve türev için hammadde bazlı formül kalemleri (hammadde + miktar + birim + not)
- [x] Formül görüntüleme/düzenleme arayüzü

## Modül 5: Maliyet ve Kar Marjı Hesaplayıcı
- [x] Formülden otomatik hammadde maliyeti hesabı
- [x] Ambalaj + kargo maliyeti girişi
- [x] Satış fiyatı + indirim oranı → net kar, kar marjı %, otomatik hesap
- [x] Ürün bazlı maliyet kayıt/güncelleme

## Modül 6: AI Pazarlama Metin Ajanı
- [x] LLM entegrasyonu (server-side invokeLLM)
- [x] İçerik tipi seçimi: ürün açıklaması / Instagram postu / reklam metni
- [x] Ürün seçimi + ton + ek yönergeler girişi
- [x] Üretilen metinleri kaydetme ve geçmiş listesi, kopyalama

## Modül 7: Kampanya Takvimi
- [x] Kampanya CRUD (ad, ürün grubu, başlangıç/bitiş, indirim oranı, not, durum)
- [x] Aylık takvim görünümü
- [x] Yaklaşan kampanyalar listesi + dashboard'da hatırlatma

## Modül 8: Tedarikçi Rehberi
- [x] Tedarikçi CRUD (firma, ilgili kişi, telefon, e-posta, tedarik ettiği malzemeler, son sipariş tarihi, fiyat notları)

## Modül 9: Dashboard (Kokpit)
- [x] Günlük/toplam sipariş özeti kartları
- [x] Kritik stok uyarı listesi
- [x] Yaklaşan kampanyalar
- [x] Sipariş durum dağılımı ve hızlı erişim linkleri

## Test & Teslim
- [x] Vitest testleri (10 test geçiyor: kar marjı hesabı, kritik stok uyarı mantığı, sipariş durum akışı, auth)
- [x] Ekran görüntüleriyle görsel doğrulama
- [x] Checkpoint + teslim

## Modül 10: Müşteriler & Tahsilat & Giderler (eklendi)
- [x] Müşteriler (CRM): ad/telefon/adres kaydı, sipariş formunda seçince otomatik dolum
- [x] Sipariş ödeme durumu (ödendi/kısmi/bekliyor) + kartta hızlı "Ödendi" + tahsilat toplamı
- [x] Kargo etiketi ve faturaya yapısal müşteri adres/telefon
- [x] Giderler modülü + Kokpit'te bu ay ciro/gider/net kâr
- [x] Komut paleti (⌘K) — sayfa + ürün/sipariş/müşteri/hammadde hızlı arama

## Modül 11: Finans derinleştirme & panoda arama (eklendi)
- [x] Strateji Kâr/Zarar: 30 gün gider + net kâr + tahsil edilecek + uyarılar
- [x] Sipariş panosunda arama (müşteri/no/telefon) + ödeme & kanal filtresi
- [x] Kısmi ödeme tutarı girişi (düzenleme dialogunda "Ödenen Tutar")
- [x] Müşteri kartında sipariş geçmişi özeti (adet, toplam harcama, borç)

## Modül 12: İşlevsellik & finans batch'i (eklendi)
- [x] Asistan/WhatsApp: tahsilat, borçlu müşteri, bu ay ciro/gider/net soru-cevabı (snapshot)
- [x] Giderler: düzenleme + bu ay kategori kırılımı (çubuklar)
- [x] Müşteriler: sipariş geçmişi detay dialogu + WhatsApp linki + başlıkta toplam alacak
- [x] Sipariş panosu: sütun altı toplam + bekleyen tutar; kartta WhatsApp butonu + adres ikonu
- [x] Kokpit: Bekleyen Tahsilatlar kartı (en yüksek borçlu siparişler)
- [x] Ürünler: kartta stok + düşük/sıfır stok renklendirmesi
- [x] Satış Analizi: 30 gün gider / net / tahsilat / kâr marjı KPI'ları

## Modül 13: Ön muhasebe — Kasa & Cari (eklendi, Bizimhesap yönü)
- [x] Kasa & Banka hesapları + güncel bakiye (açılış + gelen − giden)
- [x] Birleşik para hareketleri: tahsilat / ödeme / gelir / gider (+ hesaba işleme)
- [x] Müşteri cari ekstresi (sipariş=borç, tahsilat=alacak, yürüyen bakiye)
- [x] Karttan "Tahsilat Ekle" → siparişin ödeme durumu otomatik güncellenir
- [x] Kokpit'te Kasa/Banka bakiye kartı + asistan snapshot'ta kasa bakiyesi

## Modül 14: Kayda girmemiş tamamlanmış işler (15.07.2026 takım denetiminde eklendi)
- [x] Geliştirme panosu (/gelistirme): 5 adımlı fikir→ürün akışı (devProjects/devTrials/devTrialItems tabloları)
- [x] Görevler & Alışveriş Listesi (/gorevler, tasks tablosu)
- [x] Şablon kütüphanesi (/sablonlar): ambalaj/renk/set-paket şablonları (templates tablosu)
- [x] Alış Faturaları (/faturalar): purchases/purchaseItems + AI fatura okuma
- [x] Sidebar menü gruplama + native confirm'lerin AlertDialog'a (ConfirmDialog) dönüşümü
- [x] Üretim planlayıcı + toplu fiyat güncelleme + etiket baskısı

## Rakip paritesi için yol haritası (Bizimhesap + Qukasoft'u geçmek)
Ön muhasebe (Bizimhesap):
- [x] Tedarikçi carisi (alış faturaları → borç, ödeme → alacak, ekstre + bakiye)
- [x] Kasa/banka: hesaplar arası transfer
- [x] KDV raporu (satış/alış KDV özeti, bu ay/bu yıl)
- [x] Müşteri cari bakiyesi tahsilatları da içerir (customers.balances)
- [x] Tahsilat/Ödeme makbuzu yazdırma (printReceipt) — Accounts + Purchases'ta kullanılıyor
- [x] Cari Hesaplar genel bakış sayfası (/cari) — alacak/borç/net
- [x] Nakit Akışı raporu (Strateji sekmesi) — giriş/çıkış/net + kategori
- [x] Çek/senet takibi (/cek-senet) — portföy, vade, durum, vadesi geçen uyarısı (cheques tablosu)
- [x] Teklif (quote) → siparişe dönüştürme (/teklifler, quotes/quoteItems, migration 0019;
      yazdırma + WhatsApp paylaşımı + kabul→sipariş dönüşümü; 16.07.2026 mega sprint)
- [ ] e-Fatura/e-Arşiv entegratörü (Foriba/İzibiz/Uyumsoft) — dış servis + anlaşma gerekir;
      şu an yalnızca bilgi/proforma faturası basılıyor (invoice.ts)
Pazaryeri (Qukasoft):
- [x] Hepsiburada stok/fiyat gönderme + "Servis Anahtarı" desteği (F4'te yapıldı; canlıda HEPSIBURADA_SERVICE_KEY ile test edilecek)
- [x] N11 + Çiçeksepeti entegratörleri (sipariş çekme + stok/fiyat) — server/n11.ts +
      server/ciceksepeti.ts, marketplace.ts 4 pazaryeri, push + testConnection, 9 test
      (MEGA SPRINT 18.07); canlı test bekler
- [x] Komisyon/kesinti bazlı net kâr raporu (pazaryeri/kanal bazında) — Analiz sayfasında
      "Kanal Kârlılığı" tablosu (report.channelProfit, kâr modeli v2; 16.07.2026 mega sprint)
- [x] İade yönetimi: cancelled durumu + senkronda otomatik iptal + stok iadesi + rapor/cari hariç tutma (soru-cevap yönetimi hâlâ açık)
- [ ] Sıfırdan ürün açma (kategori/marka/özellik/görsel) — çoklu pazaryeri

## YENİ ÖNCELİK — Fiyatlandırma & kâr hızlandırma paketi (15.07.2026, patron kararı)
Asistan yazma komutları (aşağıda 2. madde) ertelendi; önce işleyişi hızlandıran
fiyat/kâr araçları gelecek. Araştırma bulguları: tekil hesaplayıcı var (Costs.tsx,
tek ürün seç → kaydet), toplu güncelleme sadece yüzde zam/indirim (bulkUpdatePrices),
Excel/CSV İÇE aktarım yok (sadece dışa aktarım var), Trendyol fiyat push var,
Hepsiburada push yok, web sitesi (Qukasoft) entegrasyonu yok.

- [x] F1. **Fiyat & Kâr tablosu** (/fiyat, Pricing.tsx): tüm ürünler tek tabloda —
      formülden hammadde maliyeti (tek sorgu: products.costSummary) + ambalaj +
      kargo, kanal profiline göre net kâr ve marj rozeti; arama/seri/zararda
      filtresi, marj sıralaması, satır içi fiyat düzenleme (Enter/odak kaybı).
- [x] F2. **Formülle toplu fiyatlama:** % zam/indirim, hedef marj % (KDV+komisyon
      düşülmüş), maliyet × çarpan, sabit tutar; x,90/x,99/tam sayı yuvarlama;
      eski→yeni önizleme → onayla → uygula (products.applyPrices). Saf mantık
      shared/pricing.ts'te, 23 birim testi (pricing.test.ts).
- [x] F3. **Excel/CSV ile fiyat güncelleme:** Barkod/ID/SKU + Fiyat sütunlu CSV
      yükle → barkod, sonra ID ile eşleşme + diff önizleme + hatalı satır raporu
      → onayla → uygula. TR/EN sayı biçimleri ve Türkçe başlıklar desteklenir.
- [x] F4. **Kanallara yansıtma:** tablodan seçili/tüm ürünleri tek tıkla
      Trendyol'a VE Hepsiburada'ya gönderme. Hepsiburada Listing API push'u
      yazıldı (price-uploads + stock-uploads, barkod=merchantSku,
      HEPSIBURADA_SERVICE_KEY desteği — Render'a girilmeli). Web sitesi
      (Qukasoft): API yoksa mevcut CSV dışa aktarımı kullanılır; canlıda
      araştırılacak.
- [x] F5. **Kanal profilleri:** komisyon/işlem bedeli/KDV/kargo kanal başına
      ayarlanabilir (settings.channelProfiles, migration gerekmedi); F1 tablosu
      ve hedef marj hesabı bu profilleri kullanır.

## F6. Kâr modeli v2 — kanal bazlı doğru hesap (15.07.2026, patron bildirimi üzerine)
- [x] HATA: eski calcMarketplace satış KDV'sinin tamamını gider düşüyordu (referans
      vakada kârı 29,78 gösteriyordu, doğrusu 42,28 — ~12,50 TL eksik). Model
      KDV-hariç baza taşındı: komisyon/işlem/kargo KDV'leri indirilecek KDV.
- [x] Yeni kesintiler: ödeme bedeli % (Trendyol %0,96), işlem bedeli (KDV dahil),
      stopaj (%1, KDV-hariç satış üzerinden). Trendyol resmi hesaplayıcısıyla
      kuruş kuruş aynı (referans vaka birim testte fixture).
- [x] Kanal türü ayrımı: pazaryeri / web sitesi / elden. Web sitesi için sanal POS:
      banka POS'u (BSMV, KDV indirimsiz) vs ödeme kuruluşu (KDV indirimli) seçimi.
- [x] Marj tanımı düzeltildi: net / KDV-hariç satış (finans onayı); ROI ayrıca gösteriliyor.
- [x] Hedef marj fiyat çözücü aynı modele geçti; eski kayıtlı profiller
      normalizeChannelProfile ile taşınıyor (stopaj %1 + ödeme %0,96 otomatik eklenir).
- [x] Süreç: model finans-muhasebe-uzmani onayından, kod qa-test-uzmani denetiminden geçti.

## Açık işler — 15.07.2026 takım denetimi (öncelik sırasıyla)
1. [x] GÜVENLİK: WhatsApp POST webhook'una X-Hub-Signature-256 (HMAC, timingSafeEqual)
       imza doğrulaması eklendi — `WHATSAPP_APP_SECRET` tanımlıysa sahte istek 401 alır,
       tanımsızsa eski davranış + açılış uyarısı. 6 birim testi. **Render'a
       `WHATSAPP_APP_SECRET` girilmeli** (Meta → Settings → Basic → App Secret).
2. [x] Asistan yazma intent'leri: "gider ekle" (expense_add → createExpense, kategori
       tahminli) + "tahsilat aldım" (collection_add → createTransaction; müşteri adı
       kanonikleştirme, ödenmemiş en eski siparişe bağlama → ödeme durumu otomatik,
       varsayılan kasa hesabı). Saf eşleştirme orderUtils.findOpenOrderForCollection,
       7 birim testi (assistant.collection.test.ts). Yardım metni güncellendi.
3. [x] Hepsiburada stok/fiyat gönderme + HEPSIBURADA_SERVICE_KEY env desteği (F4)
4. [x] Finans birim testleri: cari bakiyeler, KDV raporu, tahsilat→sipariş ödeme senkronu,
       kasa bakiyesi mantığı `server/financeUtils.ts`'e (saf fonksiyon) çıkarıldı, db.ts
       bunları kullanıyor; 16 birim testi (finance.test.ts). Senkron kilidi hâlâ test dışı.
5. [x] Ürünlerde kritik stok eşiği (products.criticalQty, migration 0019) + Ürünler'de
       "Düşük Stok" filtresi + eşiğe göre renklendirme + Stok Nöbetçisi mamul eşiği bildirimi
6. [x] Pazaryeri/kanal bazında toplu net kâr raporu (report.channelProfit + Analiz sayfası;
       11 birim testi, işlem bedeli/kargo sipariş başına bir kez)
7. [x] AI görsel üretimi: products.generateImage router'ına bağlandı + ürün detayında
       'AI Görsel Üret' (mockup); S3 URL'i mockupUrl/imageUrls'e yazılır (MEGA SPRINT 18.07)

## RAKİP ANALİZİ — Bizimhesap + Qukasoft A-Z (18.07.2026, patron talebi)
İki rakip iki cephe: Bizimhesap = ön muhasebe/e-belge; Qukasoft = pazaryeri+web
mağaza. Tam analiz + parite + storefront kararı: **docs/RAKIP-ANALIZI-BIZIMHESAP-QUKASOFT.md**
- Kokpit bugün: Bizimhesap'ın ~%75'i, Qukasoft'un ~%45'i (boya çekirdeği ikisinde de yok).
- 🔴 Olmazsa olmaz: [ ] e-Fatura/e-Arşiv/e-İrsaliye, [ ] çoklu depo
- 🟠 Öncelikli: [ ] Kokpit-güçlü storefront (kendi web mağaza — en yüksek marjlı
  kanal, CMS değil ürün çekirdeğinden beslenir), [ ] kargo entegrasyonu,
  [ ] N11 + Çiçeksepeti
- 🟡 Gerekli: [ ] kampanya motoru, [ ] SEO/GA4/pixel, [ ] üretimde işçilik/sarf
  maliyeti, [ ] banka ekstresi mutabakat
- STOREFRONT KARARI: evet ama jenerik CMS değil — ürün çekirdeğinden beslenen sade
  mağaza (Qukasoft/web mağaza kirasını ikame eder, pazaryeri komisyonu olmayan kanal).
- Odoo planıyla birleşik tek yol haritası (RAKİP-FAZ 1-4).

## MEGA SPRINT — 18.07.2026 (tamamlandı): açık işlerin kod tarafı
Rakip/Odoo analizinden çıkan + eski açık işlerden kod tarafı bitirilebilir olanlar:
- [x] N11 + Çiçeksepeti pazaryeri entegrasyonu (sipariş senkron + stok/fiyat push +
      testConnection; marketplace.ts 4 pazaryeri; 'Pazaryerine Gönder' menüsü; 9 test)
- [x] AI görsel üretimi ürün detayına bağlandı (products.generateImage → mockupUrl)
- [x] Pazaryeri/müşteri soru-cevap kuyruğu + AI cevap taslağı (/sorular, migration 0022)
- [x] Satın alma yeniden sipariş önerisi (reorder.ts, Stok sayfası öneri paneli, 7 test)
- Doğrulama: 196/196 test, 0 tip hatası, build ✓.

DIŞ SERVİS/CANLI GEREKTİRDİĞİ İÇİN BU ORTAMDA BİTİRİLEMEYENLER (gerekçeli):
- e-Fatura/e-Arşiv/e-İrsaliye: dış entegratör (İzibiz/Foriba/Uyumsoft) + ticari anlaşma
  + gizli anahtar gerekir. Kod iskeleti sonraki adımda; canlı bağlantı Render'da.
- Kendi storefront (web mağaza): büyük, tasarım kararı ister — ayrı sprint (RAKİP-FAZ 2).
- Kargo entegrasyonu: kargo firması API anahtarları + canlı test gerekir.
- N11/Çiçeksepeti/Trendyol/HB canlı bağlantı testleri: geliştirme ortamı pazaryerine
  çıkamaz; Render'da API anahtarlarıyla doğrulanır.
- S3 görsel göçü (0.3): depolama kimlik bilgisi gerekir.
- Çoklu depo + lot/parti + kalite kontrol: büyük şema işi (RAKİP-FAZ 3) — ayrı sprint.
- Uptime monitörü: kullanıcı cron-job.org kurulumu.

## ODOO UYARLAMA — modül analizi + yol haritası (18.07.2026, patron talebi)
Odoo'nun tüm modül evreni Art of Colour'a göre süzüldü. Tam analiz + sınıflandırma
+ fazlı plan: **docs/ODOO-UYARLAMA-PLANI.md**. Özet (kopyalama değil, uyarlama):
- Kokpit boya-dikeyi olarak Odoo çekirdeğinin ~%60'ını zaten karşılıyor.
- 🔴 Olmazsa olmazlar: [ ] e-Fatura/e-Arşiv, [ ] stok lot/parti+rezervasyon,
  [ ] kalite kontrol (parti testi: pH/viskozite/örtücülük/ΔE)
- 🟠 Öncelikli: [ ] CRM satış boru hattı, [x] Helpdesk/pazaryeri Q&A kuyruğu (18.07),
  [x] Purchase yeniden sipariş önerisi (18.07), [ ] Barcode mobil depo
- 🟡 Gerekli: [ ] çift taraflı muhasebe köprüsü, [ ] onay motoru, [ ] ürün bilgi
  tabanı, [ ] e-posta/SMS kampanya + otomasyon
- ⛔ Kapsam dışı (bilinçli): Payroll, Recruitment, Fleet, Website CMS, POS (şimdilik),
  Subscriptions, Events, Sign, IoT, Studio vb.
- Potansiyel yeni ajan: muhasebe-entegrasyon-uzmani (e-Fatura fazında kurulacak).

## MEGA SPRINT — 18.07.2026 (DÖRTLÜ): Üretim + Storefront + e-Fatura + Çoklu Kanal
Patron kararı: 4 temanın hepsi. Dış görevler ayrı belgede: **PATRON-GOREVLERI.md**.
Sıra: dış bağımlılığı OLMAYAN kod işleri önden; anahtar/onay gelince "bağla + canlı test".
Önce yapılan (bu oturum): Soru-Cevap oto-çekme/oto-cevap (Trendyol QnA) + ürün geliştirme
sihirbazı reçete düzenleme + KDV-dahil maliyet modeli (/fiyat + Maliyet + sihirbaz).

### Tema A — Üretim & Maliyet Gerçeği (dış bağımlılık YOK, önce yapılır)
- [x] A0. KDV-dahil kâr modeli: calcChannelProfit+suggestPrice productCostVatPercent;
      /fiyat + Maliyet + sihirbaz hizalandı; sihirbazda reçete düzenleme (bu oturum)
- [ ] A1. Gerçekleşen kâr raporu (reportUtils/channelProfitReport) aynı KDV-dahil maliyet
      modeline hizala (productCostVatPercent = kanal KDV'si) — beklenen ile tutarlı olsun
- [x] A2. Ürün tam maliyeti v1: adet başı işçilik + genel gider (KDV hariç) → calcDevProfit
      + calcChannelProfit + suggestPrice; sihirbaz, Maliyet, /fiyat ve gerçekleşen rapor
      hepsi düşüyor; ayar unitLaborOverhead (Settings + sayfalarda düzenlenir). Sonraki
      rafinasyon: ürün bazlı üretim süresi (dk) × saat ücreti (şema ister)
- [ ] A3. Hammadde alış faturasından birim maliyet + indirilecek KDV otomatik güncelleme
- [ ] A4. Stok lot/parti + rezervasyon (üretim partisi izlenebilirlik)
- [ ] A5. Kalite kontrol (parti testi: pH/viskozite/örtücülük/ΔE) kayıt + geçti/kaldı

### Tema B — Kendi Web Mağazası (Storefront) [PAYTR + domain patrondan]
- [x] B1. Storefront: herkese açık vitrin + ürün sayfası (client/Storefront.tsx, /magaza
      DashboardLayout dışında; storefront publicProcedure router; fiyat sunucuda doğrulanır)
- [x] B2. Sepet + sipariş oluşturma (localStorage sepet; sipariş channel="magaza" + bildirim)
- [x] B3. PAYTR ödeme kod tarafı (server/paytr.ts: token + callback imza; anahtar gelince canlı)
- [~] B4. SEO temel — başlık var; sitemap/GA4 patron domain+GA4 ID verince eklenecek
- [x] B5. Kargo kod tarafı: siparişe takip no yazma (kargo router; sağlayıcı gelince canlı)

### Tema C — e-Fatura/e-Arşiv + Ön Muhasebe [mali mühür + entegratör patrondan]
- [x] C1. e-Fatura entegratör iskeleti (server/efatura.ts: soyut payload + gated send)
- [x] C2. Siparişten e-Fatura/e-Arşiv taslağı → gönder (invoices router + /mutabakat UI)
- [x] C3. Banka ekstresi (CSV) yükleme + tahsilat/ödeme mutabakatı (shared/reconcile.ts +
      reconcile router + /mutabakat sayfası)
- [x] C4. Yeni ajan: muhasebe-entegrasyon-uzmani (.claude/agents/) — TAKIM'a eklendi

### Tema D — Çoklu Kanal Büyüme [API anahtarları patrondan]
- [~] D1. N11 + Çiçeksepeti soru-cevap: orkestratör çok-sağlayıcı hazır; adaptör
      endpoint'leri canlı panelden doğrulanınca eklenecek (Trendyol QnA çalışıyor)
- [x] D2. Kargo toplayıcı iskeleti (server/kargo.ts: gönderi payload + gated createShipment)
- [x] D3. Kampanya/kupon motoru (shared/campaigns.ts: %/₺/kargo bedava + min sepet + son
      kullanma) — coupons router + Kampanyalar sayfası yönetimi + storefront checkout
- [~] D4. Trendyol/HB/N11/ÇS canlı doğrulamaları — anahtar Render'a girince (PATRON-GOREVLERI)

## KOKPİT V2 — Faz 0 (temel sağlamlaştırma; plan: docs/KOKPIT-V2-ANALIZ.md)
- [x] 0.1a Cari/ürün ID göçü (migration 0016): orders.customerId, transactions.customerId/
      supplierId, purchases.supplierId, orderItems.productId + backfill + 21 indeks
- [x] 0.1b Yazma yolları ID çözümlemeli; ekstre/bakiye ID-öncelikli (isim fallback);
      pazaryeri kalemlerinde barkod→ad ürün eşleşmesi (resolveProductIdForItem, 6 test)
- [x] 0.1c Güvenlik hızlı kazanım: cookie sameSite=lax + nosniff/frame-deny/referrer başlıkları
- [x] 0.2 Mamul stok hareketleri (üretim +, satış −, iade +) + üretim emri kaydı (0017: productMovements/productionRuns)
- [ ] 0.3 Ürün görsellerinin S3'e taşınması (/api/img URL'leri korunarak)
- [ ] 0.4 routers.ts/db.ts modül dizinlerine bölünme + servis katmanı (davranış birebir)
- [x] 0.5 companyId kolon paketi (0018: 25 tabloya, default 1)
- [ ] 0.6 Oturum süresi kısaltma + sunucu tarafı iptal; body limit'in uca göre daraltılması
      (S3 göçünden sonra; görseller şu an tRPC'den base64 gidiyor)

## Faz 1 — AI Business OS çekirdeği (15.07.2026 mega-sprint'te başladı)
- [x] Bildirim merkezi (notifications tablosu + zil UI + markRead/markAllRead)
- [x] notifyOwner: bildirim + WhatsApp çıkışı (24 saat tekrar-önleme)
- [x] Zamanlayıcı: 15dk pazaryeri oto-senkron + saatlik Stok Nöbetçisi + 08:00 Sabah Brifingi
- [x] PWA service worker + kayıt (manifest/ikonlar mevcuttu)
- [ ] Asistanın tool-use ajanına dönüşümü + onay katmanı (guvenli/onayli/kritik)
- [x] Tahsilat Takipçisi: her gün 09:00 TR, 30+ gündür ödenmemiş siparişler müşteri
      bazında gruplanıp bildirim + WhatsApp hatırlatma taslağıyla iletilir
      (scheduler.runCollectionChaser, saf mantık financeUtils.overdueReceivables, testli)
- [x] Pazaryeri soru-cevap kuyruğu + AI cevap taslağı — marketplaceQuestions (migration
      0022) + /sorular sayfası + questions router (generateDraft/answer/dismiss)
      (MEGA SPRINT 18.07); soru çekme canlı API ile beslenecek
- [x] Soru-Cevap OTO-çekme + OTO-cevap (18.07): Trendyol QnA API (fetchTrendyolQuestions/
      answerTrendyolQuestion), scheduler 15dk soru senkronu, marketplaceQuestions
      orkestratörü (dedup externalId + ürün eşleme + güven-koşullu AI oto-cevap),
      questions.syncNow/autoAnswer/setAutoAnswer, /sorular'da "Soruları Çek" + oto-cevap
      anahtarı; elle "Yanıtlandı İşaretle" cevabı da Trendyol'a gönderir. AI yalnızca
      EMİN olduğu (genel ürün/kullanım) cevapları otomatik yollar; fiyat/kargo/iade/stok
      taslakla onaya bırakılır. Canlıda (Render) test edilecek — dev pazaryerine çıkamaz.
- [ ] Uptime monitörü kurulumu (kullanıcı: cron-job.org → /api/health)

## MEGA SPRINT — 16.07.2026: Satış Döngüsü & Kârlılık (tamamlandı)
- [x] Teklif modülü: quotes/quoteItems (migration 0019), CRUD + durum akışı
      (taslak→gönderildi→kabul/red/süresi doldu), kabul→siparişe dönüştürme (stok
      düşümü replaceOrderItems üzerinden), yazdırılabilir teklif + WhatsApp paylaşımı,
      menü + ⌘K kaydı. Teklifler stok/ciro/cari hesaplarına girmez.
- [x] Mamul kritik stok eşiği: products.criticalQty + Ürünler sayfasında Düşük Stok
      filtresi ve eşiğe göre renklendirme (türev satırlarında da stok görünür) +
      Stok Nöbetçisi eşik altı mamulleri de bildirir
- [x] Tahsilat Takipçisi (Faz 1): günlük vadesi geçen alacak taraması + hatırlatma taslağı
- [x] Kanal Kârlılığı raporu: Analiz sayfasında kanal bazlı gerçek net kâr tablosu
      (30/90/365 gün seçimli; maliyeti bilinmeyen kalemler işaretlenir)
- [x] Finans mantığı saf fonksiyonlara çıkarıldı (financeUtils.ts) + 27 yeni birim testi
      (finance.test.ts 16 + report.channel.test.ts 11); toplam 116/116 test
- [x] Doğrulama: 0 tip hatası, build ✓ (migration canlıda otomatik koşar)

## ÜRÜN & ÜRETİM SPRINT — 16.07.2026 (tamamlandı)
- [x] Üretim Kuyruğu: eksi stok / kritik eşik altı mamuller + önerilen adet + tıkla-planla
      (Üretim sayfası; Stok Nöbetçisi kuralıyla aynı filtre)
- [x] Üretim geçmişi ekranda (production.runs) + üretim emri geri alma (production.undo:
      hammadde iadesi güncel reçeteyle, mamul stok düşümü, kayıt nota ⛔ damgasıyla korunur)
- [x] Planlayıcı: hiyerarşik ürün seçici + "(reçete yok)" işareti, azami üretilebilir adet,
      adet başı maliyet, doğru önbellek tazeleme (ürün stoğu/kokpit/geçmiş)
- [x] Mamul stok defteri UI: ürün satırından giriş/çıkış + hareket geçmişi
      (products.adjustStock / products.movements); ürün kartındaki mutlak stok değişikliği
      artık otomatik hareket kaydı düşer (defter-stok ayrışması kapatıldı)
- [x] Stok sayfası: hammadde arama, envanter değeri toplamı, tedarikçi seçimi (supplierId
      bağlandı), hareket geçmişi + "hangi reçetelerde kullanılıyor" (materials.usage)
- [x] Formül Defteri: başka üründen reçete kopyalama (formula.copyFrom, çarpanlı) +
      kalem başına maliyet payı %
- [x] Ürünler: aramada barkod/renk kodu; "HB'ye Gönder" (pushToHepsiburada butonu)
- [x] Doğrulama: 0 tip hatası, 124/124 test, build ✓ (migration gerekmedi)

## ÜRÜN ÇEKİRDEĞİ — ana temel kararı (17.07.2026, patron kararı)
Program bundan sonra Ürünler & Türevler çekirdeği üzerine inşa edilecek.
Tam analiz + fazlı yol haritası: **docs/URUN-CEKIRDEGI-YOL-HARITASI.md**
- [x] Faz A: temel sağlamlaştırma — barkod/SKU tekilliği + çift raporu, seri
      otomatik kaydı, taslak/satista/arsiv yaşam döngüsü (migration 0021),
      türev hiyerarşi koruması, ürün sağlık skoru (shared/productHealth.ts)
- [x] Faz B: tam sayfa ürün detayı (/urun/:id) + türev tablosu (satır içi
      düzenleme) + "yalnız boş alanları doldur" güvenli yayma
- [x] Faz C (kod hazır, CANLI TEST BEKLER): Trendyol'da sıfırdan ürün açma —
      server/trendyolProducts.ts, productMainId ile varyant gruplu gönderim,
      Ayarlar'da eşleme kartı + keşif araçları, batch takibi. C3 (HB listing,
      N11/Çiçeksepeti) ve C4 (yetim ilan raporu) açık.
- [x] Faz D: eşleşmeyen kalem uyarısı (sipariş/teklif), üretim önerisi v2
      (30 gün satış hızı, report.productSales). D2 rezervasyon: mimari gereği
      gereksiz bulundu (stok sipariş anında düşüyor) — belgede gerekçesi.
- [x] Faz E1: ürün detayından AI içerik üretimi (doğrudan karta işlenir).
      E2 (görsel üretimi) ve E3 (soru-cevap kuyruğu) bilinçli ertelendi.
- [x] Faz F1: Analiz'de Ürün Kârlılığı tablosu (brüt kâr + marj + reçetesiz/
      eşleşmeyen uyarıları). F2 (sayfalama) katalog 500+ olunca.
- [x] Faz G: Excel (.xlsx) toplu içe-dışa aktarma (/urun-aktar) — gerçek xlsx
      (SheetJS, dinamik import/ayrı parça, sayısal hücreler), tam katalog dışa
      aktarma (35+ alan), oluştur-veya-güncelle içe aktarma (.xlsx/.xls/.csv;
      ID/barkod/SKU eşleştirme, üst ürün bağlama, boş hücre atla/temizle), diff
      önizleme + hata raporu; shared/productIO.ts + products.bulkImport, 23 test.
Hazırlık (17.07): ürün diyaloğu sabit boyut + HTML temizleme + Türevlere Uygula.
Canlıda doğrulanacak: Trendyol ürün açma akışı (Ayarlar → marka/kargo/kategori
eşlemesi girildikten sonra ürün detayından test) + migration 0021.

## Canlıda (Render) doğrulama bekleyenler — kod tarafı hazır
- [ ] Trendyol: "Bağlantıyı Test Et" HTTP 200 + sipariş akışı + "Trendyol'a Gönder" (stok/fiyat)
- [ ] Trendyol resmi kargo etiketi (ZPL→Labelary→PDF; kargo takip no dolunca)
- [ ] Hepsiburada API onayı → anahtarlar Render'a → bağlantı testi (mevcut 401 = kimlik eksikliği, kod hatası değil)
- [ ] Sesli uyandırma: Picovoice AccessKey ile canlı test (iki motor da kodda mevcut)
