# Art of Colour — Digital Paint Fingerprint

`art-colour-capture.base44.app` uygulamasının yerel, kaynak kodlu yeniden inşası.
Base44 platformundaki uygulamanın kaynağı dışarıya açık olmadığı için sayfa yapısı,
tasarım dili ve boya kataloğu canlı uygulamadan çıkarıldı; renk bilimi, eşleştirme
motoru ve render katmanı burada sıfırdan yazıldı.

## Çalıştırma

```bash
npm install
```

```bash
npm run dev
```

Uygulama <http://localhost:5173> adresinde açılır.

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (hot reload) |
| `npm run build` | `dist/` altına production derlemesi |
| `npm run preview` | Derlenmiş çıktıyı yerelde sunar |
| `npm test` | Renk bilimi + motor testleri |

## Sayfalar

| Yol | Sayfa |
| --- | --- |
| `/` | Genel Bakış — seriler ve son eklenen parmak izleri |
| `/tara` | Renk Tara — fotoğraftan örnekleme ve ΔE2000 eşleştirme |
| `/kutuphane` | Boya Kütüphanesi — seri filtreli katalog |
| `/boya/:id` | Parmak izi detayı — Lab/XYZ, çok açılı davranış, kaplama değerleri |
| `/stl` | STL Boyama — three.js PBR önizleme, 360° döndürme |
| `/fotograf` | Fotoğraf Boyama — karıştırma modlu kaplama, PNG dışa aktarma |

## Mimari

```
src/
├─ lib/
│  ├─ color.js      sRGB ↔ XYZ ↔ CIELAB dönüşümleri, CIEDE2000
│  ├─ match.js      ΔE2000 ile en yakın boya sıralaması
│  ├─ sampling.js   fotoğraf örnekleme, çok açılı profil çıkarımı
│  ├─ pbr.js        parmak izi → MeshPhysicalMaterial eşlemesi
│  ├─ series.js     seri tanımları ve render varsayılanları
│  └─ store.js      yerel veri katmanı (katalog + localStorage)
├─ components/      Layout, PaintSwatch, PaintPicker, PaintViewer3D
├─ pages/           yukarıdaki rotalar
└─ data/paints.json 25 boyalık Digital Paint Fingerprint kataloğu
```

### Renk bilimi

Tüm hesaplar D65 / 2° gözlemci altında yapılır. `deltaE2000`, Sharma, Wu & Dalal (2005)
referans veri kümesindeki **34 test vakasının tamamını** 1e-4 toleransla geçer
(`npm test`). Eşleştirme, kataloğun **face** (en parlak açı) rengi üzerinden yapılır —
flop tarafında metalik pulcuk yönelimi büyük sapma yarattığı için.

### Örnekleme

`smartAverage` L\* dağılımının uç %12'sini atarak gölge ve specular parlamayı eler,
kalan pikselleri kroma ağırlıklı ortalar. `extractAngleProfile` parlaklık yüzdeliklerine
göre face → flop geçişini beş banda böler; `estimateFinish` bu geçişten metalik, pearl,
pulcuk ve parlaklık değerlerini tahmin eder.

## Veri

Katalog `src/data/paints.json` içinde sabittir. Kullanıcının taradığı parmak izleri
tarayıcının `localStorage`'ında (`aoc.fingerprints.v1` anahtarı) tutulur — sunucu
gerekmez. Veri katmanının tamamı `src/lib/store.js` arkasındadır; kalıcı bir API'ye
geçmek istenirse yalnızca o dosya değişir.

## Canlı uygulamadan farklar

- **Backend yok.** Base44 entity API'si yerine yerel JSON + `localStorage` kullanılır;
  taramalar tarayıcıda kalır, cihazlar arasında paylaşılmaz.
- **Kimlik doğrulama yok.** Canlı uygulamadaki kullanıcı hesabı katmanı yeniden
  üretilmedi.
- Katalogdaki 25 boya canlı uygulamanın herkese açık veri setinden alındı; oradaki
  kullanıcı taramaları (`TARA-*`) dahil edilmedi.
