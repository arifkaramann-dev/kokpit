# Rakip Analizi: Bizimhesap & Qukasoft → Kokpit Parite Planı

*Tarih: 18.07.2026 · CTO analizi · Kaynak: bizimhesap.com, qukasoft.com özellik
sayfaları + web araması (18.07.2026). Siteler bot erişimini kısmen engellediğinden
özellikler arama sonuçları + bilgi tabanıyla teyit edildi.*

> **Bağlam:** CLAUDE.md bu iki rakibi açıkça işaret ediyor. İkisi iki farklı cepheyi
> temsil ediyor:
> - **Bizimhesap** = ön muhasebe / finans / e-belge cephesi (rakip: bizim Finans modülleri)
> - **Qukasoft** = pazaryeri + web mağaza / e-ticaret altyapısı cephesi (rakip: bizim
>   Pazaryeri + ürün + gelecekteki storefront)
>
> Bu belge ikisini A'dan Z'ye çıkarır, Kokpit karşılığıyla eşler, parite açıklarını
> sınıflandırır ve **"kendi web mağazamızı yapmalı mıyız?"** sorusunu net yanıtlar.
> Odoo analiziyle (`ODOO-UYARLAMA-PLANI.md`) birlikte üçlü rekabet resmini tamamlar.

**Durum kodları:** ✅ var · 🟡 kısmi · ⬜ yok · ⛔ kapsam dışı

---

## 1. BİZİMHESAP (ön muhasebe cephesi) — A'dan Z'ye

### 1.1 Özellik → Kokpit eşleme
| Bizimhesap özelliği | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **e-Fatura** | GİB e-fatura kesme/saklama | ⬜ (sadece proforma/bilgi faturası) | finans-muhasebe-uzmani |
| **e-Arşiv** | Nihai tüketiciye e-arşiv fatura | ⬜ | finans-muhasebe-uzmani |
| **e-İrsaliye** | Elektronik sevk irsaliyesi | ⬜ | finans-muhasebe-uzmani |
| **e-SMM** | Serbest meslek makbuzu | ⛔ (bizde uygulanmaz) | — |
| **e-İhracat faturası** | Yurtdışı satış e-belge | ⬜ (ihracat varsa) | finans-muhasebe-uzmani |
| **Cari hesap takibi** | Müşteri/tedarikçi ekstre, bakiye, otomatik hatırlatma | ✅ Cari Hesaplar + tahsilat takipçisi | finans-muhasebe-uzmani |
| **Stok yönetimi + varyant** | Ürün varyant bazlı stok | ✅ ana ürün × türev + mamul stok defteri | urun-uretim-uzmani |
| **Depo yönetimi (çoklu depo)** | Şube/kişi/araç bazlı depo | ⬜ **tek depo** | veritabani-mimari |
| **Ürün reçetesi** | Reçeteyle maliyet/stok/satış | ✅ formül defteri + üretim düşümü | urun-uretim-uzmani |
| **Üretim takibi** | Hammadde+sarf+işçilik maliyet, ürün bazlı | 🟡 hammadde maliyeti var; **işçilik/sarf gideri yok** | urun-uretim-uzmani |
| **Sipariş takibi** | Sipariş → stok → satış | ✅ Siparişler + kalem + stok düşümü | backend-gelistirici |
| **Teklif yönetimi** | Hızlı teklif gönderimi | ✅ Teklifler + yazdır + WhatsApp + dönüştürme | backend-gelistirici |
| **Gelir-gider / kasa / banka** | Nakit giriş-çıkış, hesap hareketi | ✅ Giderler + Kasa/Banka + transferler | finans-muhasebe-uzmani |
| **Banka entegrasyonu (kredi/ekstre)** | Banka API ile otomatik hareket/kredi takibi | ⬜ (elle giriş) | devops + finans |
| **Çek/senet** | Portföy, vade, durum | ✅ Çek & Senet | finans-muhasebe-uzmani |
| **KDV / mutabakat raporları** | KDV özeti, mutabakat | 🟡 KDV raporu var; otomatik mutabakat yok | finans-muhasebe-uzmani |
| **e-Ticaret entegrasyonu** | 23 pazaryeri + kargo (fatura yönü) | 🟡 Trendyol/HB var (bkz. Qukasoft tablosu) | pazaryeri-entegratoru |
| **Barkod** | Sipariş/ürün barkod | ✅ barkod alanı + etiket baskısı | frontend-gelistirici |
| **Mobil + bulut** | Mobil uygulama | ✅ PWA (kurulabilir) | frontend-gelistirici |
| **Raporlama** | Ön muhasebe/finans raporları | ✅ Kokpit + Analiz + Strateji | buyume-pazarlama-uzmani |

