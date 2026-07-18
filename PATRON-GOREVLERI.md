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

- [ ] **İşçilik saat ücreti & aylık genel gider (overhead).**
  - **Neden:** Net kâr şu an sadece hammadde maliyetini içeriyor; işçilik ve
    kira/elektrik/amortisman gibi genel giderler girince kâr GERÇEK olur.
  - **Nasıl:** Bana şu 3 rakamı ver: (1) bir üretim işçisinin saatlik maliyeti (₺),
    (2) aylık toplam genel gider (₺), (3) aylık ortalama üretilen adet/parti sayısı.
    Bunlarla ürün başına genel gider payını otomatik dağıtırım.
  - **Süre & maliyet:** 10 dakika, ücretsiz. **Neyi açar:** Maliyet & Fiyat sayfalarında
    "tam maliyet" (hammadde + işçilik + genel gider) ve gerçek net kâr.
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
- [ ] **Sanal POS / ödeme altyapısı — PAYTR (veya iyzico).**
  - **Neden:** Web mağazasında kartla tahsilat için ödeme kuruluşu şart. Excel'inde
    zaten PAYTR %3,9 kullanıyorsun — onunla devam mantıklı.
  - **Nasıl:** (1) paytr.com → Üye İşyeri başvurusu, (2) şirket evrakların (vergi
    levhası, imza sirküleri, IBAN) yüklenir, (3) onay sonrası panelden **Mağaza No,
    API Anahtarı (merchant_key), API Gizli Anahtarı (merchant_salt)** alınır.
  - **Süre & maliyet:** Başvuru onayı 2–5 iş günü; kurulum ücretsiz, işlem başına ~%3,9.
  - **Bana ver (Render):** `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`.
  - **Neyi açar:** Mağazada sepet → kartla ödeme → sipariş otomatik panoya düşer.
- [ ] **Kargo (kendi mağaza siparişleri için).**
  - **Neden:** Pazaryeri kargosu anlaşmalı; ama kendi mağaza siparişini sen
    göndereceksin. Anlaşmalı kargo hem ucuz hem otomatik etiket sağlar.
  - **Nasıl (iki yol):**
    - **Kolay yol (önerilen):** Bir kargo toplayıcı (Navlungo, Basit Kargo,
      Kolay Gelsin) hesabı aç → tek panelden çok firma + API ile otomatik etiket.
    - **Klasik yol:** Doğrudan bir kargo firmasıyla (Sürat, MNG, Aras, Yurtiçi)
      anlaşma yap → müşteri no + API bilgileri al.
  - **Süre & maliyet:** 1–3 iş günü; desi bazlı ücret (hacme göre pazarlık).
  - **Bana ver (Render):** seçtiğin sağlayıcının API anahtarı/müşteri no.
  - **Neyi açar:** Mağaza siparişine otomatik kargo etiketi + takip no.
- [ ] **SEO/analitik: Google Analytics 4 + Search Console + Meta Pixel (opsiyonel ama önerilir).**
  - **Neden:** Mağazaya gelen trafiği ölçmek, reklam dönüşümü görmek için.
  - **Nasıl:** analytics.google.com → GA4 mülkü aç → **Ölçüm Kimliği (G-XXXX)** al;
    Search Console'a domaini doğrula; reklam yapacaksan business.facebook.com → Pixel ID.
  - **Süre & maliyet:** 1 saat, ücretsiz. **Bana ver:** `GA4_MEASUREMENT_ID`, (varsa) `META_PIXEL_ID`.
  - **Neyi açar:** Mağazada ziyaretçi/dönüşüm takibi, SEO sağlığı.

---

## C) e-FATURA / e-ARŞİV + ÖN MUHASEBE (yasal olmazsa-olmaz)

- [ ] **Mali mühür (tüzel kişi) veya e-İmza (şahıs firması).**
  - **Neden:** e-Fatura/e-Arşiv kesmek için yasal zorunlu. Tüm entegratörler bunu ister.
  - **Nasıl:** Kamu Sertifikasyon Merkezi (kamusm.gov.tr) → Mali Mühür başvurusu
    (şirket türüne göre). Şahıs firmasıysan nitelikli e-İmza da yeterli olabilir.
  - **Süre & maliyet:** 1–2 hafta; mali mühür ~ 700–1.000 ₺/3 yıl.
  - **Neyi açar:** Aşağıdaki entegratör başvurusunu.
- [ ] **e-Fatura entegratörü seç ve başvur.**
  - **Neden:** GİB'e doğrudan bağlanmak yerine bir özel entegratör API'siyle fatura kesmek çok daha kolay.
  - **Nasıl:** Bir entegratör seç ve API'li paket al:
    - **Paraşüt / Mikro / Logo İşbaşı:** KOBİ dostu, hazır API.
    - **İzibiz / Uyumsoft / Foriba (Sovos):** kurumsal, güçlü API.
    - Öneri: fatura hacmin düşükse **Paraşüt** veya **Uyumsoft** hızlı başlangıç.
  - Başvuruda: şirket bilgileri + mali mühür → sana **API kullanıcı adı/şifre + test/canlı uç** verirler.
  - **Süre & maliyet:** 3–7 iş günü; yıllık ~ 2.000–6.000 ₺ (kontör/paket bazlı).
  - **Bana ver (Render):** seçtiğin entegratörün `EFATURA_*` bilgileri (kullanıcı, şifre, uç adresi).
  - **Neyi açar:** Siparişten tek tuş e-Fatura/e-Arşiv kesme + otomatik gönderme.
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
- [ ] **Hepsiburada API (kodda hazır — mevcut 401 kimlik eksikliğinden).**
  - **Nasıl:** HB Merchant paneli → Entegrasyon/OMS → **Merchant ID, kullanıcı adı,
    şifre**; Listing için ayrıca **Servis Anahtarı**.
  - **Bana ver (Render):** `HEPSIBURADA_MERCHANT_ID`, `HEPSIBURADA_USERNAME`,
    `HEPSIBURADA_PASSWORD`, `HEPSIBURADA_SERVICE_KEY`.
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
