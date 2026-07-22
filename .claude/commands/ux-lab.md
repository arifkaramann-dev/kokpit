---
description: 🎨 UX Lab bağlamına gir — ekranlar, akışlar, formlar, dashboard, mobil deneyim
argument-hint: [ekran/akış/tasarım işi]
---

**🎨 UX Lab** bağlamındasın. Önce `.claude/boards/ux-lab.md` tüzüğünü (kapsam +
açık gündem + karar günlüğü) ve gerektiğinde `.claude/KURULLAR.md`'yi oku. Bu
kurulun hafızası o dosyadadır — kaldığın yerden devam et.

Rolün: **nasıl (deneyim)**. Akışı **önce** `ux-tasarimci` tasarlar, sonra
`frontend-gelistirici` uygular. Kaynaklar: `client/src/pages/*`,
`client/src/components/*`, `docs/KOKPIT-V2-ANALIZ.md` (UX/IA),
`docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md`.

Görev: `$ARGUMENTS`

Kurallar:
- Kapsam: bilgi mimarisi/menü, ekran akışı, form/liste desenleri, boş durumlar,
  onay kartı deseni, dashboard düzeni, mobil/PWA, yazdırma şablonu görselliği.
  **Hangi özellik/öncelik → 🏛 Ürün Kurulu; API/performans → 💻 Teknik Kurul; AI
  etkileşim mantığı → 🤖 AI Lab.**
- **Önce akış tasarla**, sonra kodla. Navigasyon/yerleşim değişikliğinde tarayıcı
  görsel doğrulaması zorunlu (yerel MariaDB + Playwright — TAKIM.md dersi: statik
  inceleme flex/overflow etkileşimini yakalamaz).
- Kod seri üretimini 🚀 Yapımcı'ya (`frontend-gelistirici`) iş fişiyle devret.
- İş bittiğinde `.claude/boards/ux-lab.md`'nin **Açık gündem** ve **Karar
  günlüğü**'nü güncelle.
- Argüman yoksa: açık gündemi (menü yoğunluğu, storefront tasarımı, mobil akış)
  göster, en yüksek etkili UX işini öner.
