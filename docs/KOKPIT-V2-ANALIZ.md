# KOKPİT V2 — Stratejik Ürün Analizi ve Geliştirme Planı

**Tarih:** 15.07.2026 · **Hazırlayan:** CTO (AI takım analizi)
**Kapsam:** Mevcut sistemin uçtan uca analizi, rakip platform karşılaştırması,
modül modül değerlendirme, V2 mimari önerisi ve önceliklendirilmiş yol haritası.
**Bu belgede kod değişikliği yoktur; salt analiz ve plandır.**

---

## 0. Yönetici Özeti (TL;DR)

Kokpit bugün **tek şirketlik, tek kullanıcılı, sağlıklı çalışan bir KOBİ işletim
sistemi çekirdeği**: 26 sayfa, ~25 tRPC router'ı (108 korumalı uç), 22 tablo,
74/74 test, 0 tip hatası. Sipariş→üretim→stok→finans→pazaryeri zinciri gerçek
işi döndürüyor ve **AI asistan (yazma komutlarıyla) rakiplerin hiçbirinde olmayan
bir farklılaştırıcı**.

Ancak V2 hedefi ("Türkiye'nin AI destekli KOBİ İşletme İşletim Sistemi") için
dört yapısal engel var:

1. **Veri modeli borcu:** cari, isimle (string) bağlı; sipariş kalemleri ürün
   ID'si taşımıyor; FK/indeks yok; görseller DB'de base64. Bunlar düzelmeden
   üstüne ne inşa edilirse edilsin çatlar.
