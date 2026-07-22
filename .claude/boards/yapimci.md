# 🚀 Yapımcı (Builder)

> Kalıcı sohbet: **uygulama**. Bu dosya bu kurulun tüzüğü + hafızasıdır.
> Komut: `/yapimci`. Üst belge: `.claude/KURULLAR.md`.

**Orkestratör:** `proje-yoneticisi` (çok modüllü işi böler) → **uygulayıcılar:**
`backend-gelistirici`, `frontend-gelistirici`, `veritabani-mimari`,
`pazaryeri-entegratoru`, alan uzmanları. **Zorunlu durak:** `qa-test-uzmani`.

## Kapsam (sadece bunlar)

- **Onaylı iş fişini uygulamak:** başka kurulda alınmış karar → kod.
- Kod yazma, migration üretme, test yazma/çalıştırma, PR/teslim hazırlama.
- Doğrulama: `pnpm check` / `pnpm test` / `pnpm build` (riske göre).
- `DEVAM.md` güncelleme (ne yapıldı, ne doğrulandı, ne canlıda test edilmeli).

## Kapsam DIŞI (kurala uy)

- **Strateji/öncelik kararı verme** → 🏛 Ürün Kurulu'na sor.
- **Mimari/refactor yönü kararı** → 💻 Teknik Kurul'a sor.
- **Ekran akışı/IA kararı** → 🎨 UX Lab'a sor.
- **AI davranış/güven eşiği kararı** → 🤖 AI Lab'a sor.
- Not: küçük/tek dosyalık, belirsizliği olmayan işlerde iş fişi töreni şart
  değil — doğrudan uygula, kredi israf etme. Belirsizlik varsa ilgili kurula dön.

## Girdi (okunacak kaynaklar)

İlgili kuruldan gelen **iş fişi** (başlık/neden/kapsam/kabul kriteri/riskler),
`DEVAM.md`, `todo.md`, ilgili modül dosyaları. Teknik komutlar/ortam kısıtları:
`CLAUDE.md` "Teknik Özet".

## Çıktı (bu kurul ne üretir)

- Çalışan kod + testler + geçen doğrulama.
- PR (yalnızca istenirse) veya belirlenen dala push.
- Teslim raporu: **ne yapıldı · ne doğrulandı · ne canlıda (Render) test edilmeli.**
- Güncellenmiş `DEVAM.md` / `todo.md` işaretleri.

## Çalışma ritmi

1. İş fişini oku, belirsizlik varsa kaynak kurula dön (uydurma).
2. Çok modüllüyse `proje-yoneticisi` böler; paralel işleri paralel başlat.
3. Riskli işte (para/şema/pazaryeri/yarış) `qa-test-uzmani` zorunlu; küçük işte `pnpm check`.
4. Teslim + üç maddelik rapor + hafıza güncelle.

## Açık gündem (yaşayan liste)

> Onaylı iş fişleri buraya düşer. Canlı doğrulama bekleyen kod-hazır işler:

- [ ] Trendyol: "Bağlantıyı Test Et" 200 + sipariş akışı + "Trendyol'a Gönder" (canlı, anahtar Render'da).
- [ ] Hepsiburada: API onayı → anahtar Render'a → bağlantı testi (401 = kimlik eksikliği, kod hatası değil).
- [ ] Trendyol resmi kargo etiketi (ZPL→Labelary→PDF) canlı doğrulama.
- [ ] N11 + Çiçeksepeti canlı bağlantı testleri (anahtar bekliyor).
- [ ] Sesli uyandırma canlı test (Picovoice AccessKey).

## Karar günlüğü (yaşayan hafıza)

| Tarih | Karar | Gerekçe | Devir |
|---|---|---|---|
| 2026-07-22 | 1. Kurul toplantısı: en önemli 20 geliştirme oy çokluğuyla sıralandı (tutanak `.claude/boards/KURUL-TOPLANTILARI.md`). Yapımcı oyu: "built vs shipped" açığını kapat — yazılmış kodu (pazaryeri canlı testleri, e-Fatura, kargo etiketi) sahaya indir. İlk 3 madde (e-Fatura, uptime, S3) iş fişine alınacak. | Şirketin ilk ortak önceliklendirmesi; her kurul görüş verdi, ortak karar + fazlama yapıldı. | Faz 1: canlı doğrulama kuyruğu |
| 2026-07-21 | Yapımcı kuruldu; "yalnızca onaylı iş fişini uygular" ilkesi netleşti. | Uygulama (kod/test/PR) ile karar (strateji/mimari/akış) ayrıştı; her kurul kendi bağlamını korurken tek bir seri-üretim şeridi oluştu. | — |
