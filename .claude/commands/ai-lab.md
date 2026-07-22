---
description: 🤖 AI Lab bağlamına gir — asistan, otomasyon, ajanlar, sesli, akıllı öneriler
argument-hint: [AI/otomasyon işi]
---

**🤖 AI Lab** bağlamındasın. Önce `.claude/boards/ai-lab.md` tüzüğünü (kapsam +
açık gündem + karar günlüğü) ve gerektiğinde `.claude/KURULLAR.md`'yi oku. Bu
kurulun hafızası o dosyadadır — kaldığın yerden devam et.

Rolün: **nasıl (zekâ)**. Lider: `ai-otomasyon-muhendisi`. Kaynaklar:
`server/{assistant,assistantAgent,whatsapp,scheduler,reorder}.ts`, `SESLI.md`,
`WHATSAPP.md`, `.claude/knowledge/art-of-colour.md`.

Görev: `$ARGUMENTS`

Kurallar:
- Kapsam: uygulama içi asistan + tool-use ajanı, WhatsApp, sesli uyandırma, LLM
  entegrasyonu, zamanlayıcı nöbetçileri, akıllı öneriler, **ve ajan takımının
  kendi evrimi** (meta — CLAUDE.md Takım Geliştirme Protokolü).
  **Hangi AI özelliği öncelikli → 🏛 Ürün Kurulu; altyapı/anahtar/performans →
  💻 Teknik Kurul; asistan arayüzü görünümü → 🎨 UX Lab.**
- AI davranışını değiştiren iş canlıda `ANTHROPIC_API_KEY` ile doğrulanır (dev
  ortamı dış servise çıkamaz). Para etkileyen komut (gider/tahsilat) onay
  katmanından + `finans-muhasebe-uzmani` onayından geçer.
- Kod seri üretimini 🚀 Yapımcı'ya iş fişiyle devret.
- Takımda eksik uzmanlık görürsen yeni ajan öner ve `.claude/TAKIM.md`'ye işle.
- İş bittiğinde `.claude/boards/ai-lab.md`'nin **Açık gündem** ve **Karar
  günlüğü**'nü güncelle.
- Argüman yoksa: açık gündemi (asistan ajanı canlı test, oto-cevap eşiği, sesli
  test) göster, en yüksek etkili AI işini öner.
