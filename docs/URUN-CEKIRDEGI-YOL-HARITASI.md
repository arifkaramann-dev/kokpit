# Ürün Çekirdeği — Tam Analiz ve Yol Haritası

*Tarih: 17.07.2026 · Patron kararı: "Programın ana temeli Ürünler & Türevler olacak;
her şey buradan inşa edilecek, buranın ihtiyaçlarına göre ilerlenecek."*

Bu belge, Ürünler & Türevler modülünü sistemin **tek doğruluk kaynağı** (single
source of truth) yapma planıdır. Yol haritası fazlar halindedir; her faz bir
öncekinin çıktısına dayanır. Güncel durum işaretleri todo.md ile birlikte tutulur.

---

## 1. Vizyon: ürün kartı = şirketin çekirdek verisi

Bir ürün kartı doğru ve dolu olduğunda şunların TAMAMI otomatik beslenmelidir:

| Tüketici modül | Üründen aldığı |
|---|---|
| Pazaryeri (Trendyol/HB/N11) | barkod, SKU, başlık, açıklamalar, görseller, fiyat, stok, desi, kategori, özellikler |
| Fiyat & Kâr | reçete maliyeti, ambalaj/kargo maliyeti, kâr oranı, KDV, kanal kesintileri |
| Üretim | reçete (formulaItems), kritik eşik, üretim önerisi |
| Stok | mamul stok defteri (productMovements), hammadde tüketimi |
| Satış (sipariş/teklif) | kalem eşleşmesi (productId/barkod), fiyat, stok düşümü |
| Etiket & Baskı | etiket yazısı/boyutu, kılavuz, güvenlik, uyarılar |
| AI & Pazarlama | açıklama üretimi, kampanya metinleri, soru-cevap taslakları |
| Raporlama | ürün/seri/kanal bazlı satış ve kârlılık |

**Test cümlesi:** "Bu bilgi ürün kartında var mı? Yoksa neden yok? Varsa neden
başka yerde elle tekrar giriliyor?" — Her yeni özellik bu süzgeçten geçmeli.

---

## 2. Mevcut durum analizi

### 2.1 Güçlü yanlar (korunacak temel)

- **Esnek ana ürün → türev modeli:** `products.parentId` self-referencing; yüzey
  tipi serbest metin. Türev tipi dayatması yok — boya işine tam uyum.
- **Hızlı Türet:** yüzey × ambalaj × renk × set kombinasyonundan 60'a kadar türev;
  başlık/SKU otomatik, set çarpanı fiyat-ambalaj-reçeteye işler, görsel + reçete
  kopyalanır (`products.deriveMany`).
- **Türevlere Uygula (17.07):** ana üründeki alan gruplarını sonradan tüm
  türevlere yayma (`products.propagateToVariants`).
- **Seri kavramı:** `productSeries` kâr oranı/KDV/açıklama şablonu taşır;
  ürün alanı NULL ise seriden gelir (profitMargin/vatRate).
- **Otomatik Doldur + AI ile Yaz:** seri içi en dolu karttan devralma + Claude
  ile içerik üretimi (`products.autofill`, `products.aiFill`).
- **Kâr modeli v2:** kanal profilli, Trendyol resmi hesaplayıcısıyla kuruş kuruş
  aynı; Fiyat & Kâr tablosu, hedef marj çözücü, CSV fiyat güncelleme.
- **Üretim döngüsü:** kuyruk → emir → geri alma; mamul stok defteri; sipariş
  satışı/iadesi stok hareketine işler.
- **Pazaryeri (kısmi):** stok/fiyat push (Trendyol + HB), sipariş senkronunda
  barkod→ürün eşleşmesi, iptal/iade stok iadesi.
- **Görsellerin herkese açık linki:** `/api/img/{id}/{tür}` — pazaryerine görsel
  URL vermenin ön şartı zaten mevcut.
- **Ürün Geliştirme hattı:** devProjects 5 adım → "Ürünleştir" ana ürüne otomatik
  aktarım. Ar-Ge → katalog akışı kurulu.

### 2.2 Zayıf noktalar (temel olacaksa kapatılmalı)

**Kimlik ve veri bütünlüğü**
- Z1. `products.series` serbest metin; `productSeries.id`'ye bağ yok. Yazım farkı
  ("Meteor" / "METEOR") seriyi koparır; seri şablonları devreye girmez.
- Z2. Barkod/SKU **tekillik garantisi yok** (indeks var, unique değil). Çift
  barkod = pazaryeri eşleşme kaosu, yanlış ürüne stok/fiyat gitmesi.
- Z3. Türevin türevi engellenmiyor (UI göstermez ama API izin verir) — hiyerarşi
  bozulabilir.
