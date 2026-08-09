import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Google Gemini — referans görselleri metinle birlikte tek istekte alır. */
async function callGemini({ key, images, prompt, model }) {
  const parts = [
    ...images.map((img) => ({
      inline_data: { mime_type: img.mimeType || 'image/png', data: img.data },
    })),
    { text: prompt },
  ];

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
    }
  );

  const payload = await upstream.json();
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, error: payload?.error?.message };
  }

  const out = payload?.candidates?.[0]?.content?.parts || [];
  const image = out.find((p) => p.inline_data || p.inlineData);
  const text = out.find((p) => p.text)?.text || null;
  if (!image) return { ok: false, status: 502, error: 'model görsel döndürmedi', text };

  const inline = image.inline_data || image.inlineData;
  return {
    ok: true,
    image: inline.data,
    mimeType: inline.mime_type || inline.mimeType || 'image/png',
    text,
  };
}

/**
 * OpenAI — referans görsel varsa /images/edits (çoklu görsel kabul eder),
 * yoksa /images/generations.
 */
async function callOpenAI({ key, images, prompt, model }) {
  let upstream;

  if (images.length) {
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('size', '1024x1024');
    images.forEach((img, i) => {
      const bytes = Buffer.from(img.data, 'base64');
      form.append(
        'image[]',
        new Blob([bytes], { type: img.mimeType || 'image/png' }),
        `ref${i}.png`
      );
    });
    upstream = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    upstream = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size: '1024x1024', n: 1 }),
    });
  }

  const payload = await upstream.json();
  if (!upstream.ok) {
    return { ok: false, status: upstream.status, error: payload?.error?.message };
  }

  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) return { ok: false, status: 502, error: 'model görsel döndürmedi' };
  return { ok: true, image: b64, mimeType: 'image/png', text: null };
}

/**
 * Görsel üretim proxy'si.
 *
 * Neden sunucu tarafında: bu bir tarayıcı uygulaması. Anahtarı istemciye
 * verirsek (VITE_ öneki) derlenmiş pakete gömülür ve siteyi açan herkes
 * görür. Anahtarlar burada, Node tarafında kalıyor; tarayıcı yalnızca
 * /api/generate adresine istek atıyor.
 */
function imageProxy(env) {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/providers', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            gemini: Boolean(env.GEMINI_API_KEY),
            openai: Boolean(env.OPENAI_API_KEY),
          })
        );
      });

      server.middlewares.use('/api/generate', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'yalnızca POST' }));
          return;
        }

        try {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const {
            images = [],
            prompt = '',
            provider = 'gemini',
            model,
          } = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

          const key = provider === 'openai' ? env.OPENAI_API_KEY : env.GEMINI_API_KEY;
          if (!key) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                error: `.env.local içinde ${
                  provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'
                } yok`,
              })
            );
            return;
          }

          const result =
            provider === 'openai'
              ? await callOpenAI({ key, images, prompt, model: model || 'gpt-image-1' })
              : await callGemini({
                  key,
                  images,
                  prompt,
                  model: model || 'gemini-3.1-flash-image',
                });

          if (!result.ok) {
            res.statusCode = result.status || 500;
            res.end(
              JSON.stringify({
                error: result.error || 'üretim başarısız',
                status: result.status,
                provider,
                text: result.text || null,
              })
            );
            return;
          }

          res.statusCode = 200;
          res.end(JSON.stringify(result));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // '' öneki: VITE_ ile başlamayanları da yükle. Anahtar bilerek öneksiz —
  // öneki olsaydı istemciye sızardı.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), imageProxy(env)],
    resolve: {
      alias: { '@': path.resolve(process.cwd(), 'src') },
    },
    server: {
      port: 5173,
      open: true,
    },
  };
});
