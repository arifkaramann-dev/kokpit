# Kargo Entegrasyonu — Geliver

Kendi mağaza / elden siparişlerinin kargosu **Geliver** (geliver.io) üzerinden
otomatikleşir: sipariş kartından tek tıkla gönderi açılır, en uygun fiyatlı
teklif satın alınır, **takip numarası siparişe otomatik işlenir** ve etiket
açılır. (Pazaryeri siparişleri bunun DIŞINDA — onların kargosu pazaryeri
anlaşmalı kargosuyla yürür.)

## Benden istenenler (senin yapacakların, ~10 dakika)

Kod hazır; çalışması için Render'a şu 2 (+1 opsiyonel) bilgi girilmeli:

### 1. `GELIVER_API_TOKEN` (zorunlu)

1. https://app.geliver.io adresine kendi Geliver hesabınla gir.
2. Sol menüden **API Tokenları** sayfasına git (doğrudan adres:
   **https://app.geliver.io/apitokens**).
3. **Yeni token oluştur** de, bir isim ver (örn. `kokpit`), oluşan token'ı kopyala.
4. Render → artofcolour-kokpit → **Environment** → `GELIVER_API_TOKEN` olarak yapıştır.

> Token'ı bana mesajla GÖNDERME; sadece Render'a gir, "girdim" demen yeter.

### 2. `GELIVER_SENDER_ADDRESS_ID` (önerilir)

Gönderici (Art of Colour) adresinin Geliver'deki kimliği. Panelde kayıtlı
gönderici adresin varsa:

1. https://app.geliver.io → **Adresler / Gönderici Adresleri** bölümüne gir.
2. Kullandığın gönderici adresini aç; adresin **ID**'sini kopyala (URL'de ya da
   detayda görünen uzun kimlik).
3. Render → Environment → `GELIVER_SENDER_ADDRESS_ID` olarak gir.

Bulamazsan boş bırak — ilk canlı denemede hata mesajı hangi bilginin
istendiğini söyler, birlikte tamamlarız.

### 3. `GELIVER_TEST_MODE=1` (ilk kurulumda önerilir)

İlk denemeleri ücret YANSIMADAN yapmak için Render'a `GELIVER_TEST_MODE=1`
ekle. Test gönderisi oluşturup akışı doğrulayınca bu değişkeni silersin,
gerçek etiketler alınmaya başlar.

## Nasıl kullanılır (kurulum sonrası)

1. Sipariş Panosu → siparişin **⋯** menüsü → **"Geliver gönderisi"**.
2. Onay verince: gönderi açılır → en ucuz teklif otomatik satın alınır →
   takip no siparişe yazılır, etiket linki yeni sekmede açılır.
3. Teklif satın alma herhangi bir sebeple başarısız olursa gönderi yine
   oluşur; etiketi https://app.geliver.io panelinden alabilirsin (uygulama
   bunu mesajla söyler).

## Teknik not (benim tarafım)

- API: `https://api.geliver.io/api/v1` · Kimlik: `Authorization: Bearer <token>`
- Akış: `POST /shipments` (gönderi + teklifler) → en ucuz teklif `POST /transactions`
  ile satın alınır → yanıttan takip no + etiket URL alınır (resmi Geliver SDK akışı).
- Desi → paket ölçüsü: desi×3000'ün küp kökü kenar (cm), ağırlık = desi (kg).
- İlgili kod: `server/kargo.ts` (adaptör), `server/routers.ts` → `kargo.createShipment`,
  sipariş kartı menüsü `client/src/pages/Orders.tsx`.
- Alan adları resmi Geliver SDK belgelerinden alındı; ilk canlı çağrıda ufak
  alan farkı çıkarsa hata mesajı panelde aynen görünür ve tek dokunuşta düzeltilir.
