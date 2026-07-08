# Art of Colour Kokpit — Canlıya Alma Rehberi

Uygulama tek bir Node.js sunucusu olarak çalışır (Express + React tek pakette)
ve bir **MySQL** veritabanına ihtiyaç duyar. Aşağıdaki adımlarla ücretsiz
katmanlarda canlıya alabilirsiniz.

## 1. Adım — MySQL veritabanı edinin

Render'ın kendi yönetilen MySQL'i yoktur; ücretsiz bir MySQL için iki iyi seçenek:

### Seçenek A: TiDB Cloud Serverless (önerilen, kalıcı ücretsiz katman)
1. <https://tidbcloud.com> adresinde hesap açın (Google ile girilebilir).
2. **Create Cluster > Serverless** ile (bölge: Frankfurt/eu-central-1 önerilir) küme oluşturun.
3. Küme açılınca **Connect** düğmesine basın, `Generate Password` deyin.
4. Ekrandaki bilgilerle bağlantı adresini kurun. Örnek biçim:

   ```
   mysql://KULLANICI.root:SIFRE@gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/kokpit?ssl={"minVersion":"TLSv1.2","rejectUnauthorized":true}
   ```

   > Sondaki `?ssl=...` kısmı zorunludur; TiDB yalnızca TLS bağlantı kabul eder.
5. Connect ekranındaki SQL konsolundan veritabanını oluşturun: `CREATE DATABASE kokpit;`

### Seçenek B: Aiven for MySQL (ücretsiz plan)
1. <https://aiven.io> hesabı açın, **MySQL > Free plan** seçin.
2. Servis açılınca "Connection information" bölümündeki URI'yi alın
   (`mysql://avnadmin:...@...aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED`).
3. `?ssl-mode=REQUIRED` yerine `?ssl={"rejectUnauthorized":true}` yazın
   (mysql2 sürücüsünün beklediği biçim budur).

## 2. Adım — Render'da yayınlayın

1. <https://render.com> hesabınızla girin, **New > Blueprint** seçin.
2. GitHub hesabınızı bağlayıp `arifkaramann-dev/kokpit` deposunu seçin
   (dal: `main` — aşağıdaki nota bakın).
3. Render kökteki `render.yaml` dosyasını okuyup servisi hazırlar.
   Sizden şu ortam değişkenlerini ister:
   - `DATABASE_URL` → 1. adımda kurduğunuz bağlantı adresi
   - `OWNER_EMAIL` → panele gireceğiniz e-posta
   - `OWNER_PASSWORD` → panele gireceğiniz şifre (güçlü bir şey seçin)
4. **Apply** deyin. İlk derleme 3–5 dakika sürer. Migration'lar açılışta
   otomatik uygulanır (`pnpm db:migrate && pnpm start`).
5. Servis "Live" olunca `https://artofcolour-kokpit.onrender.com` benzeri
   adres hazırdır. `OWNER_EMAIL` / `OWNER_PASSWORD` ile giriş yapın.

> **Not (dal):** Blueprint varsayılan olarak deponun varsayılan dalını izler.
> Bu hazırlık `claude/web-site-development-tx6n7h` dalında yapıldıysa önce
> `main` dalına birleştirin ya da Render'da servisi oluşturduktan sonra
> Settings > Build & Deploy > Branch kısmından dalı değiştirin.

> **Not (ücretsiz plan):** Render free web servisleri 15 dakika istek gelmeyince
> uykuya geçer; ilk açılış 30–60 saniye sürebilir. Sürekli açık kalması için
> aylık ~7$ Starter plana geçebilirsiniz.

## Alternatif: Railway (uygulama + MySQL tek yerde)

1. <https://railway.app> hesabı açın, **New Project > Deploy from GitHub repo**
   ile depoyu seçin.
2. Aynı projeye **New > Database > MySQL** ekleyin.
3. Uygulama servisinin Variables kısmına şunları girin:
   - `DATABASE_URL` = `${{MySQL.MYSQL_URL}}` (Railway referansı)
   - `JWT_SECRET`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`
4. Settings > Deploy: Build `corepack enable && pnpm install --frozen-lockfile && pnpm build`,
   Start `pnpm db:migrate && pnpm start`.

Railway'in kalıcı ücretsiz planı yoktur (aylık ~5$ kullanım kredisi), ancak
kurulum en pratik olanıdır.

## Ortam değişkenleri özeti

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | MySQL bağlantı adresi (TLS parametreleri dahil) |
| `JWT_SECRET` | ✅ | Oturum çerezlerini imzalayan gizli anahtar (uzun ve rastgele) |
| `OWNER_EMAIL` | ✅ | Panele giriş e-postası |
| `OWNER_PASSWORD` | ✅ | Panele giriş şifresi |
| `OWNER_NAME` | — | Panelde görünen isim (varsayılan: "Yönetici") |
| `PORT` | — | Sunucu portu (Render/Railway otomatik verir) |

## Yerel geliştirme

```bash
cp .env.example .env   # değerleri doldurun
pnpm install
pnpm db:migrate        # tabloları oluşturur
pnpm dev               # http://localhost:3000
```

## AI Pazarlama modülü hakkında

`Pazarlama` sayfasındaki metin üretimi Manus'un dahili LLM servisini
(`BUILT_IN_FORGE_API_URL/KEY`) kullanır; Manus dışında bu anahtarlar olmadığı
için şimdilik çalışmaz. Modülü Claude API gibi bir sağlayıcıya bağlamak ayrı
bir geliştirme adımıdır — istediğinizde eklenebilir.
