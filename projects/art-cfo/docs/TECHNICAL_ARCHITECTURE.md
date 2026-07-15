# Art CFO - Teknik Mimari Belgeleri

## Proje Özeti

**Art CFO** (AI-Powered Financial Management Platform), kredi kartı harcamalarını PDF'lerden otomatik olarak analiz eden, AI destekli, modern ve profesyonel bir kişisel finans yönetim uygulamasıdır.

### Hedef Kullanıcılar
- Serbest muhasebeciler
- Küçük işletme sahipleri
- Yüksek harcamalı profesyoneller
- Finansal takip konusunda bilinçli bireyler

### Temel Değer Önermeleri
1. **Otomatik Veri Çıkarma**: PDF'lerden işlem verilerini OCR ile otomatik çıkarma
2. **Akıllı Sınıflandırma**: AI ile işlemleri otomatik sınıflandırma ve kategori önerisi
3. **Öğrenen Sistem**: Kullanıcı düzeltmelerine dayalı otomatik öğrenme
4. **Kapsamlı Dashboard**: Finansal veriler hakkında gerçek zamanlı içgörüler
5. **AI Asistan**: Doğal dil sorguları ile finansal analiz

---

## Teknoloji Yığını

### Frontend
- **Framework**: Next.js 14+ (React 19)
- **Dil**: TypeScript
- **Stil**: TailwindCSS 4 + shadcn/ui
- **Durum Yönetimi**: TanStack Query (React Query)
- **API İletişimi**: tRPC
- **Grafikler**: Recharts
- **Animasyonlar**: Framer Motion
- **Form Yönetimi**: React Hook Form + Zod

### Backend
- **Runtime**: Node.js
- **Framework**: Express 4 + tRPC
- **Dil**: TypeScript
- **ORM**: Drizzle ORM
- **Veritabanı**: MySQL 8+
- **Kimlik Doğrulama**: Manus OAuth
- **Dosya Depolama**: AWS S3 (S3-compatible)

### AI/ML
- **LLM**: OpenAI GPT-4 / Claude 3
- **OCR**: Tesseract.js veya AWS Textract
- **NLP**: OpenAI Embeddings + Vector Search (gelecek)

### DevOps
- **Versiyon Kontrolü**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Deployment**: Manus WebDev (Autoscale)
- **Monitoring**: Manus Analytics
- **Logging**: Manus Logs

---

## Veritabanı Şeması

### Tablolar

#### 1. **users**
Manus OAuth ile entegre kullanıcı yönetimi.

```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,           -- UUID
  openId VARCHAR(64) UNIQUE NOT NULL,   -- Manus OAuth ID
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),              -- email, google, apple, microsoft, github
  role ENUM('user', 'admin') DEFAULT 'user',
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP DEFAULT NOW()
);
```

#### 2. **pdfDocuments**
Yüklenen PDF dosyalarının metadata'sı.

```sql
CREATE TABLE pdfDocuments (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,                -- S3 path
  uploadDate TIMESTAMP DEFAULT NOW(),
  documentType ENUM('DAILY_CARD_MOVEMENT', 'MONTHLY_STATEMENT') NOT NULL,
  checksum VARCHAR(255) UNIQUE NOT NULL, -- SHA-256 hash (duplicate kontrolü)
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

#### 3. **transactions**
OCR ile çıkarılan finansal işlemler.

```sql
CREATE TABLE transactions (
  id VARCHAR(36) PRIMARY KEY,
  pdfDocumentId VARCHAR(36) NOT NULL,
  userId VARCHAR(36) NOT NULL,
  transactionDate DATE NOT NULL,
  transactionTime TIMESTAMP NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  companyName VARCHAR(255) NOT NULL,
  last4DigitsOfCard VARCHAR(4),
  isRefund BOOLEAN DEFAULT FALSE,
  provisionNumber VARCHAR(255),         -- Taksit numarası
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pdfDocumentId) REFERENCES pdfDocuments(id),
  FOREIGN KEY (userId) REFERENCES users(id)
);
```

#### 4. **categories**
İşlem kategorileri (önceden tanımlanmış + kullanıcı tanımlı).

```sql
CREATE TABLE categories (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  isPredefined BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP
);

