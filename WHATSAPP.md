# WhatsApp AI Asistanı Kurulumu

Kokpit'e WhatsApp'tan mesaj atarak iş yaptırabilirsin:

- **"Elden satış ekle, 2 adet sprey vernik, tanesi 250 lira"** → satış kaydedilir
- **"10 kg beyaz pigment geldi, stok girişi"** → stok artar
- **"Bugün kaç sipariş var? Ciro ne kadar?"** → verilerden cevap verir
- **"Not al: yarın etiket siparişi ver"** → not kaydedilir
- **"Eksik listesine ekle: beyaz pigment, 400 ml kutu, etiket"** → alınacaklara yazılır
- **"Bugün neler alınacaktı?"** → açık eksik listesi gelir
- **"Beyaz pigment aldım"** → listeden düşülür
- **"Görev ekle: kargo firmasını ara"** / **"Görevlerim neler?"** → yapılacaklar
- **"Projeler ne durumda?"** → aktif geliştirme projeleri ve adımları
- **"Son siparişi kargoya hazır yap"** / **"AOC-20260712-XXXX tamamlandı"** → sipariş durumu güncellenir (müşteri adıyla da bulur)
- **"Yardım"** → yapabildiği her şeyi tek mesajda listeler
- Stok çıkışında kalan miktar bildirilir; kritik seviyenin altına düşerse uyarır

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
| `WHATSAPP_APP_SECRET` | Meta panelinde **Settings → Basic → App Secret** (Show'a bas, kopyala) — webhook imza doğrulaması için, **önerilir** |
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
- `WHATSAPP_APP_SECRET` tanımlıysa her gelen webhook'un Meta imzası
  (`X-Hub-Signature-256`, HMAC-SHA256) doğrulanır; imzasız/sahte istekler
  401 ile reddedilir. Tanımsızsa doğrulama kapalıdır ve açılışta log'a
  uyarı yazılır — canlıda mutlaka tanımla.
- Token'ları kimseyle paylaşma; sızarsa Meta panelinden yenile.

## Sorun giderme

**Önce Ayarlar → "WhatsApp Tanı" kartına bak (yeni, 21.07.2026).** Kart şunları
gösterir: hangi ayar eksik, son webhook/mesaj/gönderim olayları ve hataları.
"Test Mesajı Gönder" butonu Meta'nın ham cevabını gösterir — süresi dolmuş
token anında belli olur.

**"Mesaj attım, cevap gelmiyor" karar ağacı:**

1. **Tanı kartında hiç olay yok** → Meta webhook'u bize hiç ulaşmıyor:
   - Webhook kurulumunu yeniden yap (yukarıda 4. adım: Callback URL + verify
     token + **messages** aboneliği). Uygulama Meta'da "Live" modda mı?
   - Render ücretsiz planda servis uyuyorsa ilk webhook zaman aşımına düşebilir;
     siteyi bir kez açıp tekrar dene (kalıcı çözüm: uptime monitörü).
2. **"İzinsiz numaradan mesaj YOK SAYILDI" görünüyor** → numaranı
   `WHATSAPP_ALLOWED_NUMBERS`'a ekle. (Eşleşme artık son 10 hane üzerinden;
   05xx / 905xx / +90 farkları sorun olmaktan çıktı.)
3. **"Webhook İMZASI GEÇERSİZ" görünüyor** → `WHATSAPP_APP_SECRET` Meta →
   Settings → Basic → App Secret ile birebir aynı değil; düzelt.
4. **"Mesaj alındı" var ama "gönderim başarısız (401)"** → access token süresi
   dolmuş (geçici token 24 saat yaşar). Yukarıdaki 2. adımla **kalıcı System
   User token'ı** üret, Render'da değiştir.
5. **"Gönderim başarısız (131030 / recipient not in allowed list)"** → Meta test
   numarası kullanıyorsun ve alıcı numara Meta panelindeki "To" listesine
   ekli değil (1. adım, madde 4).
6. **"ANTHROPIC_API_KEY gerekli" cevabı** → Render Environment'a API anahtarını ekle.

Render → Logs'taki `[whatsapp]` satırları da aynı olayları yazar.