### 1.2 Bizimhesap karşısında Kokpit'in durumu
Kokpit ön muhasebenin **~%75'ini** karşılıyor ve boya işine özel (reçete, üretim,
pazaryeri kâr modeli). **Tek gerçek açık: e-belge ailesi (e-Fatura/e-Arşiv/e-İrsaliye)
ve çoklu depo.** Bizimhesap'ın avantajı olgun e-belge altyapısı ve 23 pazaryeri
fatura entegrasyonu; dezavantajı jenerik olması (boyaya özel türetme/kâr modeli yok).

---

## 2. QUKASOFT (pazaryeri + web mağaza cephesi) — A'dan Z'ye

### 2.1 Özellik → Kokpit eşleme
| Qukasoft özelliği | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Pazaryeri entegrasyonları** | Trendyol, HB, N11, Amazon TR, Çiçeksepeti, Epttavm, LCW, Modanisa, Farmazon, Pazarama — ayrı mağaza, ayrı gönderim | 🟡 **Trendyol + HB var**; diğerleri yok | pazaryeri-entegratoru |
| **Stok/fiyat senkron (tek nokta)** | Tüm kanallara tek panelden stok/fiyat | ✅ Trendyol/HB push + 15dk oto-senkron | pazaryeri-entegratoru |
| **Sipariş yönetimi (tek nokta)** | Tüm pazaryeri siparişi tek kuyruk | 🟡 Trendyol/HB siparişi çekiliyor | pazaryeri-entegratoru |
| **Ürün yönetimi (toplu/varyant)** | Toplu ürün ekle/düzenle, varyant | ✅ ana×türev + hızlı türet + Türevlere Uygula | urun-uretim-uzmani |
| **Excel/XML içe-dışa aktarım** | Toplu ürün Excel/XML | ✅ **.xlsx içe/dışa (Faz G)** + eşleştirmeli import | frontend-gelistirici |
| **Sıfırdan ürün kartı açma** | Pazaryerinde yeni ilan (kategori/özellik/görsel) | 🟡 **Trendyol ürün açma (Faz C)** — canlı test bekler | pazaryeri-entegratoru |
| **Kargo entegrasyonları (~25 kargo)** | Aras, MNG, Yurtiçi, PTT, Sürat, hepsiJET, Sendeo… otomatik barkod | ⬜ **sadece Trendyol ortak etiket (ZPL→PDF)** | pazaryeri-entegratoru |
| **Web mağaza / e-ticaret sitesi (B2C+B2B)** | Kendi online mağaza (depo veya dükkân) | ⬜ **yok** (site ayrı) | frontend + pazaryeri |
| **Kampanya modelleri (100+)** | İndirim/kampanya kurgu | 🟡 Kampanya takvimi var; kanal kampanya motoru yok | buyume-pazarlama-uzmani |
| **SEO / rich snippets / GA4 / pixel** | Pazarlama izleme | ⬜ (kendi sitemiz olursa) | buyume-pazarlama-uzmani |
| **Muhasebe entegrasyonu (37)** | Dış muhasebe programlarına aktarım | ⬜ (kendi finansımız içeride) | finans-muhasebe-uzmani |
| **Mobil uygulama** | Yönetim mobil | ✅ PWA | frontend-gelistirici |

### 2.2 Qukasoft karşısında Kokpit'in durumu
Kokpit'in pazaryeri çekirdeği **Trendyol + HB'de güçlü** (senkron, kâr modeli,
ürün açma, Excel) ama Qukasoft **kanal genişliği** (10+ pazaryeri), **~25 kargo
entegrasyonu** ve **kendi web mağazası** ile önde. Kokpit'in avantajı: veri
çekirdeği + boya kâr modeli + üretim/reçete bağı (Qukasoft'ta yok — o sadece
satış katmanı).

