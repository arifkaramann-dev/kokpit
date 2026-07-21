# Kokpit — Kapsamlı Özellik Analizi & Geliştirme Planı (21.07.2026)

> CTO denetimi: tüm modüller incelendi; amaç geliştirme, düzeltme ve
> kullanıcı-dostu sadeleştirme için önceliklendirilmiş tek plan.
> Kaynaklar: kod tabanı ölçümleri, DEVAM.md, todo.md, docs/* strateji belgeleri.

## 0. Yönetici Özeti

Kokpit bugün **31 tablo, 30 sayfa, 4 pazaryeri entegrasyonu, 252/252 test** ile
olgun bir işletme işletim sistemi. Fonksiyonel kapsam rakiplere yaklaştı
(Bizimhesap ~%75, Qukasoft ~%45 paritesi). Ana bulgular:

1. **En büyük risk kod değil, operasyon:** kod tarafı hazır ama canlıda
   doğrulanmamış geniş bir yüzey var (4 pazaryeri, e-Fatura, Geliver, PayTR,
   sesli uyandırma). Ayrıca Render free uykuya dalınca **zamanlayıcı ölüyor** —
   oto-senkron, Stok Nöbetçisi, Sabah Brifingi, Tahsilat Takipçisi sessizce
   durur. Uptime monitörü hâlâ kurulmadı; bu tek başına en yüksek etkili iş.
2. **Teknik borç birikti:** `server/routers.ts` 2.425 satır, `server/db.ts`
   1.846 satır monolit; `Products.tsx` 2.039 satır; görseller base64 olarak
   DB'de (S3 göçü bekliyor); hiçbir list ucunda sayfalama yok.
3. **UX yoğunlaştı:** menüde 5 grup / 28 öğe; işlev çakışmaları oluştu
   (Maliyet & Kâr ↔ Fiyat & Kâr Motoru); Kokpit ana sayfası bilgi gösteriyor
   ama "bugün ne yapmalıyım"ı söylemiyor.
4. **Hızlı kazanımlar mevcut:** 1.437 satırlık ölü sayfa (`ComponentShowcase`),
   eksik hata bildirimleri, menü sadeleştirme — düşük riskle temizlenir.

Plan: **3 sprint + 1 sürekli hat** (bkz. §5).

## 1. Modül Envanteri ve Olgunluk Değerlendirmesi

Olgunluk: ★★★ üretimde kanıtlı · ★★ çalışıyor ama eksikli · ★ kod hazır/canlı doğrulanmadı

| Modül | Durum | Ana eksik / not |
|---|---|---|
| Kokpit (ana pano) | ★★ | Bilgi kartları var; aksiyon odağı yok ("bugün ne yapmalı" şeridi eksik) |
| Sipariş Panosu | ★★★ | Arama/filtre/ödeme/iptal/etiket tam. Sayfalama yok — pazaryeri hacmiyle ilk darboğaz |
| Teklifler | ★★★ | Kabul→sipariş dönüşümü, yazdırma, WhatsApp tam |
| Müşteriler (CRM) | ★★ | Cari + geçmiş var; satış boru hattı (fırsat/aşama) yok (Odoo planında 🟠) |
| Soru-Cevap | ★ | Trendyol QnA oto-çek/oto-cevap kodu hazır; **canlı test bekliyor**; N11/ÇS adaptörleri açık |
| Web Mağaza (storefront) | ★ | Vitrin+sepet+kupon hazır; PayTR anahtarı, domain, SEO (sitemap/GA4) bekliyor |
| Görevler & Eksikler | ★★★ | Basit ve işlevsel |
| Kampanyalar + kupon | ★★ | Takvim + kupon motoru var; e-posta/SMS otomasyonu yok (🟡) |
| AI Pazarlama | ★★ | Metin üretimi çalışıyor; ürün kartına AI yazma ile kısmen örtüşüyor |
| Şablonlar + Ürün Serileri | ★★ | Çalışıyor; menüde "Satış" altında olması yanlış grup |
| Fatura Girişi (alış) | ★★ | AI fatura okuma var; **A3: alış faturasından hammadde maliyet güncelleme yok** |
| Giderler | ★★★ | Kategori kırılımı dahil tam |
| Kasa & Banka | ★★★ | Hesaplar, transfer, makbuz tam |
| Cari Hesaplar | ★★★ | ID-öncelikli ekstre, müşteri+tedarikçi |
| Çek & Senet | ★★ | Portföy takibi var; kasa/cari entegrasyonu yüzeysel |
| Banka Mutabakatı | ★ | CSV eşleştirme hazır; gerçek ekstre formatlarıyla denenmedi |
| Ürünler & Türevler | ★★★ | Çekirdek güçlü (sağlık skoru, yaşam döngüsü, otomatik doldurma, AI). Sayfa 2.039 satır — bakım riski |
| İçe/Dışa Aktar | ★★★ | Gerçek xlsx, diff önizleme, 23 test |
| Ürün Geliştirme | ★★ | 5 adımlı akış + reçete düzenleme; kullanımı ağır (1.190 satır sayfa) |
| Formül Defteri | ★★★ | Kopyalama + maliyet payı tam |
| Üretim | ★★★ | 17.07 yenilemesiyle güçlü (kuyruk, planlayıcı, geçmiş, geri alma). Lot/parti + kalite kontrol açık (🔴) |
| Stok & Hammadde | ★★★ | Hareket, kullanım, yeniden sipariş önerisi tam. Çoklu depo yok (🔴 rakip paritesi) |
| Maliyet & Kâr | ★★ | **Fiyat Motoru ile işlev çakışması** — birleştirme adayı |
| Fiyat & Kâr Motoru | ★★★ | Kâr modeli v2 kuruş doğrulamalı; toplu fiyat, CSV, kanala push |
| Satış Analizi | ★★ | KPI + kanal kârlılığı var; **A1: gerçekleşen kâr raporu KDV-dahil maliyet modeline hizalanmadı** |
| Strateji & Rapor | ★★ | Kâr/zarar + nakit akışı; Analiz ile kısmen örtüşüyor |
| Asistan (app+WhatsApp+ses) | ★★ | Soru-cevap + 2 yazma komutu; **tool-use ajanına dönüşüm** en büyük açık vaat |
| Pazaryeri (TY/HB/N11/ÇS) | ★ | 4 entegratör + push + senkron kodu tam; **tamamı canlı doğrulama bekliyor** |
| e-Fatura (Bizimhesap) | ★ | Adaptör hazır; FirmID bekliyor |
| Kargo (Geliver) | ★ | Adaptör hazır; API token bekliyor |
| Bildirimler + Zamanlayıcı | ★★ | Çalışıyor ama **Render free uykusunda ölüyor** — uptime monitörü şart |
| PWA | ★★ | SW + manifest var; mobil saha akışları (depo/üretim) denetlenmedi |

## 2. Teknik Sağlık ve Borçlar

**İyi durumda:** 0 tip hatası, 252/252 test, kod içi TODO/FIXME borcu yok,
saf mantık `shared/` ve `*Utils.ts`'e ayrıştırılmış, migration disiplini oturmuş.

**Borçlar (öncelik sırasıyla):**

| # | Borç | Etki | Plan |
|---|---|---|---|
| B1 | `routers.ts` (2.425) + `db.ts` (1.846) monolit | Her değişiklik aynı iki dosyaya dokunuyor; çakışma + gerileme riski | V2 Faz 0.4 — modül dizinlerine bölme, davranış birebir |
| B2 | Görseller base64/MEDIUMTEXT DB'de | DB şişmesi, yavaş sorgu, tRPC body limiti geniş kalıyor (0.6'yı blokluyor) | Faz 0.3 — S3 göçü (`/api/img` URL'leri korunarak); AWS SDK zaten bağımlılıkta |
| B3 | **Hiçbir list ucunda sayfalama yok** (orders/products/transactions… tümü full tablo) | Pazaryeri senkronuyla sipariş tablosu büyüdükçe pano yavaşlar | Önce `orders.list` + `transactions.list`'e cursor/limit; UI'da "daha fazla göster" |
| B4 | `ComponentShowcase.tsx` 1.437 satır, hiçbir yerden referans yok | Ölü kod, build boyutu | Sil |
| B5 | Dev sayfalar: `Products.tsx` 2.039, `Orders.tsx` 1.252, `Development.tsx` 1.190 | Bakım zorluğu, dialog ormanı | Alt bileşenlere bölme (davranış birebir); Products'taki akışların ProductDetail ile tekilleştirilmesi |
| B6 | Oturum: uzun ömür, sunucu tarafı iptal yok | Güvenlik | Faz 0.6 (S3 sonrası body limit daraltmasıyla birlikte) |
| B7 | Senkron kilidi + entegrasyon yolları test dışı | Yarış durumu gerilemesi sessiz kalır | qa-test-uzmani: kilit + scheduler akış testleri |

## 3. UX / Kullanıcı-Dostu Olma Analizi

1. **Menü yoğunluğu:** 5 grup / 28 öğe. Öneri (ux-tasarimci ile):
   - "Maliyet & Kâr" → Fiyat & Kâr Motoru'na sekme olarak birleştir (tek fiyat
     gerçeği; Costs.tsx'teki tekil hesaplayıcı motorun alt görünümü olur).
   - "Şablonlar" → Ürün & Üretim grubuna (içeriği ambalaj/renk/set + ürün serileri).
   - Az kullanılan finans sayfaları (Çek & Senet, Banka Mutabakatı) grup içinde
     alta; "Görevler" Genel grubuna.
   - "Satış Analizi" ile "Strateji & Rapor" orta vadede tek "Raporlar" sayfasında
     sekmeleşebilir (KPI'lar iki yerde tekrar ediyor).
2. **Kokpit aksiyon şeridi:** ana sayfa bilgi veriyor ama iş söylemiyor. Tek
   şerit: *cevap bekleyen soru (N) · üretilecek (N) · tahsil edilecek (₺) ·
   kritik hammadde (N) · bekleyen sipariş (N)* — her biri tıklanınca filtreli
   sayfaya gider. Mevcut uçlarla yapılır, migration istemez.
3. **Sessiz hatalar:** `Analytics/Home/Ledgers/Strategy/Assistant` sayfalarında
   mutation/query `onError` yok — hata durumunda kullanıcı boş ekranla kalıyor.
   Standart: global `QueryClient` onError → toast (tek noktadan, sayfa sayfa
   dolaşmadan çözülür).
4. **İlk kullanım / boş durumlar:** yeni modüllerde (Mutabakat, Sorular,
   Teklifler) boş durum yönlendirmesi var; ancak uçtan uca "kurulum sihirbazı"
   yok. Ayarlar'daki entegrasyon panelleri güçlü — bunları tek "Bağlantı
   Durumu" kartında özetlemek (hangi entegrasyon yeşil/kırmızı) operasyonu
   kolaylaştırır.
5. **Mobil/saha:** sidebar mobil uyumlu; ama Üretim ve Stok sayfaları depoda
   telefonla kullanım için denetlenmedi. Fırsat: kamerayla barkod okuma
   (Barcode Detection API) → stok sayımı ve sipariş toplama (Odoo planındaki
   "Barcode mobil depo" 🟠 maddesi).
6. **⌘K keşfedilebilirliği:** masaüstünde güçlü; mobilde görünür bir arama
   butonu yok.

## 4. Hata / Risk Bulguları (düzeltme adayları)

| # | Bulgu | Şiddet | Aksiyon |
|---|---|---|---|
| R1 | Uptime monitörü kurulmadı → scheduler'a bağlı her şey (oto-senkron, brifing, nöbetçiler, tahsilat takipçisi) Render uykusunda **sessizce durur** | 🔴 | Kullanıcı görevi (cron-job.org → `/api/health`, 10 dk). Koda ek: Kokpit'te "zamanlayıcı son çalışma" rozeti — durduysa görünür olsun |
| R2 | Canlı doğrulanmamış yüzey: TY/HB/N11/ÇS senkron+push, TY ürün açma, QnA oto-cevap, e-Fatura, Geliver, PayTR | 🔴 | §5 "Canlı Doğrulama Hattı" — anahtar geldikçe modül modül kapat |
| R3 | Sayfalamasız list uçları (B3) | 🟠 | Sprint 2 |
| R4 | Global hata bildirimi eksikliği (§3.3) | 🟠 | Sprint 1, tek noktadan |
| R5 | QnA oto-cevabı canlıda ilk açılışta güven eşiği denetlenmeli (yanlış otomatik cevap marka riski) | 🟠 | Canlı testte ilk hafta oto-cevap KAPALI, taslak-onay modunda izle |
| R6 | Senkron kilidi test kapsamı dışı (B7) | 🟡 | Sprint 2 |
| R7 | `ComponentShowcase` ölü kodu (B4) | 🟡 | Sprint 1 |

## 5. Plan — 3 Sprint + Sürekli Hat

### Sprint 1 — "Sadeleştir & Görünür Kıl" (düşük risk, yüksek his)
UX odaklı; migration yok, davranış değişikliği minimal. Sıra: ux-tasarimci
akış onayı → frontend-gelistirici uygulama.
1. Kokpit **aksiyon şeridi** (§3.2) + "zamanlayıcı son çalışma" rozeti (R1 görünürlüğü).
2. Global hata toast'u (QueryClient onError) (R4).
3. Menü IA düzenlemesi: Maliyet→Fiyat Motoru birleşmesi, Şablonlar taşıma,
   grup sıraları (§3.1). Eski rotalar redirect ile korunur.
4. `ComponentShowcase.tsx` silme + ölü import taraması (B4).
5. Ayarlar'da "Bağlantı Durumu" özet kartı (§3.4).
- Doğrulama: `pnpm check` + mevcut testler; riskli parça yok.

### Sprint 2 — "Ölçek & Borç" (yapısal; qa-test-uzmani zorunlu durak)
1. Sayfalama: `orders.list` + `transactions.list` cursor/limit + UI (B3/R3).
2. S3 görsel göçü (Faz 0.3) — `/api/img` sözleşmesi korunur (B2). *(S3 kimlik
   bilgisi patrondan; gelmezse bu madde Sprint 3'e kayar, bloklamaz.)*
3. `routers.ts`/`db.ts` modül bölünmesi + servis katmanı (Faz 0.4, B1) —
   davranış birebir, mevcut 252 test regresyon ağı.
4. Senkron kilidi + scheduler birim testleri (B7/R6).
5. Oturum sertleştirme + body limit daraltma (Faz 0.6, B6; S3'e bağlı).

### Sprint 3 — "Değer Üret" (ürün değeri; sıralama patron önceliğine açık)
1. **Asistan tool-use ajanı** + onay katmanı (güvenli/onaylı/kritik) — Faz 1'in
   en büyük açık vaadi; intent listesi yerine gerçek araç çağrısı.
2. **A1 + A3 maliyet gerçeği:** gerçekleşen kâr raporunun KDV-dahil maliyet
   modeline hizalanması; alış faturasından hammadde birim maliyet + KDV
   otomatik güncelleme (finans-muhasebe-uzmani onayıyla).
3. Sıfırdan ürün açma — HB listing + N11/ÇS (Trendyol'daki C3 devamı).
4. Barkod ile mobil depo (kamera okuma → stok sayım/toplama) — §3.5.
5. CRM satış boru hattı (fırsat/aşama) — Odoo 🟠.

### Sürekli Hat — "Canlı Doğrulama" (anahtar geldikçe, PATRON-GOREVLERI.md)
Sıra önerisi (ciro etkisine göre): ① uptime monitörü (R1, 10 dakika) →
② Trendyol bağlantı+senkron+push → ③ HB anahtarları → ④ QnA canlı (ilk hafta
oto-cevap kapalı, R5) → ⑤ Bizimhesap FirmID (e-Fatura) → ⑥ Geliver token →
⑦ PayTR + domain (storefront yayına) → ⑧ N11/ÇS anahtarları → ⑨ Picovoice.

### Bilinçli ertelenenler
Çoklu depo + lot/parti + kalite kontrol (büyük şema işi — RAKİP-FAZ 3 ayrı
sprint), çok kullanıcı/şirket (companyId hazır, talep yok), e-posta/SMS
kampanya otomasyonu, REST API/plugin (V2 Faz 3).

## 6. Takım Notu (Takım Geliştirme Protokolü)

Mevcut 15 ajan kadroyu karşılıyor; yeni ajan ihtiyacı YOK. Sprint 1'de
ux-tasarimci öncü, Sprint 2'de veritabani-mimari (sayfalama/indeks) +
qa-test-uzmani kalite kapısı, Sprint 3'te ai-otomasyon-muhendisi (tool-use)
ve pazaryeri-entegratoru (ürün açma) öncü. Sprint sonlarında protokol sorusu
tekrarlanacak.
