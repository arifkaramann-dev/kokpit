# Mega Sprint Hareket Planı — 19.07.2026

> Bu belge, yeni Mega Sprint için **ekip incelemesinin** (proje-yöneticisi orkestrasyonuyla
> dört uzmanın paralel denetimi) çıktısıdır. Amaç: dış anahtar gerektirmeyen en yüksek
> değerli işleri, kanıtlı hataları ve zorunlu durakları tek yerde toplamak.
> Dış görevler (anahtar/onay/mühür) ayrı belgede: **PATRON-GOREVLERI.md**.

## Kod Sağlığı (19.07.2026, ölçülmüş)
- ✅ `pnpm check`: **0 tip hatası** · `pnpm test`: **231/231** (19 test dosyası) · build ✓
- 32 şema tablosu · 23 migration (son: `0022`) · 32 sayfa · 44 server dosyası
- ⚠️ Teknik borç somut: `server/routers.ts` **2268 satır**, `server/db.ts` **1835 satır**
  (todo `0.4` modül-bölme borcu). Davranış-koruyan refactor adayı.

---

## Ekip İncelemesi — Özet

| Uzman | Ana bulgu |
|---|---|
| `urun-uretim-uzmani` | A1 zaten bitmiş (bayat işaret); **A3 saklı bir hata** — hammadde maliyetinde net/brüt KDV tutarsızlığı kârı ~%17 şişiriyor; lot/parti + SKT + kalite kontrol boya dikeyinin farklılaştırıcısı |
| `finans-muhasebe-uzmani` | Kâr modeli v2 testle kilitli/sağlam; **iki kritik para hatası** (tahsilat silme resync yok, iade ödeme durumunu düşürmüyor); reconcile/e-Fatura saf fonksiyonları testsiz; e-Fatura VKN bug'ı |
| `ai-otomasyon-muhendisi` | Asistan tek-atış intent sınıflandırıcı; **onay katmanı** (güvenli/onaylı/kritik) tam tool-use'a gerek kalmadan ince sarmalla para korur; proaktif nöbetçiler ucuz-yüksek getiri |
| `buyume-pazarlama-uzmani` | Storefront çalışan MVP ama **satışa hazır değil**: PAYTR ödeme UI'ı frontend'de yok, SEO sıfır; en yüksek marjlı kanal şu an ölü; kampanya bir takvim, indirim motoru değil |

---

## 🔴 Kanıtlı Hatalar (listede yoktu, ekip yakaladı)

1. **Tahsilat silme cariyi/siparişi bozuyor.** `deleteTransaction` (`server/db.ts:580`)
   hareketi siliyor ama siparişin `paidAmount`/`paymentStatus`'unu yeniden hesaplamıyor;
   `updateTransaction` fonksiyonu yok (düzenleme = sil+ekle, silme adımı senkronsuz).
   → Silinen tahsilat sonrası sipariş "ödendi" kalır, **alacak kaybolur**. **Kritik.**
2. **İade (out) ödeme durumunu düşürmüyor.** `db.ts:564` resync yalnız `direction:"in"`
   iken çalışıyor → iade sonrası sipariş yanlışlıkla "paid" kalabilir.
3. **A3 kökü — net/brüt KDV tutarsızlığı.** AI fatura okuma "KDV-hariç birim fiyat"
   yazıyor (`server/_core/claude.ts:157`) → `materials.unitCost` **net** saklanıyor; ama
   kâr/maliyet modeli bunu **KDV-dahil** kabul edip `/(1+KDV)` ile tekrar arındırıyor
   (`client/src/pages/Costs.tsx:386`, `server/reportUtils.ts:121`, `shared/pricing.ts:135`).
   → Hammadde maliyeti ~%17 eksik, **kâr yapay şişiyor.** Tüm fiyat/kâr sayfalarını etkiler.