---

## 3. "Kendi web mağazamızı / storefront yapmalı mıyız?" — net cevap

**Kısa cevap: Evet — ama "web sitesi yapıcısı (CMS)" değil, "ürün çekirdeğinden
beslenen storefront".** Bir önceki soruda bu ayrımı netleştirmek gerekiyordu:

| Yaklaşım | Karar | Gerekçe |
|---|---|---|
| Jenerik CMS/tema yapıcı (Odoo Website, Wix tarzı drag-drop, blog/forum) | ❌ Hayır | Başlı başına bir ürün; bakım yükü; boya OS'unu dağıtır |
| **Kokpit-güçlü storefront** (katalog → kendi mağaza; ürün/görsel/fiyat çekirdekten) | ✅ **Evet, öncelikli** | En yüksek marjlı kanal (pazaryeri komisyonu YOK), tüm veri zaten hazır, Qukasoft/site kirasından kurtarır |

**Neden en yüksek değer:**
1. **Marj:** Kâr modeli v2 "web sitesi" kanalını zaten sanal POS'la modelliyor.
   Trendyol %15-20 komisyon alırken kendi site ~%2-3 (sadece sanal POS). En kârlı kanal.
2. **Veri hazır:** Faz C'de pazaryeri için ürettiğimiz zengin içerik (başlık,
   açıklama, özellik, görsel) + `/api/img` herkese açık link → storefront'u besler.
3. **Bağımsızlık:** Qukasoft/web mağaza kirası + çift veri girişi biter.
4. **SEO/marka:** Kendi domainde (artofcolour.com.tr) marka + organik trafik.

**Pragmatik yol (CMS değil):** Kokpit ürün çekirdeğinden beslenen, sade,
katalog-odaklı bir mağaza — kategori/ürün/sepet/sanal POS ödeme. Tema yapıcı yok;
Art of Colour'a özel tek tasarım. Ürün ekleme = Kokpit'te zaten yapılıyor.

---

## 4. Parite açıkları sınıflandırması (iki rakip birleşik)

### 🔴 OLMAZSA OLMAZLAR
- **B1. e-Fatura / e-Arşiv / e-İrsaliye** (Bizimhesap) — yasal + kurumsal satış şartı.
  *(= Odoo planı M1; ortak madde)*
- **B2. Çoklu depo** (Bizimhesap) — üretim atölyesi + sevk deposu ayrışması,
  pazaryeri stoğu vs. atölye stoğu. *(Odoo M2 lot/parti ile birlikte)*

### 🟠 ÖNCELİKLİ
- **Q1. Kokpit-güçlü storefront** (Qukasoft web mağaza) — en yüksek marjlı kanal
  (§3). *frontend-gelistirici + pazaryeri-entegratoru*
- **Q2. Kargo entegrasyonu** (Qukasoft) — Art of Colour'un fiilen kullandığı 2-3
  kargo (örn. Aras/MNG/Yurtiçi) otomatik barkod/takip. *pazaryeri-entegratoru*
- **Q3. Ek pazaryeri: N11 + Çiçeksepeti** (Qukasoft) — mevcut Trendyol/HB deseniyle
  aynı; boya satışına uygun kanallar. *pazaryeri-entegratoru*

### 🟡 GEREKLİ
- **Q4. Kampanya motoru** (Qukasoft 100+ model) — kanal bazlı indirim/kampanya kurgu.
  *buyume-pazarlama-uzmani*
