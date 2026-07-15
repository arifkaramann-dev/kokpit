# Art CFO Projesi Yapılacaklar Listesi

## V1 Özellikleri

- [ ] **PDF Yükleme (Sürükle-Bırak):**
  - [ ] Günlük kart hareketi PDF yükleme
  - [ ] Aylık kart ekstresi PDF yükleme
  - [ ] Sürükle-bırak desteği
  - [ ] Yüklenen PDF'leri arşivleme
  - [ ] Checksum tabanlı duplicate kontrolü

- [ ] **OCR ile Veri Çıkarma:**
  - [ ] PDF'lerden tarih çıkarma
  - [ ] PDF'lerden işlem saati çıkarma
  - [ ] PDF'lerden işlem tutarı çıkarma
  - [ ] PDF'lerden firma adı çıkarma
  - [ ] PDF'lerden taksit sayısı çıkarma
  - [ ] PDF'lerden kalan taksit çıkarma
  - [ ] PDF'lerden provizyon çıkarma
  - [ ] PDF'lerden kartın son 4 hanesini çıkarma
  - [ ] PDF'lerden iade işlemlerini tespit etme

- [ ] **AI ile İşlem Sınıflandırma:**
  - [ ] İşlemleri "İşletme", "Kişisel" veya "Belirsiz" olarak sınıflandırma
  - [ ] Kategori önerileri sunma (Hammadde, Kargo, Reklam, Yazılım, Yakıt, Ofis vb.)
  - [ ] AI güven puanı hesaplama
  - [ ] Belirsiz işlemler için kullanıcıya sorma mekanizması

- [ ] **Öğrenen AI Mekanizması:**
  - [ ] Kullanıcının kategori düzeltmelerini hafızaya alma
  - [ ] Aynı firmadan gelen sonraki işlemleri otomatik olarak doğru kategoriye atama

- [ ] **Dashboard:**
  - [ ] Toplam harcama gösterimi
  - [ ] İşletme gideri gösterimi
  - [ ] Kişisel harcama gösterimi
  - [ ] Kart borcu gösterimi
  - [ ] Bu ayki harcama gösterimi
  - [ ] Bu ay bitecek taksitler gösterimi
  - [ ] Yaklaşan son ödeme gösterimi
  - [ ] Kategori dağılımı grafiği
  - [ ] En çok harcama yapılan firmalar listesi
  - [ ] Aylık trend grafiği

- [ ] **Taksit Takibi:**
  - [ ] Aylık ekstrelerden aktif taksitleri çıkarma
  - [ ] Toplam taksit sayısı gösterimi
  - [ ] Kalan taksit sayısı gösterimi
  - [ ] Aylık ödeme tutarı gösterimi
  - [ ] Bitiş tarihi gösterimi

- [ ] **Doğal Dil Arama:**
  - [ ] Doğal dil sorgularıyla finansal verileri sorgulama yeteneği

- [ ] **Raporlama:**
  - [ ] PDF formatında dışa aktarma
  - [ ] Excel formatında dışa aktarma
  - [ ] CSV formatında dışa aktarma

- [ ] **AI Finans Asistanı:**
  - [ ] Sayfanın sağ altında sohbet arayüzü
  - [ ] Veritabanındaki verilere dayanarak finansal sorulara cevap verme

## Tasarım ve Teknoloji

- [ ] **Tasarım:**
  - [ ] Apple seviyesinde minimal, modern ve profesyonel arayüz
  - [ ] Dark Mode desteği
  - [ ] Glassmorphism efektleri
  - [ ] Responsive ve mobil uyumlu tasarım
  - [ ] Sade animasyonlar

- [ ] **Teknoloji Yığını:**
  - [ ] Frontend: Next.js, React, TypeScript, TailwindCSS, shadcn/ui
  - [ ] Backend: Node.js, NestJS (veya Next.js API)
  - [ ] Veritabanı: PostgreSQL
  - [ ] ORM: Prisma
  - [ ] AI: OpenAI API, Claude API desteği
  - [ ] OCR: Tesseract veya daha iyi bir OCR çözümü
  - [ ] Kimlik Doğrulama: Clerk veya Auth.js
  - [ ] Dosya Depolama: Local (geliştirme), S3 uyumlu yapı (üretim)
  - [ ] Grafikler: Recharts

## Kod Kalitesi ve Geliştirme Prensipleri

- [ ] Temiz mimari
- [ ] Feature-based architecture
- [ ] SOLID prensipleri
- [ ] Type Safe (TypeScript)
- [ ] ESLint ve Prettier entegrasyonu
- [ ] Unit Testler
- [ ] E2E Testler

## Geliştirme Yol Haritası

- [x] Ayrıntılı teknik analiz hazırla.
- [x] Klasör yapısını tasarla.
- [x] Veritabanını tasarla.
- [x] Drizzle şemasını oluştur.
- [x] UI Wireframe hazırla.
- [ ] Yol haritası çıkar.
- [ ] Görevleri küçük parçalara böl.
- [ ] Her görev tamamlandıktan sonra Git commit oluştur.
- [ ] Her büyük özellik için ayrı Pull Request hazırla.
- [ ] Kod yazarken her dosyayı açıklayan teknik dokümantasyon oluştur.


