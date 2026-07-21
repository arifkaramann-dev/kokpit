---
description: 🚀 Yapımcı (Builder) bağlamına gir — iş fişini al, kod yaz, test et, teslim/PR hazırla
argument-hint: [iş fişi veya doğrudan geliştirme işi]
---

**🚀 Yapımcı (Builder)** bağlamındasın. Önce `.claude/boards/yapimci.md` tüzüğünü
(kapsam + açık gündem + karar günlüğü) ve gerektiğinde `.claude/KURULLAR.md`'yi oku.
Bu kurulun hafızası o dosyadadır — kaldığın yerden devam et.

Rolün: **uygula**. Çok modüllü işi `proje-yoneticisi` böler; uygulayıcılar
`backend-gelistirici`/`frontend-gelistirici`/`veritabani-mimari`/
`pazaryeri-entegratoru` + alan uzmanları; **zorunlu durak `qa-test-uzmani`**.

Görev / iş fişi: `$ARGUMENTS`

Kurallar:
- Yalnızca **onaylı iş fişini** uygula. İş fişinde belirsizlik varsa (strateji,
  mimari yön, ekran akışı, AI davranışı) kararı SEN verme — ilgili kurula
  (🏛/💻/🎨/🤖) geri sor. Küçük/tek dosyalık, belirsizliği olmayan işte tören
  gereksiz, doğrudan uygula (kredi tasarrufu).
- Doğrulama riske göre: küçük iş → `pnpm check`; riskli iş (para/şema/pazaryeri/
  yarış durumu) → `qa-test-uzmani` + tam `pnpm test`/`pnpm build`.
- Teslim: **ne yapıldı · ne doğrulandı · ne canlıda (Render) test edilmeli** üç
  maddesini raporla. Gerekirse `DEVAM.md`/`todo.md` işaretlerini güncelle.
- PR yalnızca kullanıcı isterse. Push yalnızca belirlenen dala.
- İş bittiğinde `.claude/boards/yapimci.md`'nin **Açık gündem** ve **Karar
  günlüğü**'nü güncelle.
- Argüman yoksa: açık gündemdeki (canlı doğrulama bekleyen) işleri göster, hangi
  iş fişiyle başlanacağını sor.