2. **Tek kiracılılık:** çok kullanıcı/çok şirket/rol yok — ürünleşmenin (başka
   KOBİ'lere satışın) önündeki ana duvar.
3. **AI mimarisi tek atımlık:** intent-parse + tüm veriyi prompt'a gömme.
   Veri büyüyünce çalışmaz; tool-use'lu ajan mimarisine geçilmeli.
4. **Reaktiflik:** sistem soru sorunca cevap veriyor; kendiliğinden hiçbir şey
   yapmıyor (zamanlanmış senkron yok, uyarı/bildirim motoru yok).

**CTO kararı:** V2 bir "yeniden yazım" DEĞİL, **dört fazlı kademeli evrim**:
Faz 0 temel borçları kapatır (kırmadan), Faz 1 AI'ı ajanlaştırır ve sistemi
proaktifleştirir (en yüksek fayda/maliyet), Faz 2 e-ticaret derinliği
(iade, N11, teklif, e-Fatura), Faz 3 platformlaşma (çok kullanıcı/şirket,
modül SDK'sı). Detay: Bölüm 7.

---

## 1. Mevcut Durum Analizi

### 1.1 Kod yapısı

```
client/           React 19 + Vite + Tailwind 4 + Radix (shadcn tarzı ui/)
  src/pages/      26 sayfa (tek dosya = tek modül; en büyükleri 900–1200 satır)
  src/components/ DashboardLayout, CommandPalette (⌘K), AIChatBox, VoiceButton…
server/
  routers.ts      TÜM tRPC router'ları tek dosyada (950 satır, ~25 alt-router)
  db.ts           TÜM veri erişimi tek dosyada (1274 satır, ham Drizzle sorguları)
  assistant.ts    AI asistan beyni (intent → uygulama)
  trendyol.ts / hepsiburada.ts / marketplace.ts   Pazaryeri katmanı
  whatsapp.ts     Meta webhook (imza doğrulamalı)
  _core/          Platform çekirdeği (auth, LLM, env, vite) — Manus şablon kalıntılarıyla
shared/           pricing.ts (kâr modeli v2, 23 test), const.ts
drizzle/          schema.ts (22 tablo) + 16 migration
.claude/          12 kişilik AI ajan takımı + bilgi tabanı
```

**Güçlü:** uçtan uca tip güvenliği (tRPC + Drizzle + Zod), saf iş mantığının
`shared/`a çıkarılması (pricing), test disiplini (74 test), Türkçe alan diliyle
yazılmış okunur kod, mock pazaryeri + yerel MariaDB ile geliştirilebilirlik.

**Zayıf:**
- `routers.ts` ve `db.ts` **monolit dosyalar** — her modül aynı iki dosyaya
  dokunuyor; modül başına dosya/dizin yok, plugin sınırı yok.
- **Servis katmanı yok:** iş mantığı router içinde (örn. `deriveMany`,
  `production.produce`) veya `db.ts`'te. Test edilebilirlik ve yeniden
  kullanım sınırlı.
- `_core/` içinde kullanılmayan Manus kalıntıları (dataApi, map, oauth,
  heartbeat, imageGeneration-bağlanmamış) — kavramsal gürültü.
- İşlem (transaction) kullanımı yok: `deriveMany` 60 ürünü döngüde tek tek
  yaratıyor; yarıda kesilirse yarım veri kalır.

### 1.2 Veritabanı

22 tablo: users, materials, stockMovements, products, formulaItems, orders,
orderItems, customers, expenses, accounts, transactions, cheques, devProjects,
devTrials, devTrialItems, suppliers, campaigns, marketingTexts, purchases,
purchaseItems, templates, productImages, tasks, settings.

**Kritik sorunlar (öncelik sırasıyla):**

| # | Sorun | Etki |
|---|---|---|
| 1 | **Cari hesap isimle bağlı** (`transactions.customerName`, `supplierName` string) | Müşteri adı değişirse/yanlış yazılırsa ekstre bölünür; aynı isimli iki müşteri birbirine karışır. Ön muhasebenin temeli kırılgan. |
| 2 | **`orderItems.productName`** — ürün ID yok | Ürün bazlı satış raporu, satışta mamul stok düşümü, kârlılık analizi imkânsız/kırılgan (isim eşleşmesine mahkûm). |
| 3 | **Hiç foreign key ve ikincil indeks yok** | Veri bütünlüğü uygulama insafına kalmış; `orders.createdAt`, `transactions.customerName` gibi sık filtrelenen alanlar indekssiz — veri büyüyünce tablo taraması. |
| 4 | **Görseller DB'de base64 (MEDIUMTEXT)** | TiDB satır boyutu/maliyeti, yedek şişmesi, `listProducts` yanına görsel çekilememesi. S3 zaten bağımlılıkta var, kullanılmıyor. |
| 5 | **Mamul stoğu hareketsiz:** `products.stockQty` düz sayı; üretim hammadde düşer ama mamul artırmaz, satış mamul düşmez | Stok gerçeği yansıtmıyor; pazaryerine gönderilen stok elle güncellenen bir sayı. |
| 6 | Çift gider kaydı: `expenses` ve `transactions` ayrı dünyalar (kasa hareketi gider yaratmaz, gider kasadan düşmez) | Kâr/zarar ile nakit akışı tutarsızlaşabilir. |
| 7 | Çok kiracılık kolonu yok (companyId/tenantId hiçbir tabloda yok) | Ürünleşme öncesi tüm tablolara dokunan göç gerekir. |
| 8 | Para alanları decimal→string→parseFloat zinciri; kuruş hassasiyeti `parseFloat`a emanet | Yuvarlama hataları riski; merkezi Money yardımcıları yok. |

### 1.3 API

- tRPC 11, tek `appRouter`; 108 uç `protectedProcedure` (yetki: sadece
  "giriş yapmış olmak" — rol/izin kontrolü hiçbir uçta yok).
- **REST/dış API yok:** üçüncü taraf (web sitesi, Zapier, muhasebeci) hiçbir
  veriye erişemez. "API First" hedefinin tersi — API var ama sadece kendi
  istemcisine.
- Sayfalama hiçbir listede yok (`listOrders`, `listProducts` hepsi full scan).
- Webhook üretimi yok (Kokpit olay yayınlamaz), tüketimi sadece WhatsApp.

### 1.4 UI / Tasarım dili / UX

- shadcn-Radix seti tutarlı; ⌘K komut paleti, AlertDialog'lu onaylar,
  yazdırma şablonları (etiket/fatura/makbuz/kargo) — KOBİ pratiğine uygun,
  Odoo'dan daha sade.
- Tema: açık/koyu var. **Çoklu dil yok** (metinler koda gömülü Türkçe).
- **Mobil:** responsive (useIsMobile) ama PWA değil; sahada/dükkânda telefon ana
  cihaz olacaksa offline ve ana ekran kısayolu yok.
- **UX borçları:** (a) 26 maddelik yan menü büyümeye dayanmaz — bilgi
  mimarisi 5-6 alana toplanmalı; (b) sayfalar dev tek dosya olduğundan form/liste
  desenleri kopyala-yapıştır çoğalmış, davranış tutarlılığı zamanla kayar;
  (c) toplu işlemler (çoklu seçim) sadece Fiyat sayfasında; (d) boş durum
  (empty state) ve ilk kurulum sihirbazı yok — yeni şirket açılışı çıplak
  ekranlarla başlar; (e) bildirim merkezi yok (kritik stok sadece Kokpit
  kartında görünür, kullanıcı girmezse görmez).

### 1.5 AI yapıları

Bugün 4 AI yeteneği var: (1) intent-parse asistan (satış/sipariş/stok/görev/
gider/tahsilat yazma + soru-cevap), (2) WhatsApp aynı beyin, (3) AI fatura
okuma (görselden kalem çıkarma), (4) pazarlama metni üretimi. Sesli uyandırma
(Porcupine/WebSpeech) hazır.

**Mimari sınırlar:**
- `buildBusinessSnapshot()` **tüm siparişleri/ürünleri/stokları her soruda
  prompt'a döküyor** — 40 ürün limiti şimdiden var; 1.000 ürün/10.000 siparişte
  hem kör hem pahalı olur.
- **Tek atımlık intent** — çok adımlı iş ("geçen ayki en kârlı 5 ürünü bul,
  zam önerisi yap, onaylarsam Trendyol'a gönder") yapamaz. Tool-use (function
  calling) döngüsü yok.
- **Proaktif zekâ sıfır:** AI hiçbir şeyi kendiliğinden fark etmez (stok bitiyor,
  müşteri 60 gündür sipariş vermedi, marj eridi). Tüm AI "sorulunca" çalışır.
- Konuşma hafızası yok (her mesaj bağımsız), onay akışı yok (yazma komutları
  anında uygulanır — yanlış anlaşılan "500 lira" geri alınamaz).

### 1.6 Performans

- Ana maliyet DB round-trip: dashboard 7 paralel sorgu (iyi), ama asistan
  snapshot'ı 9 tam-tablo sorgusu; `deriveMany` 60×(insert+görsel kopya+reçete
  döngüsü) — yüzlerce sıralı sorgu.
- İstemci tarafında sanallaştırma yok (1.000 ürün kartı DOM'a basılır);
  React Query önbelleği var, invalidation kabaca.
- Render ücretsiz plan: soğuk başlatma + tek instance; in-memory kilit ve
  rate-limit tek instance varsayımına bağlı (şimdilik doğru varsayım).

### 1.7 Güvenlik

Yapılanlar iyi: bcrypt yerine env-karşılaştırmalı tek sahip girişi
(timingSafeEqual), oturum JWT+httpOnly cookie, login rate-limit, WhatsApp
webhook HMAC imzası, gizli bilgiler yalnız Render env'de.

**Açıklar / riskler (bölüm 6.7'de eylem listesi):**
1. `sameSite: "none"` cookie + CSRF token'sız mutasyonlar → CSRF yüzeyi
   (tRPC JSON gövdesi kısmi koruma, garanti değil).
2. Rol/izin sistemi fiilen yok — `protectedProcedure` tek seviye; "çok
   kullanıcı" açıldığı gün her kullanıcı her şeyi yapabilir/silebilir.
3. Oturum süresi 1 yıl, iptal mekanizması yok (çalınan cookie 1 yıl geçerli).
4. `express.json({limit:"50mb"})` global — her uca 50MB gövde atılabilir (DoS
   yüzeyi); sadece görsel/fatura uçlarında büyük limit gerekli.
5. Güvenlik başlıkları yok (helmet/CSP/X-Frame-Options).
6. `/api/img/*` tasarım gereği herkese açık (pazaryeri ihtiyacı) — kabul
   edilmiş risk, ama ürün görseli dışına genişletilmemeli.
7. Audit log yok: kim neyi sildi/değiştirdi izi tutulmuyor (muhasebe verisi için
   önemli).

### 1.8 Ölçeklenebilirlik

Dikey eksende (tek şirketin verisi büyür) sayfalama+indeks ile çözülür;
yatay eksende (çok şirket/kullanıcı) şema ve auth baştan ele alınmalı.
Kod monolitleri (routers.ts/db.ts) takımın (AI ajanlarının) paralel
çalışmasını da kısıtlıyor — iki ajan aynı dosyada çakışıyor.

---

## 2. Platform Karşılaştırması — "Onlar hangi problemi nasıl çözdü?"

Kopya değil, problem-çözüm analizi:

| Platform | Çözdüğü çekirdek problem | Kokpit'e alınacak ders |
|---|---|---|
| **Odoo** | Her şeyin tek veri modelinde yaşaması: her belge (fatura, sipariş, üretim emri) **birbirine bağlı kayıttır**; modüller ortak çekirdeğe (partner, product, account.move) eklenti olarak takılır. Chatter (her kaydın altında mesaj/log/aktivite), Activity (her kayda "yapılacak" iliştirme), çift taraflı muhasebe. | (a) **Ortak çekirdek varlıklar**: `partner` (müşteri+tedarikçi tek), `product`, `document` — her modül bunlara FK ile bağlanır. (b) Her kayda **zaman çizelgesi/log** (audit + not + AI özeti). (c) Modül = eklenti disiplini. Odoo'nun almayacağımız yönü: ağır UI, kurulum karmaşası, modül başına ayrı zihinsel model. |
| **QukaSoft** | Türkiye pazaryeri operasyonunun tamamı tek panel: N11/Trendyol/HB/ÇS'ye **tek üründen çoklu listeleme**, pazaryeri bazlı fiyat/komisyon kuralları, iade & soru-cevap kuyruğu, kargo anlaşmaları, e-Fatura entegratör köprüsü. | (a) **Kanal-listing ayrımı:** ürün tektir, her kanalda ayrı fiyat/stok/başlık taşıyan "listing" kaydı olur (şu an barkod=her yerde aynı fiyat varsayımı var). (b) İade/soru-cevap **kuyruk** olarak modellenir. (c) e-Fatura'yı kendin yazma, entegratöre köprü kur. Almayacağımız yönü: AI'sız, hantal, kural tabanlı arayüz. |
| **Shopify** | Basitlik + ekosistem: çekirdek küçük, her şey **App + Webhook + tema**. Checkout dışında her şey değiştirilebilir. Liquid tema, tek tık rapor. | (a) **Olay/webhook mimarisi**: her önemli iş olayı (order.created, stock.low) yayınlanır; otomasyonlar ve pluginler olaya abone olur. (b) Public API + token'lı erişim. (c) "Kurulumda 10 dakikada satışa hazır" onboarding hissi. |
| **WooCommerce** | Açık kaynak + hook sistemi: her davranış filter/action ile değiştirilebilir; devasa eklenti pazarı. | Plugin API'si **hook noktaları** olarak tasarlanır (örn. `order.beforeCreate`, `price.calculate`) — bizim plugin hedefimizin somut deseni. Almayacağımız yönü: kalitesiz eklentilerin sistemi çökertmesi → plugin'ler izole/izinli koşmalı. |
| **ERPNext** | Odoo'nun problemini **DocType** soyutlamasıyla çözer: her şey meta-tanımlı belge; alan ekleme, form düzeni, izin, rapor — kod yazmadan. | **Meta-veri esnekliği**: kullanıcı tanımlı alanlar (custom fields) — boya sektörüne özel alanlarımız (yüzey, kuruma süresi) zaten serbest metin; bunu şemalı "özellik seti" yapısına taşımak hem bize hem başka sektöre satarken lazım. |
| **Zoho One** | 40+ uygulamanın **tek kimlik + tek veri omurgası** ile konuşması; Zia (AI) tüm uygulamaların üstünde yatay katman. | AI'ın modül içi buton değil **yatay katman** olması: tek asistan her modülün verisine ve eylemine (tool) erişir — bizim zaten yöneldiğimiz yön, doğrulanmış model. |
| **Monday.com** | İş akışını kullanıcının kurması: "şu olunca bunu yap" (when-then) otomasyon tarifleri, pano/görünüm esnekliği, bildirim disiplini. | **Otomasyon tarifleri modülü**: "stok kritiğe düşünce eksik listesine ekle + WhatsApp'tan haber ver" gibi kuralları kullanıcının (veya AI'ın) tanımlayabilmesi. Kokpit'te bunun AI'lı hali: tarifleri doğal dille kur. |

**Sentez:** V2'nin kimliği = Odoo'nun *bağlı veri çekirdeği* + Shopify'ın
*olay/plugin mimarisi* + Quka'nın *TR pazaryeri derinliği* + Zoho'nun *yatay AI
katmanı* + Monday'in *kullanıcı-tanımlı otomasyonu*. Hiçbirinin arayüz
karmaşasını almadan.

---

## 3. Modül Modül Analiz

### 3.1 Özet tablo

Durum: ✅ var-yeterli · 🟡 var-yetersiz · 🔴 yok · Yeniden tasarım: E/H/Kısmi

| Modül | Durum | Yeniden tasarım? | Öncelik |
|---|---|---|---|
| Dashboard (Kokpit) | 🟡 | Kısmi — AI brifing katmanı | ★★★★☆ |
| CRM (Müşteriler) | 🟡 | E — cari ID bağlama + segment | ★★★★★ |
| Sipariş | 🟡 | Kısmi — kalem-ürün bağı, iade durumları | ★★★★★ |
| Ürün | 🟡 | Kısmi — kategori, listing ayrımı, özellik seti | ★★★★☆ |
| Kategori | 🔴 | E (yeni) | ★★★☆☆ |
| Stok | 🟡 | E — mamul stok hareketi + rezervasyon | ★★★★★ |
| Üretim | 🟡 | Kısmi — üretim emri kaydı + mamul girişi | ★★★★☆ |
| Cari (Müşteri/Tedarikçi ekstre) | 🟡 | E — string→ID göçü şart | ★★★★★ |
| Satın Alma | 🟡 | Kısmi — sipariş (PO) aşaması yok, sadece fatura | ★★★☆☆ |
| Finans (Kasa/Gider/KDV/Kâr) | 🟡 | Kısmi — expenses↔transactions birleşimi | ★★★★☆ |
| Banka | 🟡 | H (şimdilik) — hesap var, banka entegrasyonu Faz 3 | ★★☆☆☆ |
| Kredi Kartları / POS | 🟡 | H — POS kesinti modeli pricing'de var; ekstre takibi ileride | ★★☆☆☆ |
| Çek/Senet | ✅ | H | ★☆☆☆☆ |
| Teklif (Quote) | 🔴 | E (yeni) | ★★★☆☆ |
| e-Fatura | 🔴 | E (entegratör köprüsü) | ★★★★☆ |
| Raporlar/Analitik | 🟡 | Kısmi — AI'lı içgörü + ürün bazlı satış | ★★★★☆ |
| Görevler | ✅ | H — ileride otomasyon tarifleriyle beslenir | ★★☆☆☆ |
| AI Asistan | 🟡 | **E — tool-use ajan mimarisi (V2'nin kalbi)** | ★★★★★ |
| WhatsApp | 🟡 | Kısmi — onay akışı + proaktif bildirim | ★★★★☆ |
| E-Mail | 🔴 | E (yeni, hafif) | ★★☆☆☆ |
| Kargo | 🟡 | Kısmi — etiket var; anlaşmalı kargo/fiyat karşılaştırma yok | ★★★☆☆ |
| Pazaryeri (TY/HB) | 🟡 | Kısmi — iade, soru-cevap, N11/ÇS, listing modeli | ★★★★★ |
| SEO | 🔴 | H — pazarlama modülü içinde AI görevi olarak | ★★☆☆☆ |
| Reklam | 🔴 | H — Faz 3+ (veri yokken modül açmak israf) | ★☆☆☆☆ |
| Pazarlama (AI metin/kampanya) | ✅ | H | ★★☆☆☆ |
| Ürün Geliştirme (Ar-Ge) | ✅ | H — sektör farklılaştırıcımız, koru | ★★☆☆☆ |
| Ayarlar | 🟡 | Kısmi — kanal profilleri var; modül aç/kapa yok | ★★★☆☆ |
| Kullanıcı Yönetimi | 🔴 | E (yeni) — rol/izin/davet | ★★★★☆ |
| Bildirim Merkezi | 🔴 | E (yeni) | ★★★★☆ |
| Otomasyon Tarifleri | 🔴 | E (yeni, AI-first) | ★★★★☆ |

### 3.2 Modül detayları (6 soru: durum / Odoo / Quka / AI ile bizim çözüm)

**Dashboard.** Var; KPI kartları + kritik stok + bekleyen tahsilat. Odoo:
yapılandırılabilir dashboard + aktivite akışı. Quka: kanal bazlı satış özeti.
**AI ile bizde:** sabah brifingi — "dün 7 sipariş, Meteor 30ml stoğu 3 güne
biter, Ahmet'in 4.500 TL borcu 30 günü geçti, önerim: X". Kartlar veriyi
gösterir, AI *ne yapılacağını* söyler. Öncelik ★★★★☆.

**CRM.** Ad/telefon/adres + sipariş geçmişi var; segmentasyon, etiket,
hatırlatma, potansiyel (lead) yok. Odoo: partner tek varlık + chatter +
aktivite. Quka: pazaryeri müşterisi otomatik kaydolur. **AI ile:** RFM
segmentasyonunu AI çıkarır ("6 aydır sessiz 12 toptancı var, WhatsApp mesajı
hazırladım — onayla gönder"). Ön şart: transactions/orders'ın customerId'ye
bağlanması. ★★★★★.

**Sipariş.** Akış listesi + ödeme takibi + kargo etiketi güçlü. Eksik: kalem-ürün
bağı, iade/iptal durumları (pazaryeri iadeleri sessizce atlanıyor), sipariş
kaynaklı mamul stok düşümü. Odoo: sipariş→teslimat→fatura belge zinciri. Quka:
iade kuyruğu. **AI ile:** sipariş anomali tespiti (aynı müşteri mükerrer,
adres eksik, kâr negatif satış) + asistanla sipariş girme (var, güçlendirilecek). ★★★★★.

**Ürün/Kategori.** Türev sistemi (yüzey×ambalaj×renk×set) sektöre özgü ve
değerli; kategori kavramı hiç yok (seri kısmen görüyor), kanal-listing ayrımı
yok. Odoo: varyant matrisi + kategori hiyerarşisi. Quka: kategori/özellik
eşleme pazaryerine göre. **AI ile:** yeni ürün açarken başlık/açıklama/SEO/
pazaryeri kategorisi önerisini AI doldurur; "şu ürünü N11'e de aç" tek cümle. ★★★★☆.

**Stok.** Hammadde tarafı hareket kayıtlı ve sağlam; mamul tarafı düz sayı.
Odoo: her şey stock.move, rezervasyon, çok depo. Quka: kanal bazlı stok
havuzu/dağıtım. **AI ile:** satış hızından tükenme tahmini ("bu hızla 9 gün"),
otomatik eksik listesi + tedarikçiye sipariş taslağı. Ön şart: mamul stok
hareketi (üretim +, satış −, iade +). ★★★★★.

**Üretim.** Reçeteden hammadde düşümü var; üretim emri kaydı (ne zaman, kaç
adet, kim), mamul stok girişi ve üretim maliyeti anlık dondurma yok. Odoo: MO
(manufacturing order) + iş istasyonu. **AI ile:** sipariş kuyruğuna bakıp
üretim planı önerme ("bu hafta 3× Meteor 30ml seti üret, hammadde yeter"). ★★★★☆.

**Cari/Finans.** Kasa/banka/tahsilat/KDV/nakit akışı/çek-senet — Bizimhesap
paritesi büyük ölçüde var. Kırıklar: isim-bazlı bağ, expenses/transactions
ikiliği, audit yok. Odoo: çift taraflı muhasebe (bize fazla — ön muhasebe doğru
seviye). **AI ile:** ay sonu kapanış brifingi, vergi/KDV takvim hatırlatıcısı,
tahsilat kovalama mesajı taslağı. ★★★★★ (ID göçü), diğerleri ★★★★☆.

**Satın Alma.** Alış faturası + AI okuma var; sipariş aşaması (PO: verildi→
bekleniyor→geldi) ve tedarikçi fiyat karşılaştırma yok. **AI ile:** eksik
listesinden tek tıkla PO taslağı + WhatsApp'la tedarikçiye gönderme. ★★★☆☆.

**Pazaryeri.** TY+HB sipariş çekme, stok/fiyat push, resmi etiket — iyi çekirdek.
Eksikler: iade yönetimi, müşteri soru-cevabı (AI cevap taslağıyla — Quka'ya
karşı katil özellik), N11/ÇS, sıfırdan ürün açma, zamanlanmış otomatik senkron
(şu an butonla). ★★★★★.

**AI Asistan.** Bölüm 1.5'teki sınırlar. Hedef mimari bölüm 4.3. ★★★★★.

**WhatsApp/E-posta/Bildirim.** WhatsApp giriş yönü çalışıyor; çıkış yönü
(proaktif bildirim: "stok bitti", "sipariş geldi") yok. E-posta hiç yok (fatura
gönderme, günlük özet). Bildirim merkezi yok. Üçü tek "iletişim katmanı"
olarak tasarlanmalı. ★★★★☆.

**Kullanıcı Yönetimi.** Tek sahip. Çalışan alındığı an ("üretimci stok
girsin ama finansı görmesin") rol/izin şart; çok şirket ürünleşmenin kapısı. ★★★★☆
(tetikleyici olaya bağlı — Faz 3 başı).

**Gereksiz / erteleme kararları:** Reklam yönetimi (veri ve bütçe ölçeği yok),
tam çift taraflı muhasebe (ön muhasebe yeterli, muhasebeciye dışa aktarım
köprüsü kurulur), banka API entegrasyonu (TR'de açık bankacılık erişimi
KOBİ'ye zor; ekstre CSV içe aktarımı yeter), çok depo (tek atölye gerçeği),
SEO'nun ayrı modül olması (pazarlama içinde AI görevi).

---

## 4. Kokpit V2 Mimarisi

### 4.1 İlke: Big-bang yok, "boğa değil, kemirgen" göçü

Mevcut sistem canlı ve iş döndürüyor. V2 mimarisi **mevcut monoliti kırmadan,
modül modül içine inşa edilir** (strangler fig deseni). Yeniden yazım reddedilir.

### 4.2 Hedef yapı

```
┌────────────────────────────────────────────────────────────┐
│  İstemciler: Web (React PWA) · WhatsApp · Sesli · (Mobil)   │
├────────────────────────────────────────────────────────────┤
│  API Katmanı: tRPC (1. parti) + REST /api/v1 (3. parti,     │
│  token'lı) — ikisi de aynı servis katmanını çağırır         │
├────────────────────────────────────────────────────────────┤
│  AI Katmanı (yatay): Asistan-ajan (tool-use döngüsü)        │
│  · her modülün "tool manifest"ini görür                     │
│  · Otomasyon motoru: olay → kural/AI → eylem (onaylı/onaysız)│
├────────────────────────────────────────────────────────────┤
│  Modüller (server/modules/<ad>/): router + service + tools  │
│  siparis · urun · stok · uretim · cari · finans · pazaryeri │
│  · crm · satinalma · pazarlama · arge · ayarlar             │
│  Her modül: kendi router'ı, kendi servis dosyası, kendi     │
│  tool tanımları, kendi olay abonelikleri                    │
├────────────────────────────────────────────────────────────┤
│  Çekirdek: Olay veri yolu (event bus, DB-destekli outbox)   │
│  · Kimlik & İzin (rol/izin, çok kullanıcı)                  │
│  · Tenant bağlamı (companyId — Faz 3'te aktive)             │
│  · Zamanlayıcı (cron: senkron, brifing, hatırlatma)         │
│  · Bildirim servisi (in-app + WhatsApp + e-posta)           │
│  · i18n sözlüğü · Tema token'ları · Dosya deposu (S3)       │
├────────────────────────────────────────────────────────────┤
│  Veri: Drizzle + TiDB — FK'li, indeksli, tenant kolonlu şema │
└────────────────────────────────────────────────────────────┘
```

**10 şartın karşılanması:**
- **Modüler:** `server/modules/<ad>/` + `client/src/modules/<ad>/` — routers.ts
  ve db.ts kademeli olarak buraya bölünür (dıştan davranış aynı kalır).
- **Plugin:** Modül sözleşmesi = `{router, tools, events, nav, migrations}`.
  Bir plugin bu sözleşmeyi dolduran pakettir; çekirdek onu kayıt defterinden
  yükler. (Faz 3'te dışa açılır; Faz 0'dan itibaren kendi modüllerimiz bu
  sözleşmeyle yazılır ki plugin API bedavaya çıksın.)
- **AI First:** her modül servis fonksiyonlarını **tool olarak** da yayınlar;
  UI'daki her buton = asistanın da çağırabildiği bir tool. "Önce tool, sonra ekran."
- **API First:** aynı servis katmanı üstüne `/api/v1` REST + API token yönetimi.
- **Mobil:** PWA (manifest + service worker + push); kritik akışlar (sipariş
  gir, stok düş, tahsilat al) telefon-öncelikli tasarlanır.
- **Çok kullanıcı:** users tablosu genişler (davet, rol: sahip/yönetici/üretim/
  finans/görüntüleyici), `protectedProcedure` → `permissionProcedure("stok.yaz")`.
- **Çok şirket:** her tabloya `companyId` (Faz 0 göçünde kolon eklenir, tek
  şirketle çalışır; Faz 3'te oturum bağlamına bağlanır) — en ucuz zamanı şimdi.
- **Ölçeklenebilir:** FK+indeks, sayfalama, S3 görseller, outbox'lı olaylar,
  stateless sunucu (kilitler DB'ye taşınır).
- **Çoklu dil:** metinler `tr.ts` sözlüğüne çıkarılır (i18n altyapısı kurulur,
  ikinci dil ancak talep olunca çevrilir — çeviriyi AI yapar).
- **Tema:** Tailwind token'ları zaten CSS değişkeni; tenant bazlı renk/logo
  ayarı Faz 3'te settings'ten okunur.

### 4.3 AI mimarisi (V2'nin kalbi)

1. **Asistan-ajan:** tek atımlık intent yerine Anthropic tool-use döngüsü.
   Tool'lar modüllerden gelir (`siparis.olustur`, `stok.dus`, `cari.ekstre`,
   `fiyat.hesapla`, `pazaryeri.gonder`…). Soru-cevap için snapshot yerine
   **sorgu tool'ları** (`rapor.ciro({ay})`) — veri büyüse de prompt sabit kalır.
2. **Onay katmanı:** tool'lar `guvenli` (oku), `onayli` (yaz — kullanıcıya
   "şunu yapıyorum, onaylıyor musun?" kartı), `kritik` (silme/para/pazaryeri
   push — açık onay şart) olarak etiketlenir. Bölüm 6.13/6.14'ün mekanizması budur.
3. **Proaktif ajanlar (zamanlayıcıyla):** Sabah Brifingi, Stok Nöbetçisi,
   Tahsilat Takipçisi, Pazaryeri Nöbetçisi (senkron+anomali), Ay Sonu Muhasebecisi.
   Hepsi aynı tool setini kullanır, çıktıları bildirim merkezine + WhatsApp'a düşer.
4. **Konuşma hafızası:** conversation tablosu (son N mesaj + özet) — WhatsApp
   ve uygulama içi sohbet kaldığı yerden devam eder.

---

## 5. Modüller Arası Bağımlılık Haritası (Rapor 11)

```
                    ┌──────────┐
                    │  ÇEKİRDEK │ users/izin · companyId · settings · olaylar
                    └────┬─────┘
        ┌────────────────┼────────────────────┐
   ┌────▼───┐       ┌────▼────┐          ┌────▼────┐
   │ PARTNER │◄──────│  ÜRÜN   │─────────►│ ŞABLON  │
   │(müşteri+│       │(+kategori│          └─────────┘
   │tedarikçi)│      │ +listing)│
   └─┬───┬───┘       └─┬──┬──┬─┘
     │   │             │  │  └────────────┐
     │   │   ┌─────────┘  │               │
     │   │   │            │          ┌────▼────┐   ┌─────────┐
     │   │ ┌─▼───────┐ ┌──▼──────┐   │ FORMÜL  │◄──│  AR-GE  │
     │   │ │ SİPARİŞ │ │  STOK   │◄──│ (reçete)│   └─────────┘
     │   │ └─┬───┬───┘ │(ham+mamul)  └────┬────┘
     │   │   │   │     └──▲──▲───┘        │
     │   │   │   │        │  │       ┌────▼────┐
     │   │   │   └────────┘  └───────│ ÜRETİM  │
     │   │   │  (satış düşer)  (üretim ekler)  │
     │   │   │                       └─────────┘
     │ ┌─▼───▼────┐  ┌───────────┐
     │ │ PAZARYERİ │  │ SATIN ALMA│──► STOK (hammadde girişi)
     │ └─┬────────┘  └────┬──────┘
     │   │ (sipariş/iade)  │ (borç)
   ┌─▼───▼────────────────▼──┐
   │  FİNANS (kasa·cari·KDV· │──► RAPORLAR/ANALİTİK
   │  gider·çek·e-Fatura)    │
   └─────────────────────────┘
   AI KATMANI ve BİLDİRİM/OTOMASYON: hepsinin üstünde yatay
   (her modülün tool'unu çağırır, her modülün olayını dinler)
```

Kritik yol: **Partner-ID göçü → Sipariş-kalem-ürün bağı → mamul stok hareketi**
zinciri; CRM, raporlama, stok tahmini ve pazaryeri iadesinin tamamı bu üçe bağımlı.

---

## 6. CTO Raporları (istenen 15 başlık)

*(1. Mevcut durum = Bölüm 1; 11. bağımlılık haritası = Bölüm 5)*

### 6.2 Eksik modüller (önem sırasıyla)
1. Bildirim merkezi + proaktif iletişim (in-app/WhatsApp-çıkış/e-posta)
2. İade & pazaryeri soru-cevap yönetimi
3. Kullanıcı yönetimi (rol/izin/davet)
4. e-Fatura/e-Arşiv entegratör köprüsü
5. Teklif → sipariş akışı
6. Kategori & kanal-listing modeli
7. Otomasyon tarifleri (when-then)
8. Satın alma siparişi (PO)
9. N11 + Çiçeksepeti entegratörleri
10. E-posta kanalı (fatura/özet gönderimi)

### 6.3 Teknik borçlar
1. `transactions`/`orders` cari bağının string olması (en pahalı borç)
2. `orderItems.productName` — ürün ID'siz kalemler
3. FK ve ikincil indeks yokluğu
4. Base64 görseller (S3'e taşınmalı; SDK zaten var)
5. routers.ts (950) + db.ts (1274) monolitleri → modül dizinleri
6. Servis katmanı yokluğu (iş mantığı router/db içinde)
7. expenses ↔ transactions ikiliği
8. DB transaction kullanılmaması (deriveMany, produce, purchase)
9. Manus kalıntısı `_core` dosyaları (dataApi/map/oauth/heartbeat) — ayıkla
10. parseFloat-tabanlı para aritmetiği → merkezi Money yardımcıları
11. Finans mantığının (vatReport, balances) test kapsamı dışı olması
12. Sayfalamasız liste uçları

### 6.4 UX problemleri
1. 26 maddelik düz menü → 5-6 alanlı bilgi mimarisi (Satış · Ürün&Üretim ·
   Finans · Pazarlama · Ayarlar) + ⌘K'yı birincil gezinme yap
2. Bildirimlerin görünmezliği (kritik stok yalnız dashboard kartında)
3. Boş durumlar ve ilk-kurulum sihirbazı yok
4. Toplu işlem deseni yalnız Fiyat sayfasında; Ürün/Sipariş/Müşteri'ye yok
5. Mobilde yazdırma/etiket akışları zayıf; PWA yok
6. Yazma asistan komutlarında onaysız uygulama (yanlış anlama → anında veri)
7. Uzun listelerde sanallaştırma yok (1.000+ kayıtta donma)
8. Form hataları alan-bazlı değil, toast-bazlı

### 6.5 Performans problemleri
1. Asistan snapshot'ının 9 tam-tablo sorgusu + prompt şişmesi → tool-tabanlı sorgu
2. `deriveMany`: 60 ürün × (görsel kopya + reçete) sıralı insert → tek transaction + batch
3. Tüm list uçları sayfalamasız
4. `productImages` MEDIUMTEXT satır ağırlığı
5. İstemci liste sanallaştırması yok
6. Sık sorgulanan kolonlarda indeks yok (createdAt, customerName, barcode, orderNo)

### 6.6 Veritabanı problemleri
Bölüm 1.2'deki 8 madde. Göç sırası: (1) companyId kolonları + FK/indeks paketi
→ (2) partnerId (customers+suppliers birleşik) ve transactions/orders bağı
→ (3) orderItems.productId → (4) mamul stok hareketleri (productMovements)
→ (5) görseller S3. Her adım geriye dönük uyumlu (eski kolonlar okunur,
yenisi yazılır; iki sürüm sonra eski kaldırılır).

### 6.7 Güvenlik açıkları (eylemli)
1. CSRF: `sameSite:"lax"`a dönüş (tek origin zaten) veya Origin başlığı kontrolü — ucuz, hemen
2. Rol/izin altyapısı (çok kullanıcı öncesi zorunlu)
3. Oturum: süre kısaltma + sunucu tarafı iptal listesi (sessionVersion)
4. Body limit'i uca göre daralt (global 50MB → varsayılan 1MB)
5. helmet + CSP başlıkları
6. Audit log (finansal kayıtlarda kim-ne-ne zaman)
7. Login rate-limit'in DB'ye taşınması (multi-instance'a hazırlık)

### 6.8 Yapılması gereken ilk 20 geliştirme (sıralı)
| # | İş | Tür |
|---|---|---|
| 1 | FK + indeks + companyId göç paketi | DB |
| 2 | Partner birleşik modeli + cari'nin ID'ye bağlanması (string→ID göçü) | DB/Finans |
| 3 | orderItems.productId + satışta mamul stok düşümü | DB/Stok |
| 4 | Mamul stok hareketleri (üretim +, satış −, iade +) + üretim emri kaydı | Üretim |
| 5 | Görsellerin S3'e taşınması (`/api/img` URL'leri korunarak) | Altyapı |
| 6 | routers.ts/db.ts'in modül dizinlerine bölünmesi + servis katmanı (davranış birebir) | Mimari |
| 7 | Zamanlayıcı (cron) çekirdeği + otomatik pazaryeri senkronu | Çekirdek |
| 8 | Bildirim merkezi (in-app) + WhatsApp çıkış bildirimi | Modül |
| 9 | Asistanın tool-use ajanına dönüşümü (okuma tool'ları) | AI |
| 10 | Asistan yazma tool'ları + onay katmanı (guvenli/onayli/kritik) | AI |
| 11 | Proaktif ajan #1: Sabah Brifingi (WhatsApp+dashboard) | AI |
| 12 | Proaktif ajan #2: Stok Nöbetçisi (tükenme tahmini + eksik listesi) | AI |
| 13 | İade yönetimi (pazaryeri iade/iptal statüleri + stok iadesi) | Pazaryeri |
| 14 | Pazaryeri soru-cevap kuyruğu + AI cevap taslağı | Pazaryeri/AI |
| 15 | CSRF/helmet/body-limit/oturum güvenlik paketi | Güvenlik |
| 16 | Sayfalama + liste sanallaştırma (Sipariş/Ürün/Hareketler) | Perf |
| 17 | expenses↔transactions birleşimi (tek para hareketi modeli) | Finans |
| 18 | e-Fatura entegratör köprüsü (İzibiz/Foriba — araştırma + adaptör) | Finans |
| 19 | Teklif modülü (teklif→sipariş dönüşümü, PDF) | Modül |
| 20 | Menü bilgi mimarisi + boş durumlar + PWA manifesti | UX |

### 6.9 En yüksek fayda sağlayacak ilk 10 özellik (kullanıcı gözünden)
1. **Sabah Brifingi** (WhatsApp'a her sabah işletme özeti + öneriler) — sıfır tıkla değer
2. **Otomatik pazaryeri senkronu** (butona basmadan; yeni sipariş → anında bildirim)
3. **Stok Nöbetçisi** (tükenme tahmini + otomatik eksik listesi)
4. **Tahsilat Takipçisi** (30 günü geçen alacaklara AI'lı nazik WhatsApp taslağı)
5. **Pazaryeri soru-cevabına AI taslak** (Quka'da bile yok — TR'de satış puanını doğrudan etkiler)
6. **İade yönetimi** (şu an görünmez para kaybı)
7. **Asistan onay kartları** (yanlış anlaşılan komutun veriyi bozmaması → güven)
8. **Ürün bazlı satış/kâr raporu** (hangi ürün gerçekten kazandırıyor — kalem-ürün bağıyla mümkün olur)
9. **e-Fatura** (mevzuat gereği er ya da geç zorunlu; muhasebeciyle sürtünmeyi bitirir)
10. **PWA + push** (telefonda "uygulama" hissi, sipariş bildirimi cebe düşer)

### 6.12 AI ajanlarının görev dağılımı (geliştirme takımı)
- **proje-yoneticisi:** faz planlarını sprint'e böler; Faz 0 göç sıralamasının sahibi
- **veritabani-mimari:** 6.8/1-5 göç paketleri (her şema adımı ondan geçer)
- **backend-gelistirici:** servis katmanı, modül bölünmesi, REST API, zamanlayıcı
- **frontend-gelistirici:** bilgi mimarisi, bildirim merkezi UI, PWA, sanallaştırma
- **ai-otomasyon-muhendisi:** tool-use ajanı, onay katmanı, proaktif ajanlar, hafıza
- **pazaryeri-entegratoru:** iade, soru-cevap, N11/ÇS, listing modeli, oto-senkron
- **finans-muhasebe-uzmani:** partner göçü onayı, expenses birleşimi, e-Fatura, audit
- **urun-uretim-uzmani:** mamul stok hareketi, üretim emri, kategori/özellik seti
- **guvenlik-denetcisi:** 6.7 paketi, rol/izin tasarımı, REST token modeli
- **qa-test-uzmani:** göçlerde regresyon kapısı (özellikle 1-4: para+veri)
- **devops-muhendisi:** S3, cron, Render ölçek, staging ortamı
- **buyume-pazarlama-uzmani:** soru-cevap şablon dili, brifing içerik tasarımı, rakip izleme
- **ux-tasarimci (YENİ):** bilgi mimarisi, onay kartı deseni, boş durumlar, mobil akışlar

### 6.13 Tamamen otomatik olması gerekenler
- Pazaryeri sipariş senkronu (zamanlanmış, kilitli) ve kargo takip güncellemesi
- Kritik stok algılama → eksik listesine ekleme → bildirim
- Sipariş kaleminden mamul stok düşümü; üretimden mamul girişi
- Tahsilat kaydının sipariş ödeme durumunu güncellemesi (bugün de otomatik — korunur)
- Sabah brifingi, ay sonu özet, KDV dönem hatırlatması
- Pazaryeri anomali uyarıları (senkron hatası, 401, mükerrer)
- Fatura görselinden kalem çıkarma (taslak olarak)

### 6.14 Kullanıcı onayı gerektirenler
- Her türlü **silme** ve toplu güncelleme (toplu fiyat, applyPrices)
- **Pazaryerine fiyat/stok push** (yanlış fiyat = anında gerçek zarar)
- AI'ın yazma eylemleri: gider/tahsilat/sipariş oluşturma → onay kartı
  (tutar küçük ve tekil ise "hızlı onay", toplu/parasal büyükse açık onay)
- Müşteriye/tedarikçiye giden her mesaj (tahsilat hatırlatma, soru-cevap yanıtı)
- e-Fatura kesimi (mali belge — her zaman açık onay)
- Cari birleştirme/düzeltme önerileri (AI önerir, insan onaylar)

### 6.15 Kokpit vs Odoo vs QukaSoft — güçlü/zayıf
**Kokpit'in güçlü yönleri:** yazan AI asistan + WhatsApp + sesli komut (ikisinde
de yok); boya sektörü derinliği (formül, türev matrisi, Ar-Ge akışı — Odoo'da
pahalı özelleştirme, Quka'da imkânsız); kuruşu kuruşuna TR pazaryeri kâr modeli
(Trendyol resmi hesaplayıcıyla birebir); tek sade arayüz, sıfır kurulum
karmaşası; modern stack (tip güvenli, hızlı iterasyon); AI takımıyla geliştirme
hızı; maliyet (Odoo lisans/danışman, Quka abonelik vs Render ücretsiz+TiDB).

**Zayıf yönleri:** Odoo'ya karşı — muhasebe derinliği (çift taraflı defter,
resmi beyanname), İK/bordro, çok depo/çok şirket, olgun izin sistemi, devasa
modül ekosistemi, belge zinciri disiplini (teklif→sipariş→irsaliye→fatura).
Quka'ya karşı — pazaryeri genişliği (N11/ÇS/GittiGidiyor vb. düzinelerce kanal),
iade/soru-cevap operasyonu, e-Fatura köprüsü, sıfırdan ürün açma, kargo
anlaşmaları. Her ikisine karşı — tek kullanıcı, referans/piyasa kanıtı yok,
tek geliştirici-sahip riski.

**Stratejik sonuç:** Odoo'yla muhasebe derinliğinde, Quka'yla kanal sayısında
yarışma. **"Onların çözdüğünü AI ile 10× daha az tıkla çöz"** konumlan:
brifing, nöbetçi ajanlar, doğal dille iş yaptırma, onay kartları. Bu üçgende
(ERP çekirdeği yeterli + e-ticaret TR-derin + AI-first) rakip yok.

---

## 7. Yol Haritası — Fazlar (CTO kararı)

**Faz 0 — Temel Sağlamlaştırma (kırmadan):** 6.8/1-6 + güvenlik paketi (15).
Görünür özellik az, ama her sonraki fazın önkoşulu. Çıktı: FK'li-indeksli-
companyId'li şema, partner-ID'li cari, ürün bağlı kalemler, S3 görseller,
modül dizinli kod. *Risk: veri göçü → her adım qa-test-uzmani kapısından.*

**Faz 1 — AI Business OS çekirdeği (fark yaratan faz):** 6.8/7-12.
Zamanlayıcı, bildirim, tool-use ajan, onay katmanı, Sabah Brifingi, Stok
Nöbetçisi, oto-senkron. Çıktı: Kokpit "sorulunca cevap veren"den
**"kendiliğinden yöneten"e** geçer. Pazarlanabilir V2 hikâyesi budur.

**Faz 2 — E-ticaret & finans derinliği:** 6.8/13-19. İade, soru-cevap+AI,
sayfalama, expenses birleşimi, e-Fatura, teklif, N11/ÇS. Çıktı: Quka
paritesinin kalan kritik parçaları + mevzuat hazırlığı.

**Faz 3 — Platformlaşma:** kullanıcı yönetimi (rol/izin), çok şirket aktivasyonu,
REST /api/v1 + token, plugin sözleşmesinin dışa açılması, i18n, tema, PWA
tamamlanışı, otomasyon tarifleri UI'ı. Çıktı: Art of Colour'ın aracı →
**satılabilir ürün**.

**Bekleyebilir:** teklif dışı CRM-lead akışı, kargo fiyat karşılaştırma, veri
ambarı. **Gereksiz (şimdilik):** reklam yönetimi, çift taraflı muhasebe, banka
API'si, çok depo, ayrı SEO modülü.

---

*Bu belge yaşayan yol haritasıdır; her faz kapanışında takım denetimiyle
güncellenir. Uygulama başlamadan önce Faz 0 göç planının `veritabani-mimari` +
`finans-muhasebe-uzmani` onayından geçmesi zorunludur.*
