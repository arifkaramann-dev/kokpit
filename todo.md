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

## Rakip paritesi — TAMAMLANANLAR (Bizimhesap ön muhasebe)
- [x] Tedarikçi carisi (alış faturaları → borç, ödeme → alacak, ekstre + bakiye)
- [x] Kasa/banka: hesaplar arası transfer
- [x] KDV raporu (satış/alış KDV özeti, bu ay/bu yıl)
- [x] Müşteri cari bakiyesi tahsilatları da içerir (customers.balances)
- [x] Tahsilat/Ödeme makbuzu yazdırma (client/src/lib/receipt.ts)
- [x] Cari Hesaplar genel bakış sayfası (/cari) — alacak/borç/net
- [x] Nakit Akışı raporu (Strateji sekmesi) — giriş/çıkış/net + kategori
- [x] Çek/senet takibi (/cek-senet) — portföy, vade, durum, vadesi geçen uyarısı

## AÇIK İŞLER — E-Ticaret Eksikleri (2026-07 gözden geçirildi)
Her madde "Bitti sayılır" ölçütüyle tanımlı. Öncelik sırası: önce dış anlaşma
gerektirmeyen, uygulama içinde bitirilebilen hızlı kazanımlar.

### Öncelik 1 — Uygulama içi, dış servis gerektirmez (hemen yapılabilir)
- [ ] **P1.1 Ürün kritik stok eşiği + düşük stok filtresi**
      Neden: Ürünlerin stok uyarısı yok; ne zaman üretim/alım yapılacağı görünmüyor.
      Kapsam: products tablosuna `criticalStock` alanı; Ürünler sayfasında eşik girişi,
      "Düşük stok" filtre butonu, kartta eşik-altı kırmızı rozet; Kokpit'te sayaç.
      Bitti sayılır: eşik girilen bir ürün stoğu eşiğin altına düşünce hem Ürünler'de
      hem Kokpit'te uyarı görünür; filtre sadece eşik-altı ürünleri listeler.
- [ ] **P1.2 Sesli/WhatsApp "gider ekle" ve "tahsilat aldım" komutları**
      Neden: parseVoiceCommand'da sale/stock/task var ama gider ve tahsilat intent'i yok.
      Kapsam: parseVoiceCommand'a `expense_add` ve `collection_add` intent'leri;
      assistant.ts'te bu intent'lerin işlenmesi (gider kaydı + kasa hareketi / siparişe tahsilat).
      Bitti sayılır: "reklama 500 lira harcadım" → gider + kasa çıkışı; "Ahmet 200 lira ödedi"
      → ilgili müşteri/siparişe tahsilat + kasa girişi; testleri geçer.
- [ ] **P1.3 Teklif (quote) → siparişe dönüştürme**
      Neden: Müşteriye önce fiyat teklifi verilip onaylanınca siparişe çevirmek gerekiyor.
      Kapsam: `quotes` tablosu (müşteri, kalemler, geçerlilik tarihi, durum: taslak/gönderildi/kabul/red);
      yazdırılabilir teklif; "Siparişe Dönüştür" butonu tek tıkla order oluşturur.
      Bitti sayılır: teklif oluştur → yazdır → kabul edildi işaretle → sipariş otomatik açılır,
      kalemler ve tutar kopyalanır.
- [ ] **P1.4 Pazaryeri komisyon/kesinti bazlı net kâr raporu**
      Neden: Trendyol/HB satışında komisyon+kargo düşülünce eldeki net belirsiz.
      Kapsam: pazaryeri bazında komisyon oranı ayarı; sipariş bazında (satış − komisyon −
      kargo − ürün maliyeti) = net; Analiz'de pazaryeri kırılımlı net kâr tablosu.
      Bitti sayılır: bir Trendyol siparişinde komisyon düşülmüş net kâr doğru hesaplanır;
      Analiz'de pazaryeri bazında toplam net kâr görünür.

### Öncelik 2 — Pazaryeri entegrasyonları (canlıda API anahtarı gerektirir)
- [ ] **P2.1 N11 entegratörü** — sipariş çekme + stok/fiyat gönderme
      (mevcut Trendyol/Hepsiburada deseni: server/n11.ts + marketplace.ts'e ekleme).
      Bitti sayılır: "Bağlantıyı Test Et" 200 döner; siparişler çekilir; stok/fiyat push çalışır.
- [ ] **P2.2 Çiçeksepeti entegratörü** — sipariş çekme + stok/fiyat gönderme
      (aynı desen: server/ciceksepeti.ts).
- [ ] **P2.3 Sıfırdan ürün açma (çoklu pazaryeri)**
      Kategori/marka/özellik/görsel ile pazaryerinde yeni ilan açma.
      Bitti sayılır: bir üründen seçilen pazaryerine ilan taslağı gönderilir.
- [ ] **P2.4 İade yönetimi + müşteri soru-cevap**
      Pazaryeri iade taleplerini çekip listeleme; müşteri sorularını görüntüleme/yanıtlama.

### Öncelik 3 — Dış entegratör anlaşması gerektirir (araştırma + sözleşme)
- [ ] **P3.1 e-Fatura / e-Arşiv entegrasyonu** (Foriba / İzibiz / Uyumsoft)
      GİB onaylı bir entegratörle anlaşma + API entegrasyonu gerekir; kod ikinci adım.
      Bitti sayılır: kesilen fatura entegratör üzerinden e-Arşiv olarak iletilir.

### Opsiyonel / talep gelirse
- [ ] AI görsel üretimi (ürün fotoğrafı arka plan değiştirme)
