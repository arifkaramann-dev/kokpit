# Pazaryeri Bağlantıları & Fatura

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
2. Şunları al: **Merchant ID**, **entegrasyon kullanıcı adı** ve **şifresi**.
3. Render → **Environment**:
   - `HEPSIBURADA_MERCHANT_ID`
   - `HEPSIBURADA_USERNAME`
   - `HEPSIBURADA_PASSWORD`
4. Kaydet. "Hepsiburada — bağlı" görünmeli.

> Not: Her iki pazaryeri de **10 dakikada bir otomatik** çekilir (sayfa açıkken)
> ve "Pazaryerlerinden Çek" ile elle tetiklenebilir. Aynı sipariş iki kez eklenmez.
> İptal/iade siparişleri panoya alınmaz.

## Hepsiburada 401 (yetki hatası) çözümü

401 = Hepsiburada kullanıcı adı/şifreni reddetti. Mimari doğru; sorun **girilen
değerlerde**. Sırayla kontrol et:

1. **Ayarlar → Pazaryeri Bağlantıları → "Bağlantıyı Test Et"** butonuna bas.
   Hepsiburada'nın döndürdüğü **tam HTTP yanıtını** gösterir (ör. `HTTP 401 ...`).
   Bu yanıtı bana iletirsen kesin sebebi söylerim.
2. En sık hata: `HEPSIBURADA_USERNAME` alanına **panel e-postanı** veya **Merchant
   ID**'yi yazmak. Buraya Hepsiburada'nın verdiği **entegrasyon/API kullanıcı adı**
   girilmeli (panel → Kullanıcı Yönetimi / Entegrasyon bilgileri).
3. `HEPSIBURADA_MERCHANT_ID` bir **GUID**'dir (uzun harf-rakam dizisi), müşteri
   numarası değil.
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
