# Pazaryeri Bağlantıları & Fatura

## Hepsiburada TEST ORTAMI → canlıya geçiş (güncel durum: test bilgileri bekleniyor)

HB, canlı API bilgilerini vermeden önce test (SIT) ortamında 3 adımın
kanıtlanmasını istiyor. Kokpit'te bunun için hazır panel var:
**Ayarlar → "Hepsiburada Test Ortamı (canlıya geçiş)"**.

**Adım adım:**

1. **Test bilgileri e-postayla gelince** (arif.karamann@gmail.com'a gelecek)
   Render → Environment'a gir:
   - `HEPSIBURADA_ENV` = `sit`  ← test ortamı anahtarı (bunu girince oto-senkron
     kapanır, test siparişleri panoya karışmaz)
   - `HEPSIBURADA_MERCHANT_ID` / `HEPSIBURADA_USERNAME` / `HEPSIBURADA_PASSWORD`
     = e-postadaki TEST değerleri (+ verdilerse `HEPSIBURADA_SERVICE_KEY`)
2. **Ayarlar → Hepsiburada Test Ortamı** panelinde sırayla:
   - **1) Katalog:** Kategori ID gir (e-postada/dokümanda test için önerilen
     kategori; yoksa boya kategorisinin ID'si) → "Ürünü Gönder" →
     **trackingId**'yi kopyala. "Durum Sorgula" hatasız görünmeli.
   - **2) Listing:** "Envanteri Getir" → HB'nin yüklediği üründen birini seç →
     "Stok/Fiyat Gönder" → **priceUploadId + stockUploadId**'yi kopyala.
   - **3) Sipariş:** envanterden hbSku seçiliyken "Test Siparişi Oluştur" →
     "Siparişleri Getir" ile listelendiğini gör → sipariş numarasıyla
     **"Paketle"** → **packageNumber**'ı kopyala.
3. **HB'ye yeni ticket aç:** üç kanıtı (trackingId, uploadId'ler, paketlenen
   test siparişi no) yapıştır, canlı ortam bilgilerini iste.
4. **Canlı bilgiler gelince:** `HEPSIBURADA_ENV`'i SİL, canlı Merchant
   ID/kullanıcı/şifre/Servis Anahtarı'nı gir → "Bağlantıyı Test Et" → sipariş
   senkronu otomatik açılır.

> Not: Panel test API'lerine yalnızca canlıda (Render) ulaşabilir; ham API
> yanıtları panelde aynen gösterilir — bir adım hata verirse yanıtı bana
> ilet, düzeltilmiş halini hemen gönderirim. Test ortamı uçları canlının
> "-sit" ekli halleridir (developers.hepsiburada.com).

## Neden Trendyol siparişleri gelmiyor olabilir?

Sipariş Panosu artık en üstte **bağlantı durumu** gösteriyor: her pazaryeri için
"bağlı" (yeşil) veya "bağlı değil" (sarı) rozeti. "Bağlı değil" ise, rozetin
üstüne gelince hangi ayarın eksik olduğunu yazar. En sık sebepler:

1. **API bilgileri Render'a girilmemiş.** Sipariş çekmek için bu değişkenler
   Render → Environment'ta dolu olmalı. Boşsa sipariş hiç gelmez.
2. **Bilgiler yanlış / süresi dolmuş** → "Pazaryerlerinden Çek" butonuna basınca
   kırmızı hata mesajı çıkar (örn. "yetki hatası"). Mesaj tam olarak neyin yanlış
   olduğunu söyler.
3. **Tarih aralığında yeni sipariş yok** → Trendyol son 14 günü çeker; o aralıkta
   yeni paket yoksa "yeni yok" der (bu normal).

Bağlantı durumunu **Ayarlar** sayfasından da görebilirsin.

## Trendyol kurulumu

1. Trendyol **Satıcı Paneli** → Hesabım → **Entegrasyon Bilgileri**.
2. Şunları al: **Satıcı ID (Seller ID)**, **API Key**, **API Secret**.
3. Render → artofcolour-kokpit → **Environment**:
   - `TRENDYOL_SELLER_ID`
   - `TRENDYOL_API_KEY`
   - `TRENDYOL_API_SECRET`
4. Kaydet, servis yeniden başlasın. Sipariş Panosu'nda "Trendyol — bağlı" görünmeli.

## Hepsiburada kurulumu

