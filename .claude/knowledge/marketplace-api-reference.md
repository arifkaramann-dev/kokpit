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

### 7. Sipariş Senkronu (Order Integration)

**Endpoint:** `GET /sales/sellers/{sellerId}/orders?offset={offset}&limit={limit}`

**Kimlik:** Basic auth + User-Agent (yukarıda)

**Yanıt:**
```json
{
  "orders": [
    {
      "orderNumber": "string",
      "status": "PENDING_PAYMENT" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED",
      "grandTotal": number,
      "lineItems": [
        {
          "id": "string",
          "barcode": "string",
          "quantity": number,
          "price": number,
          "totalPrice": number
        }
      ]
    }
  ],
  "totalCount": number
}
```

**Rate Limit:** 600 req/min (order endpoints)

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

### 2. OMS (Sipariş Yönetimi) — Test & Canlı

#### 2.0 Ortam & Kimlik

**SIT (Test) Ortamı:**
- Stub (test sipariş oluş): `https://oms-stub-external-sit.hepsiburada.com`
- OMS (sipariş listele): `https://oms-external-sit.hepsiburada.com`

**Canlı Ortam:**
- Base: `https://oms-external.hepsiburada.com`
- **SIT'te stub API vardır, canlıda YOKTUR**

**Header (tüm istekler):**
```
Authorization: Basic {base64(merchantId:secretkey)}
User-Agent: {developer_username}
Content-Type: application/json
Accept: application/json
```

#### 2.1 Test Siparişi Oluşturma (SIT Ortamı Yalnızca)

