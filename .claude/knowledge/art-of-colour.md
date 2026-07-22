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

## Sistem haritası (kod-doğrulanmış, 2026-07-22 onboarding)

> Aşağıdakiler koddan doğrulandı (tahmin değil). Şirket verisi değil, sistemin
> nasıl çalıştığıdır — yeni sohbet hızlı bağlam alsın diye.

**Mimari:** React 19 + Vite + Tailwind 4 + Radix (client/), tRPC 11 + Express
(server/), Drizzle + MySQL/TiDB (drizzle/, 29 tablo, 23 migration), Anthropic SDK.
tRPC ~35 router, 5 domain modülü (`server/modules/urun|satis|finans|pazarlama|sistem`)
+ barrel `routers.ts`. Yetki: `publicProcedure` / `protectedProcedure` /
`adminProcedure` (rol user|admin). Tek sahip (patron) girişi: OWNER_EMAIL/PASSWORD,
JWT cookie (jose), 30 gün TTL + `auth.logoutAll`. 32 sayfa; `/magaza` giriş
gerektirmez (public storefront), gerisi DashboardLayout altında korumalı.

**Kâr modeli parametreleri (`shared/pricing.ts`, finans onaylı):** KDV-hariç baza
indirger, komisyon/ödeme/kargo KDV'sini indirir. Varsayılan kanal profilleri —
Elden: kesintisiz; Web Sitesi: %2,5 ödeme; **Trendyol: %20 komisyon + %0,96 ödeme
+ 12,6₺ işlem + %1 stopaj**; **Hepsiburada: %15 + 10₺ + %1 stopaj**. İşçilik+genel
gider payı: **150₺/saat, 15.000₺/ay genel gider, ~150 adet/ay → 100₺/adet**
(Ayarlar'dan ezilebilir). Trendyol resmi hesaplayıcısıyla kuruş kuruş aynı.

**Entegrasyon haritası:** Pazaryeri (4): Trendyol, Hepsiburada, N11, Çiçeksepeti —
`server/marketplace.ts` ortak yönetim + yarış-durumu kilidi (`syncLock`). e-Fatura:
**Bizimhesap köprüsü** (`efatura.ts`; FirmID bekliyor). Kargo: **Geliver**
(`kargo.ts`; token bekliyor). Ödeme: PayTR (`paytr.ts`). Asistan: uygulama içi +
WhatsApp + sesli, tek kapı `runAssistant` → tool-use ajanı (8 araç, güvenli/onaylı
onay katmanı, `ANTHROPIC_API_KEY` yoksa intent akışına düşer). Sesli uyandırma:
Picovoice/Web Speech.

**Otomasyon (nöbetçiler, `server/scheduler.ts`):** 15 dk pazaryeri oto-senkron +
soru senkronu, 60 dk Stok Nöbetçisi, 08:00 Sabah Brifingi, 09:00 Tahsilat
Takipçisi, 09:00 Çek/Senet Nöbetçisi. Render free uykuya dalınca durur →
`/api/health` uptime monitörü şart. `SCHEDULER_DISABLED=1` ile kapanır.

**İş akışları:** Sipariş new→production→ready→done|cancelled (iptal ciro/cari/KDV
hariç, stok iade). Üretim: reçete (formulaItems) → hammadde düş (stockMovements),
mamul art (productMovements) + productionRuns. Ürün geliştirme: 5 adımlı sihirbaz
(devProjects). Finans: alış→stok+maliyet+indirilecek KDV; satış→ciro+hesaplanan
KDV; cari ID-öncelikli (isim yedek); kasa/banka; çek/senet; KDV raporu; mutabakat.

## Öğrenilecekler (boşluklar)

- Ürün serilerinin adları ve fiyat aralıkları (canlı veriden öğrenilecek)
- En çok satan ürünler/renk kodları
- Üretim süreç detayları (parti büyüklüğü, kuruma/dolum süreçleri)
- Sık müşteri soruları (asistan loglarından derlenebilir)
