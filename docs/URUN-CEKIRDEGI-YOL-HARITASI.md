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

### FAZ A — Temel sağlamlaştırma (zemin) · düşük risk, hızlı

- [ ] **A1. Barkod & SKU tekilliği:** kayıt/güncellemede uygulama seviyesi
  kontrol + anlaşılır hata; mevcut çiftleri raporlayan tek seferlik kontrol
  ekranı; ardından unique indeks migration'ı. *(veritabani-mimari +
  backend-gelistirici)*
- [ ] **A2. Seri bağının sağlamlaşması:** ürün kaydında seri adı
  `productSeries`'te yoksa otomatik oluştur; ad değişikliğinde ürünlere yansıt.
  (FK'ye tam geçiş sonra; önce davranış birliği.) *(veritabani-mimari)*
- [ ] **A3. Ürün yaşam döngüsü:** `taslak / satista / arsiv` durumu
  (isActive → status genişletmesi, migration). Liste filtreleri + pazaryeri
  push'un yalnız "satista" ürünleri göndermesi. *(backend + frontend)*
- [ ] **A4. Türev hiyerarşi koruması:** API'de türevin türevi engeli (parentId'li
  ürüne parentId verilemez). *(backend, küçük iş)*
- [ ] **A5. Ürün sağlık skoru:** pazaryerine hazırlık yüzdesi — barkod, görsel,
  açıklamalar, kategori, desi, fiyat, reçete dolu mu? Listede rozet + eksik alan
  listesi. Faz C'nin (ürün açma) ön doğrulayıcısı. *(backend + frontend)*

**Çıktı:** Çift kayıt/kopuk seri riski kapanır; hangi ürünün satışa/pazaryerine
hazır olduğu tek bakışta görünür.

### FAZ B — Ürünün evi: tam sayfa ürün detayı · orta çaba

- [ ] **B1. `/urun/:id` sayfası:** sol tarafta kimlik + görseller + sağlık skoru;
  sekmeler: Temel · İçerik · Pazaryeri · Maliyet & Fiyat (kanal kârlılığı kartı)
  · Reçete (formül özeti + maliyet payı) · Stok (hareket defteri) · Türevler
  (ana üründeyse). Diyalog yalnız hızlı oluşturma/hızlı düzeltme için kalır.
  *(ux-tasarimci akışı çizer → frontend-gelistirici uygular)*
- [ ] **B2. Türev karşılaştırma tablosu:** ana ürün detayında türevleri satır
  satır fiyat/stok/barkod/sağlık ile gösteren düzenlenebilir tablo (satır içi
  düzenleme, Fiyat & Kâr sayfası deseninden). Toplu barkod girişini hızlandırır.
- [ ] **B3. Override işaretleri (Z5):** türevde ana üründen bilinçli
  farklılaştırılan alanların işaretlenmesi; "Türevlere Uygula" override'lı
  alanların üzerine yazmadan yayar. *(veritabani-mimari şema kararı ile)*

**Çıktı:** Ürünle ilgili her şey tek adreste; katalog büyüdükçe diyalog darboğazı
biter.

### FAZ C — Pazaryerinde sıfırdan ürün açma (stratejik hedef) · yüksek etki

*Ön şart: A5 sağlık skoru (eksik alanla gönderim engellenir). Görsel: mevcut
`/api/img` linkleri ilk sürüm için yeterli; S3 göçü (KOKPİT V2 0.3) paralel
ilerler, URL şeması korunur.*

- [ ] **C1. Trendyol kategori/marka/özellik altyapısı:** kategori ağacı +
  zorunlu özellik listesi çekme; üründeki kategori/özellik alanlarını Trendyol
  attribute'larına eşleyen eşleme tablosu (settings ya da yeni tablo).
  *(pazaryeri-entegratoru)*
- [ ] **C2. Ürün kartı gönderimi (createProducts):** ana ürünün türevleri ortak
  `productMainId` ile TEK ilan + varyant seçici olarak gönderilir. Batch takibi
  (`batchRequestId`) + ürün satırında durum/hata rozeti. Canlıda (Render) test —
  geliştirme ortamı pazaryerine çıkamaz.
- [ ] **C3. Hepsiburada listing paritesi**, sonra **N11 + Çiçeksepeti** iskeletleri.
- [ ] **C4. Çift yönlü eşleşme raporu:** pazaryerindeki mevcut ilanlar ↔ kokpit
  ürünleri; barkodu eşleşmeyen/yetim ilan listesi.

**Çıktı:** "Kokpitte ürünü aç → tüm pazaryerlerinde tek tıkla yayınla" vaadi
gerçek olur. Ürün kartı gerçekten tek doğruluk kaynağına dönüşür.

### FAZ D — Satış & stok döngüsünün ürüne tam bağlanması

- [ ] **D1. Kalem = ürün:** sipariş/teklif kaleminde katalogdan seçim öncelikli
  (arama + barkod okutma); serbest kalem istisna olarak kalır ve raporda
  "eşleşmedi" görünür. *(backend + frontend)*
- [ ] **D2. Stok rezervasyonu:** onaylı ama kargolanmamış siparişler "rezerve"
  düşer; pazaryerine giden müsait stok = eldeki − rezerve. Çifte satışı bitirir.
  *(qa-test-uzmani zorunlu durak — yarış durumu riski)*
- [ ] **D3. Üretim önerisi v2:** 30 günlük satış hızı + rezerve + kritik eşikten
  önerilen üretim adedi (mevcut kuyruğun akıllanması). *(urun-uretim-uzmani)*

### FAZ E — İçerik & AI katmanı

- [ ] **E1. AI içerik stüdyosu ürün detayında:** başlık/açıklama/SEO tek panelde,
  pazaryeri-uyumlu TEMİZ HTML şablonuyla üretim (Z6'nın kalıcı çözümü); üretilen
  metin doğrudan karta işlenir + türevlere yayılabilir.
- [ ] **E2. Görsel üretimi bağlanması:** `_core/imageGeneration.ts` hazır, router
  bağlantısı açık iş — mockup/kapak üretimi ürün detayından.
- [ ] **E3. Pazaryeri soru-cevap kuyruğu:** gelen soruya ürün kartındaki
  kılavuz/açıklamadan AI cevap taslağı (Faz 1 açık maddesiyle birleşir).

### FAZ F — Ürün bazlı zekâ ve raporlama

- [ ] **F1. Ürün/seri kârlılık raporu:** `orderItems.productId` üzerinden en çok
  satan türev, seri performansı, kanal × ürün kârlılığı (D1'e bağımlı — eşleşme
  oranı yükselmeden rapor kör).
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
