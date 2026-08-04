# Rakip Taraması — Eksikler ve Fırsatlar

*Tarih: 04.08.2026 · Kapsam: TR ön muhasebe/ERP · pazaryeri entegratörleri ·
üretim/MRP · **boya sektörüne özel yazılımlar** (izleme listesinde ilk kez)*

> **Bu belge tarihsizdir.** Sıralama ve takvim bilerek yok — önce "gerçekte ne
> eksik ve hangisi önemli" sorusunu netleştirir. Öncelik sırası birlikte
> yapılacak.
>
> **Bağlam kararı:** Kokpit **satılacak bir ürün değil, kendi işletmenin
> aracı**. Bu, aşağıdaki her değerlendirmeyi değiştirir: ölçüt "rakiple parite"
> değil, **"bu bana para mı kazandırıyor, zaman mı kurtarıyor, hata mı
> azaltıyor"**. Rakipte olup bizde olmayan pek çok şey bu ölçütten geçemez ve
> bilerek yapılmamalıdır (bkz. §6).
>
> **Kaynak notu:** Bulgular satıcı pazarlama sayfaları ve web aramasıyla
> derlendi (04.08.2026). Satıcı iddiaları doğrulanmış gerçek değildir; TR
> siteleri bot erişimini kısmen engelliyor. Mevcut derin analiz
> `RAKIP-ANALIZI-BIZIMHESAP-QUKASOFT.md` (18.07.2026) burada tekrar edilmedi —
> bu belge onun **üstüne** koyar.
>
> ## ⚠ DÜZELTME (04.08.2026, aynı gün)
>
> Bu belge yalnız rakiplere bakıp **kendi kodumuza bakmadan** yazıldı ve üç
> maddesi yanlış çıktı. Kod incelemesi
> (`KOKPIT-DURUM-VE-YOL-HARITASI.md`) şunları gösterdi:
>
> - **"N11/Çiçeksepeti yok"** → `products.pushToN11` ve `pushToCiceksepeti`
>   yazılmış; ölü ürün modeline bağlı oldukları için görünmüyorlar.
> - **"Tahsilat linki yok"** → PayTR sanal POS hazır (`server/paytr.ts`, env
>   anahtarları, iframe token ucu). Yalnız mağaza sayfasındaki son adım
>   bağlanmamış.
> - **"Kârlılık raporu yok"** → `report.productSales` var, Analiz sayfasından
>   koparılmış (yetim uç nokta).
>
> Yani bazı "eksikler" eksik değil, **bağlantısı kopuk**. Aşağıdaki tabloları
> okurken bunu hesaba katın; öncelik sıralaması için
> `KOKPIT-DURUM-VE-YOL-HARITASI.md` esas alınmalıdır.

---

## 0. Tek cümlelik sonuç

En büyük üç açık şunlar ve üçü de "para kazandır" başlığında:

1. **Bir satıştan cebe kalanı bilmiyoruz.** Komisyon, kargo, iade maliyeti
   düşülmüş net kâr hesabı yok — zarara satılan ürün fark edilmez.
2. **Renk kodundan ürüne giden yol yok.** Müşteri "renk kodu ile arar"
   (kendi bilgi tabanımızın tespiti) ama sistemde renk kodu → ürün araması
   yok. Sektörün tamamı bu iş üzerine kurulu.
3. **Tahsilat sürtünmesi.** WhatsApp'la satış yapılıyor ama ödeme linki yok;
   havale takibi elle.

Geri kalan her şey bu üçünden sonra gelir.

---

## 1. Ürün / katalog bakımı  *(belirtilen 1. acı)*

Kıyas: PIM araçları (Akeneo, inriver, Plytix sınıfı) + pazaryeri entegratörleri.

| Eksik | Rakipte ne var | Bizdeki durum | Neden önemli |
|---|---|---|---|
| **Kanal bazlı içerik skoru** | PIM'ler her SKU'yu **kanal başına 0-100** puanlar; ilan yayına çıkmadan önce eksik alanı gösterir | 🟡 `masterHealth` 9 genel kontrol yapıyor ama kanal şartlarına bakmıyor | Trendyol'un zorunlu özelliği ile HB'ninki farklı. Genel skor "%67 tamam" der ama o üründen Trendyol'a ilan açılamıyordur |
| **Rehberli toplu doldurma** | Eksik alanları süzüp toplu doldurma ekranı | 🟡 Excel gidiş-dönüş var (yeni), uygulama içi toplu düzenleme yok | Excel iyi ama 5 ürünün fiyatını değiştirmek için dosya indirmek ağır |
| **Kanal başına görsel seti** | Pazaryeri başına görsel sayısı/sırası/ölçü doğrulaması | 🟡 master görselleri var, kanal bazlı set ve doğrulama yok | Pazaryeri reddi çoğu zaman görselden döner |
| **İçerik kalitesi → iade ilişkisi** | Kalite skorunu iade oranıyla eşleyip kötü açıklamayı bulma | ⬜ | İade, kârı yiyen sessiz gider |
| **Özellik (attribute) kapsamı** | Kategori zorunlu özellik doluluk raporu | ✅ `attributeCoverage` + `channelAttributes` var | — |
| **AI içerik üretimi** | Açıklama/başlık üretimi | ✅ `contentAi` var | — |

