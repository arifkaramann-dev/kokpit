# WhatsApp AI Asistanı Kurulumu

Kokpit'e WhatsApp'tan mesaj atarak iş yaptırabilirsin:

- **"Elden satış ekle, 2 adet sprey vernik, tanesi 250 lira"** → satış kaydedilir
- **"10 kg beyaz pigment geldi, stok girişi"** → stok artar
- **"Bugün kaç sipariş var? Ciro ne kadar?"** → verilerden cevap verir
- **"Not al: yarın etiket siparişi ver"** → not kaydedilir

Sesli kullanım: WhatsApp klavyesindeki **mikrofon (dikte)** ile konuşarak
yazdır — mesaj yazı olarak gider, asistan aynı şekilde işler.

## Kurulum (bir kez, ~15 dakika)

WhatsApp'ın resmi **Cloud API**'si kullanılır (Meta, kişisel kullanım için ücretsiz).

### 1. Meta uygulaması aç
1. https://developers.facebook.com → **My Apps → Create App** → tür olarak **Business** seç.
2. Uygulamaya **WhatsApp** ürününü ekle (Add Product → WhatsApp → Set up).
3. **API Setup** sayfasında sana bir **test telefon numarası**, **Phone number ID**
   ve **geçici erişim anahtarı (access token)** verilir.
4. Aynı sayfadaki **"To"** kısmına kendi WhatsApp numaranı ekleyip doğrula
   (test modunda yalnızca eklediğin numaralarla konuşabilir — bizim için yeterli).

### 2. Kalıcı erişim anahtarı al
Geçici anahtar 24 saatte ölür. Kalıcısı için:
1. https://business.facebook.com/settings → **Users → System Users** → yeni system user oluştur (Admin).
2. **Add Assets** ile WhatsApp uygulamanı bu kullanıcıya bağla.
3. **Generate New Token** → uygulamanı seç → izinlerden `whatsapp_business_messaging`
   ve `whatsapp_business_management` işaretle → süreyi **Never expire** yap → token'ı kopyala.

### 3. Render'a ortam değişkenlerini gir
Render panelinde **artofcolour-kokpit → Environment**:

| Değişken | Değer |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Kendi uydurduğun gizli bir kelime (örn. `aoc-webhook-2026`) |
| `WHATSAPP_ACCESS_TOKEN` | 2. adımdaki kalıcı token |
| `WHATSAPP_PHONE_NUMBER_ID` | API Setup sayfasındaki **Phone number ID** |
| `WHATSAPP_ALLOWED_NUMBERS` | Kendi numaran, örn. `905551112233` (birden fazlaysa virgülle) |
| `ANTHROPIC_API_KEY` | (zaten girdiysen atla) — asistanın beyni bu |

Kaydet, servis yeniden başlasın.

### 4. Webhook'u bağla
1. Meta panelinde **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL**: `https://artofcolour-kokpit.onrender.com/api/whatsapp/webhook`
3. **Verify token**: 3. adımda uydurduğun kelimenin aynısı.
4. **Verify and save** → yeşil onay gelmeli.
5. **Webhook fields** kısmında **messages** alanına **Subscribe** de.

### 5. Dene
Meta'nın verdiği test numarasına WhatsApp'tan yaz:
> Bugün kaç sipariş var?

Cevap birkaç saniyede gelir. ✅

## Güvenlik
- Sadece `WHATSAPP_ALLOWED_NUMBERS` içindeki numaralara cevap verilir;
  liste boşsa asistan kimseye cevap vermez.
- Token'ları kimseyle paylaşma; sızarsa Meta panelinden yenile.

## Sorun giderme
- **Webhook doğrulanmıyor** → Render'daki `WHATSAPP_VERIFY_TOKEN` ile Meta'ya
  yazdığın kelime birebir aynı mı? Servis uyanık mı (ücretsiz planda ilk istek
  ~1 dk sürebilir; önce siteyi bir kez aç)?
- **Mesaj gidiyor ama cevap gelmiyor** → Render → Logs'ta `[whatsapp]` satırlarına
  bak; numaran `WHATSAPP_ALLOWED_NUMBERS`'ta kayıtlı mı (başında 90 ile)?
- **"ANTHROPIC_API_KEY gerekli" cevabı** → Render Environment'a API anahtarını ekle.
