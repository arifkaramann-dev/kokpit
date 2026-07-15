# Art CFO - AI Destekli Finansal Yönetim Platformu

**Art CFO**, kredi kartı harcamalarını PDF'lerden otomatik olarak analiz eden, AI destekli, modern ve profesyonel bir kişisel finans yönetim uygulamasıdır.

## 🎯 Proje Amacı

Serbest muhasebeciler, küçük işletme sahipleri ve yüksek harcamalı profesyonellerin finansal verilerini kolayca takip etmelerini sağlamak. Özellikle:

- **Otomatik Veri Çıkarma**: Kredi kartı PDF'lerinden işlem verilerini OCR ile otomatik çıkarma
- **Akıllı Sınıflandırma**: AI ile işlemleri otomatik sınıflandırma ve kategori önerisi
- **Öğrenen Sistem**: Kullanıcı düzeltmelerine dayalı otomatik öğrenme
- **Kapsamlı Dashboard**: Finansal veriler hakkında gerçek zamanlı içgörüler
- **AI Asistan**: Doğal dil sorguları ile finansal analiz

## 🚀 V1 Özellikleri

### 1. PDF Yükleme (Sürükle-Bırak)
- Günlük kart hareketi ve aylık ekstre PDF'lerini sürükle-bırak yöntemiyle yükleme
- Yüklenen dosyaları arşivleme
- Checksum tabanlı duplicate kontrolü

### 2. OCR ile Veri Çıkarma
- Tarih, saat, tutar, firma adı, taksit bilgileri, provizyon ve kartın son 4 hanesi
- Otomatik iade işlemi tespiti

### 3. AI ile İşlem Sınıflandırma
- "İşletme", "Kişisel" veya "Belirsiz" olarak sınıflandırma
- Kategori önerileri (Hammadde, Kargo, Reklam, Yazılım, Yakıt, Ofis vb.)
- Güven puanı hesaplama

### 4. Öğrenen AI Mekanizması
- Kullanıcı düzeltmelerini hafızaya alma
- Aynı firmadan gelen sonraki işlemleri otomatik sınıflandırma

### 5. Dashboard
- Toplam harcama, işletme/kişisel gider dağılımı
- Kategori grafikleri, en çok harcama yapılan firmalar
- Aylık trend bilgileri
- Taksit takibi widget'ı

### 6. Doğal Dil Arama
- "Bu ay Koçtaş'a ne kadar ödedim?" gibi sorgulamalar

### 7. Raporlama
- PDF, Excel ve CSV formatlarında dışa aktarma

### 8. AI Finans Asistanı
- Sayfanın sağ alt köşesinde sohbet arayüzü
- Veritabanındaki verilere dayanarak finansal sorulara cevap verme

### 9. Dark Mode & Glassmorphism
- Apple seviyesinde minimal, modern ve profesyonel tasarım
- Dark mode ve glassmorphism efektleri
- Mobil cihazlarla tam uyumlu

## 🛠️ Teknoloji Yığını

### Frontend
- Next.js 14+ (React 19)
- TypeScript
- TailwindCSS 4 + shadcn/ui
- tRPC + TanStack Query
- Recharts (grafikler)
- Framer Motion (animasyonlar)

### Backend
- Node.js + Express
- tRPC
- Drizzle ORM
- MySQL 8+
- Manus OAuth

### AI/ML
- OpenAI GPT-4 / Claude 3
- Tesseract.js (OCR)

### DevOps
- Git + GitHub
- GitHub Actions (CI/CD)
- Manus WebDev (Autoscale deployment)

## 📁 Proje Yapısı

```
art-cfo/
├── client/                  # Frontend (React/Next.js)
├── server/                  # Backend (Node.js + Express + tRPC)
├── drizzle/                 # Database migrations
├── shared/                  # Shared code
├── docs/
│   ├── TECHNICAL_ARCHITECTURE.md
│   └── todo.md
└── README.md
```

## 📊 Veritabanı Şeması

7 ana tablo:
- **users**: Kullanıcı yönetimi
- **pdfDocuments**: Yüklenen PDF dosyaları
- **transactions**: Çıkarılan finansal işlemler
- **categories**: İşlem kategorileri
- **aiAnalyses**: AI sınıflandırma sonuçları
- **userCategoryCorrections**: Öğrenen AI mekanizması
- **installments**: Taksit takibi

Detaylı şema: [TECHNICAL_ARCHITECTURE.md](./docs/TECHNICAL_ARCHITECTURE.md)

## 🗺️ Geliştirme Yol Haritası

### Sprint 1: Temel Altyapı ve PDF Yükleme (Hafta 1-2)
- PDF yükleme endpoint'i
- Checksum ve duplicate kontrolü
- Frontend upload component'i

### Sprint 2: OCR ve Veri Çıkarma (Hafta 3-4)
- OCR entegrasyonu
- Veri çıkarma algoritması
- Veri doğrulama arayüzü

### Sprint 3: AI Sınıflandırma (Hafta 5-6)
- OpenAI/Claude API entegrasyonu
- Kategori önerisi ve güven puanı
- Öğrenen AI mekanizması

### Sprint 4: Dashboard ve Raporlama (Hafta 7-8)
- Dashboard istatistikleri
- Grafikler ve widget'lar
- Dışa aktarma (PDF/Excel/CSV)

### Sprint 5: AI Finans Asistanı (Hafta 9-10)
- Chat API endpoint'i
- Doğal dil işleme
- Chat arayüzü

### Sprint 6: Test ve Deployment (Hafta 11-12)
- Unit ve integration testler
- Performans optimizasyonu
- Production deployment

Detaylı görev listesi: [todo.md](./docs/todo.md)

## 🔐 Güvenlik

- Manus OAuth 2.0 kimlik doğrulaması
- JWT session token'ları (HttpOnly cookies)
- CSRF koruması
- Input validation (Zod)
- SQL injection koruması (Drizzle ORM)
- XSS koruması (React + CSP)
- S3 şifreli dosya depolama

## 📈 Performans

- Code splitting ve lazy loading
- Image optimization (WebP)
- Database indexing
- Query optimization
- Response caching (gelecek)
- Redis caching (gelecek)

## 🚀 Başlangıç

### Geliştirme Ortamı Kurulumu

```bash
# Bağımlılıkları yükle
pnpm install

# Veritabanı migrasyonlarını çalıştır
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Geliştirme sunucusunu başlat
pnpm dev
```

### Environment Variables

```bash
# .env.local
DATABASE_URL=mysql://user:password@localhost:3306/art_cfo
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
OAUTH_SERVER_URL=https://api.manus.im
VITE_APP_ID=your-app-id
```

## 📝 Lisans

MIT

## 👥 Katkıda Bulunma

Katkılar hoş karşılanır! Lütfen bir pull request açın veya bir issue oluşturun.

## 📞 İletişim

- **Email**: contact@artcfo.com
- **Website**: https://artcfo.com
- **GitHub**: https://github.com/arifkaramann-dev/kokpit/projects/art-cfo

---

**Proje Durumu**: 🚧 Geliştirme Aşamasında (Sprint 1 Hazırlığı)

**Son Güncelleme**: 15 Temmuz 2026

**Versiyon**: 0.1.0 (Pre-alpha)
