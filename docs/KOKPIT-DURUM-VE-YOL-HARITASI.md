# Kokpit — Sistemin Mantığı, Bugünkü Durumu ve Sıfırdan Yol Haritası

*Tarih: 04.08.2026 · Yöntem: kod tabanının uçtan uca incelenmesi (şema, uç noktalar,
istemci çağrıları, migration geçmişi, niyet belgeleri). Rakip kıyası yok — bu belge
yalnız kendimize bakar.*

---

## Bölüm 1 — Sistemin mantığı: Kokpit neyi çözmeye çalışıyor?

### 1.1 Temel fikir

Kokpit'in kurucu fikri tek cümlede şudur:

> **Ürün kartı şirketin çekirdek verisidir; her şey oradan beslenir.**

`URUN-CEKIRDEGI-YOL-HARITASI.md` bunu açıkça yazmış ve bir de test cümlesi koymuş:
*"Bu bilgi ürün kartında var mı? Yoksa neden yok? Varsa neden başka yerde elle
tekrar giriliyor?"*

Yani Kokpit bir muhasebe programı ya da pazaryeri aracı değil. **Tek bir doğru ürün
tanımından pazaryerini, fiyatı, üretimi, stoğu, etiketi, muhasebeyi ve raporu
besleme** iddiası. Bu iddia doğru ve iyi. Sorun iddiada değil, uygulanışında.

### 1.2 Ürünün veri mantığı — "küp"

Sistemin en özgün fikri bu ve anlaşılması şart:

```
seri × renk × form × ambalaj × hazırlık  =  bir MASTER ürün
CANDY × Fuşya × Airbrush × 100 ml × konsantre  →  aoccndfusyaab100
```

Beş eksenin her kombinasyonu bir **master** üretir. Master = **fiziksel şişe**.
Stok, reçete, barkod, maliyet ona aittir.

Master'ın üstünde iki katman daha var:

| Katman | Ne demek | Örnek |
|---|---|---|
| **Master** | Fiziksel şişe | CANDY Fuşya Airbrush 100 ml |
| **İlan (listing)** | Aynı şişenin pazarlama kimliği | "Airbrush Boyası" · "Rapala Boyası" — aynı şişe, iki hikâye |
| **Kanal ilanı** | O ilanın belirli pazaryerindeki hâli | Trendyol'daki kaydı, HB'deki kaydı |

**Bu ayrım doğru ve değerlidir.** Sebebi: aynı şişeyi iki farklı isimle satabilirsin
ama stok tektir. Düz bir ürün listesi bunu yapamaz — aynı şişe iki satır olur, stok
ikiye bölünür, hangisi gerçek belli olmaz. (Sizin gönderdiğiniz ticari panelin ekran
görüntüsünde tam bu vardı: 3261 ve 3260 numaralı iki ürün, benzer adlar, ayrı ayrı
6921 ve 42792 stok.)

### 1.3 Para mantığı

```
hammadde (materials) → reçete (formulas + formulaItems) → master maliyeti
                     + ambalaj maliyeti (packagingInputs)
                     ────────────────────────────────────
                     = birim maliyet  →  fiyat  →  kâr
```

Reçete "1 litre baz" üzerinden yazılır, ambalaj hacmine göre ölçeklenir
(`formulaScale`). Bu da doğru bir kurgu.

### 1.4 Satış mantığı

```
pazaryeri siparişi ──┐
elden satış ─────────┼──→ orders + orderItems ──→ stok düşümü ──→ cari/kasa
web mağaza ──────────┘         (barkod ile master'a bağlanır)
```

### 1.5 Özet: mantık sağlam

Model doğru kurulmuş. Küp fikri, master/ilan ayrımı, reçete ölçekleme, sipariş-ürün
bağı — hepsi işin gerçeğine uygun. **Bu belgenin geri kalanı modeli eleştirmiyor;
modelin kullanılmıyor oluşunu anlatıyor.**

---

## Bölüm 2 — Nerdeyiz? (kanıtlarla)

### 2.1 Ölçüler

| Ne | Kaç |
|---|---|
| Veritabanı tablosu | 59 |
| API uç noktası | 289 |
| Sayfa | 36 |
| Rota | 41 |
| Migration | 46 |
| Test | 872 (57 dosya) |
| **Katalogdaki master ürün** | **88** |
| **Katalogdaki ilan** | **0** |
| **Stoksuz master** | **60** |

Son üç satır teşhisin tamamı: **59 tablo ve 289 uç nokta yazılmış, ilan sayısı sıfır.**

