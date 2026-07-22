# Render Köprüsü — Deploy, Log ve Ortam Değişkeni Yönetimi

Bu rehber, Render panelindeki işleri (deploy tetikleme, deploy durumu izleme,
canlı log okuma, ortam değişkeni yönetimi) komut satırından ve dolayısıyla
Claude üzerinden yapabilmen için `scripts/render.mjs` aracını anlatır.

> **Şifre paylaşımı yok.** Araç, Render paneline giriş yapmaz; Render'ın resmî
> **API anahtarıyla** çalışır. Anahtar repoya asla girmez.

## 1. Render API anahtarı al

1. <https://dashboard.render.com> → sağ üstten **Account Settings**.
2. **API Keys** → **Create API Key** → bir isim ver (ör. "kokpit-cli").
3. Çıkan `rnd_...` anahtarını kopyala. (Bir daha gösterilmez — güvenli sakla.)

## 2. Anahtarı ver

**Tek seferlik (yerelde deneme):**

```bash
export RENDER_API_KEY=rnd_xxx
node scripts/render.mjs services   # servisleri görür, bağlantıyı doğrular
```

**Kalıcı (önerilen):** Render → servis → **Environment** → `RENDER_API_KEY`
olarak ekle. Böylece canlıda ve otomasyonlarda hazır olur. Yerelde ise
`.env` dosyana ekleyebilirsin (`.env` zaten `.gitignore`'da).

Servis kimliği normalde otomatik bulunur (isimden: `artofcolour-kokpit`).
Farklıysa `RENDER_SERVICE_ID=srv-...` ya da `RENDER_SERVICE_NAME=...` ver.

## 3. Komutlar

`pnpm render <komut>` ya da `node scripts/render.mjs <komut>`:

| Komut | Ne yapar |
| --- | --- |
| `services` | Erişilebilir servisleri listeler (bağlantı testi) |
| `deploy` | Yeni deploy tetikler (`--clear-cache` ile önbelleği temizler) |
| `status` | Son deploy'un durumunu gösterir |
| `watch` | Son deploy'u "Live" veya "failed" olana kadar izler |
| `deploy:watch` | Tetikler + bitene kadar izler (tek komut) |
| `logs --tail 120` | Son 120 canlı log satırını getirir |
| `env` | Ortam değişkenlerini listeler (değerler maskeli) |
| `env:get KEY` | Bir değişkenin değerini gösterir |
| `env:set KEY=VALUE` | Değişken ayarlar (servisi otomatik yeniden deploy eder) |
| `env:unset KEY` | Değişken siler |

### Örnekler

```bash
# Kod push'landıktan sonra deploy'u tetikle ve bitene kadar izle
pnpm render deploy:watch

# Canlıda hata mı var? Son logları oku
pnpm render logs --tail 150

# Trendyol anahtarını canlıda güncelle (değer terminalde görünür — dikkat)
pnpm render env:set TRENDYOL_API_KEY=... TRENDYOL_API_SECRET=...

# Hangi env değişkenleri tanımlı? (değerler maskeli)
pnpm render env
```

## Notlar

- `render.yaml` Blueprint'inde otomatik deploy açıktır: `main` dalına her
  push zaten Render'da yeni bir deploy başlatır. Bu araç, o deploy'u **izlemek**,
  **elle tetiklemek** ve **env/log** işleri için köprüdür.
- `env:set` ve `env:unset` Render tarafında servisi yeniden başlatır.
- Ücretsiz plan 15 dk boştan sonra uykuya geçer; ilk istek 30–60 sn sürebilir.
- Değerleri terminale yazarken (`env:set`) gizli bilgiler ekranda/kabuk
  geçmişinde görünebilir; hassas anahtarları tercihen Render panelinden gir.
