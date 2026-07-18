# Odoo Modül Evreni → Kokpit Uyarlama Analizi ve Geliştirme Planı

*Tarih: 18.07.2026 · CTO analizi (orkestratör: proje-yoneticisi) · Kaynak: Odoo 18
uygulama kataloğu (odoo.com/tr_TR, apps.odoo.com), web araması ile teyit edildi.
odoo.com bot erişimini engellediğinden katalog bilgi tabanından çıkarılıp güncel
araştırmayla doğrulandı.*

> **Amaç:** Odoo'nun tüm modüllerini A'dan Z'ye tanımak, her birini Art of Colour
> gerçekliğine (butik Türk boya markası, küçük ekip, pazaryeri ağırlıklı satış,
> güçlü özel Kokpit sistemi) göre değerlendirmek ve **kopyalamak değil, işimize
> yarayan kısmı uyarlamak**. Odoo genel ERP'dir; Kokpit boya işine özel dikey bir
> işletim sistemidir. Hedef: Odoo'nun olgunlaşmış iş akışlarındaki en iyi fikirleri,
> bizim sadeliğimizi ve pazaryeri odağımızı bozmadan içeri almak.

---

## 0. Metodoloji: her modülü hangi gözle okuduk

Odoo'nun ~50 resmi uygulaması + yüzlerce topluluk modülü var. Hepsini üç soruyla süzdük:

1. **Bu iş bizde zaten var mı?** (Kokpit tablosu/sayfası var mı → var / kısmi / yok)
2. **Boya markası + küçük ekip + pazaryeri için gerçekten değer üretir mi?**
   (Payroll, Recruitment, Fleet, eLearning gibi kurumsal modüller bizim için gürültü.)
3. **Uyarlama maliyeti nedir?** (Sadelik bozulmadan, mevcut çekirdeğe eklenebilir mi?)

Her modül, ilgili **uzman ajanın** merceğinden değerlendirildi (sahip ajan sütunu).

**Durum kodları:** ✅ var · 🟡 kısmi · ⬜ yok · ⛔ kapsam dışı (bizim işe uymaz)

---

## 1. Odoo modül evreni (kategori kategori, tam liste)

### 1.1 Finans (Finance)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Accounting** | Çift taraflı muhasebe, defter, mizan, bilanço, gelir tablosu | 🟡 ön muhasebe var (kasa/banka/cari), çift taraflı defter yok | finans-muhasebe-uzmani |
| **Invoicing** | Satış/alış faturası, e-fatura, tahsilat eşleştirme | 🟡 proforma/bilgi faturası + alış faturası var; **e-Fatura yok** | finans-muhasebe-uzmani |
| **Expenses** | Masraf girişi, personel masraf onayı | ✅ Giderler modülü (kategori kırılımı, düzenleme) | finans-muhasebe-uzmani |
| **Spreadsheet** | Canlı veriyle bağlı elektronik tablo/pivot | 🟡 Excel içe/dışa aktarım var; canlı pivot yok | frontend-gelistirici |
| **Documents** | Belge yönetimi, onay akışı | ⬜ (dosya/görsel var ama merkezî DMS yok) | — |
| **Sign** | e-İmza, sözleşme imzalama | ⛔ boya işinde marjinal | — |
| **Consolidation** | Çok şirket konsolidasyon | ⛔ tek şirket | — |

### 1.2 Satış (Sales)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **CRM** | Lead → fırsat → boru hattı (pipeline), aktivite, kazan/kaybet | 🟡 Müşteriler (CRM-lite) var; **satış boru hattı/lead yok** | buyume-pazarlama-uzmani |
| **Sales** | Teklif → sipariş → fatura, ürün satırları | ✅ Teklifler + Siparişler (kalem, stok düşümü, dönüştürme) | backend-gelistirici |
| **Point of Sale (POS)** | Fiziksel dükkân kasası, barkod okuyucu, fiş | ⬜ (elden satış var ama POS ekranı yok) | frontend-gelistirici |
| **Subscriptions** | Abonelik/tekrarlayan fatura | ⛔ boya tek seferlik satış | — |
| **Rental** | Kiralama | ⛔ | — |
| **Contacts** | Kişi/firma rehberi | ✅ Müşteriler + Tedarikçiler | backend-gelistirici |

