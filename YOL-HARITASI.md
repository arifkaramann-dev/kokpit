# Kokpit — Derin Analiz ve Yol Haritası

**Tarih:** 2026-07-28 · **Referans commit:** `4a2cc77` (PR #66 sonrası)

> **DURUM (güncelleme):** 6 fazın tamamı uygulandı. Aşağıdaki analiz tarihsel
> kayıt olarak durur; her fazın altında ne yapıldığı işaretlidir. Kalan
> bilinen açıklar §5'te.

Bu belge v3 ürün mimarisi (Master / Listing / ChannelListing) tamamlandıktan
sonraki gerçek durumu, kanıtlı eksikleri ve değer sırasına göre yol haritasını
tutar. Her iddia kod okunarak doğrulanmıştır; dosya ve satır referansları
verilmiştir.

---

## 1. Zincirin uçtan uca durumu

Bir rengin fikirden paraya dönüşme yolu 14 adım. Bugünkü durum:

| # | Adım | Durum | Nerede |
|---|---|---|---|
| 1 | Tanım (seri · renk · form · ambalaj · kullanım alanı) | ✅ | `Definitions.tsx` |
| 2 | Master üretimi (küp kesişimi, mükerrer imkânsız) | ✅ | `catalogPlan.ts` |
| 3 | Reçete bağlama | ✅ otomatik (30 dk) | `catalogJobs.ts` |
| 4 | Kapasite (hammaddeden üretilebilir adet) | ✅ otomatik (30 dk) | `capacity.ts` |
| 5 | Maliyet (çok seviyeli BOM, fire dahil) | ✅ | `costing.ts` |
| 6 | İlan üretimi (master × kullanım alanı) | ✅ | `catalogPlan.ts` |
| 7 | İçerik (blok başına AI, ilan başına kişiselleştirme) | ✅ | `listingContent.ts` · `contentAi.ts` |
| 8 | Görsel | ⚠️ şema var, **veri ve yükleme aracı yok** | `masterFields.ts` |
| 9 | Kategori eşlemesi | ✅ manuel | `Publish.tsx` |
| 10 | Zorunlu özellik eşlemesi (küpten türetilir) | ✅ **yeni** | `masterFields.ts` |
| 11 | Pazaryerinde kart açma | ✅ | `cardMapping.ts` |
| 12 | Fiyat/stok senkronu | ✅ otomatik (15 dk) | `channelSyncWorker.ts` |
| 13 | **Sipariş → master bağı** | ❌ **kopuk** | `productionPlan.ts` |
| 14 | Üretim planı · hammadde rezervi · düşüm | ⚠️ 13'e bağlı | `orderReservation.ts` |

Adım 1–12 çalışıyor. **Zincir 13'te kopuyor** ve 14 o kopuk halkanın üstünde
duruyor.

---

## 2. Kritik bulgu: sipariş↔master bağı kurulmuyor

### Olan

Pazaryerinden gelen sipariş satırı **barkodu taşıyor**:

- `server/trendyol.ts:88` → `barcode: line.barcode`
- `server/hepsiburada.ts:129` → `barcode: l.merchantSku ?? l.sku`

Bu barkod `orderUtils.ts:43` içinde **eski `products` tablosuna** eşleştirilir,
`orderItems.productId` yazılır ve **barkodun kendisi saklanmaz** —
`orderItems` şemasında barkod/SKU kolonu yok (`drizzle/schema.ts:279`).

`resolveOrderLines` üç yolla eşleştirir (`productionPlan.ts:76`):

1. `kanal_kodu` — pazaryeri SKU'su/barkodu ile **kesin** eşleşme
2. `baslik` — başlık birebir
3. `yaklasik` — kelime örtüşmesi ≥ 0.6

Ama her iki çağıran da `channelRef` alanını **hiç doldurmuyor**:

- `server/modules/katalog.ts:2255` (üretim brifingi)
- `server/orderReservation.ts:122` (hammadde rezervi)

### Sonuç

**1. yol ölü kod.** Her sipariş satırı, master'a bulanık başlık benzerliğiyle
bağlanıyor. Bunun somut bedelleri:

- Pazaryerinde ilan başlığını düzenlersen (SEO için sık yapılır) geçmiş ve yeni
  siparişler eşleşmeyi kaybeder — brifing "eşleşmedi" der, üretim planı boşalır.
- İki benzer ilan ("Candy Red 100 ML" / "Candy Red 250 ML") kelime örtüşmesinde
  yakındır; 0.6 eşiği yüksek tutulmuş ama **yanlış master'a rezerv düşme riski
  sıfır değil** — para ve stok yolunda tahmin çalışıyor.
- Master başına satış/kâr raporu yazılamıyor (bkz. §3).

Kendi ürettiğimiz `channelListings.channelBarcode`'u pazaryerine gönderiyoruz,
sipariş o barkodla geri geliyor, ve biz onu çöpe atıp başlık tahmin ediyoruz.

### Çözüm (küçük, yüksek getirili)

1. `orderItems` şemasına `channelRef varchar(64)` ve `masterId int` ekle.
2. `toItemRows` gelen barkodu **sakla** (bugün düşürüyor).
3. Sipariş düşerken `channelListings.channelBarcode/channelSku` ile kesin
   eşleştir, `masterId`'yi **bir kez yaz**.
4. `resolveOrderLines` yalnız `masterId` boş kalan satırlar için çalışsın —
   bulanık eşleşme kritik yoldan yedek yola iner.

---

## 3. Eksikler (kanıtlı)

### 3.1 Master başına getiri yok — kullanıcının açık isteği

İstenen: *"ürünlerin serilerin eksikleri · **getirileri** · hedef pazar ·
pazarlama seçenekleri"*.

Bugün **eksikler** var (`masterHealth.ts` — 8 maddelik sağlık karnesi, seri
bazında toplanıyor). **Getiriler yok**: `katalog.ts` ve `masterHealth.ts`
içinde satış adedi, ciro veya kâr hesabı geçmiyor. Yani "hangi renk para
kazandırıyor, hangisi rafta duruyor" sorusunun cevabı yok — üretim
önceliklendirmesi ve renk emekliliği kararı hâlâ hisle veriliyor.

§2 çözülmeden doğru hesaplanamaz (bağ yoksa ciro master'a yazılamaz).

### 3.2 Görsel boru hattı yok

Şema (`masterImages`) ve miras (`resolveImages`) hazır, arayüz var — ama:

- Yalnız **URL girişi** var; dosya yükleme yok. Görselin bir yerde barınması
  gerekiyor, o yer belirlenmemiş.
- **Toplu atama yok**: bir rengin 4 ambalajı aynı fotoğrafı kullanır; bugün 4
  master'a ayrı ayrı girilir.
- Veri **sıfır** — dolayısıyla bugün Trendyol'da hiçbir kart açılamaz
  (`cardMapping.ts:134` "görsel yok (zorunlu)" ile düşürür).

Bu, **kart açmanın önündeki tek fiziksel engel**.

### 3.3 Vitrin (web mağaza) hâlâ eski modelde

`storefrontRouter.products` (`server/modules/pazarlama.ts:1088`) doğrudan
`db.listProducts()` okuyor — eski `products` ağacı. v3'te üretilen hiçbir
master/ilan web sitesinde görünmüyor. `salesChannels` içinde "web" kanalı var
ve yayınlanabiliyor, ama yayının vitrinde bir karşılığı yok.

### 3.4 Dokuz sayfa eski modelde

`trpc.products.list` kullanan sayfalar:

`Orders` · `Production` · `Analytics` · `Marketing` · `Quotes` · `Questions` ·
`ProductImport` · `Settings` · `CommandPalette`

En can alıcısı **Orders**: elden sipariş girerken ürün seçtiren liste eski
kataloğu gösteriyor; v3'te üretilen ürünü siparişe ekleyemiyorsun. Aynı şey
`Quotes` (teklif) için de geçerli.

### 3.5 İki ürün tablosu paralel yaşıyor

`products` (+`parentId` ağacı) ve `masterProducts` (+küp) aynı anda canlı.
Geçiş dönemi için bilinçli bir karardı, ama **bitiş tarihi yok**. Her yeni
özellik "hangi tabloya?" sorusunu doğuruyor; bu soru her seferinde kredi ve
hata riski demek.

---

## 4. Yol haritası

Sıra Yönetim Kurulu önceliğine göre: **para kazandır → zaman kurtar → hata
azalt → kararı kolaylaştır**.

### ✅ Faz 1 — Sipariş↔Master kesin bağı

*Hata azaltır (yanlış rezerv), sonraki her şeyin önkoşulu.*

- `orderItems`: `channelRef` + `masterId` kolonları (+ migration)
- Pazaryeri içe aktarımında barkodu sakla, `channelBarcode` ile kesin eşleştir
- `resolveOrderLines` yedek yola insin; eşleşmeyenler ekranda "elle bağla"
- Geçmiş siparişler için tek seferlik geri doldurma işi

**Ölçüt:** açık siparişlerin ≥%95'i `via: "kanal_kodu"` ile bağlanıyor.

### ✅ Faz 2 — Master ve seri başına getiri paneli

*Kararı kolaylaştırır: neyi üreteceğine veri karar verir.*

- Master başına: satış adedi, ciro, birim kâr, kâr marjı (30/90/365 gün)
- Seri başına toplama + "ölü renk" listesi (90 günde 0 satış)
- Ürün kartına "Getiri" sekmesi, Kokpit'e "en çok kazandıran 10 renk"

### ✅ Faz 3 — Görsel boru hattı

*Kart açmanın önündeki tek engeli kaldırır — doğrudan para.*

- Dosya yükleme (barındırma kararı: Render disk mi, S3/R2 mi)
- **Renk başına toplu atama**: bir görsel → o rengin tüm ambalajları
- İlan başına özel görsel (opsiyonel, master'ı ezer)
- Eksik görsel listesi Kokpit'te iş listesi olarak

### ✅ Faz 4 — Sipariş ve üretim sayfalarını v3'e taşı

*Zaman kurtarır: tek katalog, tek yer.*

- `Orders` ve `Quotes` ürün seçimi → master/ilan araması
- `Production` üretim emri → master + reçete + eksik hammadde
- `CommandPalette` v3 arama

### ✅ Faz 5 — Vitrin v3

*Para kazandırır: web mağaza kendi kanalımız, komisyonsuz.*

- `storefrontRouter` → `listings` + `channelListings(web)` okusun
- Renk/ambalaj seçici ilan varyantlarından
- İçerik ve görsel zaten üretilmiş durumda — sadece bağlanacak

### ✅ Faz 6 — Eski modelin emekliliği

*Bakım maliyetini kalıcı düşürür.*

- `products` yalnız okunur hale gelsin, yeni kayıt açılmasın
- Kalan tüketiciler kesildikçe router ve tablo kaldırılsın
- **Not:** veri silme kararı kullanıcınındır; kod bu kararı zorlamaz

---

## 5. Uygulama sonrası durum

### Ne yapıldı

| Faz | Ne değişti |
|---|---|
| 1 | `orderItems.channelRef` + `masterId` kolonları; gelen barkod SAKLANIYOR ve `channelListings` ile kesin eşleşiyor. `resolveOrderLines` yedek yola indi (`via: "kayitli"` yeni birincil yol). Zamanlayıcı her turda bağsız satırları tarıyor; elle bağlama ekranı var. |
| 2 | `masterRevenue.ts` (saf, 15 test): master/seri başına adet-ciro-maliyet-kâr-marj, ölü renk tespiti. Katalog → Getiri sekmesi. Analytics kârlılık paneli buradan besleniyor. |
| 3 | `masterImages.data` + `/api/img/master/:id` herkese açık servis; dosya yükleme, renk başına TOPLU atama, eksik görsel iş listesi (renk bazında). Pazaryerine mutlak adres `publicBaseUrl` ile üretiliyor. |
| 4 | Orders · Quotes · Marketing · Questions · CommandPalette `katalog.sellableList`'e geçti; sipariş/teklif satırı `masterId` ile yazılıyor. Production sayfası yeniden yazıldı: kuyruk açık sipariş talebinden, üretim çok seviyeli BOM'dan düşüyor (`produceMaster`). |
| 5 | `storefrontCatalog.ts` (saf, 15 test): vitrin web kanalı yayınlarından besleniyor, kart = renk + ambalaj seçenekleri. Web siparişi doğrudan master'a bağlanıyor. Web'e hiç yayın yoksa eski modele düşüyor — canlı mağaza bir an boş kalmıyor. |
| 6 | Eski içe aktarma sayfası (`ProductImport`) kaldırıldı — `products` tablosuna elle yeni kayıt açan son yol kapandı. Analytics eski `costSummary`'den koptu. |

### Bilinen açıklar

- **`products` tablosu hâlâ okunuyor.** `resolveProductIdForItem` sipariş
  kalemine eski `productId`'yi yazmaya devam ediyor (geçmiş raporlar bozulmasın
  diye). Tablo yalnız-okunur değil, sadece elle yeni kayıt açan yol kapandı.
  Tamamen kaldırmak `devProject` akışının da v3'e taşınmasını gerektirir.
- **Görsel base64 olarak veritabanında.** Eski `productImages` deseniyle aynı;
  dış bağımlılık istemediği için seçildi. Birkaç yüz fotoğrafta sorun değil,
  binlerce olunca S3'e taşınmalı — `masterImages.url` dolu satırlar zaten aynı
  kod yolundan geçiyor, geçiş kırılma yaratmaz.
- **Maliyet geçmişe dönük değil.** Getiri raporundaki kâr bugünkü hammadde
  fiyatlarıyla hesaplanır. Eğilim ve sıralama için doğru, muhasebe için değil.
  Panelde de böyle yazıyor.
- **Pazaryeri çağrıları canlıda doğrulanmalı.** Geliştirme ortamı pazaryerlerine
  çıkamıyor: `importChannelAttributes` ve kart açma yalnız Render'da test edilir.
- **Vitrin geçişi yayına bağlı.** Web kanalına ilk "canli" yayın yapıldığı an
  vitrin v3'e geçer. O ana kadar eski ürünleri göstermeye devam eder.
