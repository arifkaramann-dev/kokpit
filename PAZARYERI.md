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
