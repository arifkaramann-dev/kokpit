# Yönetim Kurulu — Toplantı Günlüğü

> Haftalık kurul toplantıları. Bakımcı: `yonetim-kurulu`. En yeni en üstte.
> Şablon ve kurallar: `.claude/YONETIM-KURULU.md`.

---

## Toplantı — 2026-07-21 (Kuruluş Toplantısı)

- **Bu hafta ne geliştirildi:** Yönetim Kurulu yönetişim katmanı kuruldu —
  tüzük (`.claude/YONETIM-KURULU.md`), orkestratör ajan (`yonetim-kurulu`),
  rakip takip sistemi ve bu toplantı günlüğü. İcra tarafında (kod) referans
  taban: 31 tablo, 30 sayfa, 4 pazaryeri, 252/252 test
  (`docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md`).
- **En büyük teknik risk:** Kod değil, **operasyon**. Render free plan uykuya
  dalınca zamanlayıcı ölüyor → oto-senkron, Stok Nöbetçisi, Sabah Brifingi,
  Tahsilat Takipçisi sessizce duruyor. **Uptime monitörü hâlâ kurulmadı — tek
  başına en yüksek etkili iş** (DevOps koltuğu).
- **En büyük ürün riski:** Geniş bir yüzey (4 pazaryeri, e-Fatura, Geliver,
  PayTR, sesli) kod tarafı hazır ama **canlıda doğrulanmadı**; "hazır"la
  "kanıtlı" arası fark kullanıcı güvenini riske atıyor (CEO + COO).
- **En büyük UX problemi:** Menüde 5 grup / 28 öğe; işlev çakışması (Maliyet & Kâr
  ↔ Fiyat & Kâr Motoru). Ana pano bilgi gösteriyor ama **"bugün ne yapmalıyım"ı
  söylemiyor** (CPO + UX koltuğu).
- **En büyük fırsat:** Kendi web mağazası (storefront) — en yüksek marjlı kanal;
  PayTR + domain + SEO ile canlıya alınırsa doğrudan **para kazandırır** (öncelik 1).
- **Rakipler bu hafta ne yaptı / geride miyiz:** İzleme listesi yeni tanımlandı
  (bkz. `RAKIP-TAKIP.md`). Taban: Bizimhesap ~%75, Quka ~%45 parite. Dikey
  boya+pazaryeri+muhasebe kesişiminde **öndeyiz**; genel ERP derinliğinde geride.
- **Kullanıcılar neden bizi tercih etsin:** Boya üreten esnaf için tek dikey
  işletim sistemi — üretim/formül × pazaryeri × ön muhasebe × AI asistan tek
  panoda; genel ERP'ler ağır, pazaryeri araçları muhasebesiz.
- **Bu hafta neyi yanlış yaptık:** "Kod hazır"ı "iş bitti" saymaya meyilliyiz;
  canlı doğrulama ve ölçüm (North Star telemetrisi) borç olarak birikti.
- **North Star durumu:** Henüz sistematik ölçüm yok. İlk iş N1 (sipariş tamamlama
  süresi), N5 (otomasyonla kazanılan süre) ve N7 (kritik hata oranı) için basit
  ölçüm/tahmin tanımlamak.
- **Önümüzdeki haftanın en önemli 10 işi:**
  1. Uptime monitörü kur (zamanlayıcı ölümünü çöz) — DevOps, en yüksek etki.
  2. Ana panoya "bugün ne yapmalıyım" aksiyon şeridi — CPO/UX.
  3. Web mağaza canlı yol haritası: domain + PayTR + SEO kontrol listesi.
  4. Menü sadeleştir + Maliyet/Fiyat çakışmasını çöz — UX.
  5. Sipariş listesine sayfalama (pazaryeri hacmi darboğazı) — CTO/DB.
  6. N1/N5/N7 için basit ölçüm tanımı — Kurul + AI Architect.
  7. Trendyol Soru-Cevap oto-cevabını canlıda doğrula — COO.
  8. Ölü kod temizliği (ComponentShowcase ~1.437 satır) — CTO, düşük risk.
  9. Alış faturasından hammadde maliyet güncelleme (A3 açığı) — Finans/Ürün.
  10. İlk derin rakip taraması (Bizimhesap + Quka yeni özellikler) — ERP Danışmanı.

> **Not:** Bu maddeler öneridir; icra sırası ana oturum (CTO) tarafından
> önceliklendirilir. Her biri geliştirmeye alınmadan Altın Kural kapısından geçer.
