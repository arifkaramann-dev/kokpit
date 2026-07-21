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

### Tema 0 — Para Doğruluğu & Hata Avı  ✅ TAMAMLANDI (19.07)
Zorunlu duraklar geçildi: finans kural onayı (net/brüt konvansiyonu), qa (testler),
şema (migration 0023 + 0024). 269/269 test, build ✓.
- [x] #1 `deleteTransaction` → siparişin ödeme durumu resync (orderPaymentFrom + resyncOrderPayment)
- [x] #2 İade (out) ödeme durumunu düşürür (resync in+out; edit=sil+ekle de tutarlı)
- [x] #3 **A3:** purchaseItems.vatRate + purchases.netTotal/vatTotal (0023); totalAmount brüt;
      ağırlıklı ortalama maliyet + birim güvenliği (purchaseUtils.ts); çift-netleştirme kâr
      hatası (~%17 şişme) düzeltildi; vatReport gerçek KDV
- [x] #4 e-Fatura VKN: customers.taxNumber/taxOffice (0024) + form; fromOrder VKN çözer,
      satır KDV üründen gelir; decideInvoiceType çalışıyor
- [x] A1 zaten bitmiş (bayat işaret düzeltildi); elden kanalı KDV-0 (değişmedi)
- [x] Test boşlukları dolduruldu: reconcile.test.ts (12) + efatura.test.ts (8) + purchase.test.ts (11)

### Tema A — Boya Üretim Çekirdeği  ✅ TAMAMLANDI (19.07)
Migration 0025. stockQty otoriter korundu (pazaryeri push bozulmadı). 287/287 test.
- [x] A4 lot/parti izlenebilirlik (rezervasyonsuz): materialLots/productBatches,
      alışta lot + üretimde parti otomatik, FIFO-SKT tüketim (lotUtils)
- [x] SKT / raf ömrü + üretim tarihi (materials/products.shelfLifeDays) + SKT Nöbetçisi (09:00 TR)
- [x] A5 kalite kontrol: qcTests (pH/viskozite/örtücülük/ΔE + geçti/kaldı, ΔE≤2 tol.) + /izlenebilirlik UI

### Tema B — Asistan Onay Katmanı + Proaktif Nöbetçiler  ✅ TAMAMLANDI (19.07)
Migration 0026 (assistantPendingActions). 317/317 test. Para matematiği korundu.
- [x] Onay katmanı: güvenli (oto) · onaylı · kritik (önizleme + "evet" bekle); deterministik,
      ekstra LLM yok; bekleyen eylem KALICI (0026, 15 dk TTL); kaydedilemezse uygulanmaz
- [x] Proaktif nöbetçiler: çek/senet vade + zararına satış/marj + cevapsız soru SLA (sentryUtils)
- [x] Sabah brifingi: dün vs bugün satış + yaklaşan çek/senet + cevapsız soru sayısı
- Faz 2 (ertelendi bilinçli): tam tool-use agentik döngü (çok-adımlı) — token disiplini için gate'li
- Canlıda: iki-turlu onay smoke testi ("Ahmet 500 ödedi" → önizleme → "evet")

### Tema C — Storefront'u Canlıya Hazırlama  ✅ TAMAMLANDI (19.07)
Migration YOK (settings-tabanlı). 336/336 test. Maliyet public yanıta sızmaz.
- [x] On-page SEO: sunucu sitemap.xml + robots.txt (her ortam); production'da ürün
      HTML'ine title/desc/OG/JSON-LD enjeksiyonu; JSON-LD fiyatı = gösterilen net fiyat
- [x] PAYTR iframe frontend akışı + /magaza/tamam + /magaza/hata
- [x] Kargo ücreti modeli (sabit + X üzeri bedava; sunucuda hesap) — "kargo bedava" kuponu artık gerçek
- [x] Storefront seri filtresi + arama + indirim/üstü-çizili
- [x] Kampanya→fiyat motoru: maliyet-taban guard + %60 indirim tavanı (negatif marj imkânsız)
- [x] SEO-bilinçli ürün başlığı (marketing/aiFill arama-terimi + başlık kuralları)
- Canlıda: PAYTR anahtarı (kartlı ödeme), PUBLIC_STORE_URL + GA4 ID, marj sağlaması (finans)

### Tema D — CRM Satış Boru Hattı  ✅ TAMAMLANDI (19.07)
Migration 0027. 340/340 test.
- [x] leads tablosu (kaynak/aşama/tahmini değer) + /firsatlar pipeline görünümü + özet şerit
- [x] Aşama taşıma + tek tık müşteriye dönüştürme (convertLeadToCustomer); shared/leads.ts + test

### Teknik Borç (fırsat — bu sprint kapsamı dışı, sıradaki aday)
- [ ] `0.4` `routers.ts`/`db.ts` modül dizinlerine bölünme + servis katmanı (davranış birebir)

---

## SONUÇ — Tam Mega tamamlandı (19.07.2026)
Beş temanın hepsi (0+A+B+C+D) kod tarafı bitti; **0 tip hatası, 340/340 test, build ✓**.
7 yeni migration (0023–0027 arası + 0024). 5 kanıtlı para/mantık hatası kapatıldı,
boya üretim çekirdeği (lot/SKT/QC), asistan onay katmanı + nöbetçiler, storefront
canlıya (SEO+PAYTR+kargo+kampanya), CRM boru hattı eklendi. Patron dış görevleri
(anahtar/mühür/domain) **PATRON-GOREVLERI.md**'de; kod hazır, "bağla + canlı test" bekliyor.

---

## CTO Önerisi — Sıra ve Kapsam
- **Tema 0 her hâlükârda önce** — #1-4 gerçek para hatalarını ve ~%17 kâr şişmesini kapatır.
- Ardından iş değeri en yüksek tek tema **Tema C (storefront canlıya)**: en yüksek marjlı
  kanal bugün ölü, kod ~%85 anahtarsız. → **Önerilen sprint: Tema 0 + Tema C.**
- Alternatifler: Tema 0 + Tema A (boya üretim çekirdeği) · Tam dörtlü (0+A+B+C) · yalnız Tema 0.

## Patron-Bekleyen Dış Görevler (özet — detay: PATRON-GOREVLERI.md)
Pazaryeri canlı anahtarları (Trendyol/HB/N11/ÇS) · e-Fatura mühür+entegratör · PAYTR+domain+GA4 ·
işçilik/genel gider oranları · uptime monitörü · S3 kimlik bilgisi · Picovoice AccessKey.
