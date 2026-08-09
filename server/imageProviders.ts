/**
 * Görsel üretimi — doğrudan sağlayıcıya.
 *
 * ── Neden `_core/imageGeneration.ts` kullanılmıyor ────────────────────────
 * Çekirdekteki yardımcı, `BUILT_IN_FORGE_API_URL` ile tanımlanan bir iç
 * servise (`images.v1.ImageService`) gidiyor ve üretilen görseli yine aynı
 * servisin presign ucuyla S3'e yazıyor. O servis halka açık değil; uygulamayı
 * barındıran platform tarafından enjekte ediliyor. Render'da böyle bir
 * enjeksiyon yok, satın alınabilecek bir karşılığı da yok — yani o yol
 * canlıda baştan sona ölü.
 *
 * Burada OpenAI ve Gemini'ye DOĞRUDAN gidiliyor; ikisi de kullanıcının kendi
 * hesabından alabileceği anahtarlarla çalışır. Sonuç base64 olarak dönüyor,
 * hiçbir nesne deposuna ihtiyaç duyulmuyor — `masterImages` zaten görselleri
 * veritabanında tutuyor, aynı deseni izliyoruz.
 *
 * ── Sağlayıcı seçimi ──────────────────────────────────────────────────────
 * Hangi anahtar tanımlıysa o kullanılır. İkisi de varsa OpenAI tercih edilir:
 * `gpt-image-1` referans görselle düzenlemeyi (images/edits) doğrudan
 * destekliyor ve referansla üretim bu ekranın ana akışı.
 *
 * Hiçbiri yoksa `null` döner — çağıran taraf kullanıcıya ne yapması
 * gerektiğini söyleyebilsin diye, sessizce boş görsel üretilmez.
 */

export type ImageProviderId = "openai" | "gemini";

export type GenerateInput = {
  prompt: string;
  /** Şekli sabitleyen referans görsel. Verilirse düzenleme modunda çalışılır. */
  reference?: { b64: string; mimeType: string } | null;
  /** Model kimliği. Boşsa sağlayıcının varsayılanı kullanılır. */
  model?: string | null;
};

export type GenerateOutput = {
  /** `data:image/png;base64,...` */
  dataUrl: string;
  provider: ImageProviderId;
  /** Gerçekten kullanılan model — arayüz hangisiyle üretildiğini gösterir. */
  model: string;
};

/**
 * Arayüzde listelenen modeller.
 *
 * Liste bir KISIT değil, kolaylık: `generateProductImage` gelen model
 * kimliğini olduğu gibi sağlayıcıya geçirir. Sağlayıcı yeni bir model
 * çıkardığında kod değişmeden kullanılabilsin diye böyle — tanımadığı bir
 * kimlik gelirse hatayı sağlayıcı verir ve mesajı kullanıcıya ulaşır.
 */
export const IMAGE_MODELS: Record<ImageProviderId, Array<{ id: string; label: string }>> = {
  openai: [
    { id: "gpt-image-1", label: "gpt-image-1" },
    { id: "gpt-image-1.5", label: "gpt-image-1.5" },
    { id: "gpt-image-2", label: "gpt-image-2" },
  ],
  gemini: [
    { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash (hızlı)" },
    { id: "gemini-3-pro-image", label: "Gemini 3 Pro (kaliteli)" },
    { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash" },
  ],
};

const OPENAI_MODEL = "gpt-image-1";
const GEMINI_MODEL = "gemini-2.5-flash-image";

/**
 * `quality` yalnız onu tanıyan modele gönderilir.
 *
 * gpt-image-1 low/medium/high kabul ediyor; daha yeni modellerde parametrenin
 * karşılığı farklı olabiliyor ve tanımadığı bir değer bütün isteği 400'e
 * düşürüyor. Emin olmadığımız yerde göndermemek, üretimi hiç yapamamaktan
 * iyidir — kalite varsayılanı zaten makul.
 */
const QUALITY_MODELS = new Set(["gpt-image-1"]);

/** Hangi sağlayıcı yapılandırılmış? Yoksa null. */
export function activeImageProvider(): ImageProviderId | null {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

function b64ToBlob(b64: string, mimeType: string): Blob {
  const bytes = Buffer.from(b64, "base64");
  return new Blob([new Uint8Array(bytes)], { type: mimeType });
}

/** Sağlayıcı hatalarını okunur hale getirir — gövdedeki mesaj asıl ipucu. */
async function failure(provider: string, res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    detail = parsed.error?.message ?? body;
  } catch {
    // JSON değilse ham gövde kalsın
  }
  throw new Error(`${provider} görsel üretimi başarısız (${res.status}): ${detail.slice(0, 400)}`);
}

async function generateWithOpenAi({
  prompt,
  reference,
  model,
}: GenerateInput): Promise<GenerateOutput> {
  const key = process.env.OPENAI_API_KEY!;
  const chosen = model?.trim() || OPENAI_MODEL;

  // Referans varsa düzenleme ucu: model şekli korur, yalnız isteneni değiştirir.
  // Üretim ucuna referans veremiyoruz, o yüzden iki ayrı yol.
  const res = reference
    ? await (async () => {
        const form = new FormData();
        form.append("model", chosen);
        form.append("prompt", prompt);
        form.append("size", "1024x1024");
        form.append("image", b64ToBlob(reference.b64, reference.mimeType), "reference.png");
        return fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: { authorization: `Bearer ${key}` },
          body: form,
        });
      })()
    : await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: chosen,
          prompt,
          size: "1024x1024",
          ...(QUALITY_MODELS.has(chosen) ? { quality: "high" } : {}),
        }),
      });

  if (!res.ok) await failure("OpenAI", res);

  const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI görsel verisi döndürmedi");
  return { dataUrl: `data:image/png;base64,${b64}`, provider: "openai", model: chosen };
}

async function generateWithGemini({
  prompt,
  reference,
  model,
}: GenerateInput): Promise<GenerateOutput> {
  const key = process.env.GEMINI_API_KEY!;
  const chosen = model?.trim() || GEMINI_MODEL;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (reference) {
    parts.push({ inline_data: { mime_type: reference.mimeType, data: reference.b64 } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${chosen}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );

  if (!res.ok) await failure("Gemini", res);

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) throw new Error("Gemini görsel verisi döndürmedi");
  return {
    dataUrl: `data:${part?.inlineData?.mimeType || "image/png"};base64,${b64}`,
    provider: "gemini",
    model: chosen,
  };
}

/**
 * Görsel üretir ve data URL döner.
 *
 * @throws yapılandırılmış sağlayıcı yoksa ya da sağlayıcı hata verirse
 */
export async function generateProductImage(input: GenerateInput): Promise<GenerateOutput> {
  const provider = activeImageProvider();
  if (!provider) {
    throw new Error(
      "Görsel üretimi için sağlayıcı anahtarı tanımlı değil. Render → Environment altında " +
        "OPENAI_API_KEY ya da GEMINI_API_KEY girilmeli.",
    );
  }
  return provider === "openai" ? generateWithOpenAi(input) : generateWithGemini(input);
}
