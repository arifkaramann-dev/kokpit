# Patron Dış Görev Yol Haritası (Kokpit Mega Sprint)

Bu belge, **kodun dışında senin yapman gerekenleri** adım adım anlatır. Ben (CTO)
yazılımı hazır ederim; ama hesap açma, API anahtarı alma, sözleşme imzalama, mali
mühür gibi işler **şirket adına senin** yapman gereken işlerdir. Her madde şu düzende:

- **Ne / Neden** · **Nasıl (adımlar)** · **Süre & tahmini maliyet** · **Bana ver** (Render env) · **Neyi açar**

> Genel kural: Tüm gizli anahtarlar **yalnızca Render → Environment**'a girilir, repoya asla
> yazılmaz. Bana anahtarın kendisini WhatsApp/panoda yollama; Render'a sen gir, "girdim" de,
> ben kodu ona göre bağlarım. Test sonucu 401/403 ise sorun anahtardadır, kodda değil.

Durum işaretleri: `[ ]` yapılmadı · `[~]` başvuru sürüyor · `[x]` tamam (Render'a girildi).

---

## A) ÜRETİM & MALİYET GERÇEĞİ (çoğu kod tarafı — senden azı gerekir)

Bu tema büyük ölçüde bende. Senden gereken tek şey birkaç **oran/sabit** girmen:

- [x] **İşçilik saat ücreti & aylık genel gider (overhead).** ✔ 21.07.2026
  - **Verilen rakamlar:** işçilik **150 ₺/saat**, aylık genel gider **15.000 ₺**,
    aylık ortalama üretim **150 adet** → adet başı genel gider payı **100 ₺**
    otomatik hesaplanıyor (Ayarlar → Maliyet Parametreleri; Fiyat & Kâr Motoru,
    Maliyet ve Kanal Kârlılığı hesaplarına otomatik dahil).
  - **Kalan mini iş:** bir adedin ortalama işçilik DAKİKASINI öğrenirsen
    (örn. 10 dk) Ayarlar'a gir — işçilik payı da otomatik eklenir.
- [ ] **Hammadde alış faturalarını sisteme girme alışkanlığı.**
  - **Neden:** Alış faturasından hammadde birim maliyeti + indirilecek KDV otomatik
    güncellenirse, maliyet hep güncel kalır (elle güncelleme derdi biter).
  - **Nasıl:** Alış faturası geldikçe Gider/Alış ekranından gireceksin (ben ekranı
    hazırlıyorum). e-Fatura entegrasyonu gelince (bkz. C) bu da otomatikleşir.
  - **Süre & maliyet:** Fatura başına ~1 dk, ücretsiz. **Neyi açar:** Otomatik maliyet
    güncelleme + doğru KDV mahsubu.

---

## B) KENDİ WEB MAĞAZASI (Storefront) — en yüksek marjlı kanal

- [ ] **Alan adı (domain).**
  - **Neden:** Kendi mağazan `magaza.artofcolour.com` gibi bir adreste yayınlanmalı.
  - **Nasıl:** Zaten bir alan adın varsa (artofcolour.com) alt alan adı (subdomain)
    açman yeter. Yoksa bir sağlayıcıdan (GoDaddy, Natro, İsimtescil) al.
  - **Süre & maliyet:** 30 dk; `.com` ~ 300–500 ₺/yıl. **Bana ver:** kullanmak
    istediğin adres. **Neyi açar:** Mağazanın canlı adresi + Render'da domain bağlama.
- [~] **Sanal POS / ödeme altyapısı — PAYTR (veya iyzico).** *(patron kararı
  21.07.2026: hesap hazır ama ŞİMDİLİK ERTELENDİ — web mağaza canlıya yaklaşınca
  anahtarlar girilecek.)*
  - **Neden:** Web mağazasında kartla tahsilat için ödeme kuruluşu şart. Excel'inde
    zaten PAYTR %3,9 kullanıyorsun — onunla devam mantıklı.
  - **Nasıl:** (1) paytr.com → Üye İşyeri başvurusu, (2) şirket evrakların (vergi
    levhası, imza sirküleri, IBAN) yüklenir, (3) onay sonrası panelden **Mağaza No,
    API Anahtarı (merchant_key), API Gizli Anahtarı (merchant_salt)** alınır.
  - **Süre & maliyet:** Başvuru onayı 2–5 iş günü; kurulum ücretsiz, işlem başına ~%3,9.
  - **Bana ver (Render):** `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
  - **Neyi açar:** Mağazada sepet → kartla ödeme → sipariş otomatik panoya düşer.
- [~] **Kargo (kendi mağaza siparişleri için) — GELİVER seçildi.** *(21.07.2026:
  patron zaten Geliver kullanıyor; kod adaptörü hazır.)*
  - **Nasıl:** Rehberin tamamı **`KARGO.md`** dosyasında. Özet: app.geliver.io →
    **API Tokenları** → token üret → Render'a `GELIVER_API_TOKEN` (+ önerilen
    `GELIVER_SENDER_ADDRESS_ID`, ilk kurulumda `GELIVER_TEST_MODE=1`) gir.
  - **Neyi açar:** Sipariş kartından "Geliver gönderisi" → otomatik teklif
    satın alma + takip no siparişe işlenir + etiket açılır.
- [ ] **SEO/analitik: Google Analytics 4 + Search Console + Meta Pixel (opsiyonel ama önerilir).**
  - **Neden:** Mağazaya gelen trafiği ölçmek, reklam dönüşümü görmek için.
  - **Nasıl:** analytics.google.com → GA4 mülkü aç → **Ölçüm Kimliği (G-XXXX)** al;
    Search Console'a domaini doğrula; reklam yapacaksan business.facebook.com → Pixel ID.
  - **Süre & maliyet:** 1 saat, ücretsiz. **Bana ver:** `GA4_MEASUREMENT_ID`, (varsa) `META_PIXEL_ID`.
  - **Neyi açar:** Mağazada ziyaretçi/dönüşüm takibi, SEO sağlığı.

---

## C) e-FATURA / e-ARŞİV + ÖN MUHASEBE (yasal olmazsa-olmaz)

- [x] **Mali mühür (tüzel kişi) veya e-İmza (şahıs firması).** ✔ 21.07.2026 —
  mali mühür MEVCUT (patron onayı).
- [~] **e-Fatura entegratörü — BİZİMHESAP seçildi.** *(21.07.2026: patron zaten
  Bizimhesap abonesi; yeni anlaşmaya gerek yok, kod adaptörü hazır.)*
  - **Nasıl:** Rehber **`EFATURA.md`**. Özet: Bizimhesap destek talebiyle
    **Firma ID (FirmID)** iste → Render'a `EFATURA_PROVIDER=bizimhesap` +
    `BIZIMHESAP_FIRM_ID` gir → abonelikte e-fatura modülü + mali mühür tanımını doğrula.
  - **Neyi açar:** Siparişten faturanın Bizimhesap'a otomatik işlenmesi;
    GİB'e e-Fatura/e-Arşiv gönderimi Bizimhesap altyapısından.
- [ ] **Banka hesap ekstresi erişimi (mutabakat için).**
  - **Neden:** Kasa/banka bakiyesini gerçekle otomatik eşleştirmek (mutabakat) için.
  - **Nasıl (kolaydan zora):** (1) internet bankacılığından **MT940 veya CSV/Excel
    ekstre** indir → sisteme yükle (kod tarafı ben); (2) ileri seviye: bankan Open
    Banking API veriyorsa API anahtarı.
  - **Süre & maliyet:** ücretsiz. **Bana ver:** ilk etapta bir örnek ekstre dosyası
    (format görmem için). **Neyi açar:** Banka ekstresi ↔ tahsilat/ödeme eşleştirme.

---

## D) ÇOKLU KANAL BÜYÜME (pazaryerleri + kargo)

- [ ] **Trendyol API (zaten kodda hazır — sadece anahtar).**
  - **Nasıl:** Trendyol Satıcı Paneli → Hesap Bilgilerim / Entegrasyon Bilgileri →
    **Satıcı ID, API Key, API Secret**.
  - **Bana ver (Render):** `TRENDYOL_SELLER_ID`, `TRENDYOL_API_KEY`, `TRENDYOL_API_SECRET`.
  - **Neyi açar:** Sipariş çekme, stok/fiyat gönderme, kargo etiketi, **soru-cevap oto-çekme/oto-cevap** (yeni).
- [~] **Hepsiburada API — TEST ORTAMI süreci başladı (21.07.2026).**
  - HB, canlı bilgilerden önce test (SIT) ortamında 3 kanıt istiyor; test
    bilgileri **arif.karamann@gmail.com**'a e-postayla gelecek.
  - **Nasıl:** e-posta gelince Render'a `HEPSIBURADA_ENV=sit` + test
    Merchant ID/kullanıcı/şifre gir → **Ayarlar → Hepsiburada Test Ortamı**
    panelinden 3 adımı koştur → kimlikleri HB ticket'ına yapıştır.
    Adım adım rehber: **PAZARYERI.md** (en üstte).
  - **Canlıya geçince (Render):** `HEPSIBURADA_ENV` silinir; canlı
    `HEPSIBURADA_MERCHANT_ID`, `HEPSIBURADA_USERNAME`, `HEPSIBURADA_PASSWORD`,
    `HEPSIBURADA_SERVICE_KEY` girilir.
  - **Neyi açar:** HB sipariş/stok/fiyat akışı.
- [ ] **N11 API.**
  - **Nasıl:** N11 Mağaza paneli → Entegrasyon/API → **appKey, appSecret**.
  - **Bana ver (Render):** `N11_APP_KEY`, `N11_APP_SECRET`. **Neyi açar:** N11 sipariş/stok senkronu.
- [ ] **Çiçeksepeti API.**
  - **Nasıl:** Çiçeksepeti Satıcı paneli → API Bilgileri → **x-api-key**.
  - **Bana ver (Render):** `CICEKSEPETI_API_KEY`. **Neyi açar:** Çiçeksepeti sipariş/stok senkronu.
- [ ] **Pazaryeri anlaşmalı kargo ayarları (etiket için).**
  - **Nasıl:** Her pazaryeri panelinden anlaşmalı kargo firmanı seç; Trendyol için
    kargo firma ID'sini Ayarlar → "Anlaşmalı Kargo ID" alanına gireceksin.
  - **Neyi açar:** Otomatik kargo etiketi (ZPL→PDF).
  - **Trendyol "ortak etiket" notu (21.07.2026):** canlıda
    `COMMON_LABEL_NOT_ALLOWED` hatası alındı = bu servis hesabında **yetkili
    değil**. İstersen Trendyol **kategori sorumluna** "ortak etiket (common
    label) servisi yetkisi" için yaz; açılana kadar uygulama otomatik olarak
    kendi barkodlu etiketimizi basıyor (hata değil, bilinen durum — haftada bir
    kendiliğinden yeniden dener).

---

## E) MEVCUT — CANLIDA DOĞRULAMAYI BEKLEYENLER (anahtar girince test edeceğiz)

- [ ] Trendyol "Bağlantıyı Test Et" → HTTP 200 + sipariş akışı + stok/fiyat gönderme.
- [ ] Trendyol resmi kargo etiketi (kargo takip no dolunca ZPL→Labelary→PDF).
- [ ] Hepsiburada bağlantı testi (anahtarlar Render'a girince 401 kalkar).
- [ ] **Soru-Cevap oto-cevap** açma kararı (yeni özellik — Trendyol bağlanınca canlıda dener,
  emin olduğu cevaplar otomatik gider, gerisi onayına kalır).
- [ ] Sesli uyandırma ("Hey Kokpit") — Picovoice AccessKey.
  - **Nasıl:** console.picovoice.ai → ücretsiz hesap → **AccessKey**.
  - **Bana ver (Render):** `PICOVOICE_ACCESS_KEY`.
- [ ] WhatsApp bildirimleri — WhatsApp Cloud API (Meta) veya kullandığın sağlayıcı token'ı.
  - **Bana ver (Render):** ilgili `WHATSAPP_*` değişkenleri + izinli numara.

---

## ÖNCELİK SIRASI (benim önerim)

1. **Trendyol + Hepsiburada anahtarları** (D) → mevcut hazır işler hemen canlı olur,
   soru-cevap oto-cevap devreye girer. *En hızlı değer.*
2. **İşçilik/genel gider rakamları** (A) → net kâr gerçeğe oturur (kod bende, hazır).
3. **PAYTR + domain** (B) → kendi mağaza (en yüksek marj) yola girer.
4. **Mali mühür + e-Fatura entegratörü** (C) → yasal tamamlanır (başvuru uzun sürdüğü
   için erken başlat).
5. **N11 + Çiçeksepeti + kargo toplayıcı** (D) → kanal genişlemesi.

> Sen bu dış işleri hallederken ben kod tarafını paralel ilerletiyorum: dış bağımlılığı
> OLMAYAN işleri (üretim maliyeti, storefront iskeleti, e-Fatura kod altyapısı, mutabakat
> ekranı) önden bitiriyorum; anahtar/onay gelince sadece "bağla + canlı test" kalır.