### 1.3 Tedarik Zinciri (Supply Chain)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Inventory** | Depo, stok hareketi, lot/seri, sayım, çoklu lokasyon | 🟡 hammadde + mamul stok hareketi var; **lot/parti, çoklu depo, rezervasyon yok** | urun-uretim-uzmani |
| **Purchase** | Satın alma talebi → teklif → sipariş → alış faturası, tedarikçi | 🟡 Alış Faturaları + tedarikçi carisi var; **RFQ/otomatik sipariş önerisi yok** | finans-muhasebe-uzmani |
| **Barcode** | Mobil barkodla depo işlemleri | 🟡 barkod alanı var; mobil tarama akışı yok | frontend-gelistirici |

### 1.4 Üretim (Manufacturing)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Manufacturing (MRP)** | Üretim emri, BOM (ürün ağacı), iş istasyonu, malzeme tüketimi | ✅ Reçete (formül) + üretim emri + hammadde düşümü + geri alma | urun-uretim-uzmani |
| **PLM** | Ürün yaşam döngüsü, mühendislik değişikliği, versiyon | 🟡 Ürün Geliştirme panosu (fikir→ürün) var; formal versiyonlama yok | urun-uretim-uzmani |
| **Quality** | Kalite kontrol noktaları, ölçüm, red/karantina | ⬜ **boya için kritik** (pH, viskozite, renk uyumu, parti testi) | urun-uretim-uzmani |
| **Maintenance** | Ekipman bakımı, arıza | ⛔ küçük atölye için erken | — |

### 1.5 Web Siteleri (Websites)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Website** | Site kurucu (CMS) | ⛔ artofcolour.com.tr ayrı; Kokpit CMS olmayacak | — |
| **eCommerce** | Online mağaza, sepet, ödeme | 🟡 kendi sitesi + pazaryeri var; Kokpit ürün verisini besliyor | pazaryeri-entegratoru |
| **Blog / Forum / eLearning / Live Chat** | İçerik/topluluk | ⛔ | — |

### 1.6 Pazarlama (Marketing)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Email Marketing** | Toplu e-posta kampanyası, şablon, istatistik | ⬜ (WhatsApp var, e-posta kampanya yok) | buyume-pazarlama-uzmani |
| **Marketing Automation** | Tetikleyicili otomasyon akışı (drip) | 🟡 zamanlayıcı + bildirim altyapısı var; görsel akış editörü yok | ai-otomasyon-muhendisi |
| **SMS Marketing** | Toplu SMS | ⬜ | buyume-pazarlama-uzmani |
| **Social Marketing** | Sosyal medya planlama/yayın | ⬜ (AI metin üretimi var) | buyume-pazarlama-uzmani |
| **Events / Surveys** | Etkinlik, anket | ⛔ | — |

### 1.7 İnsan Kaynakları (HR)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Employees / Recruitment / Appraisals / Referrals** | Personel, işe alım, değerlendirme | ⛔ küçük ekip, İK modülü gereksiz | — |
| **Time Off / Attendances / Planning** | İzin, mesai, vardiya | ⛔ | — |
| **Payroll** | Bordro | ⛔ (muhasebeciye dış kaynak) | — |
| **Fleet** | Araç filosu | ⛔ | — |

### 1.8 Hizmetler (Services)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Project** | Proje, görev, aşama (kanban), son tarih | 🟡 Görevler + Ürün Geliştirme panosu var; genel proje yok | proje-yoneticisi |
| **Timesheets** | Zaman kaydı | ⛔ | — |
| **Field Service** | Saha servisi | ⛔ | — |
| **Helpdesk** | Destek talebi (ticket), SLA | ⬜ **pazaryeri soru-cevap için değerli** | pazaryeri-entegratoru |
| **Appointments** | Randevu | ⛔ | — |