> *Not: 88/0/60 rakamları işletme sahibinin gönderdiği ekran görüntüsünden. Canlı
> veritabanına erişimim yok. Bu sayılar yanlışsa aşağıdaki teşhisin bir kısmı da
> yanlıştır.*

### 2.2 Kokpit henüz hiçbir şeyin kayıt yeri değil

Gerçek satış başka bir panelde dönüyor (3261 numaralı ürüne kadar giden, fotoğraflı,
fiyatlı, stoklu ticari panel). Kokpit onun yanında duruyor.

Bu, "ürünler yapay duruyor" hissinin kaynağı: kayıtlar yapay çünkü hiçbiri gerçek
bir satışın kaydı değil. Sistem **iş hakkında** veri tutuyor ama **işin kendisi**
değil.

### 2.3 Genişlik/derinlik dengesizliği

36 sayfa var. Ama ilan yoksa:
- Kampanya takvimi neyi planlayacak?
- Strateji raporu neyi analiz edecek?
- AI pazarlama neyin metnini yazacak?
- Kupon motoru neye indirim yapacak?

Bunlar kötü özellikler değil — **sırası gelmemiş** özellikler. Temel akış çalışmadan
üstüne kat çıkılmış.

---

## Bölüm 3 — Nasıl buraya geldik: iki kuşak hikâyesi

Bu bölüm olmadan mevcut kafa karışıklığı anlaşılmaz.

### 3.1 Dönüm noktası: migration 0033

```
0000 ─────────────────── 0032    │  0033  │  0034 ─────────── 0045
   BİRİNCİ KUŞAK (products)      │ 14 yeni │  İKİNCİ KUŞAK
   düz model: parentId, türev    │  tablo  │  küp: masterProducts
```

Sistem **bir kez baştan sona kuruldu**, sonra **ikinci kez baştan kuruldu.**
Migration 0033 tek seferde 14 tablo ekliyor — yani şemanın dörtte biri o gün doğdu.

### 3.2 Birinci kuşakta ne yapıldı

`URUN-CEKIRDEGI-YOL-HARITASI.md`'ye göre Faz A'dan G'ye tamamlanan işler:

| Faz | İş | Bugünkü hâli |
|---|---|---|
| A1-A5 | Barkod/SKU tekilliği, yaşam döngüsü, **sağlık skoru** | `shared/productHealth.ts` — **ölü** |
| B1-B3 | Tam sayfa ürün detayı, türev karşılaştırma | eski modele bağlı |
| C1-C2 | **Trendyol'da sıfırdan ürün açma** | `trendyolProducts.ts` — yeni modele taşınmış |
| D1-D3 | Sipariş kalem bağı, üretim önerisi | kısmen taşındı |
| E1 | AI içerik | taşındı |
| F1 | **Ürün Kârlılığı raporu** | `report.productSales` — **yetim** |
| G1-G4 | **Excel içe/dışa aktarma (20 test)** | `shared/productIO.ts` — **yetim**, sayfası silinmiş |

**Bir yol haritasının tamamı, sonra terk edilen bir model üzerine inşa edilmiş.**

### 3.3 Eski model silinmedi, sadece fişi çekildi

`/urunler` rotası `/katalog`'a yönlendiriliyor ve kodda şu not var:
*"Eski model menüden kaldırıldı."* Ama tablolar, uç noktalar ve kod duruyor.

---

## Bölüm 4 — Ölü ağırlık (sayımı yapıldı)

289 uç noktanın **43'ü istemciden hiç çağrılmıyor**. Dağılımı:

| Dosya | Yetim | Ne bunlar |
|---|---|---|
| `urun.ts` | **29** | Eski ürün modelinin tamamı: create/update/delete/get, images, movements, adjustStock, bulkImport, bulkPrice, applyPrices, costSummary, formula.*, production.produce/runs/undo |
| `katalog.ts` | 8 | capacityOf, publishListing, reserve/releaseForOrder, setChannelPrice, masterImages, kanal özelliği silme |
| `finans.ts` | 2 | accounts.update, **report.productSales** |
| `pazarlama.ts` | 2 | campaigns.upcoming, **storefront.paytrToken** |
| `satis.ts` | 1 | orders.syncTrendyol |
| `_core` | 1 | system.health |

### 4.1 Ölü ama değerli olanlar — "yok" sanılan, aslında yazılmış şeyler

Bu liste önemli, çünkü dün yazdığım rakip analizinde bunlara "eksik" demiştim ve
**yanılmışım**:

| Sanılan | Gerçek |
|---|---|
| "N11 / Çiçeksepeti entegrasyonu yok" | `products.pushToN11` ve `pushToCiceksepeti` **yazılmış** — ama ölü modele bağlı |
| "Tahsilat linki yok" | **PayTR sanal POS hazır**: `server/paytr.ts`, env anahtarları, iframe token ucu. Mağaza sayfasında son adım bağlanmamış; ekranda hâlâ *"aktifleştirildiğinde burada görünür"* yazıyor |
| "Kârlılık raporu yok" | `report.productSales` **var**, Analiz sayfasından koparılmış |

Yani sistemin bir kısmı "eksik" değil, **bağlantısı kopmuş**. Bu iyi haber: bağlamak
yazmaktan ucuzdur.

### 4.2 Tamamen ölü kod

- `shared/productHealth.ts` (76 satır) — **yalnız kendi testi çağırıyor**, başka
  hiçbir yerden referans yok. 6 test hiçbir şeyi korumuyor.
- `shared/productIO.ts` (532 satır, 20 test) — sayfası silinmiş, `urun.bulkImport`
  yetim.
- Eski `products` tablosu ve çevresi: 108 kod referansı.

### 4.3 Hâlâ ölü tabloya yazan canlı akış — **bu bir hata**

`server/modules/pazarlama.ts` (satır 341, 486, 584): **Ürün Geliştirme**'deki
"Ürünleştir" adımı `db.createProduct()` çağırıyor — yani **eski** tabloya yazıyor.

Sonuç: Ar-Ge'de bir ürün geliştirip "Ürünleştir" derseniz, ürün ölü modele düşer
ve **Ürünler sayfasında hiç görünmez.** Kopuk köprü.

---

## Bölüm 5 — Zincir nerede kopuyor? (en önemli bulgu)

Ürünün pazaryerine gitme zinciri kodda şöyle:

```
1. Boyutları Tohumla        → renk/form/ambalaj/kullanım alanı sözlüğü      ✅ yapılmış (31 renk, 7 ambalaj)
2. Seri uyumluluğu          → hangi seri hangi renk/form/ambalajla üretilir  ✅ yapılmış
3. generateMasters          → küp çarpımı, master kayıtları                  ✅ yapılmış (88 master)
4. generateListings         → master başına ilan (pazarlama kimliği)         ⛔ HİÇ ÇALIŞTIRILMAMIŞ (0 ilan)
5. bulkPublish              → ilan başına kanal ilanı                        ⛔ 4 olmadan olmaz
6. pushCardsToTrendyol      → pazaryerinde ürün kartı açma                   ⛔
7. syncChannel              → stok/fiyat gönderimi (15 dk otomatik)          ⛔
```

**4. adım eksik bir özellik değil — basılmamış bir düğme.**

`generateListings` yazılmış, test edilmiş, Ürünler → Seri kurgusu sekmesinde
düğmesi duruyor, önizlemesi var. `bulkPublish` ve `pushCardsToTrendyol` da yazılmış
ve `/yayin` sayfasına bağlı.

Yani: **Kokpit'in ürün→pazaryeri zinciri kodda tamamlanmış, bir kez bile
çalıştırılmamış.** Bu bir geliştirme sorunu değil, bir **kullanım** sorunu.

Bunun tek istisnası olabilir: 4. adım "Genel" kullanım alanı kaydı ister
(`GENERIC_USE_CASE_CODE`); yoksa hata verir. Tohumlama yapıldığı için muhtemelen
vardır ama **canlıda doğrulanmalı**.

---

## Bölüm 5.5 — Uygulama durumu (04.08.2026 akşamı)

Bu belge yazıldıktan sonra Faz 1-3'ün bir kısmı uygulandı. Gerçekleşen:

| İş | Durum | Not |
|---|---|---|
| Ar-Ge → katalog köprüsü | ✅ | Ürün Çıktıları'nda **üç** düğme vardı; biri ölü modele yazıyordu. Tek yola indi |
| PayTR ödeme adımı | ✅ | Sunucu hazırdı, istemci çağırmıyordu; bağlandı |
| "İlan üret" düğmesi | ✅ | **Hiçbir şey üretmiyordu**, yalnız /katalog'a yönlendiriyordu. Zincirin kırıldığı yer buydu |
| Trendyol sahte kategori engeli | ✅ | Yeni modelin kullanmadığı bir ayar zorunlu tutuluyordu |
| İşçilik + genel gider maliyete | ✅ | `computeMasterCosts` artık payı alıyor; maliyetler ARTACAK, doğrusu bu |
| Ölü ağırlık | ✅ | 3 router, 3 shared modül, 27 db fonksiyonu, 36 boş test kaldırıldı |
| Kârlılık raporu (F1.3) | ✅ | `report.productSales` kaldırıldı: `katalog.revenue` aynı işi master bazında yapıyor ve zaten Analiz'e bağlıydı — bir ikizlik daha |
| Net kâr (F3.1) | ✅ | `report.channelProfit` maliyeti `computeMasterCosts`tan alıyor; eski tablodan okuduğu için rapor boş çıkıyordu |
| İkiliği kökten kaldır | ✅ | Emekli model koddan VE veritabanından söküldü (migration 0046) |
| Yetim uçlar | ✅ | 43 → 1. Kalan tek yetim `system.health` (Render sağlık kontrolü, HTTP rotası) |
| N11/Çiçeksepeti (F1.4) | ⬜ | Push kodu ölü modele bağlıydı, model silinince kodu da gitti. Yeni modele **yeniden yazılacak** |
| Renk kodu araması (F4) | ⬜ | — |

### Yetim uçlarda ne yapıldı

Her yetim için tek soru soruldu: bu gerçek bir boşluk mu, yoksa ikizlik mi?

**Bağlandı** (gerçek boşluk — eklenebiliyordu ama kaldırılamıyordu):
`deleteChannelAttribute`, `deleteChannelAttributeValue` (özellik/eşleme silme
düğmeleri), `accounts.update` (hesap adı düzeltilemiyordu).