## Sprint 1: Temel Altyapı ve PDF Yükleme (Hafta 1-2)

### Backend Geliştirme
- [ ] PDF yükleme endpoint'i oluştur (POST /api/pdf/upload)
- [ ] Checksum hesaplama ve duplicate kontrolü
- [ ] PDF dosya depolama (S3 entegrasyonu)
- [ ] PDF metadata çıkarma (filename, size, upload date)

### Frontend Geliştirme
- [ ] PDF upload component'i oluştur (sürükle-bırak desteği)
- [ ] Upload progress göstergesi
- [ ] Yüklenen PDF'lerin listesi
- [ ] PDF silme ve indirme işlemleri

### Veritabanı
- [ ] pdfDocuments tablosuna veri yazma işlemleri
- [ ] Checksum indeksi oluşturma

---

## Sprint 2: OCR ve Veri Çıkarma (Hafta 3-4)

### Backend Geliştirme
- [ ] OCR entegrasyonu (Tesseract veya AWS Textract)
- [ ] PDF'den işlem verilerini çıkarma algoritması
- [ ] Tarih, saat, tutar, firma adı, taksit, provizyon parsing
- [ ] Kartın son 4 hanesini çıkarma
- [ ] İade işlemlerini tespit etme

### Frontend Geliştirme
- [ ] OCR işlem durumu göstergesi
- [ ] Çıkarılan verilerin ön izlemesi
- [ ] Veri doğrulama arayüzü (kullanıcı onayı)
- [ ] Hatalı veri düzeltme arayüzü

### Veritabanı
- [ ] transactions tablosuna veri yazma işlemleri

---

## Sprint 3: AI Sınıflandırma ve Öğrenen Mekanizması (Hafta 5-6)

### Backend Geliştirme
- [ ] OpenAI/Claude API entegrasyonu
- [ ] İşlem sınıflandırma prompt'u oluşturma
- [ ] Kategori önerisi ve güven puanı hesaplama
- [ ] Öğrenen AI mekanizması (user corrections)
- [ ] Firma-kategori mapping cache'i

### Frontend Geliştirme
- [ ] AI sınıflandırma sonuçlarını gösterme
- [ ] Kategori düzeltme arayüzü
- [ ] Güven puanı göstergesi
- [ ] Toplu sınıflandırma onayı

### Veritabanı
- [ ] aiAnalyses tablosuna veri yazma
- [ ] userCategoryCorrections tablosuna veri yazma

---

## Sprint 4: Dashboard ve Raporlama (Hafta 7-8)

### Backend Geliştirme
- [ ] Dashboard istatistikleri endpoint'i
- [ ] Kategori dağılımı hesaplama
- [ ] En çok harcama yapılan firmalar
- [ ] Aylık trend verisi
- [ ] PDF/Excel/CSV dışa aktarma endpoint'leri

### Frontend Geliştirme
- [ ] Dashboard layout'u
- [ ] Kart bileşenleri (toplam harcama, işletme, kişisel)
- [ ] Grafikler (pie chart, bar chart, line chart)
- [ ] Taksit takibi widget'ı
- [ ] Raporlama arayüzü

### Tasarım
- [ ] Dark mode tema uygulaması
- [ ] Glassmorphism efektleri
- [ ] Responsive tasarım (mobile, tablet, desktop)

---

## Sprint 5: AI Finans Asistanı (Hafta 9-10)

### Backend Geliştirme
- [ ] Chat API endpoint'i (POST /api/chat)
- [ ] Veritabanı verilerine dayalı sorgulama
- [ ] Doğal dil işleme (NLP)
- [ ] Chat geçmişi depolama
- [ ] Streaming response desteği

### Frontend Geliştirme
- [ ] Chat arayüzü bileşeni
- [ ] Mesaj geçmişi gösterimi
- [ ] Typing indicator
- [ ] Markdown rendering
- [ ] Sağ alt köşe widget'ı

---

## Sprint 6: Test, Optimizasyon ve Deployment (Hafta 11-12)

### Testing
- [ ] Unit testler (backend)
- [ ] Integration testler
- [ ] E2E testler (frontend)
- [ ] Performans testleri

### Optimizasyon
- [ ] Veritabanı sorgusu optimizasyonu
- [ ] Frontend bundle size optimizasyonu
- [ ] Caching stratejisi
- [ ] CDN entegrasyonu

### Deployment
- [ ] Production ortamı kurulumu
- [ ] CI/CD pipeline'ı
- [ ] Monitoring ve logging
- [ ] Backup stratejisi

---

## Teknik Borç ve Gelecek Geliştirmeler

- [ ] V2: Banka API entegrasyonu (otomatik işlem çekme)
- [ ] V2: Vergi hesaplaması ve KDV deductible işlemler
- [ ] V2: Bütçe planlama ve harcama tahminleri
- [ ] V2: Çoklu kart desteği
- [ ] V2: Mobil uygulama (React Native)
- [ ] V2: Muhasebe yazılımı entegrasyonu (Muhasebeci)
- [ ] V2: Gelişmiş raporlama ve analitik