### 1.9 Verimlilik (Productivity)
| Odoo Modülü | Ne yapar | Kokpit | Sahip ajan |
|---|---|---|---|
| **Discuss** | Kanal/mesajlaşma, kayıt üstü tartışma | ⬜ (bildirim var, iç mesajlaşma yok) | — |
| **Approvals** | Onay talebi akışı (harcama, izin) | 🟡 onay kartı deseni var; genel onay motoru yok | backend-gelistirici |
| **Knowledge** | Wiki/bilgi tabanı | 🟡 .claude/knowledge var (ekip için); ürün bilgi tabanı yok | urun-uretim-uzmani |
| **Sign / IoT / Studio / VoIP** | e-İmza / cihaz / no-code / telefon | ⛔ | — |
| **Dashboards / Spreadsheet BI** | Gösterge panosu, analiz | ✅ Kokpit + Analiz + Strateji (KPI, grafik, kanal kârlılığı) | buyume-pazarlama-uzmani |

---

## 2. Büyük resim: Kokpit zaten Odoo'nun neyini karşılıyor

Kokpit, bir boya markasının ihtiyaç duyduğu Odoo çekirdeğinin **~%60'ını** halihazırda,
üstelik **boya işine özel** (Odoo'da olmayan: seri × yüzey × ambalaj × renk türetme,
reçete kopyalama, pazaryeri varyant kartı, kâr modeli v2) biçimde karşılıyor:

- **Sales + Invoicing (kısmi):** Teklifler, Siparişler, alış faturaları, proforma
- **Manufacturing (MRP):** Reçete/formül, üretim emri, hammadde düşümü, geri alma
- **Inventory (kısmi):** Hammadde + mamul stok defteri, kritik eşik, üretim kuyruğu
- **Purchase (kısmi):** Alış faturaları + tedarikçi carisi
- **Accounting (ön muhasebe):** Kasa/banka, cari hesaplar, çek/senet, KDV, nakit akışı
- **CRM (kısmi):** Müşteriler + sipariş geçmişi + borç takibi
- **Marketing (kısmi):** Kampanyalar, AI pazarlama metni, WhatsApp
- **PLM (kısmi):** Ürün Geliştirme panosu (fikir→reçete→test→fiyat→ürünleştir)
- **Dashboards:** Kokpit ana ekran, Satış Analizi, Strateji, Fiyat & Kâr
- **eCommerce bağı:** Trendyol/Hepsiburada senkron + ürün kartı açma (Faz C)
- **Spreadsheet:** Excel (.xlsx) içe/dışa aktarım (Faz G)

**Odoo'dan almamız gereken, bizde eksik olan olgun fikirler** aşağıdaki sınıflandırmada.

---

## 3. Sınıflandırma: Art of Colour için ne almalı

### 3.1 🔴 OLMAZSA OLMAZLAR (yasal/finansal zorunluluk + günlük operasyon)

| # | Odoo'dan gelen fikir | Neden olmazsa olmaz | Sahip |
|---|---|---|---|
| **M1** | **e-Fatura / e-Arşiv** (Invoicing) | Türkiye'de yasal zorunluluk; şu an sadece proforma basılıyor. Ciro eşiği aşılınca zaruri. | finans-muhasebe-uzmani + devops |
| **M2** | **Stok lot/parti + rezervasyon** (Inventory) | Boya parti üretilir; hangi partiden ne satıldı, iade hangi partiye döner izlenmeli. Onaylı-kargolanmamış sipariş "müsait stok"tan düşmeli. | urun-uretim-uzmani + veritabani-mimari |
| **M3** | **Kalite kontrol** (Quality) | Boyada pH/viskozite/örtücülük/renk-uyumu testi olmadan sevkiyat = iade riski. Parti bazlı test kaydı. | urun-uretim-uzmani |

### 3.2 🟠 ÖNCELİKLİ (satış/kâr hızlandıran, kısa sürede değer)

