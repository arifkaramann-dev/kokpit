# 🤖 AI Lab

> Kalıcı sohbet: **yapay zekâ & otomasyon**. Bu dosya bu kurulun tüzüğü + hafızasıdır.
> Komut: `/ai-lab`. Üst belge: `.claude/KURULLAR.md`.

**Lider:** `ai-otomasyon-muhendisi`.

## Kapsam (sadece bunlar)

- **Uygulama içi asistan & tool-use ajanı** (`server/assistant.ts`, `server/assistantAgent.ts`): araçlar, onay katmanı, intent düşüşü.
- **WhatsApp botu** (`server/whatsapp.ts`): webhook, mesaj akışı, tanı.
- **Sesli asistan / uyandırma** ("Hey Kokpit", Web Speech / Picovoice).
- **LLM entegrasyonu** (Anthropic SDK): fatura okuma, pazarlama metni, ürün açıklaması/etiket üretimi, görsel üretimi.
- **Zamanlayıcı nöbetçileri** (`server/scheduler.ts`): oto-senkron, Stok Nöbetçisi, Sabah Brifingi, Tahsilat Takipçisi, soru-cevap oto-cevap.
- **Akıllı öneriler:** yeniden sipariş, üretim önerisi, güven-koşullu oto-cevap eşiği.
- **Ajan takımının evrimi:** `.claude/agents/*` ve bu kurul yapısının kendisini geliştirmek (meta — CLAUDE.md Takım Geliştirme Protokolü).

## Kapsam DIŞI (ilgili kurula devret)

- Hangi AI özelliği öncelikli → **🏛 Ürün Kurulu**
- LLM çağrısının altyapısı/gizli anahtar/performans → **💻 Teknik Kurul**
- Asistan arayüzü / sesli UI görünümü → **🎨 UX Lab** (etkileşim mantığı burada)
- Onaylı AI özelliğinin kodlanması/testi → **🚀 Yapımcı**
- Para etkileyen asistan komutları (gider/tahsilat) → `finans-muhasebe-uzmani` onayı

## Girdi (okunacak kaynaklar)

`server/{assistant,assistantAgent,whatsapp,scheduler,reorder}.ts`,
`docs/KOKPIT-V2-ANALIZ.md` (Faz 1 AI çekirdeği), `SESLI.md`, `WHATSAPP.md`,
`.claude/knowledge/art-of-colour.md`, `DEVAM.md`.

## Çıktı (bu kurul ne üretir)

- AI özelliği tasarımı (araç seti, onay akışı, güven eşiği) + Yapımcı'ya iş fişi.
- Prompt/ajan davranış kararları (karar günlüğüne).
- Takım evrim önerisi (yeni/emekli ajan) → `.claude/TAKIM.md`.

## Çalışma ritmi

AI davranışını değiştiren iş canlıda `ANTHROPIC_API_KEY` ile doğrulanır (dev
ortamı dış servise çıkamaz). Para etkileyen komutlar onay katmanından + finans
onayından geçer. Her sprint sonunda: "Takımda eksik uzmanlık var mı?" sorusu.

## Açık gündem (yaşayan liste)

- [ ] Asistan tool-use ajanı canlı doğrulama (`ANTHROPIC_API_KEY`, `assistant.agentMode`): 8 araç + evet/hayır onay katmanı gerçek WhatsApp/uygulama akışında test.
- [ ] Pazaryeri soru-cevap oto-cevap güven eşiği ayarı: hangi soru sınıfı otomatik, hangisi taslak — canlı veriyle kalibrasyon.
- [ ] Sesli uyandırma canlı test (Picovoice AccessKey; iki motor da kodda — `SESLI.md`).
- [ ] Proaktif nöbetçilerin genişlemesi (V2 Faz 1): yeni brifing/uyarı senaryoları.
- [ ] Meta: kurul yapısı + ajan kadrosu evrim gözden geçirmesi (sprint sonu).

## Karar günlüğü (yaşayan hafıza)

| Tarih | Karar | Gerekçe | Devir |
|---|---|---|---|
| 2026-07-21 | AI Lab kuruldu; ajan takımının kendi evrimi de (meta) bu kurulun kapsamına alındı. | AI/otomasyon hızla büyüyen, kendi bilgi tabanını hak eden bir alan; asistan/sesli/nöbetçi işleri tek kalıcı bağlamda toplanmalıydı. | — |