- Z4. `isActive` 0/1'den ibaret; taslak → satışta → arşiv yaşam döngüsü yok.
  Yarım kart ile satışa hazır kart ayrışmıyor.

**İçerik ve devralma**
- Z5. Devralma anlık kopya: ana ürün güncellenince türevler bayatlar. "Türevlere
  Uygula" bunu elle çözer ama hangi türev hangi alanı bilinçli farklılaştırdı
  ("override") bilgisi tutulmuyor — yayma her şeyin üstüne yazar.
- Z6. Pazaryerinden yapıştırılan HTML içerik kirli (tek tık temizleme eklendi,
  17.07); ama pazaryeri-uyumlu zengin içerik ÜRETİMİ (temiz HTML şablonu) yok.

**Pazaryeri açığı (en büyük stratejik eksik)**
- Z7. Yalnızca stok/fiyat gönderiliyor. **Sıfırdan ürün kartı açma yok**:
  kategori/marka/özellik eşleme, görsel gönderimi, varyant gruplama
  (`productMainId`) hiçbiri yok. Yeni ürün pazaryerine hâlâ elle giriliyor —
  kokpitin vaadiyle çelişen en büyük kırılma.
- Z8. Türevler pazaryerinde ayrı ilanlara dağılır; tek ilan + varyant seçici
  (renk/ambalaj) deneyimi kurulamıyor.