**Kaldırıldı** (ikizlik ya da vazgeçilmiş fikir): `report.productSales`
(→ `katalog.revenue`), `orders.syncTrendyol` (→ `syncAll`), `publishListing`
(→ `bulkPublish`), `setChannelPrice` (→ `setBasePrice` + applyToChannels),
`masterImages` (→ `masterCard`), `capacityOf` (→ `trackList`),
`reserveForOrder`/`releaseForOrder` (rezervasyon fikri D2'de zaten gereksiz
bulunmuştu; otomatik yol `orderReservation.ts`'te duruyor), `campaigns.upcoming`.

### Çözüldü: Strateji sayfası ölü veriyi analiz ediyordu

`report.data` → `reportData()` eski `products` tablosunu okuyor. Strateji
sayfasındaki 12 maddelik ürün tamamlanma listesi (`Strategy.tsx:65-92`)
aslında `masterHealth`'in ölü model üzerindeki bir KOPYASI — üstelik daha
eski bir sürümü.

Doğru çözüm silmek değil, tekrarı kaldırmak: Strateji ürün bölümü kendi
kontrol listesini tutmayı bırakıp `katalog.trackList`'in sağlık verisini
okumalı. Ürünler sayfasındaki kartlar bunu zaten canlı veriyle ve tıklanabilir
düzeltmelerle yapıyor.

**Yapıldı:** kontrol listesi küp alanlarına göre 9 maddeye indi (satış adı,
reçete, fiyat, barkod, görsel, satılabilirlik, satışta, pazarlama metni, satış
görmüş) ve `reportData` artık `masterProducts` okuyor.

## Bölüm 6 — Yol haritası

Sıralama mantığı: **önce çalıştır, sonra bağla, sonra temizle, sonra büyüt.**
Yeni özellik en sona bırakıldı, çünkü sistemin sorunu özellik eksikliği değil.

### FAZ 0 — Zinciri bir kez uçtan uca çalıştır  ⟵ *her şeyden önce*

**Bu bir geliştirme işi değil, bir kullanım işi.** Kod hazır.

Tek seri seçilir (CANDY: 9 renk, 87 varyant) ve sonuna kadar götürülür:

1. Renklere uluslararası ad, seriye satış karşılığı girilir (`MAGENTA`, `CANDY PAINT`)
2. "Satış adlarını üret" çalıştırılır
3. Her renge görsel yüklenir (renk başına tek görsel tüm ambalajlara atanabilir)
4. Fiyat, barkod, stok girilir — ya da Excel'le toplu
5. **`generateListings` çalıştırılır** ← zincirin kopuk halkası
6. `/yayin` → `bulkPublish` → `pushCardsToTrendyol`
7. Trendyol'da canlı ilanı gözle doğrula

**Çıktı:** Kokpit'in ilk gerçek satışı. Ve daha değerlisi: **gerçek eksik listesi.**
Trendyol hangi alanı reddetti, hangi görsel geçmedi, komisyon sonrası ne kaldı —
bunlar tahminle değil ancak deneyerek öğrenilir.

**Uyarı:** Bu adım muhtemelen çuvallayacak. İyi olan bu. Çuvallama noktaları
gerçek yol haritasını yazacak; aşağıdaki fazlar tahmindir, Faz 0'ın çıktısı
gerçektir.

### FAZ 1 — Kopuk köprüleri bağla  *(hepsi mevcut kodu kullanır, yeni yazım az)*

| İş | Neden | Büyüklük |
|---|---|---|
| **"Ürünleştir" yeni modele yazsın** | Ar-Ge'de geliştirilen ürün ölü tabloya düşüyor, katalogda görünmüyor | S |
| **PayTR son adımını mağazaya bağla** | Sanal POS hazır, ekranda "aktifleştirildiğinde görünür" yazıyor. Kartla tahsilat = doğrudan nakit | S |
| **Kârlılık raporunu geri bağla** | `report.productSales` yazılmış, Analiz'den kopmuş. Yeni modele uyarlanacak | M |
| **N11/Çiçeksepeti push'unu yeni modele taşı** | Eşleme kodu yazılmış, ölü modele bakıyor | M |

### FAZ 2 — Ölü ağırlığı kaldır  *(hız ve kafa netliği)*

- `shared/productHealth.ts` + testi sil (hiçbir şeyi korumuyor)
- `shared/productIO.ts` + `urun.bulkImport` sil (yerini `masterIO` aldı)
- Eski `products` modeli için **karar ver**: sil / dondur / veriyi göç ettir.
  Kararı vermeden önce: canlıda o tabloda kaç satır var ve hangisi hâlâ referans
  ediliyor?

Bu faz özellik üretmez ama her sonraki işi hızlandırır: bugün bir geliştirici
(ya da AI) "ürün" kelimesini aradığında iki cevap buluyor.

### FAZ 3 — Paranın görünür olması

| İş | Neden |
|---|---|
| **Komisyon + kargo + iade → net kâr** | Şu an bir satıştan cebe ne kaldığı bilinmiyor |
| **İşçilik + genel gider → parti maliyeti** | Maliyet yalnız hammaddeden; sistematik olarak düşük çıkıyor |

İkisi birleşmeden "kârlıyım" cümlesi kurulamaz. Faz 0 gerçek komisyon oranlarını
göstereceği için bu faz ondan sonra gelir.

### FAZ 4 — Renk kodu araması  *(satışı doğrudan artıran tek fikir)*

Müşteri profiliniz renk koduyla arıyor (kendi bilgi tabanımızın tespiti). Renk
sözlüğü (hex dahil) zaten var. Web mağazaya "renk kodu → ürün" araması eklemek,
aramayı satışa çeviren en kısa yol.

### FAZ 5 — Genişleme

İade yönetimi, kargo etiketi genişletme, kanal bazlı içerik skoru, lot
izlenebilirliği, e-Fatura. **Hepsi Faz 0-3 bitmeden erken.**

---

## Bölüm 7 — Karar bekleyen sorular

1. **Bugün Trendyol'da satılan ürünler hangi panelden yönetiliyor?** Cevap "diğer
   panel"se, asıl mesele "Kokpit'e ne ekleyelim" değil, **"Kokpit o paneli ne zaman
   devralacak"**. Yol haritası o devralma planıdır.
2. **Eski `products` tablosunda canlıda kaç satır var?** Silme/göç kararı buna bağlı.
3. **e-Fatura eşiğine ne kadar yakınsınız?** Yasal zorunluluk, özellik değil.
4. **GBF/SDS yükümlülüğünüz var mı?** Varsa risk, fırsat değil.

---

## Bölüm 8 — Tek paragraflık özet

Kokpit'in mantığı doğru: ürün kartını şirketin çekirdeği yapmak, küp modeliyle
şişeyi pazarlama kimliğinden ayırmak, reçeteden maliyete kadar tek zincir kurmak.
Bu model iyi tasarlanmış ve büyük ölçüde yazılmış. Sorun şu ki sistem **iki kez
kuruldu** (migration 0033), birincisi silinmeden bırakıldı, ve ikincisi hiç
çalıştırılmadı: 88 ürün, 0 ilan. Ürün→pazaryeri zinciri kodda tamam ama basılmamış
bir düğmede duruyor. Yapılacak ilk iş yeni özellik yazmak değil, **bir seriyi
uçtan uca canlıya çıkarmak** — çünkü gerçek eksik listesini ancak o üretir.
