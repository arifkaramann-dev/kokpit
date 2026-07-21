# 🏛 Ürün Kurulu (Product Board)

> Kalıcı sohbet: **ürün stratejisi**. Bu dosya bu kurulun tüzüğü + hafızasıdır.
> Komut: `/urun-kurulu`. Üst belge: `.claude/KURULLAR.md`.

**Lider:** `buyume-pazarlama-uzmani` (strateji/rakip) + `proje-yoneticisi` (planlama/önceliklendirme).
**Danışman:** alan uzmanları (finans, ürün/üretim, pazaryeri) fizibilite için çağrılır.

## Kapsam (sadece bunlar)

- **Ne + neden:** hangi özellik/modül, hangi iş değeri, hangi müşteri sorunu.
- **Yol haritası & önceliklendirme:** `todo.md`'nin sahibi; faz sıralaması,
  🔴/🟠/🟡 etiketleri, sprint teması kararı.
- **Rakip analizi & parite:** Bizimhesap, Qukasoft, Odoo, Zoho vb. karşılaştırma;
  boya-dikeyi farklılaşması.
- **Fiyatlandırma/kampanya stratejisi** (iş modeli düzeyinde), pazar konumu.
- **Patron görevleri / dış bağımlılık takibi** (`PATRON-GOREVLERI.md`): iş
  ilerlemesini bekleten dış anahtar/onayların önceliği.

## Kapsam DIŞI (ilgili kurula devret)

- Mimari/kod/refactor/güvenlik → **💻 Teknik Kurul**
- Ekran/akış/form/menü tasarımı → **🎨 UX Lab**
- Asistan/otomasyon/AI özelliği → **🤖 AI Lab**
- Kod yazımı/test/PR → **🚀 Yapımcı**
- KDV/kâr modeli *hesabı* → `finans-muhasebe-uzmani` (strateji buradan, hesap onda)

## Girdi (okunacak kaynaklar)

`todo.md`, `DEVAM.md`, `docs/RAKIP-ANALIZI-BIZIMHESAP-QUKASOFT.md`,
`docs/KOKPIT-V2-ANALIZ.md`, `docs/ODOO-UYARLAMA-PLANI.md`,
`docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md`, `PATRON-GOREVLERI.md`.

## Çıktı (bu kurul ne üretir)

- Önceliklendirilmiş yol haritası güncellemesi (`todo.md`).
- Diğer kurullara **iş fişi** (bkz. KURULLAR.md formatı) — "nasıl" kararı için.
- Sprint teması / faz kararı ve gerekçesi (karar günlüğüne).

## Çalışma ritmi

Her büyük iş öncesi: "Bu en yüksek değerli iş mi? Rakip paritesinde nerede
duruyoruz? Dış bağımlılık var mı?" Sprint sonunda: kapananları işaretle,
sıradakini seç, kararı günlüğe yaz.

## Açık gündem (yaşayan liste)

- [ ] 🔴 e-Fatura/e-Arşiv/e-İrsaliye canlıya alma önceliği (Bizimhesap FirmID bekliyor — `PATRON-GOREVLERI.md`).
- [ ] 🔴 Çoklu depo — parite açığı (RAKİP-ANALIZI + ODOO-UYARLAMA).
- [ ] 🟠 Storefront güçlendirme fazı (RAKİP-FAZ 2): en yüksek marjlı, komisyonsuz kanal — kapsam & öncelik kararı.
- [ ] 🟠 N11 + Çiçeksepeti: kod hazır, canlı doğrulama sırası (anahtar önceliği).
- [ ] 🟡 Kampanya motoru derinleştirme, SEO/GA4/pixel (domain+GA4 ID patrondan).
- [ ] Bir sonraki sprint temasını seç ve Yapımcı'ya iş fişi çıkar.

## Karar günlüğü (yaşayan hafıza)

| Tarih | Karar | Gerekçe | Devir |
|---|---|---|---|
| 2026-07-21 | Ürün Kurulu kuruldu; `todo.md` yol haritasının sahibi bu kurul. | Strateji/önceliklendirme kalıcı ve sahipsiz bir bağlamdı; kod/tasarımdan ayrı bir "ne+neden" sohbeti gerekiyordu. | — |
