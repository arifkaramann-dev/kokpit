# Rakip Takip Sistemi

> Yönetim Kurulu'nun sürekli hattı. Bakımcı: `yonetim-kurulu` (+ derin analiz
> `buyume-pazarlama-uzmani`). Her izlenen üründe üç soru: **Bize gerekli mi?
> Daha iyisini yapabilir miyiz? Yapmamalı mıyız?** Yeni bilgi geldikçe güncelle,
> tarih düş. Derin analiz: `docs/RAKIP-ANALIZI-BIZIMHESAP-QUKASOFT.md`.

## İzlenen ürünler

| Ürün | Sınıf | Neden izliyoruz | Bizim durumumuz |
|---|---|---|---|
| **Bizimhesap** | TR ön muhasebe | Birincil parite hedefi (cari, kasa, KDV, çek/senet) | ~%75 parite; eksik: e-Fatura entegratörü canlı, teklif→sipariş tam |
| **Quka (Qukasoft)** | TR pazaryeri yönetimi | Pazaryeri yönetimi paritesi | ~%45 parite; eksik: N11/Çiçeksepeti, komisyon-bazlı net kâr, iade yönetimi |
| **Logo** | TR ERP (KOBİ) | Muhasebe/e-Belge referansı | Kıyas: biz daha hafif ve pazaryeri-odaklıyız |
| **Mikro** | TR ERP (KOBİ) | Ön muhasebe/stok referansı | Kıyas: biz üretim-formül + pazaryeri odaklıyız |
| **Nebim** | TR perakende ERP | Perakende/stok referansı | Kıyas: bizim niş boya üretimi |
| **Odoo** | Açık kaynak ERP (global) | Modülerlik/akış referansı | Plan: `docs/ODOO-UYARLAMA-PLANI.md` |
| **ERPNext** | Açık kaynak ERP | Üretim/BOM referansı | İzle: reçete/BOM desenleri |
| **SAP Business One** | KOBİ ERP (global) | Kurumsal alt sınır | İzle: yalnızca ilham, ağırlığını alma |
| **Dynamics 365 BC** | KOBİ ERP (global) | Kurumsal alt sınır | İzle: ilham |
| **Zoho (Books/Inventory)** | KOBİ bulut suit | Fiyat/kapsam referansı | İzle: entegrasyon genişliği |
| **Shopify** | E-ticaret platformu | Kendi web mağazamız (storefront) | İzle: storefront/checkout deseni |
| **Monday / ClickUp / Notion / Jira / Linear / Asana** | İş/proje yönetimi | Görev/akış UX referansı | İzle: yalnızca UX/akış deseni; ERP değil |
| **BatchMaster / Deacom / Mar-Kov** | Boya-kimya ERP (dikey) | Parti maliyeti, lot izlenebilirliği, SDS/CoA — bizim asıl sektörümüz | Eksik: işçilik+genel gider, lot izleme, raf ömrü, GBF |
| **PPG Paint Manager / S-W FormulaExpress** | Renk erişim sistemi | Müşteri renk koduyla arar; sektörün çekirdeği | **Bizde yok** — en yüksek getirili fırsat (renk kodu → ürün) |
| **Katana / MRPeasy** | Küçük üretici MRP | Parti/lot, çok seviyeli BOM, iş emri | İzle: reçete versiyonlama ve fire/verim deseni |
| **Sentos / Entegra** | TR pazaryeri + kargo | Komisyon bazlı net kâr, ~25 kargo, iade otomasyonu | Eksik: net kâr hesabı, kargo etiketi, iade yönetimi |
| **Paraşüt** | TR ön muhasebe (bulut) | Banka oto-eşleme, tahsilat linki | Eksik: tahsilat linki, banka hareketi otomatik eşleme |
| **Akeneo / inriver / Plytix** | PIM | Kanal bazlı içerik kalite skoru | Eksik: skorumuz kanal şartlarına bakmıyor |

## Gözlem günlüğü (en yeni en üstte)

| Tarih | Ürün | Ne değişti / gözlem | Karar (gerekli mi / daha iyisi / yapma) |
|---|---|---|---|
| 2026-08-04 | **Boya/kimya ERP** (BatchMaster, Deacom, Mar-Kov) | Kategori izleme listesinde HİÇ yoktu. Ayırt edici başlıklar: parti/lot izlenebilirliği, parti maliyetine işçilik+genel gider, fire/verim sapması, raf ömrü, SDS/CoA. | **Gerekli**: işçilik+genel gider (maliyet sistematik düşük çıkıyor), lot izlenebilirliği. **Yapma**: tam QMS/CAPA. |
| 2026-08-04 | **Renk erişim sistemleri** (PPG Paint Manager, S-W FormulaExpress/Collision Core) | Sektörün tamamı "renk kodu → formül/ürün" üzerine kurulu. Bağımsız OEM renk kodu veritabanları ayrı ürün kategorisi. Bizde renk kodu araması yok; oysa bilgi tabanımız müşterinin renk koduyla aradığını söylüyor. | **Daha iyisini yapabiliriz**: renk kodu → ürün araması en yüksek getirili tek fikir. Doğrudan satış kaybı kapatır. |
| 2026-08-04 | **Sentos / Entegra** | Komisyon+kargo+iade düşülmüş **net kâr** hesabı ve ~25 kargo entegrasyonu standart özellik; iade otomatik yakalanıp stok+gelir düzeltiliyor. | **Gerekli**: net kâr hesabı (zarara satış görünmüyor). Kargo etiketi ikinci sırada. Kanal sayısı artırmak sonra. |
| 2026-08-04 | **Paraşüt** | Banka hareketleri otomatik inip cariyle eşleşiyor, açık fatura otomatik kapanıyor. Kredi kartı **tahsilat linki** var. | **Gerekli**: tahsilat linki (WhatsApp satışında doğrudan nakit etkisi, küçük iş). Banka oto-eşleme ikinci sırada. |
| 2026-08-04 | **PIM sınıfı** (Akeneo/inriver/Plytix) | SKU'yu **kanal başına** 0-100 puanlıyor, yayına çıkmadan eksik alanı gösteriyor; içerik kalitesini iade oranıyla eşliyor. | **Daha iyisini yapabiliriz**: `masterHealth` zaten var, kanal gereksinimlerine bağlanacak (`channelAttributes` verisi duruyor). |
| 2026-07-21 | — | Kurul kuruldu; izleme listesi tanımlandı. İlk taban: Bizimhesap ~%75, Quka ~%45 parite (docs kaynaklı). | Sürekli hat başlatıldı; ilk derin tarama sonraki haftalık toplantıda. |

## Farklılaşma tezi (neden Kokpit?)

Kokpit genel bir ERP değil; **boya üreten esnaf için dikey işletim sistemidir**:
üretim-formül defteri × pazaryeri senkronu × ön muhasebe × AI asistan/WhatsApp
tek panoda. Genel ERP'ler (Logo/Mikro/Odoo) bunu ya yapmaz ya da esnaf için
fazla ağırdır; pazaryeri araçları (Quka) muhasebeyi, muhasebe araçları
(Bizimhesap) pazaryeri+üretimi zayıf bırakır. **Kurulun görevi bu kesişimdeki
üstünlüğü her sprintte genişletmek.**