4. **e-Fatura tip seçimi ölü kod.** `invoices.fromOrder` müşteriyi VKN'siz kuruyor
   (`server/routers.ts:2200`) → `decideInvoiceType` hep "e-arşiv" döner; kurumsal (10 hane VKN)
   müşteri hiç e-fatura sınıflanamıyor. Fatura satırları da tek global `vat` ile üretiliyor.
5. **Kampanya indirimi hiçbir yere uygulanmıyor.** `campaign.discountPercent`
   (`routers.ts:290`) ne storefront ne pazaryeri fiyatına yansıyor — Kampanyalar bir
   *takvim*, indirim *motoru* değil. "Kargo bedava" kuponu da `shipping:0` sabit olduğu
   için (storefront `createOrder`) pratikte hiçbir şey yapmıyor.

## Ek riskler / bayat işaretler
- **A1 (gerçekleşen kâr KDV hizalama) zaten YAPILMIŞ** (`reportUtils.ts:118-125` +
  `report.channel.test.ts` kilitli). `todo.md:243` bayat — sadece `[x]` yapılacak.
- Alış faturası birim maliyeti "son fiyatla ez" (`db.ts:1456`) — ağırlıklı ortalama yok.
- Birim dönüşüm riski: fatura miktarı `stockQty`'ye ham ekleniyor (kg vs gr doğrulaması yok).
- KDV raporu tek global oran (%20) — satır bazlı KDV kolonu yok (bilinen sınır; A3 kapatır).
- Test boşluğu: `reconcile()`, `parseBankStatement`, `buildInvoicePayload`, `decideInvoiceType`
  saf fonksiyonlarının birim testi yok.

---

## Temalar (dış anahtar GEREKMEZ — bu ortamda bitirilebilir)

### Tema 0 — Para Doğruluğu & Hata Avı  *(temel — her kapsamda önce)*
Zorunlu duraklar: `finans-muhasebe-uzmani` (kural onayı) + `qa-test-uzmani` (test) +
`veritabani-mimari` (A3 şema). `pnpm test` + `pnpm build` zorunlu (riskli sınıf).
- [ ] #1 `deleteTransaction` → siparişin ödeme durumunu resync et; `updateTransaction` ekle
- [ ] #2 İade (out) ödeme durumunu düşürsün (resync `in`+`out` her ikisinde)
- [ ] #3 **A3:** `purchases`/`purchaseItems`'a `vatRate`/`vatAmount` + net maliyet; hammadde
      maliyetinin net/brüt tanımını netleştir (finans kararı); ağırlıklı ortalama maliyet;
      kg/gr birim dönüşümü güvenliği; KDV raporunun alış tarafını gerçeğe oturt
- [ ] #4 e-Fatura `fromOrder` VKN geçir + satır bazlı KDV; `decideInvoiceType` çalışsın
- [ ] A1'i resmen kapat + elden kanalında maliyet-KDV kuralını netleştir (tek cümle karar)
- [ ] Test boşluklarını doldur: `reconcile.test.ts`, `efatura.test.ts` (payload/tip/tutar kilidi)