-- Önceden tanımlanmış kategoriler:
-- Hammadde, Kargo, Reklam, Yazılım, Yakıt, Ofis, Seyahat, Yemek, Sağlık, Eğitim, vb.
```

#### 5. **aiAnalyses**
AI sınıflandırma sonuçları ve güven puanları.

```sql
CREATE TABLE aiAnalyses (
  id VARCHAR(36) PRIMARY KEY,
  transactionId VARCHAR(36) UNIQUE NOT NULL,
  classification ENUM('BUSINESS', 'PERSONAL', 'UNCERTAIN') NOT NULL,
  suggestedCategoryId VARCHAR(36) NOT NULL,
  confidenceScore DECIMAL(5, 2) NOT NULL, -- 0-100
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (transactionId) REFERENCES transactions(id),
  FOREIGN KEY (suggestedCategoryId) REFERENCES categories(id)
);
```

#### 6. **userCategoryCorrections**
Öğrenen AI mekanizması - kullanıcı düzeltmeleri.

```sql
CREATE TABLE userCategoryCorrections (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  companyName VARCHAR(255) NOT NULL,
  correctedCategoryId VARCHAR(36) NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (correctedCategoryId) REFERENCES categories(id),
  UNIQUE KEY (userId, companyName)  -- Firma başına bir kategori
);
```

#### 7. **installments**
Taksit takibi bilgileri.

```sql
CREATE TABLE installments (
  id VARCHAR(36) PRIMARY KEY,
  transactionId VARCHAR(36) UNIQUE NOT NULL,
  totalInstallments INT NOT NULL,
  remainingInstallments INT NOT NULL,
  monthlyPayment DECIMAL(10, 2) NOT NULL,
  endDate DATE NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (transactionId) REFERENCES transactions(id)
);
```

---

## API Mimarisi (tRPC)

### Procedure Yapısı

```typescript
// server/routers.ts
export const appRouter = router({
  // PDF Yönetimi
  pdf: router({
    upload: protectedProcedure
      .input(z.object({ file: z.instanceof(File), documentType: z.enum(['DAILY_CARD_MOVEMENT', 'MONTHLY_STATEMENT']) }))
      .mutation(async ({ ctx, input }) => { /* ... */ }),
    
    list: protectedProcedure
      .query(async ({ ctx }) => { /* ... */ }),
    
    delete: protectedProcedure
      .input(z.object({ pdfId: z.string() }))
      .mutation(async ({ ctx, input }) => { /* ... */ }),
  }),

  // İşlem Yönetimi
  transaction: router({
    list: protectedProcedure
      .input(z.object({ 
        skip: z.number().default(0), 
        take: z.number().default(50),
        filters: z.object({
          classification: z.enum(['BUSINESS', 'PERSONAL', 'UNCERTAIN']).optional(),
          categoryId: z.string().optional(),
          dateRange: z.object({ from: z.date(), to: z.date() }).optional(),
        }).optional()
      }))
      .query(async ({ ctx, input }) => { /* ... */ }),
    
    approve: protectedProcedure
      .input(z.object({ transactionId: z.string(), categoryId: z.string() }))
      .mutation(async ({ ctx, input }) => { /* ... */ }),
  }),

  // Dashboard
  dashboard: router({
    summary: protectedProcedure
      .query(async ({ ctx }) => { /* ... */ }),
    
    categoryDistribution: protectedProcedure
      .query(async ({ ctx }) => { /* ... */ }),
    
    topCompanies: protectedProcedure
      .query(async ({ ctx }) => { /* ... */ }),
    
    monthlyTrend: protectedProcedure
      .query(async ({ ctx }) => { /* ... */ }),
  }),

  // AI Chat
  chat: router({
    send: protectedProcedure
      .input(z.object({ message: z.string() }))
      .mutation(async ({ ctx, input }) => { /* ... */ }),
  }),
});
```

---

## Klasör Yapısı

```
art-cfo/
├── client/                          # Frontend (React/Next.js)
│   ├── public/                      # Static assets
│   ├── src/
│   │   ├── pages/                   # Page components
│   │   │   ├── Home.tsx             # Dashboard
│   │   │   ├── Upload.tsx           # PDF upload
│   │   │   ├── Transactions.tsx     # Transaction list
│   │   │   └── Reports.tsx          # Raporlama
│   │   ├── components/
│   │   │   ├── DashboardLayout.tsx  # Main layout
│   │   │   ├── PDFUpload.tsx        # Upload component
│   │   │   ├── TransactionList.tsx  # Transaction table
│   │   │   ├── AIChatBox.tsx        # Chat interface
│   │   │   ├── Charts/              # Chart components
│   │   │   └── ui/                  # shadcn/ui components
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── lib/                     # Utilities
│   │   │   ├── trpc.ts              # tRPC client
│   │   │   └── utils.ts             # Helper functions
│   │   ├── contexts/                # React contexts
│   │   ├── App.tsx                  # Routes
│   │   ├── main.tsx                 # Entry point
│   │   └── index.css                # Global styles
│   ├── index.html
│   └── vite.config.ts
│
├── server/                          # Backend (Node.js + Express + tRPC)
│   ├── routers.ts                   # tRPC procedures
│   ├── db.ts                        # Database queries
│   ├── _core/
│   │   ├── index.ts                 # Express app setup
│   │   ├── context.ts               # tRPC context
│   │   ├── trpc.ts                  # tRPC initialization
│   │   ├── oauth.ts                 # OAuth routes
│   │   ├── llm.ts                   # LLM integration
│   │   ├── imageGeneration.ts       # Image generation
│   │   ├── voiceTranscription.ts    # Voice to text
│   │   ├── notification.ts          # Notifications
│   │   ├── dataApi.ts               # Data API
│   │   ├── storageProxy.ts          # S3 storage
│   │   └── env.ts                   # Environment variables
│   └── features/                    # Feature-specific logic (gelecek)
│       ├── pdf/
│       │   ├── pdf.service.ts       # PDF processing
│       │   ├── ocr.service.ts       # OCR logic
│       │   └── pdf.router.ts        # PDF routes
│       ├── ai/
│       │   ├── classification.service.ts  # AI classification
│       │   ├── learning.service.ts       # Learning mechanism
│       │   └── ai.router.ts              # AI routes
│       └── dashboard/
│           ├── dashboard.service.ts  # Dashboard logic
│           └── dashboard.router.ts   # Dashboard routes
│
├── drizzle/                         # Database migrations
│   ├── schema.ts                    # Drizzle schema
│   ├── relations.ts                 # Relationships
│   ├── migrations/
│   │   └── 0001_initial.sql
│   └── drizzle.config.ts
│
├── shared/                          # Shared code
│   ├── types.ts                     # Shared types
│   ├── const.ts                     # Constants
│   └── _core/
│       └── errors.ts                # Error definitions
│
├── storage/                         # S3 helpers
│   └── index.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── drizzle.config.ts
├── .env.example
├── .gitignore
├── README.md
├── TECHNICAL_ARCHITECTURE.md        # Bu dosya
└── todo.md                          # Görev listesi
```

---

## Önemli Tasarım Kararları

### 1. **UUID vs Auto-increment ID**
- **Karar**: UUID (VARCHAR(36)) kullanıyoruz
- **Neden**: Dağıtılmış sistemlerde ölçeklenebilirlik, privacy (sequential ID'ler tahmin edilebilir)

### 2. **Checksum-based Duplicate Detection**
- **Karar**: PDF dosyalarının SHA-256 hash'ini saklıyoruz
- **Neden**: Aynı PDF'nin birden fazla kez yüklenmesini önlemek

### 3. **Confidence Score (0-100)**
- **Karar**: AI sınıflandırma güven puanı DECIMAL(5,2)
- **Neden**: Kullanıcıya hangi sınıflandırmaların güvenilir olduğunu göstermek

### 4. **Öğrenen AI Mekanizması**
- **Karar**: userCategoryCorrections tablosunda firma-kategori mapping
- **Neden**: Aynı firmadan gelen işlemleri otomatik sınıflandırmak

### 5. **Taksit Takibi**
- **Karar**: installments tablosunda totalInstallments ve remainingInstallments
- **Neden**: Aylık ödeme tutarı ve bitiş tarihini hesaplamak

---

## Güvenlik Mimarisi

### Kimlik Doğrulama
- Manus OAuth 2.0 kullanıyoruz
- JWT session token'ları HttpOnly cookies'de saklanıyor
- CSRF koruması aktif

### Yetkilendirme
- `protectedProcedure` ile tüm hassas işlemler korunuyor
- Kullanıcılar sadece kendi verilerine erişebiliyor
- Admin role'ü gelecek için hazırlanmış

### Veri Güvenliği
- Tüm PDF'ler S3'te şifreli depolanıyor
- Veritabanı bağlantısı SSL/TLS ile korunuyor
- Sensitive bilgiler (API keys) environment variables'da

### API Güvenliği
- Rate limiting (gelecek)
- Input validation (Zod ile)
- SQL injection koruması (Drizzle ORM)
- XSS koruması (React + Content Security Policy)

---

## Performans Optimizasyonları

### Frontend
- Code splitting (dynamic imports)
- Image optimization (WebP, lazy loading)
- CSS-in-JS optimization (TailwindCSS)
- React Query caching

### Backend
- Veritabanı indeksleri (userId, companyName, transactionDate)
- Query optimization (SELECT only needed fields)
- Response caching (Redis - gelecek)
- Pagination (50 items per page default)

### Veritabanı
- Foreign key indeksleri
- Composite indeksleri (userId, transactionDate)
- Partition strategy (tarih bazlı - gelecek)

---

## Monitoring ve Logging

### Manus Analytics
- Sayfa görüntülemeleri (PV/UV)
- Kullanıcı davranışları
- Hata takibi

### Custom Logging
- Server-side: Express middleware
- Client-side: Browser console + error tracking
- Structured logging (JSON format)

---

## Deployment Stratejisi

### Geliştirme
- Local development: `pnpm dev`
- Hot reload: Vite + tsx watch
- Database: Local MySQL

### Staging
- Manus WebDev (Autoscale)
- Production-like environment
- Full testing

### Production
- Manus WebDev (Autoscale)
- Auto-scaling: 0-N instances
- CDN: Manus CDN
- Backup: Daily snapshots

---

## Gelecek Geliştirmeler (V2+)

### Özellikler
- Banka API entegrasyonu (otomatik işlem çekme)
- Vergi hesaplaması ve KDV deductible işlemler
- Bütçe planlama ve harcama tahminleri
- Çoklu kart desteği
- Mobil uygulama (React Native)
- Muhasebe yazılımı entegrasyonu

### Teknoloji
- Vector database (Pinecone) - semantic search
- Real-time notifications (WebSocket)
- GraphQL API (REST'e ek olarak)
- Microservices architecture (gelecek)

---

## Kaynaklar ve Referanslar

- [Drizzle ORM Docs](https://orm.drizzle.team)
- [tRPC Docs](https://trpc.io)
- [TailwindCSS Docs](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [React Query Docs](https://tanstack.com/query/latest)
- [OpenAI API Docs](https://platform.openai.com/docs)

---

**Son Güncelleme**: 15 Temmuz 2026
**Versiyon**: 1.0
**Yazarlar**: Senior Full Stack Developer, AI Engineer, Financial Software Architect