- **Q5. SEO / GA4 / pixel** (storefront'a bağlı) — kendi site gelince. *buyume-pazarlama*
- **B3. İşçilik/sarf maliyeti üretimde** (Bizimhesap) — reçeteye işçilik+sarf kalemi.
  *urun-uretim-uzmani + finans*
- **B4. Banka entegrasyonu / otomatik mutabakat** (Bizimhesap) — banka ekstresi
  içe aktarım + eşleştirme. *finans-muhasebe-uzmani*

### ⛔ KAPSAM DIŞI (bilinçli)
- e-SMM (serbest meslek — bize uymaz), 37 dış muhasebe entegrasyonu (finansımız
  içeride), jenerik CMS/tema yapıcı, Modanisa/LCW/Farmazon gibi niş pazaryerleri
  (boya satmıyoruz), fulfillment.

---

## 5. Fazlı plan (Odoo planıyla birleştirilmiş — tek yol haritası)

Odoo (`ODOO-UYARLAMA-PLANI.md`) ve bu rakip analizi **aynı hedeflere** işaret ediyor;
tek birleşik sıralama:

### RAKİP-FAZ 1 — Yasal + kanal genişliği (en yüksek getiri)
- [ ] **1.1 e-Fatura/e-Arşiv/e-İrsaliye** (B1 = Odoo M1) — İzibiz/Foriba/Uyumsoft.
  *finans-muhasebe-uzmani + devops + guvenlik*
- [ ] **1.2 N11 + Çiçeksepeti entegrasyonu** (Q3) — Trendyol/HB deseniyle.
  *pazaryeri-entegratoru*
- [ ] **1.3 Kargo entegrasyonu** (Q2) — kullanılan 2-3 kargo, otomatik barkod.
  *pazaryeri-entegratoru*

### RAKİP-FAZ 2 — En yüksek marjlı kanal: kendi storefront
- [ ] **2.1 Kokpit-güçlü storefront** (Q1) — katalog + sepet + sanal POS; ürün
  çekirdeğinden beslenir, tema yapıcı yok. *frontend + pazaryeri + finans*
- [ ] **2.2 SEO/GA4/pixel** (Q5) — storefront üstüne. *buyume-pazarlama*

### RAKİP-FAZ 3 — Depo + üretim maliyet olgunluğu
- [ ] **3.1 Çoklu depo + lot/parti** (B2 = Odoo M2) — atölye/sevk deposu, parti izi.
  *veritabani-mimari + urun-uretim-uzmani + qa-test*
- [ ] **3.2 Üretimde işçilik/sarf maliyeti** (B3) — reçete maliyet doğruluğu.
  *urun-uretim-uzmani + finans*

### RAKİP-FAZ 4 — Finans + pazarlama derinleşme
- [ ] **4.1 Banka ekstresi içe aktarım + mutabakat** (B4) *finans-muhasebe-uzmani*
- [ ] **4.2 Kampanya motoru** (Q4) — kanal bazlı kampanya. *buyume-pazarlama*

---

## 6. Karar özeti: Kokpit bu ikisini ne kadar ikame etmeli

| Rakip | Kokpit ikame oranı (bugün) | Hedef | Strateji |
|---|---|---|---|
| **Bizimhesap** | ~%75 | ~%95 | e-Fatura + çoklu depo eklenince ön muhasebeyi tamamen ikame eder; e-SMM/dış muhasebe entegrasyonu gerekmez |
| **Qukasoft** | ~%45 | ~%85 | N11/Çiçeksepeti + kargo + **kendi storefront** ile pazaryeri+web mağaza katmanını ikame eder; niş pazaryerleri hariç |

**Ana mesaj:** Kokpit her iki rakibi de **kısmen** karşılıyor ama boya çekirdeği
(reçete, üretim, kâr modeli, türetme) ikisinde de yok — bu bizim asıl üstünlüğümüz.
İki rakibi ikame etmek için **kopyalamaya değil**, en yüksek getirili 6-7 açığı
(e-Fatura, storefront, N11/Çiçeksepeti, kargo, çoklu depo) çekirdeğe bağlamaya
odaklan. Storefront kararı: **evet, ama CMS değil — ürün çekirdeğinden beslenen
sade mağaza** (en yüksek marjlı kanal).

---

## 7. Takım değerlendirmesi
Mevcut ajanlar yeterli. Odoo analizindeki potansiyel **`muhasebe-entegrasyon-uzmani`**
(e-Fatura) burada da geçerli — RAKİP-FAZ 1.1'de kurulacak. Storefront için ayrı ajan
gerekmez; `frontend-gelistirici` + `pazaryeri-entegratoru` + `ux-tasarimci` yeterli.