**Değerlendirme:** Bu başlıkta temel iyi. Gerçek açık **kanal bazlı** olan
tarafta: sağlık kontrolü ürünü "hazır" sayıyor ama pazaryerinin istediği alan
eksik olabiliyor. En yüksek getirili tek iş: `masterHealth`'i kanal
gereksinimlerine bağlamak — zaten `channelAttributes` verisi duruyor.

---

## 2. Pazaryeri ve sipariş akışı  *(belirtilen 2. acı)*

Kıyas: Qukasoft, Sentos, Entegra.

| Eksik | Rakipte ne var | Bizdeki durum | Neden önemli |
|---|---|---|---|
| **Komisyon bazlı net kâr** | Alış maliyeti + kargo + iade masrafı + pazaryeri komisyonu düşülüp **satış başına gerçek net kâr** | ⬜ maliyet ve fiyat var, kesintiler yok | **En kritik açık.** Trendyol komisyonu %10-20 bandında; kargo + iade eklenince kâr sandığınız ürün zarar olabilir. Bunu görmeden fiyat kararı vermek körlemesine |
| **Kargo entegrasyonu** | ~25 kargo (Yurtiçi, Aras, MNG, Sürat, Sendeo, hepsiJET, PTT, UPS), toplu etiket/barkod | 🟡 yalnız Trendyol ortak etiket (ZPL→PDF) | Elden/web satışta her gönderi için kargo paneline geçiliyor. Günlük tekrar eden zaman kaybı |
| **İade yönetimi** | İptal/iade otomatik yakalanır, stok geri yüklenir, gelir düzeltmesi muhasebeleşir | ⬜ | İade elle takip ediliyorsa hem stok hem kâr yanlış |
| **N11 / Çiçeksepeti** | Var | ⬜ (planlı) | Kanal genişlemesi — ama ancak yukarıdakiler bittikten sonra anlamlı |
| **Tek kuyrukta sipariş** | Tüm kanal siparişi tek ekran | ✅ Trendyol/HB çekiliyor | — |
| **Stok/fiyat tek noktadan senkron** | Var | ✅ 15 dk oto-senkron | — |

**Değerlendirme:** Kanal *sayısını* artırmak değil, mevcut kanalın *ekonomisini*
görmek öncelikli. Net kâr hesabı olmadan yeni pazaryeri açmak zararı büyütür.

---

## 3. Muhasebe, fatura, tahsilat  *(belirtilen 3. acı)*

Kıyas: Paraşüt, Bizimhesap.

| Eksik | Rakipte ne var | Bizdeki durum | Neden önemli |
|---|---|---|---|
| **e-Fatura / e-Arşiv** | GİB standardında kesme, saklama | ⬜ (proforma var) | Ciro eşiği aşılınca **yasal zorunluluk**. Bu bir "özellik" değil, uyum meselesi |
| **Tahsilat linki** | Müşteriye kredi kartı ödeme linki (taksitli/peşin) | ⬜ | WhatsApp'la satış yapan biri için doğrudan para: link at, tahsil et. Havale bekleme ve takip yükü biter |
| **Banka entegrasyonu** | Hesap hareketleri otomatik iner, cariyle eşlenir, açık fatura otomatik kapanır | 🟡 `reconcile` modülü var, otomatik akış yok | Elle mutabakat aylık saatler yiyor |
| **Otomatik KDV/mutabakat** | Dönemsel özet | 🟡 KDV raporu var | — |
| **Cari, kasa, çek/senet** | Var | ✅ | — |

**Değerlendirme:** e-Fatura yasal zorunluluk olduğu için diğerlerinden farklı
bir kategoride — "isteyince yapılır" değil, "eşiğe gelmeden hazır olunur".
Tahsilat linki ise en hızlı geri dönen kalem: küçük iş, doğrudan nakit etkisi.

---

## 4. Üretim ve reçete  *(acı listesinde seçilmedi — ikinci kuşak)*

Kıyas: BatchMaster, Deacom, Mar-Kov (boya/kimya ERP) · Katana, MRPeasy (küçük üretici MRP).

