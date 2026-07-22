# Kurullar — 5 Kalıcı Sohbet Yapısı (Art of Colour Kokpit)

Bu belge, projenin **5 kalıcı sohbet / kurul** yapısını tanımlar. Amaç: her
büyük çalışma alanı kendi bağlamını, hafızasını ve önceliklerini korusun; ürün
stratejisi ile kod, tasarım ile üretim birbirine karışmasın.

Kurullar **ajanların yerine geçmez** — üstünde bir *orkestrasyon katmanıdır*.
13 uzman ajan (`.claude/agents/*.md`, sicil `.claude/TAKIM.md`) çalışan ekiptir;
5 kurul ise bu ekibi 5 kalıcı bağlama toplar. Her kurulun **sabit tüzüğü**
(kapsam, üyeler, kurallar) ve **yaşayan hafızası** (açık gündem + karar günlüğü)
vardır. Hafıza dosyada durduğu için git ile sürümlenir, cihazlar/oturumlar
arası taşınır — claude.ai'deki bir "Proje"den daha kalıcıdır.

> **Üst katman — Yönetim Kurulu:** Bu 5 kurulun üstünde stratejik bir **Yönetim
> Kurulu** (`.claude/YONETIM-KURULU.md`, ajan `yonetim-kurulu`) durur: "bunu
> yapmalı mıyız / değer katıyor mu" **değer-kapısı**. Tam akış:
> 🎩 Yönetim Kurulu (değer onayı) → 🏛 Ürün Kurulu (öncelik) → 💻/🎨/🤖 (tasarım)
> → 🚀 Yapımcı (uygula). Kısaca: **Yönetim Kurulu *neyi/niçin*'e karar verir,
> Kurullar *nasıl*'ı yürütür.** İkisi ayrı katman; biri diğerinin yerine geçmez.

## Beş Kurul

| # | Kurul | Ne yapar (tek cümle) | Lider ajan | Komut | Tüzük |
|---|---|---|---|---|---|
| 🏛 | **Ürün Kurulu** | Ne + neden: strateji, yol haritası, önceliklendirme, rakip analizi | `buyume-pazarlama-uzmani` + `proje-yoneticisi` | `/urun-kurulu` | `boards/urun-kurulu.md` |
| 💻 | **Teknik Kurul (CTO)** | Nasıl (teknik): mimari, kod kalitesi, refactor, performans, güvenlik | `backend-gelistirici`, `veritabani-mimari`, `guvenlik-denetcisi`, `devops-muhendisi` | `/teknik-kurul` | `boards/teknik-kurul.md` |
| 🎨 | **UX Lab** | Nasıl (deneyim): ekranlar, akışlar, formlar, dashboard, mobil | `ux-tasarimci` + `frontend-gelistirici` | `/ux-lab` | `boards/ux-lab.md` |
| 🤖 | **AI Lab** | Nasıl (zekâ): asistan, otomasyon, ajanlar, sesli, akıllı öneriler | `ai-otomasyon-muhendisi` | `/ai-lab` | `boards/ai-lab.md` |
| 🚀 | **Yapımcı (Builder)** | Uygula: iş fişini al → kod yaz → test et → PR/teslim | tüm geliştiriciler + `qa-test-uzmani` (zorunlu) | `/yapimci` | `boards/yapimci.md` |

Alan uzmanları (`finans-muhasebe-uzmani`, `urun-uretim-uzmani`,
`pazaryeri-entegratoru`, `muhasebe-entegrasyon-uzmani`) tek bir kurula bağlı
değildir — hangi kurulun işi onların alanına giriyorsa oraya **danışman** olarak
çağrılır (ör. para mantığı → hangi kurulda olursa olsun `finans-muhasebe-uzmani`
onayı gerekir).

## İşleyiş döngüsü (kurullar arası akış)

