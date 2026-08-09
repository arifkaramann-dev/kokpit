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
| `colorLibrary`, `masterStore`, `assetStore`, `packagingStore` | tRPC + `colors` / `masterImages` | ⏳ sırada |
| `AiStudio`, `Templates`, `Packaging`, `Library`, `PaintDetail` sayfaları | `client/src/pages/` | ⏳ sırada |

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

## Uygulama planı

1. ✅ **Renk motoru** → `shared/color/` (TypeScript, 75 test)
2. ✅ **`recolor`** → ölü koddan çıktı, `shared/color/recolor.ts` (9 test).
   Bağımlılığı olmadığı için şemadan önce alındı; hattın belirleyici parçası
   ve tek başına doğrulanabiliyor.
3. ⏳ **Şema** → `colors` tablosuna Lab sütunları
4. ⏳ **tRPC** → renk kütüphanesi ve master görsel router'ları; localStorage /
   IndexedDB depolarının yerine
5. ⏳ **Sayfalar** → AiStudio, Templates, Packaging, Library, PaintDetail
6. ⏳ **Bağlantı** → üretilen görsel `masterImages` / `listingImages` üzerinden
   pazaryeri kartına

Sıra tesadüfi değil: her adım bir öncekine dayanıyor ve her adım tek başına
doğrulanabilir. Zincirin ucu (6) çalışana kadar hiçbir adım "bitti" sayılmaz.
