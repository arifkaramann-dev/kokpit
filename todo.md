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

### Öncelik 1 — Uygulama içi (TAMAMLANDI ✅ 2026-07)
- [x] **P1.1 Ürün kritik stok eşiği + düşük stok filtresi**
      products.criticalStock (migration 0016); Ürünler'de eşik girişi + "Düşük stok"
      filtre/sayaç + kart rozeti; Kokpit'te "Düşük Stoklu Ürünler" kartı.
- [x] **P1.2 Sesli/WhatsApp "gider ekle" / "tahsilat aldım" komutları**
      parseVoiceCommand'a expense_add + collection_add; gider → Giderler + kasa çıkışı,
      tahsilat → müşterinin en yüksek borçlu siparişine + kasa girişi. (5 test)
- [x] **P1.3 Teklif (quote) → siparişe dönüştürme**
      quotes/quoteItems (migration 0017); /teklifler sayfası, yazdırılabilir teklif,
      durum akışı, tek tıkla siparişe dönüştürme (convertedOrderId).
- [x] **P1.4 Pazaryeri komisyon bazlı net kâr raporu**
      Ayarlar'da komisyon oranı; Satış Analizi'nde brüt−komisyon−ürün maliyeti = net
      tablosu (son 90 gün). (4 test)

### Öncelik 2 — Pazaryeri entegrasyonları (kod TAMAM ✅, canlıda anahtarla doğrulanmalı)
- [x] **P2.1 N11 entegratörü** — server/n11.ts: sipariş çekme + stok/fiyat + test. (kod)
- [x] **P2.2 Çiçeksepeti entegratörü** — server/ciceksepeti.ts. (kod, 7 eşleme testi)
- [x] **P2.3 Sıfırdan ürün açma (Trendyol)** — createTrendyolListing + /pazaryeri "Yeni İlan".
- [x] **P2.4 İade yönetimi + müşteri soru-cevap** — /pazaryeri sekmeleri; iade listeleme,
      soru cevaplama (Trendyol claims + qna). (2 test)
  > CANLI DOĞRULAMA GEREKİR: Bu ortam pazaryerlerine çıkamaz. Render'a N11_APP_KEY/SECRET,
  > CICEKSEPETI_API_KEY girilip Ayarlar > "Bağlantıyı Test Et" ile doğrulanmalı. Ürün açma ve
  > iade/soru akışları gerçek API alan adlarıyla ilk canlı denemede teyit edilmeli.

### Öncelik 3 — e-Fatura (temel TAMAM ✅, entegratör sözleşmesi kullanıcıda)
- [x] **P3.1 e-Fatura / e-Arşiv temeli** — server/einvoice.ts: entegratörden bağımsız
      soyutlama, Ayarlar'da entegratör bilgileri, siparişten KDV dökümlü fatura üretip
      yapılandırılmış gateway'e gönderme, sipariş kartında "e-Arşiv Gönder". (4 KDV testi)
  > KALAN: Kullanıcının GİB onaylı bir entegratörle (İzibiz/Uyumsoft/Foriba) sözleşmesi +
  > API adresi/kimlik bilgisi girmesi gerekir. Entegratör seçilince o entegratörün alan
  > eşlemesi einvoice.ts `buildProviderPayload` içinde netleştirilir.

### Opsiyonel / talep gelirse
- [ ] AI görsel üretimi (ürün fotoğrafı arka plan değiştirme)
