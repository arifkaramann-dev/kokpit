# 🎨 UX Lab

> Kalıcı sohbet: **kullanıcı deneyimi**. Bu dosya bu kurulun tüzüğü + hafızasıdır.
> Komut: `/ux-lab`. Üst belge: `.claude/KURULLAR.md`.

**Lider:** `ux-tasarimci` (akışı önce tasarlar) → **uygulama:** `frontend-gelistirici`.

## Kapsam (sadece bunlar)

- **Bilgi mimarisi:** menü/gezinme düzeni, sayfa gruplama, keşfedilebilirlik.
- **Ekran & akışlar:** sayfa akışı, adım sayısı, boş durumlar, hata/onay desenleri.
- **Formlar & listeler:** alan sırası, doğrulama geri bildirimi, satır içi düzenleme, tablo/kart desenleri.
- **Dashboard (Kokpit):** aksiyon şeridi, KPI kartları, öncelik sırası.
- **Mobil & PWA:** responsive düzen, dokunma hedefleri, yatay kaydırma yerine akış.
- **Yazdırma şablonları** (etiket/fatura/makbuz/teklif) görsel tutarlılığı.
- **Tasarım dili:** bileşen tutarlılığı, onay kartı deseni, tipografi/aralık.

## Kapsam DIŞI (ilgili kurula devret)

- Hangi özellik/öncelik → **🏛 Ürün Kurulu**
- API/mimari/performans → **💻 Teknik Kurul**
- Asistan/sesli/AI etkileşimi mantığı → **🤖 AI Lab** (görsel/akış tarafı burada)
- Bileşen kodunun seri üretimi/testi → **🚀 Yapımcı** (akış kararı burada verilir)

## Girdi (okunacak kaynaklar)

`docs/KOKPIT-V2-ANALIZ.md` (UX/IA bölümü), `docs/ANALIZ-GELISTIRME-PLANI-2026-07-21.md`
(UX bulguları), `client/src/pages/*`, `client/src/components/*`, `DEVAM.md`.
**Önemli ders (TAKIM.md):** yerleşim/navigasyon değişikliği tarayıcı görsel
doğrulaması ister (yerel MariaDB + Playwright) — statik inceleme flex/overflow
etkileşimini yakalamaz.

## Çıktı (bu kurul ne üretir)

- Akış/wireframe kararı + kabul kriteri → Yapımcı'ya iş fişi (`frontend-gelistirici`).
- IA/menü düzeni kararı, tasarım deseni (karar günlüğüne).

## Çalışma ritmi

Yeni modül veya ekran yeniden düzeni: **önce UX Lab akışı tasarlar**, sonra
Yapımcı kodlar. Navigasyon/yerleşim değişikliğinde görsel doğrulama zorunlu.

## Açık gündem (yaşayan liste)

- [ ] Menü yoğunluğu (26+ öğe): sürekli IA gözetimi; gruplama/sadeleştirme sürdür.
- [ ] Storefront (RAKİP-FAZ 2) tasarımı: ürün çekirdeğinden beslenen sade mağaza akışı — büyük tasarım kararı, Ürün Kurulu önceliklendirince başlar.
- [ ] Mobil/PWA akış derinleştirme: kritik akışların (sipariş, tahsilat, üretim) telefon deneyimi.
- [ ] Onay kartı / boş durum / hata deseni tutarlılık denetimi (ConfirmDialog, toast).
- [ ] Kokpit aksiyon şeridi ve KPI sırası: patron iş akışına göre gözden geçir.

## Karar günlüğü (yaşayan hafıza)

| Tarih | Karar | Gerekçe | Devir |
|---|---|---|---|
| 2026-07-21 | UX Lab kuruldu; akış-önce ilkesi (frontend'den ÖNCE tasarım) bu kurulda kurumsallaştı. | IA/UX tekrarlanan, sahipsiz bir uzmanlıktı; ekran akışı kararı kod yazımından ayrı bir kalıcı bağlam istiyordu. | — |
