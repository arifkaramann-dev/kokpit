# Pazaryeri API'leri — Tam Referans (Trendyol & Hepsiburada)

Resmi belgelerden (developers.trendyol.com / developers.hepsiburada.com, 2026) doğrulanmış **tam API modeli**. Her entegrasyon değişikliğinde, payload hatası tanılandığında, rate limit sınırı kalkınca buraıya bakılır.

---

## Trendyol Satıcı API

### Kimlik Doğrulama & Temel Bilgiler

| Bilgi | Değer | Render env | Kod kullanımı |
|---|---|---|---|
| **Kimlik Yöntemi** | HTTP **Basic auth** (standart) | — | `base64(API_KEY:API_SECRET)` |
| **User-Agent (zorunlu)** | `"{SellerID} - SelfIntegration"` | — | Header'a gömülü; yoksa **403** |
| **Tabanlar** | canlı `apigw.trendyol.com` / stage `stageapigw.trendyol.com` | `TRENDYOL_API_BASE_URL` | — |
| **storeFrontCode** | Header parameter (brand list vb) | `TRENDYOL_STOREFRONT_CODE` | Header'da gerekli |
| **Rate Limit** | product: **60 req/min** · order: **600 req/min** · stock-price: **100 req/min** | — | Retry-After header'ını oku; 429 → exponential backoff |
| **Response Header** | `X-RateLimit-Remaining`, `Retry-After` | — | — |

### 1. Ürün Yaratma (createProduct v2)

> v1 eylül 15, 2026'da kapanıyor — v2 kullanmak zorunlu.

**Endpoint:** `POST /integration/product/v2/sellers/{sellerId}/products`

**Payload Modeli:**

```json
{
  "products": [
    {
      "barcode": "string (max 40, special: . - _ only)",
      "title": "string (max 100)",
      "productMainId": "string (max 40, variant group ID)",
      "brandId": number,
      "categoryId": number,
      "quantity": number,
      "stockCode": "string",
      "description": "string (HTML, max 30,000 chars)",
      "listPrice": number,
      "salePrice": number,
      "vatRate": number (ör. 20),
      "images": [
        {
          "url": "https://... (1200x1800px, 96dpi)"
        }
      ],
      "attributes": {
        // kategori-spesifik — getAttributes'ten alınır
        "renk": "string",
        "beden": "string",
        // ... diğer özellikler
      }
    }
  ]
}
```

