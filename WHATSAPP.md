# WhatsApp → Sipariş Köprüsü (bağlı cihaz)

WhatsApp'ından **kendine** bir komut yaz, Kokpit taslak sipariş çıkarsın, sen
"evet" deyince kaydetsin. Numaran değişmez, telefonundan WhatsApp'ı normal
kullanmaya devam edersin — köprü telefonuna **bağlı bir cihaz** gibi eklenir
(tıpkı WhatsApp Web gibi).

## Nasıl çalışır

1. Telefonunda WhatsApp'ta **"Kendine mesaj"** (note-to-self) sohbetini aç.
2. Şunun gibi yaz:
   > Bülent'e 900 elden satış: 225 astar, 300 primex, 300 beyaz, 100 kargo
3. Kokpit aynı sohbette taslağı özetler ve sorar:
   > ➡️ Elden satış — Bülent: 1× astar (225 TL), 1× primex (300 TL)… \
   > Onaylıyor musun? (evet / hayır)
4. **"evet"** yaz → sipariş kaydedilir. **"hayır"** → hiçbir şey olmaz.

Sipariş beyni uygulama içi asistanla **birebir aynıdır** (`runAssistant`); sadece
sipariş değil stok girişi, tahsilat, gider, cari kartı, işletme soru-cevabı da
buradan yapılabilir. Müşteri bu sohbeti görmez.

## Kurulum (Render)

1. **Ortam değişkenleri** (Render → Environment):
   - `WHATSAPP_ENABLED=1`
   - `ANTHROPIC_API_KEY=` (asistan beyni için; yoksa basit intent akışına düşer)
   - `WHATSAPP_AUTH_DIR=/data/wa-auth` (kalıcı disk kullanacaksan)
   - `WHATSAPP_CONTROL_JID=` (boş bırak → "kendine mesaj" kontrol yüzeyi olur)
2. **Deploy** et. Servis loglarını aç (Render → Logs). Bir **QR kodu** basılacak.
3. Telefonunda: **WhatsApp > Ayarlar > Bağlı Cihazlar > Cihaz Bağla** → logdaki QR'ı okut.
4. Log `"[whatsapp] bağlandı ✔"` dediğinde hazırdır. Kendine bir komut yazıp dene.

## Kalıcılık (önemli)

Köprü, giriş oturumunu `WHATSAPP_AUTH_DIR` klasöründe tutar. Render **free planda
dosya sistemi geçicidir** → her yeniden başlatma/deploy'da QR'ı tekrar okutman
gerekir. Kalıcı olması için:

- Planı diskli bir plana yükselt,
- `render.yaml`'daki `disk:` bloğunu aç (mountPath `/data`),
- `WHATSAPP_AUTH_DIR=/data/wa-auth` yap.

## Güvenlik ve risk

- **Resmi olmayan istemci (Baileys).** Meta'nın gözünde izinsiz cihazdır; düşük de
  olsa **ban riski** vardır. Toplu/otomatik müşteri mesajı attırma — ban çoğunlukla
  spam davranışından gelir. Bu köprü yalnızca senin kontrol sohbetini dinler.
- Oturum anahtarları (`.wa-auth`) **sırdır**, repoya girmez (`.gitignore`'da).
- Kapatmak için `WHATSAPP_ENABLED` değerini sil/`0` yap ve yeniden başlat. Cihaz
  bağlantısını da telefondan "Bağlı Cihazlar"dan kaldırabilirsin.

## Sorun giderme

- **QR gelmiyor:** `WHATSAPP_ENABLED=1` mi? Logda `[whatsapp]` satırı var mı?
- **"oturum kapandı" logu:** telefondan cihaz bağlantısı kaldırılmış → `.wa-auth`
  (veya diskteki klasör) silinip yeniden QR okutulur.
- **Cevap gelmiyor:** komutu **kendine mesaj** sohbetine yazdığından emin ol
  (başka bir sohbet dinlenmez; `WHATSAPP_CONTROL_JID` ile değiştirebilirsin).
