---
description: 5 kalıcı sohbet (kurul) yapısını göster ve doğru kurula yönlendir
argument-hint: [opsiyonel: iş/soru — hangi kurula ait olduğunu söyleyeyim]
---

`.claude/KURULLAR.md` dosyasını oku ve 5 kurulu (🏛 Ürün Kurulu, 💻 Teknik Kurul,
🎨 UX Lab, 🤖 AI Lab, 🚀 Yapımcı) kısa özetle listele: her biri ne yapar ve hangi
komutla açılır.

Kullanıcı `$ARGUMENTS` ile bir iş/soru verdiyse:
1. Hangi kurulun kapsamına girdiğini söyle (birden çok kurul gerekiyorsa akış
   sırasını ver: önce hangi kurul karar verir, sonra kim uygular).
2. O kurula geçmek için hangi komutu çalıştıracağını öner (ör. `/teknik-kurul ...`).
3. Kullanıcı isterse doğrudan o kurulun bağlamına geçip işi başlat.

Argüman yoksa sadece tabloyu ve işleyiş döngüsünü göster, hangi komutla
başlanacağını sor.
