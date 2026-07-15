# Art of Colour Kokpit — TODO

## Altyapı
- [x] Veritabanı şeması: siparişler, sipariş kalemleri, hammaddeler, ana ürünler, türev ürünler, formül kalemleri, tedarikçiler, kampanyalar
- [x] Migration üretimi ve veritabanına uygulanması
- [x] Tema/tasarım sistemi (index.css, font, renk paleti — sade ve işlevsel, boya markasına uygun canlı vurgu rengi)
- [x] DashboardLayout ile sidebar navigasyon ve rota yapısı (App.tsx)

## Modül 1: Sipariş Panosu
- [x] Sipariş CRUD (müşteri adı, kanal, tutar, notlar, kalemler)
- [x] Kanban panosu: Yeni / Üretimde / Kargoya Hazır / Tamamlandı sütunları
- [x] Sürükle-bırak ile durum değiştirme (optimistic update)
- [x] Kanban yerine otomatik akışlı sipariş listesi (arama + ödeme/kanal filtreleri) — güncel görünüm
- [x] Sipariş detay/düzenleme dialogu

## Modül 2: Hammadde ve Stok Takibi
- [x] Hammadde CRUD (ad, kategori: pigment/solvent/şişe/etiket/diğer, birim, stok miktarı, kritik eşik, birim maliyet)
- [x] Stok giriş/çıkış hareketi (miktar güncelleme)
- [x] Kritik stok uyarısı (eşik altına düşünce görsel uyarı + dashboard'da gösterim)

## Modül 3: Ana Ürün ve Türev Ürün Sistemi (esnek)
- [x] Ana ürün CRUD (ad, seri, renk kodu, temel satış fiyatı)
- [x] Sınırsız/esnek türev ekleme: türev adı, serbest metin yüzey/kullanım alanı tipi, katkı maddeleri ve oran farkları
- [x] Türev tipi önceden sabit DEĞİL — kullanıcı istediği yüzey tipini kendisi tanımlar
- [x] Her türev bağımsız formül taşır

## Modül 4: Ürün Formül Defteri
- [x] Ana ürün ve türev için hammadde bazlı formül kalemleri (hammadde + miktar + birim + not)
- [x] Formül görüntüleme/düzenleme arayüzü

## Modül 5: Maliyet ve Kar Marjı Hesaplayıcı
- [x] Formülden otomatik hammadde maliyeti hesabı
- [x] Ambalaj + kargo maliyeti girişi
- [x] Satış fiyatı + indirim oranı → net kar, kar marjı %, otomatik hesap
- [x] Ürün bazlı maliyet kayıt/güncelleme

## Modül 6: AI Pazarlama Metin Ajanı
- [x] LLM entegrasyonu (server-side invokeLLM)
- [x] İçerik tipi seçimi: ürün açıklaması / Instagram postu / reklam metni
- [x] Ürün seçimi + ton + ek yönergeler girişi
- [x] Üretilen metinleri kaydetme ve geçmiş listesi, kopyalama

## Modül 7: Kampanya Takvimi
- [x] Kampanya CRUD (ad, ürün grubu, başlangıç/bitiş, indirim oranı, not, durum)
- [x] Aylık takvim görünümü
- [x] Yaklaşan kampanyalar listesi + dashboard'da hatırlatma

## Modül 8: Tedarikçi Rehberi
- [x] Tedarikçi CRUD (firma, ilgili kişi, telefon, e-posta, tedarik ettiği malzemeler, son sipariş tarihi, fiyat notları)

## Modül 9: Dashboard (Kokpit)
- [x] Günlük/toplam sipariş özeti kartları
- [x] Kritik stok uyarı listesi
- [x] Yaklaşan kampanyalar
- [x] Sipariş durum dağılımı ve hızlı erişim linkleri

## Test & Teslim
- [x] Vitest testleri (10 test geçiyor: kar marjı hesabı, kritik stok uyarı mantığı, sipariş durum akışı, auth)
- [x] Ekran görüntüleriyle görsel doğrulama
- [x] Checkpoint + teslim

## Modül 10: Müşteriler & Tahsilat & Giderler (eklendi)
- [x] Müşteriler (CRM): ad/telefon/adres kaydı, sipariş formunda seçince otomatik dolum
- [x] Sipariş ödeme durumu (ödendi/kısmi/bekliyor) + kartta hızlı "Ödendi" + tahsilat toplamı
- [x] Kargo etiketi ve faturaya yapısal müşteri adres/telefon
- [x] Giderler modülü + Kokpit'te bu ay ciro/gider/net kâr
- [x] Komut paleti (⌘K) — sayfa + ürün/sipariş/müşteri/hammadde hızlı arama

## Modül 11: Finans derinleştirme & panoda arama (eklendi)
- [x] Strateji Kâr/Zarar: 30 gün gider + net kâr + tahsil edilecek + uyarılar
- [x] Sipariş panosunda arama (müşteri/no/telefon) + ödeme & kanal filtresi
- [x] Kısmi ödeme tutarı girişi (düzenleme dialogunda "Ödenen Tutar")
- [x] Müşteri kartında sipariş geçmişi özeti (adet, toplam harcama, borç)

## Modül 12: İşlevsellik & finans batch'i (eklendi)
- [x] Asistan/WhatsApp: tahsilat, borçlu müşteri, bu ay ciro/gider/net soru-cevabı (snapshot)
- [x] Giderler: düzenleme + bu ay kategori kırılımı (çubuklar)
- [x] Müşteriler: sipariş geçmişi detay dialogu + WhatsApp linki + başlıkta toplam alacak
- [x] Sipariş panosu: sütun altı toplam + bekleyen tutar; kartta WhatsApp butonu + adres ikonu
- [x] Kokpit: Bekleyen Tahsilatlar kartı (en yüksek borçlu siparişler)
- [x] Ürünler: kartta stok + düşük/sıfır stok renklendirmesi
- [x] Satış Analizi: 30 gün gider / net / tahsilat / kâr marjı KPI'ları

## Modül 13: Ön muhasebe — Kasa & Cari (eklendi, Bizimhesap yönü)
- [x] Kasa & Banka hesapları + güncel bakiye (açılış + gelen − giden)
- [x] Birleşik para hareketleri: tahsilat / ödeme / gelir / gider (+ hesaba işleme)
- [x] Müşteri cari ekstresi (sipariş=borç, tahsilat=alacak, yürüyen bakiye)
- [x] Karttan "Tahsilat Ekle" → siparişin ödeme durumu otomatik güncellenir
- [x] Kokpit'te Kasa/Banka bakiye kartı + asistan snapshot'ta kasa bakiyesi

## Modül 14: Kayda girmemiş tamamlanmış işler (15.07.2026 takım denetiminde eklendi)
- [x] Geliştirme panosu (/gelistirme): 5 adımlı fikir→ürün akışı (devProjects/devTrials/devTrialItems tabloları)
- [x] Görevler & Alışveriş Listesi (/gorevler, tasks tablosu)
- [x] Şablon kütüphanesi (/sablonlar): ambalaj/renk/set-paket şablonları (templates tablosu)
- [x] Alış Faturaları (/faturalar): purchases/purchaseItems + AI fatura okuma
- [x] Sidebar menü gruplama + native confirm'lerin AlertDialog'a (ConfirmDialog) dönüşümü
- [x] Üretim planlayıcı + toplu fiyat güncelleme + etiket baskısı

## Rakip paritesi için yol haritası (Bizimhesap + Qukasoft'u geçmek)
Ön muhasebe (Bizimhesap):
- [x] Tedarikçi carisi (alış faturaları → borç, ödeme → alacak, ekstre + bakiye)
- [x] Kasa/banka: hesaplar arası transfer
- [x] KDV raporu (satış/alış KDV özeti, bu ay/bu yıl)
- [x] Müşteri cari bakiyesi tahsilatları da içerir (customers.balances)
- [x] Tahsilat/Ödeme makbuzu yazdırma (printReceipt) — Accounts + Purchases'ta kullanılıyor
- [x] Cari Hesaplar genel bakış sayfası (/cari) — alacak/borç/net
- [x] Nakit Akışı raporu (Strateji sekmesi) — giriş/çıkış/net + kategori
- [x] Çek/senet takibi (/cek-senet) — portföy, vade, durum, vadesi geçen uyarısı (cheques tablosu)
- [ ] Teklif (quote) → siparişe dönüştürme; ürün/hizmet ayrımı (kodda hiç iz yok)
- [ ] e-Fatura/e-Arşiv entegratörü (Foriba/İzibiz/Uyumsoft) — dış servis + anlaşma gerekir;
      şu an yalnızca bilgi/proforma faturası basılıyor (invoice.ts)
Pazaryeri (Qukasoft):
- [ ] Hepsiburada stok/fiyat gönderme + "Servis Anahtarı" desteği (Trendyol push'una simetrik; şu an sadece sipariş çekme var)
- [ ] N11 + Çiçeksepeti entegratörleri (sipariş çekme + stok/fiyat) — iskelet yok
- [ ] Komisyon/kesinti bazlı net kâr raporu (pazaryeri bazında) — KISMEN: tekil hesaplayıcı var (Costs.tsx marketplaceNet), toplu rapor yok
- [ ] İade yönetimi (Returned/Cancelled siparişler şu an sessizce atlanıyor) + müşteri soru-cevap yönetimi
- [ ] Sıfırdan ürün açma (kategori/marka/özellik/görsel) — çoklu pazaryeri

## YENİ ÖNCELİK — Fiyatlandırma & kâr hızlandırma paketi (15.07.2026, patron kararı)
Asistan yazma komutları (aşağıda 2. madde) ertelendi; önce işleyişi hızlandıran
fiyat/kâr araçları gelecek. Araştırma bulguları: tekil hesaplayıcı var (Costs.tsx,
tek ürün seç → kaydet), toplu güncelleme sadece yüzde zam/indirim (bulkUpdatePrices),
Excel/CSV İÇE aktarım yok (sadece dışa aktarım var), Trendyol fiyat push var,
Hepsiburada push yok, web sitesi (Qukasoft) entegrasyonu yok.

- [ ] F1. **Fiyat & Kâr tablosu:** tüm ürünler tek tabloda — formülden hammadde
      maliyeti + ambalaj + kargo = toplam maliyet, mevcut fiyat, komisyon/KDV
      varsayımıyla net kâr ve marj %; sıralama/filtre (zararına satılanlar üste),
      satırda fiyat düzenleme. Server'da tek sorguda toplu maliyet endpoint'i.
- [ ] F2. **Formülle toplu fiyatlama:** hedef marj % / çarpan / sabit tutar gir →
      önerilen fiyatlar + psikolojik yuvarlama (örn. ,90'a); önizleme (eski→yeni
      diff) → onayla → toplu uygula (bulkPrice genişletilir: percent'e ek modlar).
- [ ] F3. **Excel/CSV ile fiyat güncelleme:** mevcut katalog dışa aktarımının
      simetriği — barkod/ID + yeni fiyat sütunlu dosya yükle → eşleşme + diff
      önizlemesi → onayla → uygula (hatalı satırlar raporlanır).
- [ ] F4. **Değişen fiyatı kanallara yansıtma:** güncelleme sonrası tek tıkla
      Trendyol'a push (mevcut pushTrendyolStockPrice); Hepsiburada stok/fiyat
      push eklenmeli (eski 3. madde buraya bağlanır). Web sitesi: Qukasoft'un
      API'si/toplu içe aktarımı araştırılacak; yoksa F3 formatında CSV üret.
- [ ] F5. **Pazaryeri komisyon profilleri:** kanal başına komisyon/kesinti
      varsayılanları kaydedilir; F1 tablosu ve toplu net kâr raporu (eski 6.
      madde) bunları kullanır.

## Açık işler — 15.07.2026 takım denetimi (öncelik sırasıyla)
1. [x] GÜVENLİK: WhatsApp POST webhook'una X-Hub-Signature-256 (HMAC, timingSafeEqual)
       imza doğrulaması eklendi — `WHATSAPP_APP_SECRET` tanımlıysa sahte istek 401 alır,
       tanımsızsa eski davranış + açılış uyarısı. 6 birim testi. **Render'a
       `WHATSAPP_APP_SECRET` girilmeli** (Meta → Settings → Basic → App Secret).
2. [ ] (ERTELENDİ — önce fiyatlandırma paketi) Asistan yazma intent'leri: "gider ekle" /
       "tahsilat aldım" (claude.ts intent enum + assistant.ts handler; altyapı hazır)
3. [ ] Hepsiburada stok/fiyat gönderme + HEPSIBURADA_SERVICE_KEY env desteği
4. [ ] Finans birim testleri: vatReport, customer/supplierBalances, tahsilat→sipariş
       ödeme senkronu, kasa bakiyesi, senkron tek-uçuş kilidi (38/38 test geçiyor ama
       bunları kapsamıyor; DB'ye gömülü mantık saf fonksiyona çıkarılmalı)
5. [ ] Ürünlerde kritik stok eşiği alanı (products.criticalQty) + düşük stok filtresi
       (şu an Products.tsx'te sabit eşikli renklendirme var, yapılandırılamıyor)
6. [ ] Pazaryeri bazında toplu net kâr raporu (yapı taşları hazır)
7. [ ] AI görsel üretimi: _core/imageGeneration.ts hazır ama hiçbir router'a bağlı
       değil — kullanıcı talebiyle modül olarak bağlanacak

## Canlıda (Render) doğrulama bekleyenler — kod tarafı hazır
- [ ] Trendyol: "Bağlantıyı Test Et" HTTP 200 + sipariş akışı + "Trendyol'a Gönder" (stok/fiyat)
- [ ] Trendyol resmi kargo etiketi (ZPL→Labelary→PDF; kargo takip no dolunca)
- [ ] Hepsiburada API onayı → anahtarlar Render'a → bağlantı testi (mevcut 401 = kimlik eksikliği, kod hatası değil)
- [ ] Sesli uyandırma: Picovoice AccessKey ile canlı test (iki motor da kodda mevcut)