**Önemli Kurallar:**
- **Max 1,000 ürün per request**
- **listPrice >= salePrice** (zorunlu)
- **Images:** HTTPS URL, 1200×1800px, 96dpi
- **Kategorize:** en alt level categoryId (subcategory'si varsa gönderilmez)
- **Variants:** aynı `productMainId` → grouped (slicer vs varianter)
- **Approval:** gönderile ürün onay kuyruğuna girer, yayınlanmadan

**Response:**
```json
{
  "batchRequestId": "string"
}
```
→ batchRequestId ile `getBatchRequestResult` ile status kontrol et.

**Yaygın 400 Hatalar:**
- `"Invalid attribute value"` → getAttributes'te olmayan değer
- `"Barcode is invalid"` → format (max 40 char, special chars sınırlandırılı)
- `"ListPrice must be >= SalePrice"` → pricing kuralı
- `"Category does not exist or not leaf"` → subcategory seçilmiş

### 2. Kategori Ağacı (getCategoryTree)

**Endpoint:** `GET /integration/lookup/v2/sellers/{sellerId}/categories`

**Yanıt:** kategori ağacı, leaf'in subCategories: []

**Kurallar:**
- **Güncellenme:** düzenli → önce sorgula
- **Leaf kategori zorunlu:** subCategories boş olanla ürün gönder
- **Subcategory'li kategori:** üzerine ürün gönderilmez

### 3. Marka Listesi (getBrands)

**Endpoint:** `GET /integration/lookup/v2/sellers/{sellerId}/brands?page=0`

**Yanıt:** brandId + brandName

**Kurallar:**
- **Min 1,000 brand per sayfa**
- **Pagination:** page param
- **storeFrontCode header gerekli**
- **Prod/stage ayrı brandId'ler** — ortama göre değişir

### 4. Kategori Özellikleri (getAttributes)

**Endpoint:** `GET /integration/lookup/v2/sellers/{sellerId}/product-categories/{categoryId}/attributes`

**Yanıt:** kategori-spesifik attribute listesi

```json
{
  "attributes": [
    {
      "id": number,
      "name": "string (ör. 'Renk')",
      "required": boolean,
      "varianter": boolean,
      "slicer": boolean,
      "attributeValues": [
        {
          "id": number,
          "name": "string (ör. 'Kırmızı')"
        }
      ]
    }
  ]
}
```

**Kurallar:**
- **Haftalık güncelleme:** kategori attribute'ları değişebilir
- **required: true** → ürün gönderirken zorunlu
- **slicer: true** → renk vs, ürünü açar (ayrı listing)
- **varianter: true** → boyut vs, aynı sayfada

### 5. Stok & Fiyat Güncelleme (updatePriceAndInventory)

**Endpoint:** `POST /integration/inventory/sellers/{sellerId}/products/price-and-inventory`

**Payload:**

```json
{
  "items": [
    {
      "barcode": "string",
      "quantity": number,
      "salePrice": number,
      "listPrice": number
    }
  ]
}
```

**Kurallar:**
- **Max 1,000 SKU per request**
- **Max 20,000 units** per item
- **Duplicate prevention:** 15 dakika içinde aynı istek (barcode + qty + prices) tekrarlanamaz
- **listPrice >= salePrice**

**Response:**
```json
{
  "batchRequestId": "string"
}
```
→ getBatchRequestResult ile status kontrol.

### 6. Batch İşlem Durumu (getBatchRequestResult)

**Endpoint:** `GET /integration/batch-requests/{batchRequestId}/sellers/{sellerId}`

**Yanıt:**

```json
{
  "status": "PROCESSING" | "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED",
  "items": [
    {
      "lineNumber": 1,
      "status": "SUCCESS" | "FAILED",
      "failureReasons": ["string"]
    }
  ]
}
```

**failureReasons Örneği:**
- `"Barcode is not available for this seller"`
- `"Product quantity cannot exceed 20000"`
- `"Invalid image URL format"`

---

## Hepsiburada API'leri

### Kimlik Doğrulama & Temel Bilgiler

| Bilgi | Değer | Render env | Kod kullanımı |
|---|---|---|---|
| **Kimlik Modeli** | **Basic auth + User-Agent** (iki bileşen!) | — | — |
| **Basic auth (kullanıcı adı)** | **Merchant ID (GUID)** | `HEPSIBURADA_MERCHANT_ID` | `base64("{GUID}:{secretkey}")` |
| **Basic auth (şifre)** | **Secretkey** | `HEPSIBURADA_PASSWORD` | `base64("{merchantId}:{secretkey}")` |
| **User-Agent** | **Developer Username** (ör. `artofcolour_dev`) | `HEPSIBURADA_USERNAME` | Header'da zorunlu |
| **Servis Anahtarı** | OMS/Listing'den ayrı (opsiyonel, Listing için) | `HEPSIBURADA_SERVICE_KEY` | Listing secret yerine kullanılır |
| **Test ortam** | env değişkeni ile tüm `-sit` uçlarına geçer | `HEPSIBURADA_ENV=sit` | test: oto-senkron kapalı |
| **MPOP tabanı** | canlı: `mpop.hepsiburada.com` / test: `mpop-sit.hepsiburada.com` | `HEPSIBURADA_MPOP_BASE_URL` | — |
| **Rate Limit (MPOP)** | ~**100 req/min** | — | — |
| **Katalog penceresi** | **00:00–03:00 UTC** (ürün ekleme yalnızca bu saatler) | — | off-hours: queue'da bekler |

### 1. MPOP Katalog (Ürün Açma)

#### 1.1 JWT Kimlik Doğrulama

**Endpoint:** `POST /api/authenticate` (MPOP tabanında)

**Payload:**
```json
{
  "username": "{HEPSIBURADA_USERNAME}",
  "password": "{HEPSIBURADA_PASSWORD}",
  "authenticationType": "INTEGRATOR"
}
```

**Response:**
```json
{
  "id_token": "eyJ...",
  // ya da
  "token": "eyJ..."
}
```

**Kurallar:**
- **Token geçerlilik:** 24 saat
- **Hata (401):** username/password yanlış veya hesap INTEGRATOR olmayan

#### 1.2 Ürün Import

**Endpoint:** `POST /product/api/products/import` (multipart/form-data)

**Payload (JSON dosyası, form "file" alanında):**

```json
[
  {
    "categoryId": number,
    "merchant": "{MERCHANT_ID (GUID)}",
    "attributes": {
      "merchantSku": "string (benzersiz, max 50)",
      "VaryantGroupID": "string (variant group)",
      "Barcode": "string",
      "UrunAdi": "string (ürün adı, max ???)",
      "UrunAciklamasi": "string (html, açıklama)",
      "Marka": "string (marka adı)",
      "GarantiSuresi": number (ay, ör. 24),
      "kg": "string (ağırlık, ör. '1.5')",
      "tax_vat_rate": "string (ör. '20')",
      "price": "string (satış fiyatı, ör. '99.99')",
      "stock": "string (mevcut stok, ör. '10')",
      "Image1": "https://...",
      "Image2": "https://...",
      // ... Image3-Image5
      // Kategori-spesifik özellikler (renk, beden, vs)
    }
  }
]
```

**Alan Adları (camelCase/PascalCase — exact match zorunlu!):**

| Alan | Format | Zorunlu | Not |
|---|---|---|---|
| **merchantSku** | camelCase | ✓ | **HATALI: snake_case "merchant_sku"** → "Merchant sku can't be empty" |
| **VaryantGroupID** | PascalCase | ✓ | variant gruplaması |
| **Barcode** | PascalCase | ✓ | ürün kodu |
| **UrunAdi** | PascalCase (tr) | ✓ | ürün adı |
| **UrunAciklamasi** | PascalCase (tr) | ✗ | açıklama (HTML) |
| **Marka** | PascalCase (tr) | ✓ | marka adı |
| **GarantiSuresi** | PascalCase | ✗ | garanti süresi (ay) |
| **kg** | lowercase | ✗ | ağırlık |
| **tax_vat_rate** | snake_case | ✗ | KDV oranı (%) |
| **price** | lowercase | ✓ | satış fiyatı |
| **stock** | lowercase | ✓ | mevcut stok |
| **Image1..Image5** | PascalCase | ✗ | görseller (HTTPS) |

**Request Header (JWT):**
```
Authorization: Bearer {id_token}
Accept: application/json
```

**Response:**
```json
{
  "data": {
    "trackingId": "string"
  }
}
```

**Kurallar:**
- **Max item:** limit yok (ama import işlemi async)
- **Field name case sensitivity:** ZORUNLU (merchantSku ≠ merchant_sku) — uyumsuz field'lar HB'ye göre "empty" sayılır
- **Katalog saati:** 00:00–03:00 UTC dışında gönderilen ürün kuyrukte bekler
- **Onay:** tüm ürünler manuel/otomatik onay sürecine girer

**Yaygın Hatalar:**
- `"Merchant sku can't be empty"` → field adı yanlış (snake_case, lowercase)
- `"Category not found"` → categoryId yanlış/leaf değil
- `"Invalid barcode format"` → barcode kuralları
- `"Brand not found"` → marka adı sistem'de yok

#### 1.3 İthalatçı Durumu Sorgusu

**Endpoint:** `GET /ticket-api/api/integrator/status/{trackingId}` (eski: `/product/api/products/status/{trackingId}`)

**Response:**
```json
{
  "importStatus": "SUCCESS" | "FAILED" | "PROCESSING",
  "createdDate": "...",
  "completedDate": "...",
  "details": [
    {
      "lineNumber": 1,
      "status": "SUCCESS" | "FAILED",
      "validationResults": [
        {
          "type": "ERROR" | "WARNING",
          "message": "..."
        }
      ]
    }
  ]
}
```

**importStatus Değerleri:**
- **SUCCESS:** tüm ürünler onay kuyruğuna alındı
- **FAILED:** sistemsel hata (auth, server, etc)
- **PROCESSING:** henüz tamamlanmadı

**validationResults Örneği:**
- `"Merchant sku can't be empty"` → attributes.merchantSku boş/eksik
- `"Invalid barcode"` → Barcode format
- `"Category is not a leaf"` → categoryId'nin subcategory'si var

### 2. OMS (Sipariş Yönetimi)

#### 2.1 Siparişleri Listele

**Endpoint:** `GET /orders/merchantid/{merchantId}?offset={offset}&limit={limit}`

**Header:**
```
Authorization: Basic {base64(merchantId:secretkey)}
User-Agent: {developer_username}
```

**Response:** sipariş listesi (field adları account'a göre değişebilir — savunmacı parsing)

**Yanıt Biçimi Varyasyonları:**
- `{"items": [...]}` veya `{"orders": [...]}` veya `{"content": [...]}`
- Kalem: nested array (`items` / `details` / `lineItems`)

### 3. Listing (Stok & Fiyat)

#### 3.1 Toplu Güncelleme (price-uploads / stock-uploads)

**Endpoints:**
- Price: `POST /listings/merchantid/{merchantId}/price-uploads`
- Stock: `POST /listings/merchantid/{merchantId}/stock-uploads`

**Payload (ikisi de aynı format):**

```json
[
  {
    "merchantSku": "string",
    "price": number,
    "availableStock": number
  }
]
```

**Header:**
```
Authorization: Basic {base64(merchantId:serviceKey_or_secretkey)}
User-Agent: {developer_username}
Content-Type: application/json
```

**Response:**
```json
{
  "id": "string" (priceUploadId ya da stockUploadId)
}
```

**Kurallar:**
- **Max 4,000 SKU per request**
- **merchantSku:** Listing'de var olması gerekir (önceki import'ta kullanılmış)
- **Servis Anahtarı:** `HEPSIBURADA_SERVICE_KEY` varsa kulllan, yoksa secretkey

### 4. Katalog (MPOP) Özellikleri

**Endpoint:** `GET /product/api/categories/{categoryId}/attributes` (MPOP tabanında)

**Header:** JWT (Bearer token)

**Yanıt:** kategori-spesifik zorunlu + opsiyonel alanlar

---

## Pazaryeri-Spesifik Kurallar Tablosu

| Kriter | Trendyol | Hepsiburada |
|---|---|---|
| **Ürün Açma** | POST v2 + batch | POST MPOP katalog (JWT) |
| **Ürün Approval** | batch → onay kuyruğu | import → manuel/otomatik onay |
| **Max Item/Request** | 1,000 (product v2) · 1,000 (stock-price) | no explicit limit (MPOP) · 4,000 (Listing) |
| **Field Names** | snake_case (attributes.renk, attributes.beden) | camelCase + PascalCase (merchantSku, UrunAdi, Barcode) |
| **Auth** | Basic auth + User-Agent | Basic auth + User-Agent (OMS/Listing) + JWT (MPOP) |
| **Rate Limit** | 60 req/min (product) · 100 req/min (stock-price) | ~100 req/min (MPOP) · 4,000 SKU/request (Listing) |
| **Batch Tracking** | batchRequestId → getBatchRequestResult | trackingId → status query |
| **Price Rule** | listPrice >= salePrice | — |
| **Catalog Window** | — | 00:00–03:00 UTC (ürün ekleme) |
| **Variants** | productMainId (slicer vs varianter) | VaryantGroupID |
| **Category** | leaf category (subCategories: []) | leaf category (categoryId) |

---

## Ortak Hatalar & Çözümler

| Hata | Sebep | Çözüm |
|---|---|---|
| 401 Unauthorized | auth yanlış | Merchant ID/secretkey/username'i kontrol et; test vs canlı ortam eş miş? |
| 403 Forbidden | permission yok | Hesapta endpoint yetkisi var mı? Servis Anahtarı üretildi mi? |
| 400 Bad Request (invalid field name) | field adı yanlış format | Casing'i kontrol et: `merchant_sku` ❌ `merchantSku` ✓ |
| "Merchant sku can't be empty" | field eksik/boş | attributes.merchantSku varsa kontrol et; yanlış alan adı ise casing'i düzelt |
| 429 Too Many Requests | rate limit aşıldı | Retry-After header okuyup backoff yap |
| "Category is not a leaf" | subcategory seçilmiş | Ağacta en alt level categoryId kullan |
| "Product already exists" (HB) | duplikat merchantSku | Aynı SKU tekrar gönderme (15 min bekleme) |

---

## Referans Kaynakları

- [Trendyol Developers](https://developers.trendyol.com/)
- [Hepsiburada Developers](https://developers.hepsiburada.com/tr/)
- Kokpit kodunda: `server/trendyol.ts`, `server/hepsiburada.ts`, `server/hepsiburadaTest.ts`, `server/_core/env.ts`

---

**Son Güncelleme:** 2026-07-22 (resmi portalslar taranmış, field adları doğrulanmış)