```
🏛 Ürün Kurulu        → NE + NEDEN, öncelik → "iş fişi" çıkarır
      ↓
💻 Teknik / 🎨 UX / 🤖 AI  → NASIL: mimari + akış + AI tasarımı, kabul kriteri
      ↓
🚀 Yapımcı            → kod + test + PR (proje-yoneticisi orkestrasyonuyla)
      ↓
      geri → 🏛 Ürün Kurulu: kapandı mı? etkisi ne? sıradaki ne?
```

Kural: **Yapımcı yalnızca onaylı iş fişini uygular.** Strateji/mimari/akış
kararı ilgili kurulda alınır, Yapımcı'da alınmaz. Küçük/tek dosyalık işlerde bu
döngü kısadır — doğrudan `/yapimci` ile yapılabilir (kredi israf etme).

## İş fişi formatı (kurullar arası el sıkışma)

Bir kurul başka kurula iş devrederken bu yapıyı kullanır (karar günlüğüne de
bunun özeti işlenir):

```
Başlık:        <kısa>
Kaynak kurul:  🏛/💻/🎨/🤖
Hedef kurul:   🚀 (veya tasarım için 💻/🎨/🤖)
Neden:         <iş değeri / hangi stratejiye hizmet ediyor>
Kapsam:        <net sınır — neyi içerir, neyi içermez>
Kabul kriteri: <"bitti" ne demek — ölçülebilir>
Riskler/duraklar: <para→finans, şema→veritabani, auth→güvenlik, pazaryeri→canlı test>
```

## Nasıl çalıştırılır — iki mod

**Mod A — Tek Claude Code oturumu (önerilen, bugün kullanılabilir).**
Slash komutlarıyla kurul bağlamına gir: `/urun-kurulu`, `/teknik-kurul`,
`/ux-lab`, `/ai-lab`, `/yapimci` (dizin: `/kurullar`). Her komut ilgili tüzüğü
okur, kurulun kapsamını üstlenir, işi o kurulun ajanlarıyla yürütür ve
bitince kurulun **yaşayan hafızasını günceller**. Kalıcılık dosyada olduğu için
sohbet kapansa da kaldığın yerden devam edersin.

**Mod B — claude.ai'de 5 ayrı Proje/sohbet.**
İstersen claude.ai'de 5 ayrı Proje aç; her Projenin "özel talimat" alanına ilgili
`boards/*.md` tüzüğünü yapıştır. Böylece her sohbet doğal olarak kendi şeridinde
kalır. İki mod da **aynı tüzük dosyalarını** tek doğruluk kaynağı olarak kullanır;
hangi modda çalışırsan çalış kararları `boards/*.md` karar günlüğüne işle.

## Yaşayan hafıza (kalıcılığın mekaniği)

Her `boards/*.md` dosyasının iki yaşayan bölümü vardır:

- **Açık gündem** — kurulun o anki odağı (yaşayan checklist).
- **Karar günlüğü** — alınan kararlar (tarih · karar · gerekçe · devir).

Bir kurulda anlamlı bir karar/devir olduğunda bu bölümleri güncelle. Bu, her
"sohbetin kendi bağlamını koruması"nın somut hâlidir — bağlam claude.ai'nin
sohbet geçmişinde değil, git'te yaşar.

## Kurallar

- **Şerit disiplini:** Hiçbir kurul başka kurulun kararını gasp etmez. Kapsam
  dışına çıkan işi ilgili kurula "iş fişi"yle devret.
- **Zorunlu duraklar her kurulda geçerli:** para → `finans-muhasebe-uzmani` +
  `qa-test-uzmani`; şema → `veritabani-mimari`; auth/gizli bilgi →
  `guvenlik-denetcisi`; pazaryeri/e-Belge → canlı (Render) doğrulama.
- **Az kredi, çok iş:** doğrulama riske göre (küçük iş → `pnpm check`; riskli iş
  → tam test/build). Küçük işte kurul töreni şart değil.
- **Orkestratör:** çok modüllü Yapımcı işinde önce `proje-yoneticisi` böler.
- **Evrim:** Kurul yapısı da `.claude/TAKIM.md` evrim protokolüne tabidir; kurul
  eklenir/birleştirilir/emekli edilirse oraya gerekçesiyle işlenir.