- Z9. N11 + Çiçeksepeti entegrasyonu yok (todo'da açık).

**Satış bağı**
- Z10. `orderItems.productId` / `quoteItems.productId` NULL olabilir; elden
  sipariş/teklif kaleminde katalogdan seçim zorunlu-öncelikli değil. Ürün bazlı
  satış raporu ve stok düşümü eşleşmeyen kalemlerde kör kalır.

**Stok ve operasyon**
- Z11. Stok tek havuz: kanal bazlı ayrım/rezervasyon yok. Onaylanmış ama
  kargolanmamış sipariş stoğu "müsait" görünür → çifte satış riski.
- Z12. Görseller DB'de base64 (MEDIUMTEXT): liste sorgularını şişirir, yedeklemeyi
  ağırlaştırır (KOKPİT V2 Faz 0.3'te S3 göçü zaten planlı).

**Arayüz ölçeklenmesi**
- Z13. Ürünün TÜM hayatı tek diyalogda (30+ alan). Diyalog sabitlendi (17.07) ama
  ürün sayısı/alan sayısı büyüdükçe diyalog modeli tükenecek; tam sayfa ürün
  detayı yok. Reçete, hareketler, kârlılık ayrı sayfalara dağılmış durumda —
  ürünün "tek bakışta" görünümü yok.
- Z14. Liste tüm ürünleri tek sorguda çekip istemcide filtreliyor — birkaç yüz
  üründe sorun değil, binlerce türevde sayfalama/sunucu araması gerekecek.

---

## 3. Yol haritası

Sıralama mantığı: önce **temel sağlamlığı** (kimlik/bütünlük — üzerine inşa
edilecek zemin), sonra **ürünün evi** (tam sayfa detay), sonra **en büyük
stratejik açık** (pazaryeri ürün açma), sonra satış/stok bağları ve AI katmanı.

### FAZ A — Temel sağlamlaştırma (zemin) ✅ TAMAMLANDI (17.07.2026)

- [x] **A1. Barkod & SKU tekilliği:** create/update'te uygulama seviyesi kontrol,
  Hızlı Türet SKU çakışmasında otomatik numaralandırma, mevcut çiftler için
  `duplicateIdentity` raporu + Ürünler sayfasında uyarı bandı. Unique indeks
  migration'ı canlıdaki çiftler temizlendikten sonra atılacak (açık).
- [x] **A2. Seri bağı:** ürüne yazılan seri adı kayıtlı değilse `productSeries`'e
  varsayılanlarla otomatik açılır.
- [x] **A3. Yaşam döngüsü:** `products.status` (taslak/satista/arsiv, migration
  0021 + isActive backfill); push yalnız "satista" gönderir; diyalogda durum
  seçici, listede filtre + rozet.
- [x] **A4. Hiyerarşi koruması:** türevin altına türev engeli (create/update/deriveMany).
- [x] **A5. Sağlık skoru:** `shared/productHealth.ts` (pazaryeri zorunlu alan
  ayrımıyla), liste + detay sayfasında rozet, 8 birim testi.

**Çıktı:** Çift kayıt/kopuk seri riski kapanır; hangi ürünün satışa/pazaryerine
hazır olduğu tek bakışta görünür.

### FAZ B — Ürünün evi: tam sayfa ürün detayı ✅ TAMAMLANDI (17.07.2026)

- [x] **B1. `/urun/:id` sayfası:** kimlik + görsel + sağlık kartı, KPI şeridi
  (fiyat/stok/maliyet/brüt kâr), sekmeler: Türevler · Genel · İçerik & Etiket ·
  Pazaryeri · Reçete (maliyet payı %) · Stok Hareketleri. Listeden ada tıklayınca
  açılır; "Kartı Düzenle" mevcut diyaloğu `?duzenle=ID` ile çağırır.
- [x] **B2. Türev karşılaştırma tablosu:** fiyat/stok/barkod satır içi düzenleme,
  durum seçici, satır başına sağlık skoru.
- [x] **B3 (hafif çözüm). Güvenli yayma:** "Türevlere Uygula"da "dolu alanların
  üzerine yazma" seçeneği — yalnız boş alanlar doldurulur. Alan bazlı kalıcı
  override işaretleri (şema değişikliği) ihtiyaç doğarsa sonraki sprintte.

**Çıktı:** Ürünle ilgili her şey tek adreste; katalog büyüdükçe diyalog darboğazı
biter.

### FAZ C — Pazaryerinde sıfırdan ürün açma (stratejik hedef) · yüksek etki

*Ön şart: A5 sağlık skoru (eksik alanla gönderim engellenir). Görsel: mevcut
`/api/img` linkleri ilk sürüm için yeterli; S3 göçü (KOKPİT V2 0.3) paralel
ilerler, URL şeması korunur.*

- [x] **C1. Trendyol kategori/marka/özellik altyapısı:** Ayarlar → "Trendyol Ürün
  Açma" kartı (marka ID, kargo ID, site adresi, kategori eşlemesi JSON, özellik
  varsayılanları) + keşif araçları (marka arama, kategori özellikleri). *(17.07)*
- [x] **C2. Ürün kartı gönderimi (createProducts):** `server/trendyolProducts.ts`
  — ana ürün + "satista" türevleri ortak `productMainId` ile tek ilan; saf eşleme
  fonksiyonu 8 birim testli; detay sayfasında "Trendyol'da Ürün Aç" + atlanan
  kalemlerin neden listesi + "Sonucu Sorgula" (batch takibi). **Kod hazır —
  CANLIDA (Render) doğrulanacak** (ortam kısıtı). *(17.07)*
- [ ] **C3. Hepsiburada listing paritesi**, sonra **N11 + Çiçeksepeti** iskeletleri.
- [ ] **C4. Çift yönlü eşleşme raporu:** pazaryerindeki mevcut ilanlar ↔ kokpit
  ürünleri; barkodu eşleşmeyen/yetim ilan listesi.

**Çıktı:** "Kokpitte ürünü aç → tüm pazaryerlerinde tek tıkla yayınla" vaadi
gerçek olur. Ürün kartı gerçekten tek doğruluk kaynağına dönüşür.

### FAZ D — Satış & stok döngüsünün ürüne tam bağlanması ✅ (17.07.2026)

- [x] **D1. Kalem = ürün:** datalist seçici + otomatik fiyat + sunucuda
  barkod/ad→productId çözümü zaten vardı; eksik olan görsel geri bildirim
  eklendi — katalogla eşleşmeyen kalem sarı çerçeve + açıklama ile işaretlenir
  (Sipariş + Teklif formları).
- [x] **D2. Stok rezervasyonu — GEREKSİZ (analiz kararı):** stok, sipariş
  oluşturulduğu anda düşer (`replaceOrderItems` → mamul hareket), iptalde geri
  gelir. "Onaylı ama düşmemiş" ara durumu mimaride yok; çifte satış penceresi
  yalnızca 15 dk'lık pazaryeri senkron aralığıdır ve rezervasyonla çözülmez.
  Ayrı rezervasyon katmanı eklemek karmaşıklık katıp değer üretmezdi.
- [x] **D3. Üretim önerisi v2:** hedef stok = max(kritik eşik, son 30 gün satış)
  — öneri stoku hedefe tamamlar; kuyruk satırında "30g satış" göstergesi
  (`report.productSales` ucu).

### FAZ E — İçerik & AI katmanı (E1 ✅, E2-E3 planlı)

- [x] **E1. AI içerik ürün detayında:** Pazaryeri sekmesinde "AI ile Yaz" —
  Claude'un ürettiği açıklamalar/etiket/özellikler DOĞRUDAN karta işlenir
  (diyalogdaki form doldurmadan farkı: kalıcı kayıt). aiFill zaten temiz
  HTML şablonuyla üretiyor (<p>/<ul>/<strong>). *(17.07)*
- [ ] **E2. Görsel üretimi bağlanması:** `_core/imageGeneration.ts` hazır, router
  bağlantısı açık — görsel üretimi kredi tükettiği için patronun kullanım
  tercihi netleşince ürün detayına bağlanacak.
- [ ] **E3. Pazaryeri soru-cevap kuyruğu:** soru çekme API'si canlı erişim
  gerektirir — C2'nin canlı doğrulamasıyla aynı sprintte ele alınacak.

### FAZ G — Excel/CSV toplu içe-dışa aktarma ✅ (17.07.2026, patron talebi)

Rakip panelindeki (Qukasoft) içe/dışa aktarma sisteminin muadili. Yüzlerce
varyantı Excel'de toplu düzenlemek ürün çekirdeğinin temel operasyonu.

- [x] **G1. Tam katalog dışa aktarma (.xlsx):** `shared/productIO.ts` alan kataloğu
  (35+ düzenlenebilir alan) tek kaynak; ID, üst ürün barkodu ve görsel linkleri
  bilgi sütunu. Gerçek `.xlsx` (SheetJS, dinamik import ile ayrı parça); fiyat/
  stok gerçek sayı hücresi (Excel yerele göre biçimler). CSV içe aktarımı da
  desteklenir (parseCatalogCsv + BOM/`;`).
- [x] **G2. Oluştur-veya-güncelle içe aktarma:** eşleştirme sütunu (ID/Barkod/SKU)
  ile eşleşen satır güncellenir, eşleşmeyen (adı olan) satır yeni ürün olur;
  "Üst Ürün Barkodu" ile türev bağlanır. Dosyada olmayan sütun değişmez; boş
  hücre atla/temizle seçeneği (varsayılan atla — veri kazası önlenir).
- [x] **G3. Diff önizleme + hata raporu:** uygulamadan önce yeni/güncelleme/
  değişiklik-yok/hata kırılımı, alan bazlı eski→yeni gösterimi. Sunucu
  `products.bulkImport` planı yeniden doğrular (çift barkod/SKU, üst ürün),
  başarısız satırları rapor eder. TR/EN ondalık, durum alias'ları, batch içi
  çift kimlik yakalama. 20 birim testi (`productIO.test.ts`).
- [x] **G4. Menü + sayfa:** `/urun-aktar` (İçe / Dışa Aktar), sidebar'da Ürün &
  Üretim altında; Ürünler sayfası "İçe / Dışa Aktar" butonu buraya yönlendirir
  (eski tek-yönlü CSV dışa aktarımın yerini aldı).

### FAZ F — Ürün bazlı zekâ ve raporlama (F1 ✅)

- [x] **F1. Ürün Kârlılığı raporu:** Analiz sayfasında yeni tablo — kalem bazlı
  satış (iptal hariç) − reçete maliyeti − ambalaj/kargo → brüt kâr + marj;
  reçetesiz ürünler işaretli; katalogla eşleşmeyen serbest kalem cirosu ayrıca
  raporlanır (`report.productSales`). *(17.07)*
- [ ] **F2. Liste ölçeklenmesi (Z14):** sunucu tarafı arama/sayfalama —
  katalog ~500+ ürüne yaklaşınca devreye alınır, öncesinde gereksiz.

---

## 4. Bağımlılık haritası (özet)

```
A1-A4 (bütünlük) ──► C2 (ürün açma: temiz barkod/seri şart)
A5 (sağlık skoru) ──► C2 (eksik alanla gönderim engeli)
B1 (detay sayfası) ──► E1 (içerik stüdyosunun evi)
B3 (override) ──► "Türevlere Uygula" güvenli otomasyonu
C2 (ürün açma) ──► D2 (müsait stok = eldeki − rezerve, kanala doğru stok)
D1 (kalem=ürün) ──► F1 (ürün bazlı rapor)
S3 göçü (V2 0.3) ──► C2 performans/kalıcılık (paralel; /api/img ilk sürüme yeter)
```

## 5. Takım notu (Takım Geliştirme Protokolü değerlendirmesi)

Mevcut kadro bu haritayı karşılıyor: ürün alanı `urun-uretim-uzmani`, pazaryeri
`pazaryeri-entegratoru`, şema `veritabani-mimari`, akış tasarımı `ux-tasarimci`,
içerik/SEO `buyume-pazarlama-uzmani`. Yeni ajan ihtiyacı ŞU AN yok; Faz C
büyüyüp kategori/özellik eşleme kalıcı bir uzmanlık alanına dönüşürse
"katalog-yoneticisi" ajanı o sprintte değerlendirilecek.

## 6. Çalışma prensipleri

- Her faz sonunda todo.md işaretlenir, bu belge güncellenir.
- Pazaryeri API'sine dokunan her iş yalnızca canlıda (Render) doğrulanır.
- Şemaya dokunan her iş `veritabani-mimari`, para hesabına dokunan her iş
  `finans-muhasebe-uzmani`, yarış durumu içeren her iş `qa-test-uzmani`
  onayından geçer.
- Küçük/güvenli değişiklikte yalnız `pnpm check`; riskli işte tam test + build.