| # | Odoo'dan gelen fikir | Değer | Sahip |
|---|---|---|---|
| **P1** | **CRM satış boru hattı** (pipeline) | Lead → fırsat → teklif → sipariş; toptan/bayi müşterisi takibi, kazan/kaybet. Şu an müşteri var ama "sıcak fırsat" görünürlüğü yok. | buyume-pazarlama-uzmani |
| **P2** | **Helpdesk / pazaryeri soru-cevap kuyruğu** | Trendyol/HB soruları tek kuyrukta, AI cevap taslağı, SLA. İade/şikâyet ticket'ı. | pazaryeri-entegratoru + ai-otomasyon |
| **P3** | **Purchase yeniden sipariş önerisi** | Hammadde kritik eşiğe inince otomatik satın alma önerisi + tedarikçi kıyas. | finans-muhasebe-uzmani |
| **P4** | **Barcode mobil depo** | Telefonla barkod okutup stok giriş/çıkış/sayım — atölyede hızlı. | frontend-gelistirici |

### 3.3 🟡 GEREKLİ (olgunlaşma, orta vade)

| # | Odoo'dan gelen fikir | Değer | Sahip |
|---|---|---|---|
| **G1** | **Çift taraflı muhasebe defteri** | Ön muhasebeden gerçek muhasebeye köprü (mizan, gelir tablosu) — muhasebeciyle entegrasyon. | finans-muhasebe-uzmani |
| **G2** | **Genel onay motoru** (Approvals) | Harcama/iskonto/fiyat değişikliği onay akışı (rol bazlı). | backend-gelistirici |
| **G3** | **Ürün bilgi tabanı** (Knowledge) | Reçete sırları, uygulama teknikleri, SSS — ürün kartına bağlı wiki. | urun-uretim-uzmani |
| **G4** | **E-posta/SMS kampanya** (Marketing) | WhatsApp'ın yanına e-posta/SMS; bayi duyurusu, kampanya. | buyume-pazarlama-uzmani |
| **G5** | **Marketing Automation akışı** | Tetikleyicili otomasyon (X gün alışveriş yapmayan müşteriye hatırlatma). | ai-otomasyon-muhendisi |

### 3.4 🔵 İLERİDE / DEĞERLENDİR (koşula bağlı)

- **POS ekranı** — fiziksel dükkân/stand açılırsa (barkod okuyucu + fiş).
- **Project (genel proje yönetimi)** — ekip büyürse; şimdilik Görevler yeterli.
- **Discuss (iç mesajlaşma)** — ekip 2-3 kişiden büyürse.
- **Documents (DMS)** — sözleşme/belge hacmi artarsa.

### 3.5 ⛔ KAPSAM DIŞI (bizim işe uymaz — bilinçli hayır)

Payroll, Recruitment, Appraisals, Time Off, Attendances, Fleet, Subscriptions,
Rental, Website CMS, Blog, Forum, eLearning, Events, Surveys, Sign, IoT, Studio,
Field Service, Appointments, Maintenance, Consolidation, VoIP.
*Gerekçe: küçük ekip + tek şirket + boya dikeyinde bu modüller gürültü ve bakım yükü.*

---

## 4. Fazlı geliştirme planı (Odoo uyarlama yol haritası)

> Sıralama: önce yasal/operasyonel zorunluluk (olmazsa olmazlar), sonra kâr
> hızlandıran öncelikliler. Her faz mevcut ürün çekirdeği üzerine oturur
> (bkz. `URUN-CEKIRDEGI-YOL-HARITASI.md`) ve mevcut sadeliği bozmaz.

### ODOO-FAZ 1 — Finansal/operasyonel zorunluluklar
- [ ] **1.1 e-Fatura/e-Arşiv entegratörü** (M1): İzibiz/Foriba/Uyumsoft'tan biriyle
  entegrasyon; fatura → resmi e-belge. Dış servis + anlaşma gerekir.
  *finans-muhasebe-uzmani (model) + devops-muhendisi (entegrasyon) + guvenlik-denetcisi*
- [ ] **1.2 Stok lot/parti + rezervasyon** (M2): `productBatches` tablosu (parti no,
  üretim tarihi, miktar, test durumu); sipariş onayında rezerve, kargoda düş,
  iade partiye geri. *veritabani-mimari + urun-uretim-uzmani + qa-test-uzmani*
