# e-Fatura — Bizimhesap Köprüsü

**Karar (21.07.2026):** Entegratör olarak zaten abone olduğun **Bizimhesap**
kullanılacak. Yeni bir entegratör anlaşmasına (İzibiz/Uyumsoft/Paraşüt) gerek yok.

## Sorunun cevabı: "Bizimhesap'tan yapabilir miyiz, yoksa kendimiz mi keselim?"

- **Bizimhesap'tan: EVET.** Bizimhesap'ın B2B API'si var
  (apidocs.bizimhesap.com). Kokpit siparişten faturayı Bizimhesap'a API ile
  işler; GİB'e e-Fatura/e-Arşiv gönderimini Bizimhesap'ın e-fatura altyapısı
  yapar (mali mührün Bizimhesap'a tanımlı olması yeterli — aboneliğinde
  e-fatura modülü açık olmalı).
- **"Direkt kendimiz": pratikte HAYIR.** GİB'e doğrudan fatura basmak için ya
  GİB portalında elle kesmek ya da **özel entegratör lisansına sahip** bir
  aracı kullanmak gerekir. Mali mühür tek başına API'den fatura kesmeye
  yetmez; kendi sistemimizi entegratör yapmak ayrı bir lisans/denetim sürecidir
  ve bize gereksiz. Doğru mimari: **Kokpit → Bizimhesap API → GİB**.

## Benden istenenler (senin yapacakların, ~10 dakika)

1. **Firma ID (API anahtarı) al:** Bizimhesap paneline gir → **destek/canlı
   destek** üzerinden "API entegrasyonu için Firma ID (FirmID) istiyorum" diye
   talep aç. (Bizimhesap API anahtarını panelden değil, destek talebiyle veriyor.)
2. Render → artofcolour-kokpit → **Environment**:
   - `EFATURA_PROVIDER` = `bizimhesap`
   - `BIZIMHESAP_FIRM_ID` = sana verilen Firma ID
3. Bizimhesap aboneliğinde **e-Fatura/e-Arşiv modülünün açık** olduğunu ve mali
   mührün Bizimhesap'a tanımlı olduğunu doğrula (bir kez, onların desteğiyle).

> Firma ID'yi bana yollama; Render'a gir, "girdim" de.

## Ne çalışır hale gelir

- Sipariş kartından fatura üretimi Bizimhesap'a **otomatik işlenir**
  (müşteri + kalemler + KDV dökümü; Bizimhesap'ta olmayan müşteri/ürün
  otomatik açılır — addinvoice böyle çalışır).
- Vergi no 10 haneli (şirket) → e-Fatura, 11 haneli/boş (şahıs) → e-Arşiv
  ayrımı Bizimhesap tarafında yürür.
- İlk canlı denemeyi tek bir gerçek siparişle yaparız; Bizimhesap panelinden
  faturanın düştüğünü görüp onaylarsın, sonra rutine bağlarız.

## Teknik not (benim tarafım)

- Uç: `POST https://bizimhesap.com/api/b2b/addinvoice` (kimlik: gövdedeki `firmId`).
- Eşleme: `server/efatura.ts` → `buildBizimhesapInvoice` (birim testli:
  `server/efatura.bizimhesap.test.ts`). Tutarlar KDV-hariç + KDV ayrı;
  toplamlar Kokpit'in KDV özetiyle birebir.
- tRPC: `invoices.fromOrder` (send:true olunca gönderir; yapılandırma yoksa
  taslak döner, akış bozulmaz).
- Alış faturası yönü (invoiceType 5) ve fatura durumunun geri okunması bir
  sonraki faz — talep olursa eklenir.
