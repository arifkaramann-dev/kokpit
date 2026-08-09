import { useCallback, useState } from 'react';
import { Upload, X, Sparkles, AlertTriangle, Download, Loader2 } from 'lucide-react';

const OBJECTS = [
  { id: 'car', label: 'Otomobil', prompt: 'a modern sports car body' },
  { id: 'helmet', label: 'Kask', prompt: 'a motorcycle helmet' },
  { id: 'spoon', label: 'Numune kaşığı', prompt: 'an automotive paint test spray-out spoon' },
  { id: 'panel', label: 'Kaporta paneli', prompt: 'a curved automotive body panel' },
  { id: 'guitar', label: 'Gitar gövdesi', prompt: 'an electric guitar body' },
  { id: 'tank', label: 'Motosiklet deposu', prompt: 'a motorcycle fuel tank' },
];

const PROVIDERS = [
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { id: 'gemini-3.1-flash-image', label: 'Flash (hızlı)' },
      { id: 'gemini-3-pro-image', label: 'Pro (kaliteli)' },
      { id: 'gemini-2.5-flash-image', label: '2.5 Flash' },
    ],
    fix: 'Google Cloud konsolunda 950888106671 projesinde faturalandırmayı aç ve Generative Language API’yi etkinleştir.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1' },
      { id: 'gpt-image-1.5', label: 'gpt-image-1.5' },
      { id: 'gpt-image-2', label: 'gpt-image-2' },
    ],
    fix: 'platform.openai.com › Settings › Billing adresinden hesaba kredi yükle.',
  },
];

/** Dosyayı base64'e çevirir (data: öneki olmadan). */
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ data: result.slice(result.indexOf(',') + 1), mimeType: file.type || 'image/png' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AiStudioPage() {
  const [refs, setRefs] = useState([]);
  const [object, setObject] = useState(OBJECTS[0]);
  const [extra, setExtra] = useState('');
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [model, setModel] = useState(PROVIDERS[0].models[0].id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const addFiles = useCallback(async (files) => {
    const added = [];
    for (const file of files.slice(0, 6)) {
      // eslint-disable-next-line no-await-in-loop
      const encoded = await toBase64(file);
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        url: URL.createObjectURL(file),
        ...encoded,
      });
    }
    setRefs((prev) => [...prev, ...added].slice(0, 6));
  }, []);

  const generate = async () => {
    if (!refs.length) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const prompt = [
      `Look at the reference images and identify the exact paint colour and finish of the painted surface.`,
      `Generate a photorealistic studio photograph of ${object.prompt} painted in that exact colour and finish.`,
      `Match the hue, saturation, lightness, metallic flake and depth of the reference paint as closely as possible.`,
      `White seamless studio background, professional automotive catalogue lighting with large softboxes,`,
      `sharp elongated highlights along the body, visible clearcoat depth. No text, no watermark, no people.`,
      extra.trim(),
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: refs.map((r) => ({ data: r.data, mimeType: r.mimeType })),
          prompt,
          provider: provider.id,
          model,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError({ message: json.error || `HTTP ${res.status}`, status: json.status || res.status });
        return;
      }
      setResult(`data:${json.mimeType};base64,${json.image}`);
    } catch (err) {
      setError({ message: err.message });
    } finally {
      setBusy(false);
    }
  };

  // 429 = kota/kredi yok. Anahtar geçerli ama hesapta bakiye bulunmuyor.
  const quotaProblem = error?.status === 429;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">AI Üretim</h1>
      <p className="mt-1.5 text-sm text-neutral-500 max-w-2xl">
        Boyanın 2-3 referans görselini yükle, hangi objeyi istediğini seç. Model referanstaki rengi
        ve kaplamayı okuyup o boyayla boyanmış objenin stüdyo fotoğrafını üretir.
      </p>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6 mt-6">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-medium tracking-wide text-neutral-400 mb-3">
              REFERANS GÖRSELLER
            </div>

            {refs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
                {refs.map((r) => (
                  <div key={r.id} className="relative shrink-0">
                    <img
                      src={r.url}
                      alt={r.name}
                      className="w-24 h-20 object-cover rounded-xl border border-neutral-200"
                    />
                    <button
                      type="button"
                      onClick={() => setRefs((prev) => prev.filter((x) => x.id !== r.id))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-xl py-6 cursor-pointer text-sm text-neutral-500">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles([...e.target.files])}
              />
              <Upload className="w-4 h-4" />
              {refs.length ? 'Görsel ekle' : 'Boyanın referans görsellerini yükle'}
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-medium tracking-wide text-neutral-400 mb-2">OBJE</div>
            <div className="flex flex-wrap gap-1.5">
              {OBJECTS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setObject(o)}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    object.id === o.id
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Ek yönerge (isteğe bağlı) — örn. yandan görünüm, koyu zemin"
              className="w-full mt-3 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />

            <div className="flex items-center gap-2 mt-3">
              <select
                value={provider.id}
                onChange={(e) => {
                  const p = PROVIDERS.find((x) => x.id === e.target.value);
                  setProvider(p);
                  setModel(p.models[0].id);
                }}
                className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={generate}
                disabled={!refs.length || busy}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Üretiliyor…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Üret
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-100 text-[11px] font-medium tracking-wide text-neutral-400">
            SONUÇ
          </div>

          {error && (
            <div className="p-4">
              <div className="flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium">
                    {quotaProblem
                      ? `${provider.label}: bakiye yok`
                      : `${provider.label}: üretim başarısız`}
                  </div>
                  <div className="text-xs mt-1 break-words">{error.message}</div>
                </div>
              </div>

              {quotaProblem && (
                <div className="mt-3 text-xs text-neutral-600 leading-relaxed">
                  Anahtar geçerli, istek sağlayıcıya ulaşıyor — ama hesapta kullanılabilir bakiye
                  yok.
                  <div className="mt-2">{provider.fix}</div>
                  <div className="mt-2 text-neutral-400">
                    Bakiye yüklendiğinde bu sayfa değişiklik gerektirmeden çalışır. Diğer sağlayıcıyı
                    da deneyebilirsin.
                  </div>
                </div>
              )}
            </div>
          )}

          {!error && !result && !busy && (
            <div className="p-10 text-center text-sm text-neutral-400">
              Referans görsel yükle ve Üret&apos;e bas.
            </div>
          )}

          {busy && (
            <div className="p-10 text-center text-sm text-neutral-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
              Model çalışıyor…
            </div>
          )}

          {result && (
            <div>
              <img src={result} alt="Üretilen görsel" className="w-full" />
              <div className="px-4 py-3 border-t border-neutral-100 flex justify-end">
                <a
                  href={result}
                  download={`aoc-${object.id}.png`}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <Download className="w-3.5 h-3.5" /> İndir
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
