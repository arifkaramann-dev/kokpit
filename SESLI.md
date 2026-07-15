# Sesli Uyandırma ("Hey Kokpit") — Kurulum

Asistanı el değmeden başlatmak için iki motor var:

1. **Web Speech (yedek):** Ek kurulum gerekmez ama yalnızca Chrome'da, sekme açıkken
   ve internet bağımlı çalışır. Uyandırma kelimesi: **"Hey Kokpit"**.
2. **Picovoice Porcupine (önerilen):** Cihaz-üstü (ses buluta gitmez), daha güvenilir
   tetikleme. Bir **AccessKey** girilince otomatik devreye girer.

> Not: İkisi de tarayıcı/PWA açıkken çalışır. Telefon kilitliyken çalışan gerçek
> "Hey Siri" seviyesi ancak native (App Store / Play) uygulama ile olur.

## 1) AccessKey al (ücretsiz)

1. https://console.picovoice.ai → kayıt ol.
2. Panelden **AccessKey**'i kopyala.
3. Render → Environment'a ekle: `PICOVOICE_ACCESS_KEY = <anahtar>`.

Bu kadarıyla asistan **hazır İngilizce kelimeyle** çalışır: kulak simgesini aç,
mikrofona izin ver, **"Jarvis"** de, sonra komutunu söyle.

## 2) "Hey Kokpit" özel kelimesi (opsiyonel, Türkçe)

Hazır kelimeler İngilizce. Türkçe "Hey Kokpit" için:

1. Picovoice Console → **Porcupine** → yeni wake word:
   - Kelime: `Hey Kokpit`
   - Dil: **Turkish**
   - Platform: **Web (WASM)**
   - Eğit ve **`.ppn`** dosyasını indir.
2. Türkçe model dosyasını indir: Picovoice porcupine deposundan
   `lib/common/porcupine_params_tr.pv`.
3. İki dosyayı repoya koy:
   - `client/public/wake/hey-kokpit.ppn`
   - `client/public/wake/porcupine_params_tr.pv`
4. Render → Environment:
   - `PICOVOICE_KEYWORD_PATH = /wake/hey-kokpit.ppn`
   - `PICOVOICE_KEYWORD_LABEL = Hey Kokpit`
   - `PICOVOICE_MODEL_PATH = /wake/porcupine_params_tr.pv`
5. Deploy et. Artık uyandırma kelimesi **"Hey Kokpit"** olur.

## Ortam değişkenleri (özet)

| Değişken | Zorunlu | Açıklama |
|---|---|---|
| `PICOVOICE_ACCESS_KEY` | Porcupine için evet | Picovoice Console'dan AccessKey |
| `PICOVOICE_KEYWORD_PATH` | hayır | Özel `.ppn` yolu (boşsa hazır "Jarvis") |
| `PICOVOICE_KEYWORD_LABEL` | hayır | Özel kelime etiketi (ör. "Hey Kokpit") |
| `PICOVOICE_MODEL_PATH` | hayır | Özel `.pv` model yolu (boşsa gömülü İngilizce) |

## Dosyalar

- `client/public/wake/porcupine_params.pv` — gömülü İngilizce model (hazır kelimeler için).
- `client/src/lib/wakeword.ts` — Porcupine denetleyicisi (başlat/duraklat/durdur).
- `client/src/pages/Assistant.tsx` — kulak butonu + uyandırma mantığı; AccessKey varsa
  Porcupine, yoksa Web Speech'e düşer. Uyandıktan sonra komut metni Web Speech ile alınır.

Porcupine ve model dosyaları Apache-2.0 (Picovoice) lisanslıdır.