| Eksik | Rakipte ne var | Bizdeki durum | Neden önemli |
|---|---|---|---|
| **Parti/lot izlenebilirliği** | Hangi hammadde partisi hangi mamul partisine girdi — ileri/geri izleme | ⬜ | Müşteri "bu şişe öncekinden farklı" dediğinde cevap verebilmenin tek yolu |
| **İşçilik + genel gider** | Parti maliyetine işçilik ve sarf dahil | ⬜ yalnız hammadde | Maliyet olduğundan düşük görünüyor → kâr olduğundan yüksek. Fiyatlama bunun üstüne kuruluysa sistematik hata |
| **Fire / verim sapması** | Planlanan vs gerçekleşen | ⬜ | Fire görünmezse maliyet hep iyimser |
| **Reçete versiyonlama** | Formül sürüm geçmişi | ⬜ | "Geçen ayki reçete neydi" sorusunun cevabı yok |
| **Raf ömrü / SKT** | Parti bazlı son kullanma | ⬜ | Boyada gerçek bir kısıt |
| **GBF / SDS (Güvenlik Bilgi Formu)** | SDS/TDS/CoA üretimi ve saklama | ⬜ | TR'de kimyasal ürün satışında yasal gereklilik olabilir — **doğrulanmalı** |
| **Reçete → maliyet → üretim düşümü** | Var | ✅ | — |

**Değerlendirme:** Bu başlığı acı listesine koymadınız ama **"işçilik + genel
gider yok"** maddesi sessizce §2'deki net kâr sorununu büyütüyor: hem maliyet
eksik hesaplanıyor hem kesintiler düşülmüyor. İkisi birleşince gerçek kâr
tamamen bilinmiyor demektir.

---

## 5. Boya sektörüne özel — en büyük farklılaşma fırsatı

**İzleme listenizde bu kategori hiç yoktu.** Oysa asıl kaldıraç burada.

### 5.1 Renk kodu → ürün araması *(en yüksek getirili tek fikir)*

Sektörün büyükleri (PPG *Paint Manager XI*, Sherwin-Williams *FormulaExpress* /
*Collision Core Color*) işlerini **renk erişimi** üzerine kurmuş: usta OEM renk
kodunu girer, sistem doğru formülü/ürünü verir. Bağımsız veritabanları (9.800+
OEM renk kodu, marka/model/yıl kırılımı, hex karşılığı) ayrı bir ürün kategorisi.

**Bizdeki durum:** `colorCode` yalnız ürün geliştirme projelerinde bir metin
alanı. Web mağazada **renk kodu araması yok.**

**Neden önemli:** Kendi bilgi tabanımız diyor ki müşteri profili "oto rötuş
yapan ustalar ve son kullanıcılar — **renk kodu ile arama yaparlar**". Yani
müşterinin aradığı anahtar elimizde ama arama kutusu yok. Bu bir ERP eksiği
değil, **doğrudan satış kaybı**.

**Somut hâli:** müşteri `Renault TED` ya da `Ford Frozen White` yazar → eşleşen
ürün + hex önizleme + "bu renk şu ambalajlarda var" çıkar. Elimizdeki renk
sözlüğü (`colors` tablosu, hex dahil) bunun yarısı zaten.

### 5.2 Renk varyantı kavramı

Aynı OEM kodunun birden çok varyantı olur (üretim yılı/fabrika farkı). Refinish
sistemleri varyantı ayrı tutar. Bizde renk tek katman — varyant yok. Şikâyet ve
iade sebebi olabilir.

### 5.3 Partiler arası renk tutarlılığı

Boya ERP'lerinin ayrı başlığı: aynı rengin partiler arası sapması. §4'teki lot
izlenebilirliğine bağlı. Butik ölçekte bile "bu parti öncekinden koyu" şikâyeti
gerçek.

---

## 6. Bilerek YAPILMAYACAKLAR

Kokpit satılacak ürün olmadığı için rakipteki şu başlıklar kapsam dışı
sayılmalı. Bunlar "eksik" değil, **doğru kararlar**:

| Rakipte var | Neden bize gerekmez |
|---|---|
| Çoklu depo / şube | Tek depo, tek kişi |
| Çok kullanıcı, rol/yetki matrisi | Tek kullanıcılı sistem |
| 20+ pazaryeri entegrasyonu | Kanal başına bakım maliyeti var; 2-4 kanal yeter |
| WMS, toplama rotası, el terminali | Ölçek yok |
| Tam QMS / CAPA / denetim izi | Kurumsal uyum gereği yok |
| Çok kiracılık, onboarding, faturalama | Ürünleştirme kararı verilmedi |
| Dış muhasebe programına aktarım (37 entegrasyon) | Muhasebe zaten içeride |

---

## 7. Eksiklerin tek tabloda özeti

Etki: 💰 para · ⏱ zaman · 🛡 hata/risk. Büyüklük: S/M/L.

