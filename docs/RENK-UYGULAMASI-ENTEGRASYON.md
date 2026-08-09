# Renk Uygulaması Entegrasyonu

Dışarıda geliştirilen **Digital Paint Fingerprint** uygulamasının (Vite + React 18
+ Tailwind + three.js, 8.661 satır) kokpit'e alınması. Kaynak kod
`_transfer/renk-uygulamasi/` altında olduğu gibi duruyor — bu dizin **arşivdir**,
çalışan kod değildir. Taşınan her parça kokpit'in kendi diline (TypeScript, tRPC,
Drizzle) çevrilerek gelir.

## Amaç

Tek cümleyle: **rengi üret, ürüne bağla, pazaryerine gönder.**

Kokpit'in bugün yapamadığı şey, bir rengin ürün görselini tutarlı biçimde
üretmek. Uygulamanın getirdiği şey tam bu: obje tipi başına bir master görsel,
sonra her renk için o master'ın renginin değiştirilmesi. Böylece katalogdaki
bütün renkler aynı formda, aynı ışıkta, yalnız renk ekseninde ayrışan görsellerle
çıkar — müşteri iki numuneyi yan yana koyduğunda şekil farkını değil rengi görür.

## Kapsam kararı

### Taşınıyor

| Parça | Kokpit'teki yeri | Durum |
| --- | --- | --- |
| `color.js` — CIELAB, ΔE2000 | `shared/color/color.ts` | ✅ taşındı |
| `series.js` — boya serileri | `shared/color/series.ts` | ✅ taşındı |
| `normalize.js` — kayıt tamamlama | `shared/color/paint.ts` | ✅ taşındı |
| `match.js` — en yakın renk | `shared/color/match.ts` | ✅ taşındı |
| `recolor.js` — görsel yeniden renklendirme | `shared/color/recolor.ts` | ✅ taşındı |
| `subject` — fon ayıklama + obje maskesi | `shared/color/subject.ts` | ✅ taşındı |
| `AiStudio` — renk başına AI üretimi | Renk Stüdyosu (`/renk-studyo`) | ✅ kuruldu |
| `masterStore` — referans obje | `sampleMasters` + tRPC | ✅ kuruldu |
| `Templates` — kart kompozisyonu (fon+ambalaj+marka) | — | ⏳ sırada |

### Dondurulan

Dondurma **silme değildir**: kod `_transfer/renk-uygulamasi/` altında ve git
geçmişinde duruyor, geri çağrılabilir. Taşınmıyor, çünkü bugünkü amaca hizmet
etmiyor ve taşımanın bedeli (TypeScript'e çevirme, tRPC'ye bağlama, sürekli
bakım) karşılığını vermiyor.

**1. Fingerprint zinciri** — `fingerprint.js`, `illuminant.js`, `texture.js`,
`selection.js`, `Create.jsx`, `fingerprint.test.mjs`

Ne yapıyordu: aynı boyanın N fotoğrafından, aydınlatma farkını sökerek ve aykırı
gözlemleri eleyerek tek bir ölçülmüş renk üretmek.

Neden donduruldu: girdisi (gerçek boyanın farklı ışıklarda çekilmiş fotoğrafları)
bugünkü akışta yok — renkler AI ile üretiliyor. Daha güçlü sebep: `recolor`
rengi matematiksel olarak zorluyor, yani üretilen görselin rengi *konstrüksiyon
gereği* doğru. Ölçüp doğrulanacak bir sapma kalmıyor.

**Geri çağırma koşulu:** oto rötuş tarafında "müşteri arabasının fotoğrafını
gönderiyor, bu rengi yapın" senaryosu gerçek talebe dönüştüğünde. Fingerprint tam
o sorunun makinesidir ve rakiplerde yoktur.

**2. 3B önizleme zinciri** — `PaintViewer3D.jsx`, `StlPaint.jsx`,
`environment.js`, `pbr.js`, `tonemap.js`, `environment.test.mjs`,
`tonemap.test.mjs`

Ne yapıyordu: three.js ile boyanın 3B model üzerinde PBR önizlemesi.

Neden donduruldu: düzgün çalışmıyor, ve "renk üret → ürüne bağla" zincirinde rolü
yok. Bedeli ise ölçüldü — bundle'ın neredeyse tamamı buydu:

| | Önce | Sonra | Fark |
| --- | --- | --- | --- |
| Bundle | 817,28 kB | 260,39 kB | −%68 |
| Bundle (gzip) | 225,08 kB | 79,98 kB | −%64 |

`three` bağımlılığı tamamen düşüyor. Toplam 3.710 satır donuyor, geriye 4.409
satır kalıyor.

**3. `Scan.jsx`** — fotoğraftan renk örnekleyip en yakın boyayı bulan sayfa.
Fingerprint'in küçük kardeşi; aynı sebeple donduruldu. Motoru (`match`) taşındı,
sayfası taşınmadı.

### Karar bekleyen

- `PhotoPaint.jsx` — fotoğraf boyama. `recolor`'ı kullanmıyor; ne yaptığı
  incelenecek.

## Taşımada bulunan hata

