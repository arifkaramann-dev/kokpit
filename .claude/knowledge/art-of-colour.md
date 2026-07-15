# Art of Colour — Şirket Bilgi Tabanı

> Bu dosya takımın ortak hafızasıdır. Şirket hakkında öğrenilen her kalıcı
> bilgi buraya işlenir. Birincil bakımcı: `buyume-pazarlama-uzmani`;
> her ajan kendi alanındaki bölümü güncelleyebilir. Tahmin yazma —
> yalnızca doğrulanmış bilgi ekle ve tarih düş.

## Şirket

- **Marka:** Art of Colour — butik Türk boya markası
- **Ürün alanları:** oto rötuş boyası, airbrush boyaları, hobi boyaları
- **Ölçek:** tek kişilik / küçük işletme (esnaf); tek kullanıcılı sistem
- **E-posta:** artofcolourresmi@gmail.com
- **Canlı sistem:** https://artofcolour-kokpit.onrender.com/ (Render ücretsiz plan)

## Müşteri profili

- Oto rötuş yapan ustalar ve son kullanıcılar (renk kodu ile arama yaparlar)
- Airbrush sanatçıları
- Hobi/maket boyacıları
- Dil: samimi, pratik, usta işi; kurumsal jargon yok

## Satış kanalları

- Trendyol (aktif entegrasyon; siparişler "ödendi" sayılır)
- Hepsiburada (entegrasyon hazır, API onayı bekliyor — panel üzerinden
  "API Entegrasyon İşlemleri" talebi süreci)
- Elden/doğrudan satış (WhatsApp ağırlıklı iletişim)
- Planlanan: N11, Çiçeksepeti

## Ürün yapısı

- Ana ürün → türevler: yüzey × ambalaj × renk × set/paket kombinasyonları
- Her türevin bağımsız formülü (reçetesi) var: pigment/solvent bazlı
- Hammadde kategorileri: pigment, solvent, şişe, etiket, diğer
- Ürün görselleri herkese açık linkle servis edilir: `/api/img/{id}/{tür}`

## Rakipler / kıyas alınan ürünler

- **Bizimhesap:** ön muhasebe paritesi hedefi (cari, kasa, KDV, çek/senet —
  büyük ölçüde tamamlandı; eksik: e-Fatura entegratörü, teklif→sipariş)
- **Qukasoft:** pazaryeri yönetimi paritesi hedefi (eksik: N11/Çiçeksepeti,
  komisyon bazlı net kâr, iade yönetimi, sıfırdan ürün açma)

## Operasyon alışkanlıkları

- Kargo etiketi 10×15 cm, Code 128 barkodlu; Trendyol'da resmi ZPL etiket tercih
- Ödeme takibi kritik: tahsil edilecekler ve borçlu müşteriler yakından izlenir
- Asistan/WhatsApp üzerinden finans soru-cevabı aktif kullanılıyor
- Sesli uyandırma ("Hey Kokpit") opt-in özellik

## Öğrenilecekler (boşluklar)

- Ürün serilerinin adları ve fiyat aralıkları (canlı veriden öğrenilecek)
- En çok satan ürünler/renk kodları
- Üretim süreç detayları (parti büyüklüğü, kuruma/dolum süreçleri)
- Sık müşteri soruları (asistan loglarından derlenebilir)
