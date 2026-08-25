# Kokpit'i kendi bilgisayarında çalıştırma

Render ve TiDB olmadan, her şey senin bilgisayarında. Uygulama da veritabanı
da tek komutla kalkıyor.

> **Bu kurulum yalnızca BU bilgisayardan erişilebilir.** Aynı wifi'daki başka
> bir cihazdan bile açılmaz — dükkan içi erişim gerektiğinde en alttaki
> "Dükkandaki diğer cihazlardan erişim" bölümüne bak.

---

## Neden bu iş kolay

Uygulama en baştan yerel çalışmaya uygun yazılmış, kimse özellikle
uğraşmadan:

- **Görseller veritabanının içinde** duruyor (`server/images.ts`). Dışarıda
  bir depolama servisi (S3 gibi) yok — tek makine kendine yetiyor.
- **Pazaryerlerine biz gidiyoruz**, onlar bize gelmiyor. Trendyol ve
  Hepsiburada 15 dakikada bir *dışarı doğru* sorgulanıyor
  (`server/scheduler.ts`). Yani **sabit IP, port açma, alan adı gerekmiyor**.
- **Giriş çerezi isteğin protokolüne bakıyor** (`server/_core/cookies.ts`),
  bu yüzden düz `http://localhost` üzerinden giriş sorunsuz çalışıyor.

Render'ın sağladığı iki şey kalıyor: 7/24 açık bir makine ve dışarıdan
erişilen bir adres. İkisi de şimdilik gerekmiyor.

---

## Bir kereye mahsus kurulum

### 1. Docker Desktop kur

<https://docker.com/products/docker-desktop> — bilgisayarına uygun sürümü
indir, kur, aç. Kurulumdan sonra Docker'ın **çalışır durumda** olduğundan
emin ol (görev çubuğunda balina simgesi).

Docker, veritabanını ve uygulamayı kendi kutusunda çalıştırıyor. Bilgisayarına
ayrıca MySQL/MariaDB kurman **gerekmiyor**.

### 2. Ayar dosyanı oluştur

Proje klasöründe terminal aç:

```bash
cp .env.yerel.example .env.yerel     # Windows'ta: copy .env.yerel.example .env.yerel
```

`.env.yerel` dosyasını bir metin düzenleyicide aç ve iki satırı doldur:

```
JWT_SECRET=buraya-uzun-ve-rastgele-bir-sey-yaz
OWNER_PASSWORD=panele-girecegin-sifre
```

Gerisi opsiyonel. AI özelliklerini (pazarlama metni, banner sloganı, görsel
üretimi) kullanacaksan ilgili anahtarları da doldur.

> `.env.yerel` git'e girmez — şifrelerin depoda durmaz.

### 3. Başlat

```bash
pnpm yerel
```

İlk çalıştırma birkaç dakika sürer (imaj derleniyor). Sonraki açılışlar
saniyeler.

Tarayıcıda aç: **<http://localhost:3000>**

`.env.yerel` içindeki e-posta ve şifreyle giriş yap.

---

## Günlük komutlar

| Komut | Ne yapar |
|---|---|
| `pnpm yerel` | Başlatır (kod değiştiyse yeniden derler) |
| `pnpm yerel:durdur` | Durdurur — **veri silinmez** |
| `pnpm yerel:yeniden` | Yalnız uygulamayı yeniden başlatır (ayar değişikliği sonrası) |
| `pnpm yerel:log` | Ne olup bittiğini canlı gösterir (çıkmak için Ctrl+C) |
| `pnpm yerel:yedek` | Veritabanı yedeği alır → `yedek/` klasörü |
| `pnpm yerel:geri-yukle <dosya.sql>` | Yedeği geri yükler |

Bilgisayarı kapatıp açtığında Docker açıksa sistem **kendiliğinden** geri
gelir (`restart: unless-stopped`).

---

## ⚠️ Yedek artık senin işin

Render + TiDB kurulumunda yedeği sağlayıcı alıyordu. Burada kimse almıyor.

```bash
pnpm yerel:yedek
```

Çıkan dosyayı **bulut sürücüne ya da harici diske kopyala**. Aynı bilgisayarda
duran yedek, disk bozulduğunda yedek değildir.

Haftada bir alışkanlık haline getir. Veri büyüdükçe (özellikle görseller
veritabanında durduğu için) dosya da büyür.

---

## Canlıdaki veriyi buraya taşımak

TiDB'deki gerçek veriyi yerele almak için:

1. **TiDB Cloud → Cluster → Import/Export → Export** ile bir `.sql` dump al.
   (Kota kilitliyken bu yapılamaz; önce erişimi açman gerekir.)
2. Dosyayı proje klasörüne koy.
3. ```bash
   pnpm yerel:geri-yukle kokpit-dump.sql
   pnpm yerel:yeniden
   ```

Geri yükleme mevcut yerel veritabanını **siler**; betik güvenlik için önce
onun yedeğini alıyor.

---

## Arka plan işleri

Yerelde **kapalı** başlıyor (`SCHEDULER_DISABLED=1`). Zamanlayıcı 15 dakikada
bir pazaryerlerine gidiyor, stok nöbeti tutuyor, sabah brifingi hazırlıyor —
bunlar 7/24 açık bir makine için tasarlandı ve pazaryeri anahtarları boşken
zaten hiçbir işe yaramıyor.

Açmak için `.env.yerel` içinden `SCHEDULER_DISABLED` satırını sil, sonra
`pnpm yerel:yeniden`.

---

## Dükkandaki diğer cihazlardan erişim

Şu an iki port da yalnız bu bilgisayara bağlı. Aynı ağdaki tabletten ya da
telefondan açmak istersen `docker-compose.yml` içinde:

```yaml
ports:
  - "127.0.0.1:3000:3000"     # bunu
  - "3000:3000"               # bununla değiştir
```

Sonra `pnpm yerel`. Diğer cihazdan `http://<bilgisayarın-ip-adresi>:3000`
adresiyle açılır.

> Bunu yapmadan önce güçlü bir `OWNER_PASSWORD` seçtiğinden emin ol: artık
> ağdaki herkes giriş ekranını görebiliyor olacak.

---

## Sorun giderme

**"docker: command not found"** → Docker Desktop kurulu değil ya da açık
değil.

**Uygulama açılmıyor, sürekli yeniden başlıyor** → `pnpm yerel:log` ile bak.
En sık sebep `.env.yerel` dosyasının hiç oluşturulmamış olması.

**"Giriş yapılandırılmamış"** → `.env.yerel` içinde `OWNER_EMAIL` ve
`OWNER_PASSWORD` boş.

**Baştan başlamak istiyorum (veri dahil her şey silinsin)**

```bash
docker compose down -v
```

`-v` veri birimini de siler. **Geri dönüşü yok** — önce yedek al.

---

## İleride sunucuya taşırken

Bu kurulum olduğu gibi taşınır: aynı `Dockerfile`, aynı `docker-compose.yml`.
Sunucuda değişmesi gerekenler:

- `MARIADB_ROOT_PASSWORD` ve `DATABASE_URL` içindeki şifre — gerçek bir şifre
- Portlardaki `127.0.0.1:` ön eki kalkar
- Önüne HTTPS veren bir katman (Caddy/Nginx ya da Cloudflare Tunnel)
- `SCHEDULER_DISABLED` kalkar, pazaryeri anahtarları girilir