**Endpoint:** `POST /orders/merchantId/{merchantId}` (stub base'de)

**Amaç:** Canlıya geçiş öncesinde HB'nin istediği 3 kanıttan biri

**Payload:**
```json
{
  "OrderNumber": "1234567890",
  "OrderDate": "2026-07-22T10:30:00Z",
  "Customer": {
    "CustomerId": "string",
    "FirstName": "string",
    "LastName": "string",
    "Email": "string",
    "PhoneNumber": "string"
  },
  "DeliveryAddress": {
    "AddressId": "string",
    "FirstName": "string",
    "LastName": "string",
    "AddressLine": "string",
    "CityCode": number,
    "DistrictCode": number,
    "PostalCode": "string",
    "PhoneNumber": "string"
  },
  "LineItems": [
    {
      "Sku": "HB_SKU_123",
      "MerchantId": "{MERCHANT_ID}",
      "MerchantSku": "{SKU}",
      "Quantity": 1,
      "Price": {
        "Amount": 99.99,
        "Currency": "TRY"
      },
      "Vat": 19.99,
      "TotalPrice": 119.98,
      "CargoCompanyId": 1,
      "DeliveryOptionId": "STANDARD"
    }
  ]
}
```

**Kurallar:**
- **OrderNumber:** 10 haneli rakam (benzersiz)
- **Price.Amount + Vat = TotalPrice**

**Response:**
```json
{
  "orderId": "string",
  "orderNumber": "1234567890",
  "status": "PENDING_PAYMENT"
}
```

#### 2.2 Ödemesi Tamamlanmış Siparişleri Listele

**Endpoint:** `GET /orders/merchantid/{merchantId}?offset=0&limit=50`

**Header:** (Basic auth — yukarıda)

**Yanıt Biçimi Varyasyonları:**
- `{"items": [...]}` veya `{"orders": [...]}` veya `{"content": [...]}`

**Kalem Yapısı:**
```json
{
  "orderNumber": "1234567890",
  "orderId": "string",
  "status": "PAID",
  "lineItems": [
    {
      "id": "line-item-id",
      "sku": "HB_SKU",
      "merchantSku": "MERCHANT_SKU",
      "productName": "string",
      "quantity": 1,
      "price": 99.99
    }
  ]
}
```

**Kurallar:**
- **Limit:** max 50
- **Veri Saklama:** son 1 ay
- **Field adları savunmacı:** `sku`, `merchantSku`, `hbSku` — tüm varyasyonları dene

#### 2.3 Pakete Yerleştirme (Packaging)

**Endpoint:** `POST /packages/merchantid/{merchantId}`

**Payload:**
```json
{
  "lineItemRequests": [
    {
      "id": "{lineItemId}",
      "quantity": 1
    }
  ]
}
```

**Response:**
```json
{
  "packageNumber": "PKG123456789",
  "status": "CREATED"
}
```

**Kurallar:**
- **packageNumber:** HB'ye raporlanmalı (3. kanıt)

#### 2.4 Sipariş İptali

**Endpoint:** `POST /orders/{orderId}/cancel`

**Payload:**
```json
{
  "reason": "MERCHANT_REQUEST" | "OUT_OF_STOCK" | "CUSTOMER_REQUEST",
  "notes": "string"
}
```

**Ceza Tablosu (sipariş tutarına göre):**
- 0–50 TL → 10 TL
- 50–100 TL → 30 TL
- 100–200 TL → 50 TL
- 200–1,000 TL → 100 TL
- 1,000–3,000 TL → 300 TL
- 3,000–6,000 TL → 600 TL
- 6,000–10,000 TL → 1,000 TL
- 10,000–20,000 TL → 1,500 TL
- 20,000+ TL → 2,000 TL

### 3. Listing (Stok & Fiyat)

#### 3.1 Toplu Güncelleme (price-uploads / stock-uploads)

**Endpoints:**
- Price: `POST /listings/merchantid/{merchantId}/price-uploads`
- Stock: `POST /listings/merchantid/{merchantId}/stock-uploads`

**Payload:**
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
Accept: application/json
```

**Response:**
```json
{
  "id": "string"
}
```

**Kurallar:**
- **Max 4,000 SKU per request**
- **merchantSku:** daha önce import edilmiş olmalı
- **Servis Anahtarı:** varsa kullan, yoksa secretkey

#### 3.2 Inventory Listele (Ürün Envanterini Sorgula)

**Endpoint:** `GET /listings/merchantid/{merchantId}?offset=0&limit=50`

**Header:** (Basic auth — yukarıda)

**Yanıt Biçimi Varyasyonları:**
- `{"listings": [...]}` veya `{"data": [...]}` veya `{"items": [...]}`

**Kalem Yapısı:**
```json
{
  "merchantSku": "string",
  "hbSku": "string",
  "price": number,
  "availableStock": number
}
```

**Kurallar:**
- **Limit:** max 50
- **Field adları savunmacı:** `merchantSku`, `merchantsku`, `sku` — tüm varyasyonları dene
- **hbSku:** HB sistemindeki SKU (ürün import edilmişse mevcut)

### 4. Rate Limiting & Retry Stratejisi (OMS & Listing)

**Rate Limit:** 1,000 requests/sec (SIT & Canlı)

**Response Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

**429 Too Many Requests Hata Durumu:**

```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded"
}
```

**Retry Stratejisi:**

1. **İlk Deneme:** immediate
2. **429 Alındı:** `X-RateLimit-Reset` header'ındaki timestamp'e kadar bekle
3. **Header yok ise:** exponential backoff (1s → 2s → 4s → 8s → 16s)
4. **Max 5 retry** sonra fail

**Kod Örneği (pseudo):**
```javascript
async function retryWithBackoff(request, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(request);
      if (res.status === 429) {
        const resetTime = res.headers.get('X-RateLimit-Reset');
        const waitMs = resetTime ? (parseInt(resetTime) * 1000 - Date.now()) : Math.pow(2, i) * 1000;
        await sleep(Math.max(0, waitMs));
        continue;
      }
      return res;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

### 5. Katalog (MPOP) Özellikleri

**Endpoint:** `GET /product/api/categories/{categoryId}/attributes` (MPOP tabanında)

**Header:** JWT (Bearer token)

**Yanıt:** kategori-spesifik zorunlu + opsiyonel alanlar

---

## N11 Pazaryeri API (Araştırma Aşaması)

> **NOT:** Resmi N11 API belgelerine ulaşılamadı; eski SDK'lar ve üçüncü taraf entegratörler kullanılmakta.

**Bilinen Bilgiler:**
- **Auth:** API Key + API Secret (header-based)
- **Base:** `https://api.n11.com/api/` (unsecure HTTP da eski sistemlerde)
- **Endpoints:** `/order/list`, `/order/detail/{orderId}`, `/product/create`, `/product/list`
- **Response Format:** XML (legacy) veya JSON (newer versions)

**TODO:**
- [ ] Resmi N11 developer portalından (api.n11.com) eksik uç adreslerini al
- [ ] Auth header adlarını ve format'ını doğrula
- [ ] Rate limit bilgilerini al
- [ ] Ürün / sipariş payload şemalarını dokümante et

---

## Çiçeksepeti Pazaryeri API (Araştırma Aşaması)

> **NOT:** Çiçeksepeti API belgelerine kısıtlı erişim mevcut.

**Bilinen Bilgiler:**
- **Auth:** `x-api-key` header (API anahtarı)
- **Base:** `https://apis.ciceksepeti.com/`
- **Endpoints:** `/order`, `/product`, `/inventory`

**TODO:**
- [ ] Resmi Çiçeksepeti developer portalından endpoint listesi al
- [ ] Payload şemalarını dokümante et
- [ ] Rate limit ve error codes'ı al
- [ ] Test vs Canlı ortam ayrımını belirle

---

## Pazaryeri-Spesifik Kurallar Tablosu

| Kriter | Trendyol | Hepsiburada | N11 | Çiçeksepeti |
|---|---|---|---|---|
| **Ürün Açma** | POST v2 + batch | MPOP JWT (multipart) | SDK (XML/JSON) | REST + API Key |
| **Max Item/Request** | 1,000 | unlimited | — | — |
| **Field Names** | snake_case | camelCase+PascalCase | — | — |
| **Auth** | Basic + UA | Basic + UA + JWT | API Key/Secret | x-api-key header |
| **Rate Limit** | 60-600 req/min | 1,000 req/sec | — | — |
| **Batch Tracking** | batchRequestId | trackingId | — | — |
| **Price Rule** | listPrice ≥ salePrice | — | — | — |
| **Catalog Window** | — | 00:00–03:00 UTC | — | — |
| **Variants** | productMainId | VaryantGroupID | — | — |
| **Status** | ✓ Canlı | ✓ Canlı + SIT Test | ⚠ Eksik | ⚠ Eksik |

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
- Hepsiburada resmi "Genel Sipariş Entegrasyonu Önemli Bilgiler" dokümanı (05.06.2026 baskı) — kullanıcı tarafından sağlandı, test sipariş/paketleme/iptal/dijital teslimat/rate-limit bölümleri buradan alındı
- Kokpit kodunda: `server/trendyol.ts`, `server/hepsiburada.ts`, `server/hepsiburadaTest.ts`, `server/marketplace.ts`, `server/_core/env.ts`

**Eksik/Devam Eden Araştırma:**
- N11 resmi API dokümantasyonu (endpoint/payload/rate limit teyidi gerekiyor)
- Çiçeksepeti resmi API dokümantasyonu (endpoint/payload/rate limit teyidi gerekiyor)
- Webhook/push notification akışları (sipariş güncelleme, iptal, teslimat bildirimleri) — her iki pazaryeri için de doğrulanmadı

---

**Son Güncelleme:** 2026-07-23 (Hepsiburada sipariş entegrasyonu resmi dokümanla genişletildi: test sipariş oluşturma, paketleme, iptal ceza tablosu, dijital ürün teslimatı, rate limit/retry stratejisi; Trendyol sipariş senkron uç noktası eklendi; N11/Çiçeksepeti için araştırma iskeleti oluşturuldu)