1. Hepsiburada **Merchant/İş Ortağı paneli** → Entegrasyon / OMS bilgileri.
2. Şunları al: **Merchant ID (GUID)**, **Secretkey** ve **Developer Username**.
3. Render → **Environment** (HB'nin kimlik modeli — bkz. aşağıdaki not):
   - `HEPSIBURADA_MERCHANT_ID` = Merchant ID (GUID). **Basic auth kullanıcı adı da budur.**
   - `HEPSIBURADA_PASSWORD` = Secretkey.
   - `HEPSIBURADA_USERNAME` = **Developer Username** (ör. `artofcolour_dev`).
     Bu değer **User-Agent** başlığına yazılır — Basic auth kullanıcı adı DEĞİLDİR.
4. Kaydet. "Hepsiburada — bağlı" görünmeli.

> **HB kimlik modeli (önemli):** Onboarding e-postasındaki ifadeyle
> _"Username (Merchantid)"_ ve _"User-Agent (Developer Username)"_. Yani Basic
> auth kullanıcı adı = **Merchantid (GUID)**, Password = **Secretkey**, ve
> **User-Agent = Developer Username**. Kod bunu otomatik böyle kurar
> (`HEPSIBURADA_USERNAME` → User-Agent, `HEPSIBURADA_MERCHANT_ID` → Basic auth adı).

> Not: Her iki pazaryeri de **10 dakikada bir otomatik** çekilir (sayfa açıkken)
> ve "Pazaryerlerinden Çek" ile elle tetiklenebilir. Aynı sipariş iki kez eklenmez.
> İptal/iade siparişleri panoya alınmaz.

## Hepsiburada 401 (yetki hatası) çözümü

401 = Hepsiburada kullanıcı adı/şifreni reddetti. Mimari doğru; sorun **girilen
değerlerde**. Sırayla kontrol et:

1. **Ayarlar → Pazaryeri Bağlantıları → "Bağlantıyı Test Et"** butonuna bas.
   Hepsiburada'nın döndürdüğü **tam HTTP yanıtını** gösterir (ör. `HTTP 401 ...`).
   Bu yanıtı bana iletirsen kesin sebebi söylerim.
2. **En sık hata (bizde de buydu):** Basic auth kullanıcı adı yanlış. HB'nin
   Basic auth **kullanıcı adı = Merchantid (GUID)**'dir; developer username
   (`artofcolour_dev`) buraya DEĞİL, **User-Agent** başlığına gider. Kod bunu
   doğru kurar; sen sadece env'leri yukarıdaki gibi doldur (`HEPSIBURADA_USERNAME`
   = developer username, `HEPSIBURADA_MERCHANT_ID` = GUID).
3. `HEPSIBURADA_MERCHANT_ID` bir **GUID**'dir (uzun harf-rakam dizisi), müşteri
   numarası değil. Password alanına **Secretkey**'i yaz.
4. **Development bilgileri yalnızca SIT (test) ortamında geçerlidir:**
   `HEPSIBURADA_ENV=sit` olmalı. Canlı uçta 401 verir; canlı bilgiler HB test
   onayından sonra verilir, o zaman `HEPSIBURADA_ENV` silinir.
4. Değişkenleri Render → Environment'a girdikten sonra servisin yeniden başladığından
   emin ol.

> Not: Doğru değerleri canlıda "Bağlantıyı Test Et" ile doğrulayabilirsin; bu araç
> gerçek istek atıp Hepsiburada'nın cevabını aynen gösterir.

## Trendyol'a stok & fiyat gönderme (entegratör özelliği)

Bu program artık sadece sipariş çekmiyor, **stok ve fiyatı Trendyol'a gönderiyor**:

1. Ürün düzenlemede **Barkod** ve **Stok Adedi** alanlarını doldur (Trendyol ürünü
   barkodla eşler).
2. Ürünler sayfasında **"Trendyol'a Gönder"** butonuna bas — barkodu olan tüm
   ürünlerin adet ve fiyatı Trendyol'daki listelemelere işlenir (indirimli fiyat
   `salePrice`, etiket fiyatı `listPrice` olarak).
3. Trendyol bir **parti numarası (batchRequestId)** döner; güncelleme birkaç dakikada
   yayılır.

> Şimdilik mevcut listelemelerin stok/fiyatını günceller. Sıfırdan ürün açma
> (kategori, marka, görsel, özellikler) sonraki aşamada eklenecek.

## Ürün görsellerini link olarak dışa aktarma

Ürünlere eklediğin görseller artık **herkese açık link** olarak da kullanılabilir —
web siten ve pazaryerleri bu linklerden görseli çeker.

- Link biçimi: `https://SİTEN/api/img/{ürünId}/{tür}` (tür: `main`, `packaging`, `usage`)
- Ürünler → **"Dışa Aktar"** CSV'sinde artık şu sütunlar var: **Ana Görsel**,
  **Ambalaj Görseli**, **Kullanım Görseli** ve hepsi birden **Tüm Görseller**.
- Bu linkleri Trendyol/Hepsiburada toplu ürün şablonundaki "Görsel URL" alanına
  veya web sitene yapıştırabilirsin.
- Görseli olmayan ürünün hücresi boş kalır (ölü link olmaz).

> Görseller sunucuda saklanır ve linkten gerçek resim olarak servis edilir
> (1 gün önbellekli). Ürün silinirse linki de kaybolur.

## Fatura kesme & gönderme

Her sipariş kartındaki **belge simgesine** (📄) basınca yazdırılabilir fatura açılır:

- Şirket başlığı, alıcı, kalemler, **KDV dökümü** (matrah + KDV + genel toplam)
- "Yazdır / PDF Kaydet" ile yazıcıya gönder veya **PDF olarak kaydedip** WhatsApp/
  e-posta ile müşteriye gönder
- Fatura numarası otomatik artar (örn. `2026-00001`)

**Şirket bilgilerini bir kez gir:** Ayarlar → Şirket / Fatura Bilgileri (ünvan,
adres, vergi dairesi/no, telefon, IBAN, KDV oranı, alt not). Bunlar fatura
başlığında görünür.

> Bu belge bilgilendirme amaçlı fatura/proformadır. Resmi **e-Fatura / e-Arşiv**
> için mali mühür ve bir entegratör (ör. GİB onaylı özel entegratör) gerekir;
> ileride istenirse bu modül entegratöre bağlanacak şekilde tasarlandı.