### Tema A — Boya Üretim Çekirdeği  *(alan farklılaştırıcısı)*
Zorunlu duraklar: `veritabani-mimari` (yeni tablolar) → `ux-tasarimci` (akış) →
`frontend-gelistirici`. `pazaryeri-entegratoru` haberdar (stok = lot toplamı olmalı).
- [ ] A4 lot/parti izlenebilirlik (**rezervasyonsuz** — karar `URUN-CEKIRDEGI...` D2'de var):
      `materialLots`/`productionBatches`, üretim tüketimini lota bağla
- [ ] SKT / raf ömrü + üretim tarihi (lot'a neredeyse bedava; "vadesi geçen stok" nöbetçisini besler)
- [ ] A5 kalite kontrol: `qcTests` (parti + pH/viskozite/örtücülük/ΔE + geçti/kaldı)

### Tema B — Asistan Onay Katmanı + Proaktif Nöbetçiler
Zorunlu duraklar: `finans-muhasebe-uzmani` (kritik intent'ler) + `qa-test-uzmani`.
Yeni dış bağımlılık yok (`ANTHROPIC_API_KEY` var).
- [ ] Onay katmanı: **güvenli** (query/task_list/help/note = oto) · **onaylı**
      (stock/task/order_status = önizleme+onay) · **kritik** (sale/order/expense/collection =
      güçlü onay). Bekleyen-eylem **kalıcı** saklama (küçük tablo/settings — in-memory OLMAZ,
      Render free uyku/restart'ta uçar)
- [ ] Proaktif nöbetçiler: çek/senet vade · zararına satış/marj · cevapsız soru SLA
- [ ] Sabah brifingi zenginleştirme (dün vs bugün satış, cevapsız soru, yaklaşan çek/senet)
- Faz 2 (ertelenir): tam tool-use agentik döngü (çok-adımlı komut) — token disiplini için gate'li

### Tema C — Storefront'u Canlıya Hazırlama  *(en yüksek marjlı kanal)*
Zorunlu duraklar: `finans-muhasebe-uzmani` (kampanya→fiyat marjı) + `qa-test-uzmani`
(PAYTR para akışı, canlı test anahtar gelince). Domain/GA4/PAYTR anahtarı patrondan
(yalnız **canlı test** için; kod ~%85 anahtarsız).
- [ ] On-page SEO: `sitemap.xml`, `robots.txt`, per-ürün `<title>`/meta, Open Graph,
      **JSON-LD Product** (fiyat/stok — gösterilen net fiyatla birebir aynı olmalı)
- [ ] PAYTR iframe frontend akışı: ödeme adımı UI + `/magaza/tamam` + `/magaza/hata`
      (endpoint router'da hazır: `routers.ts:2135-2159`)
- [ ] Kargo ücreti modeli (bugün `shipping:0` sabit — "kargo bedava" kuponu bu yüzden ölü)
- [ ] Storefront kategori/arama/seri filtresi
- [ ] **Kampanya→fiyat motoru:** `discountPercent`'i gerçek indirime bağla (kupon+kampanya
      üst üste binerse negatif marj riski — finans doğrulaması şart)
- [ ] SEO-bilinçli ürün başlık/açıklama (arama-terimi öncelikli; `ai-otomasyon` ile prompt katmanı)

### Tema D — CRM Satış Boru Hattı  *(küçük)*
- [ ] Tek eksik "lead" aşaması (kodda/şemada `lead` yok). Hafif şema (kaynak/aşama) +
      pipeline görünümü ile lead → teklif → sipariş tamamlanır. Dış bağımlılık yok.

### Teknik Borç (fırsat)
- [ ] `0.4` `routers.ts`/`db.ts` modül dizinlerine bölünme + servis katmanı (davranış birebir)

---

## CTO Önerisi — Sıra ve Kapsam
- **Tema 0 her hâlükârda önce** — #1-4 gerçek para hatalarını ve ~%17 kâr şişmesini kapatır.
- Ardından iş değeri en yüksek tek tema **Tema C (storefront canlıya)**: en yüksek marjlı
  kanal bugün ölü, kod ~%85 anahtarsız. → **Önerilen sprint: Tema 0 + Tema C.**
- Alternatifler: Tema 0 + Tema A (boya üretim çekirdeği) · Tam dörtlü (0+A+B+C) · yalnız Tema 0.

## Patron-Bekleyen Dış Görevler (özet — detay: PATRON-GOREVLERI.md)
Pazaryeri canlı anahtarları (Trendyol/HB/N11/ÇS) · e-Fatura mühür+entegratör · PAYTR+domain+GA4 ·
işçilik/genel gider oranları · uptime monitörü · S3 kimlik bilgisi · Picovoice AccessKey.
