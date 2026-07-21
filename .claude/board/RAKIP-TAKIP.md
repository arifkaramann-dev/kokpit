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

## Gözlem günlüğü (en yeni en üstte)

| Tarih | Ürün | Ne değişti / gözlem | Karar (gerekli mi / daha iyisi / yapma) |
|---|---|---|---|
| 2026-07-21 | — | Kurul kuruldu; izleme listesi tanımlandı. İlk taban: Bizimhesap ~%75, Quka ~%45 parite (docs kaynaklı). | Sürekli hat başlatıldı; ilk derin tarama sonraki haftalık toplantıda. |

## Farklılaşma tezi (neden Kokpit?)

Kokpit genel bir ERP değil; **boya üreten esnaf için dikey işletim sistemidir**:
üretim-formül defteri × pazaryeri senkronu × ön muhasebe × AI asistan/WhatsApp
tek panoda. Genel ERP'ler (Logo/Mikro/Odoo) bunu ya yapmaz ya da esnaf için
fazla ağırdır; pazaryeri araçları (Quka) muhasebeyi, muhasebe araçları
(Bizimhesap) pazaryeri+üretimi zayıf bırakır. **Kurulun görevi bu kesişimdeki
üstünlüğü her sprintte genişletmek.**
