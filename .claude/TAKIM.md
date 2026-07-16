# AI Takım Sicili — Art of Colour Kokpit

Bu dosya takımın kim olduğunu, nasıl çalıştığını ve nasıl evrildiğini kaydeder.
CTO (ana oturum) her sprint sonunda bu dosyayı gözden geçirir.

## Kadro

| Ajan | Uzmanlık | Ne zaman çağrılır |
|---|---|---|
| `proje-yoneticisi` | Orkestrasyon | Çok modüllü/büyük işler: analiz → dağıtım → birleştirme |
| `backend-gelistirici` | tRPC/Express/iş mantığı | server/ altındaki geliştirmeler |
| `frontend-gelistirici` | React/Tailwind/Radix | client/ sayfaları, bileşenler, yazdırma şablonları |
| `veritabani-mimari` | Drizzle/TiDB/migration | drizzle/schema.ts'e dokunan HER iş |
| `pazaryeri-entegratoru` | Trendyol/Hepsiburada/N11 | Pazaryeri API, senkron, kargo etiketi |
| `finans-muhasebe-uzmani` | Ön muhasebe alan bilgisi | Cari/KDV/kasa/çek-senet; para mantığı onayı |
| `ai-otomasyon-muhendisi` | LLM/asistan/WhatsApp/sesli | Asistan, intent, AI modülleri |
| `urun-uretim-uzmani` | Ürün/formül/stok/üretim | Ürün modeli, reçete, maliyet, stok |
| `qa-test-uzmani` | Test/doğrulama | Riskli işlerde zorunlu durak; vitest |
| `guvenlik-denetcisi` | Auth/gizli bilgi/güvenlik | Auth değişiklikleri, periyodik denetim |
| `buyume-pazarlama-uzmani` | SEO/pazarlama/strateji | İçerik, rakip analizi, veri içgörüsü |
| `devops-muhendisi` | Render/deploy/env | Dağıtım, build, env değişkeni işleri |
| `ux-tasarimci` | Bilgi mimarisi/UX desenleri | Yeni modül/ekran akışı tasarımı, menü düzeni, onay kartı desenleri — frontend'den önce |

## Çalışma kuralları

- Orkestratör `proje-yoneticisi`dir; büyük iş önce ona gider.
- Hiçbir ajan başka ajanın uzmanlık işini gereksiz yere yapmaz.
- Zorunlu duraklar: para mantığı → `finans-muhasebe-uzmani` + `qa-test-uzmani`;
  şema → `veritabani-mimari`; auth → `guvenlik-denetcisi`.
- Ortak hafıza: `.claude/knowledge/art-of-colour.md` — öğrenilen şirket
  bilgisi oraya işlenir.
- Küçük işlerde delegasyon zorunlu değil — kredi tasarrufu esastır.

## Evrim protokolü

Her büyük görev öncesi ve her sprint sonunda: "Eksik uzmanlık var mı? Bu iş
tekrarlanacak mı? Kendi bilgi tabanını hak ediyor mu?" — EVET ise yeni ajanı
oluştur ve aşağıdaki günlüğe gerekçesiyle işle. Artık kullanılmayan ajanlar
da aynı şekilde emekli edilir (dosya silinir, günlüğe not düşülür).

### Aday ajanlar (ihtiyaç doğunca kurulacak)

- **e-fatura-entegratoru:** e-Fatura/e-Arşiv işi başlayınca (Foriba/İzibiz/
  Uyumsoft API'leri kendi başına derin bir alan). Şimdilik `finans-muhasebe-uzmani`nde.
- **musteri-deneyimi-uzmani:** Pazaryeri soru-cevap + iade yönetimi modülleri
  yazılınca (Qukasoft paritesi). Şimdilik `pazaryeri-entegratoru` +
  `buyume-pazarlama-uzmani` paylaşıyor.
- **veri-analisti:** Rapor/tahminleme talepleri artarsa (satış tahmini, stok
  optimizasyonu). Şimdilik `buyume-pazarlama-uzmani`nde.

## Evrim günlüğü

| Tarih | Değişiklik | Gerekçe |
|---|---|---|
| 2026-07-16 | Mega Sprint "Satış Döngüsü & Kârlılık": Teklif modülü, mamul kritik stok eşiği, Tahsilat Takipçisi, Kanal Kârlılığı raporu, finans saf fonksiyonları + 27 birim testi. Sprint sonu değerlendirmesi: yeni ajan ihtiyacı YOK — teklif modülü finans+satış kesişimi mevcut kadroyla karşılandı; finans mantığı testle kilitlendiği için onaylı kâr modeli (v2) artık regresyona karşı korumalı. Aday listesi geçerli (e-fatura-entegratoru dış anlaşmayı bekliyor). | Faz 1'in açık maddesi (Tahsilat Takipçisi) ve Bizimhesap/Qukasoft paritesinin en büyük iki eksiği (teklif, kanal bazlı net kâr raporu) kapatıldı; finans birim test borcu ödendi. |
| 2026-07-15 | Kokpit V2 stratejik analizi tamamlandı (`docs/KOKPIT-V2-ANALIZ.md`): mevcut durum, 7 platform karşılaştırması, 30 modüllük değerlendirme, V2 mimarisi, 4 fazlı yol haritası. Yeni ajan: `ux-tasarimci` kuruldu | V2 analizi UX/bilgi mimarisinin tekrarlanan ve sahipsiz bir uzmanlık olduğunu gösterdi (26 maddelik menü, desen tutarsızlığı, onay kartı tasarımı, PWA akışları). Faz 0-3 boyunca her modül yeniden tasarımında frontend'den önce akış tasarımı gerekecek. |
| 2026-07-15 | Ders: menü gruplama görsel hatası (öğeler üst üste) kod incelemesinden kaçtı; kök neden index.css'teki global `.flex{min-height:0}` kuralıydı. `qa-test-uzmani` risk tablosu güncellendi: yerleşim/navigasyon değişikliği artık tarayıcı görsel doğrulaması ister (yerel MariaDB + Playwright akışı kuruldu). | Statik kod incelemesi flex/overflow etkileşimlerini yakalayamıyor; görsel hatalar ancak render edilince görülür. |
| 2026-07-15 | İlk takım denetimi: QA + finans/ürün + pazaryeri/AI paralel incelemesi; DEVAM.md ve todo.md açık işleri kanıta dayalı yenilendi | Bulgular: sağlık ✅ (0 tip hatası, 38/38 test, kod içi borç yok), WhatsApp webhook imza eksiği (güvenlik), 6 kayda girmemiş tamamlanmış modül, 2 mükerrer/eskimiş todo maddesi. Yeni ajan ihtiyacı çıkmadı; aday listesi geçerli. |
| 2026-07-15 | Kuruluş: 12 ajanlık çekirdek kadro oluşturuldu | AI Team Evolution Protocol — tek geliştiricili yapıdan AI yazılım organizasyonuna geçiş. Kadro, projenin fiili modüllerinden türetildi: sunucu/arayüz/DB üçlüsü, iki alan uzmanlığı (finans, ürün/üretim), iki entegrasyon alanı (pazaryeri, AI/otomasyon), üç yatay disiplin (QA, güvenlik, DevOps), bir büyüme rolü ve orkestratör. |