`normalize.js` kayıt tamamlarken `srgb` ve `xyz` alanlarını hex'ten türetiyor
ama `lab` alanını türetmiyordu; eksikse sabit `{l:50, a:0, b:0}` — nötr gri —
yazıyordu. Yani hex'i kırmızı olan bir kayıt srgb/xyz tarafında kırmızı, Lab
tarafında gri görünüyordu.

Kaynak uygulamada bu hiç patlamadı: kayıtlar tarama hattından geliyordu ve Lab'ı
hep doluydu. Kokpit'te durum tersine dönüyor — `colors` tablosunda hex var, Lab
yok. Eski davranışla taşınan **her renk gri Lab alırdı** ve ΔE eşleştirmesi
hepsini birbirinin aynısı sayardı; hata vermeden, sessizce, tamamen yanlış
sonuçla.

`shared/color/paint.ts` içinde düzeltildi (`lab` artık hex'ten türetiliyor) ve
regresyon testi eklendi.

## Veri modeli yönü

Ölçülen değerlerle denetim verisi ayrı yerlerde durmalı:

| Veri | Nerede | Neden |
| --- | --- | --- |
| `lab` (L, a, b) | `colors` tablosunda ayrı sütunlar | Görsel üretiminin girdisi; ΔE eşleştirmesi SQL'e iner |
| Güven düzeyi | Sütun | Kalite kapısı — sorgulanacak |
| Etki, köken, ham kayıt | JSON sütunu | Sorgulanmıyor, şeması evrilecek |

`colors.finish` enum'u (`duz|metalik|sedef|candy|neon|seffaf`) ile boya serisi
(`Solid|Candy|Metallic|Pearl|Meteor`) **farklı kavramlardır**: ilki satış
etiketidir ve pazaryeri kartında "Renk Tipi" olarak gider, ikincisi malzeme
davranışıdır. Birbirine çevrilmeye çalışılırsa ikisi de bozulur.

## Akış kararı — 2026-08-09

İlk kurulumda üretim hattını "obje tipi başına bir NÖTR master üret, sonra her
rengi `recolor` ile matematiksel bas" olarak tasarladım. Gerekçe maliyet ve
tutarlılıktı: renk başına sıfır AI çağrısı ve şekil sabitliği.

Bu **yanlış kurgu oldu** ve ekranda karşılığı görülünce düzeltildi. İstenen akış:

> **Her renk için AI üretir.** Ürün (master) seçilir, renk üründen gelir, AI o
> renkte objeyi üretir, sonuç ürüne kaydedilir.

Nötr master yaklaşımı kaldırıldı. Şekil tutarlılığı ise kaybolmadı: üretim
isteğe bağlı bir **referans obje** ile yapılıyor ve modele "şekli, açıyı, ışığı
aynen koru, yalnız rengi değiştir" deniyor — kaynak uygulamadaki `masterStore`
fikrinin ta kendisi, ama rengi AI basıyor.

`recolor` çöpe gitmedi: **"Rengi tam tutur"** anahtarı olarak duruyor (varsayılan
kapalı). Görüntü modelleri kesin hex tutturmaz; anahtar açıkken üretim sonrası
renk hedefe oturtulur, gölge ve parlama korunur.

**Eksen de düzeltildi:** ekran önce renk + kodda sabit ambalaj listesinden
çalışıyordu; oysa kokpit'te gerçek nesne `masterProducts` ve renk onun bir
ekseni. Artık ürün seçiliyor, renk üründen türetiliyor.

Kart kompozisyonu (beyaz fon + ambalaj fotoğrafı + marka) bu turda akıştan
çıkarıldı; ona ait ambalaj/marka/font varlıkları da depodan kaldırıldı. İkisi de
`_transfer/renk-uygulamasi/` arşivinde ve git geçmişinde duruyor.

## Uygulama planı

1. ✅ **Renk motoru** → `shared/color/` (TypeScript, 75 test)
2. ✅ **`recolor`** → ölü koddan çıktı, `shared/color/recolor.ts` (9 test).
   Bağımlılığı olmadığı için şemadan önce alındı; hattın belirleyici parçası
   ve tek başına doğrulanabiliyor.
3. ✅ **Fon ayıklama** → `shared/color/subject.ts` (8 test). Kaynakta canvas'a
   gömülü olduğu için hiç test edilememişti.
4. ✅ **Şema + tRPC** → `sampleMasters` tablosu (tek CREATE TABLE) ve
   `renkStudyo` router'ı: referans objeler, renk başına üretim, ürüne kaydetme.
5. ✅ **Ekran** → `/renk-studyo`: ürün seç → AI üretir → ürüne kaydet.
6. ⏳ **Kart kompozisyonu** → beyaz fon + ambalaj fotoğrafı + marka; ambalaj
   ekseni kokpit'in `packagings` tablosuna bağlanacak.
7. ⏳ **Pazaryeri** → `masterImages` → `listingImages` → kanal kartı.

`colors` tablosuna Lab sütunu EKLENMEDİ: `normalizePaint` Lab'ı hex'ten
türetiyor ve bugünkü akışta sunucu tarafı ΔE eşleştirmesi yok. Yazıcısı ve
okuyucusu olmayan sütun, sonradan taşınacak ölü şema demek olurdu.

Sıra tesadüfi değil: her adım bir öncekine dayanıyor ve her adım tek başına
doğrulanabilir. Zincirin ucu (6) çalışana kadar hiçbir adım "bitti" sayılmaz.
