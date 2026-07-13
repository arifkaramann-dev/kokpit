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

## Rakip paritesi için yol haritası (Bizimhesap + Qukasoft'u geçmek)
Ön muhasebe (Bizimhesap):
- [x] Tedarikçi carisi (alış faturaları → borç, ödeme → alacak, ekstre + bakiye)
- [x] Kasa/banka: hesaplar arası transfer
- [x] KDV raporu (satış/alış KDV özeti, bu ay/bu yıl)
- [x] Müşteri cari bakiyesi tahsilatları da içerir (customers.balances)
- [x] Tahsilat/Ödeme makbuzu yazdırma (printReceipt)
- [x] Cari Hesaplar genel bakış sayfası (/cari) — alacak/borç/net
- [x] Nakit Akışı raporu (Strateji sekmesi) — giriş/çıkış/net + kategori
- [x] Çek/senet takibi (/cek-senet) — portföy, vade, durum, vadesi geçen uyarısı
- [ ] e-Fatura/e-Arşiv (entegratör — dış servis + anlaşma)
- [ ] Teklif (quote) → siparişe dönüştürme; ürün/hizmet ayrımı
- [ ] e-Fatura/e-Arşiv (entegratör: Foriba/İzibiz/Uyumsoft) — dış entegrasyon
- [ ] Çek/senet takibi, tahsilat/ödeme makbuzu yazdırma
Pazaryeri (Qukasoft):
- [ ] N11 + Çiçeksepeti entegratörleri (sipariş çekme + stok/fiyat)
- [ ] Komisyon/kesinti bazlı net kâr raporu (pazaryeri bazında)
- [ ] İade yönetimi, müşteri soru-cevap yönetimi
- [ ] Sıfırdan ürün açma (kategori/marka/özellik/görsel) — çoklu pazaryeri

## Modül 14: İş Zekâsı — Kârlılık & Müşteri (eklendi)
- [x] Ürün kârlılığı: ciro − (reçete + ambalaj + kargo) → ürün bazında kâr/marj (son 90 gün)
- [x] "Fiyatı gözden geçir" uyarısı: zarar eden / düşük marjlı (%15 altı) ürünler ayrı liste
- [x] Maliyet kapsamı: adı reçeteyle eşleşmeyen satışlar "maliyeti bilinmiyor" işaretlenir (toplam sessizce yanılmaz)
- [x] Müşteri zekâsı: en değerli müşteriler (harcama/sipariş/alacak) + bu ay yeni müşteriler
- [x] "Uykuda müşteriler" (60+ gün sipariş yok, değere göre) + tek tık WhatsApp "geri kazan" mesajı
- [x] Analiz ekranı sekmeli: Satış / Kârlılık / Müşteriler
- [x] Kokpit ana sayfada "En Kârlı Ürünler" + "Uykuda Müşteriler" kartları
- [x] Asistan/WhatsApp: "en kârlı ürünüm ne?", "kim uzun süredir sipariş vermedi?" (snapshot'a eklendi)
- [x] Saf, test edilmiş motor: `shared/analytics.ts` + `server/analytics.test.ts` (11 test)

## Modül 15: İşlem bütünlüğü — DB transaction'ları (eklendi)
- [x] `adjustStock`: stok hareketi + bakiye güncellemesi atomik (transaction)
- [x] `deductStockBatch`: üretimde çok hammadde düşümü tek transaction'da (kısmi düşüm olmaz)
- [x] `transferBetweenAccounts`: çıkış + giriş atomik (para "kaybolmaz")
- [x] `createPurchase`: fatura + hammadde + stok hareketi + kalemler atomik
- [x] `replaceOrderItems`: sil + ekle atomik (sipariş kalemsiz kalmaz)
- [x] Üretim planı saf fonksiyona ayrıldı: `planProduction` (productUtils) + `server/production.test.ts` (5 test)

## Sonraki Oturuma Ertelenenler (opsiyonel geliştirmeler)
- AI görsel üretimi modülü (ürün fotoğrafı arka plan değiştirme) — kullanıcı talebiyle eklenecek
- Asistanla sesli "gider ekle" / "tahsilat aldım" komutu (parseVoiceCommand intent)
- Ürünlerde kritik stok eşiği alanı + düşük stok filtresi