| # | Eksik | Alan | Etki | Büyüklük |
|---|---|---|---|---|
| 1 | Komisyon+kargo+iade düşülmüş net kâr | Pazaryeri | 💰💰💰 | M |
| 2 | Renk kodu → ürün araması | Boya/satış | 💰💰💰 | M |
| 3 | Tahsilat linki | Finans | 💰💰 ⏱ | S |
| 4 | İade yönetimi (stok + gelir düzeltme) | Pazaryeri | 💰 🛡 | M |
| 5 | Kanal bazlı içerik/uygunluk skoru | Katalog | ⏱⏱ 🛡 | S–M |
| 6 | Kargo entegrasyonu (etiket) | Pazaryeri | ⏱⏱ | M |
| 7 | İşçilik + genel gider → parti maliyeti | Üretim | 💰 🛡 | S |
| 8 | e-Fatura / e-Arşiv | Finans | 🛡🛡🛡 (yasal) | L |
| 9 | Banka hareketi otomatik eşleme | Finans | ⏱⏱ | M |
| 10 | Parti/lot izlenebilirliği | Üretim | 🛡 | M |
| 11 | Uygulama içi toplu düzenleme | Katalog | ⏱ | S |
| 12 | Kanal başına görsel seti/doğrulama | Katalog | 🛡 | S |
| 13 | Reçete versiyonlama | Üretim | 🛡 | S |
| 14 | Renk varyantı | Boya | 🛡 | M |
| 15 | Raf ömrü / SKT | Üretim | 🛡 | S |
| 16 | GBF/SDS üretimi | Uyum | 🛡 (**doğrulanmalı**) | M |
| 17 | N11 / Çiçeksepeti | Pazaryeri | 💰 | L |

---

## 8. Doğrulanması gerekenler

Bu belge araştırmaya dayanıyor; şu üçü **işin sahibinden** teyit ister:

1. **e-Fatura eşiği.** Cirо/mükellefiyet durumunuz zorunluluk sınırına ne
   kadar yakın? Cevap, 8. maddenin aciliyetini tamamen değiştirir.
2. **GBF/SDS yükümlülüğü.** Ürettiğiniz boyalar için Güvenlik Bilgi Formu
   yasal olarak gerekli mi? Gerekliyse bu bir "fırsat" değil, açık risk.
3. **Trendyol/HB komisyon oranlarınız.** Net kâr hesabı için gerçek oranlar
   lazım; kategori bazlı değişiyor.

---

## 9. Sonraki adım

Sıralama bilerek yapılmadı. Önerim: §7 tablosundan **1, 2, 3** ile başlamak —
üçü de doğrudan paraya dokunuyor, üçü de S/M büyüklükte ve birbirinden bağımsız.
Ama karar sizin; tablo üzerinden birlikte seçelim.

## Kaynaklar

- [BatchMaster — Paints & Coatings ERP](https://www.batchmaster.com/erp-for-paints-coatings-manufacturing/)
- [Deacom/ECI — ERP for Paint and Coatings](https://www.ecisolutions.com/industries/manufacturing/erp-software-for-paint-and-coatings-manufacturers/)
- [Mar-Kov — Paint Manufacturing Software](https://mar-kov.com/paint-manufacturing-software/)
- [ERP Cloud Blog — Color Consistency with ERP](https://erpsoftwareblog.com/cloud/2026/07/how-paint-manufacturers-can-manage-color-consistency-with-erp/)
- [Katana vs MRPeasy karşılaştırması](https://craftybase.com/compare/katana-vs-mrpeasy)
- [MRP sistemleri 2026](https://work-management.org/worksite/best-mrp-systems/)
- [PPG — Identify Color Formula](https://www.ppg.com/en-US/refinish/support/standard-operating-procedures/pd-0631-identify-color-formula)
- [Sherwin-Williams — Color Retrieval Systems](https://industrial.sherwin-williams.com/na/us/en/automotive/color/color-retrieval-systems.html)
- [Automotive Paint Colour Codes veritabanı](https://www.paintcalculators.com/colour-codes/automotive-paint/)
- [Sentos — Pazaryeri Entegrasyonu](https://www.sentos.com.tr/pazaryeri-entegrasyonu/)
- [Sentos — Kargo Entegrasyonu](https://www.sentos.com.tr/birgunde-kargo-entegrasyonu/)
- [Paraşüt — Banka Entegrasyonu](https://www.parasut.com/banka-entegrasyonu)
- [Paraşüt — Ön muhasebe özellikleri](https://www.parasut.com/kullanim-kilavuzu/parasut-on-muhasebe-programi-ozellikleri)
- [MSDS/TDS/CoA rehberi](https://www.globalformulation.com/msds-tds-coa-guide/)
- [PIM yazılımları 2026](https://learn.g2.com/best-pim-software)
- [inriver — PIM trendleri 2026](https://www.inriver.com/resources/pim-trends-2026/)