- [ ] **1.3 Kalite kontrol** (M3): parti bazlı test kaydı (pH/viskozite/örtücülük/
  renk-ΔE), geçti/kaldı, karantina; üretim emrine bağlı. *urun-uretim-uzmani*

### ODOO-FAZ 2 — Satış & destek hızlandırma
- [ ] **2.1 CRM boru hattı** (P1): `leads`/`opportunities` (aşama, değer, sahip,
  aktivite); teklif bu boru hattından doğar; kazan/kaybet raporu. *buyume-pazarlama*
- [ ] **2.2 Helpdesk + pazaryeri Q&A kuyruğu** (P2): ticket tablosu, kaynak
  (Trendyol/HB/WhatsApp/e-posta), AI cevap taslağı, SLA sayacı.
  *pazaryeri-entegratoru + ai-otomasyon-muhendisi*
- [ ] **2.3 Purchase yeniden sipariş önerisi** (P3): kritik hammadde → önerilen
  sipariş + tedarikçi fiyat kıyas + tek tık RFQ taslağı. *finans-muhasebe-uzmani*

### ODOO-FAZ 3 — Mobil & olgunlaşma
- [ ] **3.1 Barcode mobil depo** (P4): PWA'da kamera barkod okuma → stok işlemi.
  *frontend-gelistirici*
- [ ] **3.2 Genel onay motoru** (G2): rol bazlı onay akışı (iskonto/harcama/fiyat).
  *backend-gelistirici + guvenlik-denetcisi*
- [ ] **3.3 Ürün bilgi tabanı** (G3): ürün kartına bağlı wiki (uygulama/SSS/reçete notu).
  *urun-uretim-uzmani*

### ODOO-FAZ 4 — Pazarlama & muhasebe derinleşme
- [ ] **4.1 E-posta/SMS kampanya + otomasyon** (G4/G5): şablon, liste, tetikleyici
  akış; WhatsApp'la birleşik. *buyume-pazarlama-uzmani + ai-otomasyon-muhendisi*
- [ ] **4.2 Çift taraflı muhasebe köprüsü** (G1): mizan/gelir tablosu, muhasebeciye
  aktarım formatı. *finans-muhasebe-uzmani*

---

## 5. Takım değerlendirmesi (Takım Geliştirme Protokolü)

Bu plan mevcut 13 uzman ajanla karşılanıyor. **Bir potansiyel yeni ajan** var:

- **`muhasebe-entegrasyon-uzmani`** (e-Fatura + resmi muhasebe köprüsü): ODOO-FAZ 1.1
  ve 4.2 tekrar eden, dış-servis + yasal uyum gerektiren, kendi bilgi tabanına değecek
  bir alan. **Karar:** ODOO-FAZ 1.1'e başlarken kur; o zamana kadar
  `finans-muhasebe-uzmani` + `devops-muhendisi` ikilisi yeterli. Erken kurmak
  gereksiz kalabalık olur (CLAUDE.md: "her uzmanlık kendi uzmanında toplansın ama
  gereksiz kalabalık da olmasın").

Diğer tüm iş kalemleri mevcut sahiplere dağıtıldı; yeni ajana gerek yok.

---

## 6. İlkeler (bu planı uygularken)

1. **Kopyalama, uyarlama.** Odoo genel ERP; biz boya dikeyiyiz. Her modülden
   *fikri* alırız, jenerik implementasyonunu değil.
2. **Sadelik kalesi.** Kokpit'in gücü sadeliği. Her yeni modül "bu ekran gerçekten
   günlük kullanılacak mı?" testinden geçmeli.
3. **Çekirdek üstüne.** Her şey ürün + sipariş + cari çekirdeğine bağlanır; ayrık
   ada modül yok.
4. **Az kredi, çok iş.** Küçük/güvenli işte sadece `pnpm check`; para/stok/yasal
   işte tam test + ilgili uzman onayı.
5. **Yasal önce.** e-Fatura ve parti izlenebilirliği; sonra konfor özellikleri.
