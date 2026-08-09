import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Upload,
  X,
  Sparkles,
  Loader2,
  Download,
  AlertTriangle,
  Save,
  Check,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  SERIES,
  TEMPLATES,
  renderToDataUrl,
  getSeries,
  packagingForLine,
  defaultPackagingFor,
} from '@/lib/templates.js';
import {
  listColors,
  saveColor,
  deleteColor,
  markGenerated,
  subscribe,
} from '@/lib/colorLibrary.js';
import { getAsset, putAsset, deleteAsset } from '@/lib/assetStore.js';
import {
  hasMaster,
  getMasterImage,
  setMaster,
  clearMaster,
  subscribe as subscribeMasters,
} from '@/lib/masterStore.js';
import { resetAll, currentCounts } from '@/lib/reset.js';

const OBJECTS = [
  { id: 'spoon', label: 'Sprey damlası', prompt: 'an automotive paint spray-out test blob shaped like a stylised car silhouette, sitting on a clean white surface' },
  { id: 'helmet', label: 'Kask', prompt: 'a motorcycle helmet' },
  { id: 'panel', label: 'Kaporta paneli', prompt: 'a curved automotive body panel' },
  { id: 'car', label: 'Otomobil', prompt: 'a modern sports car body' },
  { id: 'tank', label: 'Motosiklet deposu', prompt: 'a motorcycle fuel tank' },
];

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', models: ['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1'] },
  { id: 'gemini', label: 'Gemini', models: ['gemini-3.1-flash-image', 'gemini-3-pro-image'] },
];

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result);
      resolve({ data: r.slice(r.indexOf(',') + 1), mimeType: file.type || 'image/png' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TemplatesPage() {
  const [paint, setPaint] = useState({
    code: 'VP1104',
    nameTr: 'SEDEFLİ MAVİ',
    nameEn: 'SEABLUE',
    seriesCode: 'VP',
    hex: '#0a56d6',
    packaging: defaultPackagingFor('VP'),
  });

  const [refs, setRefs] = useState([]);
  const [object, setObject] = useState(OBJECTS[0]);
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [model, setModel] = useState(PROVIDERS[0].models[0]);

  const [objectImage, setObjectImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [previews, setPreviews] = useState({});
  const [colors, setColors] = useState(() => listColors());
  const [saved, setSaved] = useState(null);
  const [fromLibrary, setFromLibrary] = useState(false);
  const fontReady = useRef(false);

  const [params, setParams] = useSearchParams();
  const [masterOn, setMasterOn] = useState(() => hasMaster(OBJECTS[0].id));

  useEffect(() => subscribe(() => setColors(listColors())), []);
  useEffect(() => subscribeMasters(() => setMasterOn(hasMaster(object.id))), [object.id]);
  useEffect(() => setMasterOn(hasMaster(object.id)), [object.id]);

  /**
   * Kayıtlı renge geçildiğinde: metadata'yı forma doldur, üretilmiş görsel
   * varsa depodan çek. Yeniden üretmiyoruz — aynı renk her zaman aynı
   * görseli göstermeli, yoksa katalog tutarsızlaşır.
   */
  const loadFromLibrary = useCallback(
    async (color) => {
      setPaint({
        id: color.id,
        code: color.code,
        nameTr: color.nameTr,
        nameEn: color.nameEn,
        seriesCode: color.seriesCode,
        hex: color.hex,
      });
      setError(null);
      setFromLibrary(true);
      const stored = await getAsset(color.id, object.id);
      setObjectImage(stored || null);
    },
    [object.id]
  );

  // Kütüphaneden gelen derin bağlantı: /sablonlar?renk=<id>
  useEffect(() => {
    const wanted = params.get('renk');
    if (!wanted) return;
    const color = colors.find((c) => c.id === wanted);
    if (!color) return;
    loadFromLibrary(color);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, colors]);

  // Obje değişince o renk için kayıtlı görseli getir
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!paint.id) return;
      const stored = await getAsset(paint.id, object.id);
      if (!cancelled) {
        setObjectImage(stored || null);
        setFromLibrary(Boolean(stored));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paint.id, object.id]);

  // Şablonlar canvas'a Goldman ile yazıyor; font yüklenmeden çizersek
  // tarayıcı yedek fonta düşer ve çıktı yanlış tipografiyle donar.
  useEffect(() => {
    let cancelled = false;
    document.fonts
      .load('700 48px Goldman')
      .then(() => document.fonts.load('400 48px Goldman'))
      .then(() => {
        if (!cancelled) fontReady.current = true;
      })
      .catch(() => {
        fontReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFiles = useCallback(async (files) => {
    const added = [];
    for (const file of files.slice(0, 6)) {
      // eslint-disable-next-line no-await-in-loop
      const enc = await toBase64(file);
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: URL.createObjectURL(file),
        ...enc,
      });
    }
    setRefs((prev) => [...prev, ...added].slice(0, 6));
  }, []);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setObjectImage(null);
    setPreviews({});

    // Master varsa ondan türetiyoruz: aynı şekil, yeni renk.
    //
    // Her rengi sıfırdan ürettirmek katalogu dağıtıyor — AI her seferinde
    // farklı bir form çiziyor ve müşteri iki numuneyi yan yana koyduğunda
    // renk farkını değil şekil farkını görüyor. Master referans olarak
    // gönderilince şekil, ışık ve kompozisyon sabit kalıyor.
    const master = await getMasterImage(object.id);

    const prompt = master
      ? [
          'The FIRST image is the master object. Reproduce it EXACTLY:',
          'identical shape, identical camera angle, identical lighting, identical composition,',
          'identical position and size in frame, identical white background.',
          refs.length
            ? 'Change ONLY the paint colour, matching the colour and finish of the other reference images.'
            : `Change ONLY the paint colour to exactly ${paint.hex}.`,
          'Do not redesign, do not move, do not rescale, do not change the shape.',
          'No text, no watermark, no logo.',
        ].join(' ')
      : [
          refs.length
            ? 'Look at the reference images and identify the exact paint colour and finish of the painted surface.'
            : `The paint colour is exactly ${paint.hex}.`,
          `Generate a photorealistic studio photograph of ${object.prompt} painted in that exact colour and finish.`,
          'Pure white seamless background. Professional product photography, large softbox lighting,',
          'sharp elongated highlights following the form, visible clearcoat depth and gloss.',
          'The object must be centred with clear margins. No text, no watermark, no logo, no people, no props.',
        ].join(' ');

    // Master ilk sırada — prompt "FIRST image" diye ona atıf yapıyor
    const images = [
      ...(master ? [{ data: master.split(',')[1], mimeType: 'image/png' }] : []),
      ...refs.map((r) => ({ data: r.data, mimeType: r.mimeType })),
    ];

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, prompt, provider: provider.id, model }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError({ message: json.error || `HTTP ${res.status}`, status: json.status || res.status });
        return;
      }
      const dataUrl = `data:${json.mimeType};base64,${json.image}`;
      setObjectImage(dataUrl);
      setFromLibrary(false);

      // Üretilen görsel doğrudan kütüphaneye yazılır. Bir daha üretilmez;
      // bu rengin bu objesi artık sabit.
      const record = saveColor(paint);
      setPaint((p) => ({ ...p, id: record.id }));
      await putAsset(record.id, object.id, dataUrl);
      markGenerated(record.id, object.id);
      setFromLibrary(true);
      setSaved(record.code);
      setTimeout(() => setSaved(null), 2500);
    } catch (err) {
      setError({ message: err.message });
    } finally {
      setBusy(false);
    }
  };

  /** Metadata'yı görsel üretmeden kaydet. */
  const saveMetaOnly = () => {
    const record = saveColor(paint);
    setPaint((p) => ({ ...p, id: record.id }));
    setSaved(record.code);
    setTimeout(() => setSaved(null), 2500);
  };

  /** Bu objenin görselini sil — yeniden üretilebilsin. */
  const regenerate = async () => {
    if (paint.id) await deleteAsset(paint.id, object.id);
    setObjectImage(null);
    setFromLibrary(false);
  };

  const newColor = () => {
    setPaint({ code: '', nameTr: '', nameEn: '', seriesCode: 'VP', hex: '#808080' });
    setObjectImage(null);
    setFromLibrary(false);
    setError(null);
  };

  /** Her şeyi siler. Geri dönüşü yok, o yüzden iki adımlı. */
  const wipeAll = async () => {
    const counts = currentCounts();
    const ok = window.confirm(
      `Tüm veriler silinecek:\n\n` +
        `• ${counts.colors} renk kaydı\n` +
        `• ${counts.fingerprints} eski tarama\n` +
        `• üretilmiş tüm görseller\n\n` +
        `Bu işlem geri alınamaz. Devam edilsin mi?`
    );
    if (!ok) return;
    await resetAll();
    newColor();
    setColors([]);
    window.location.reload();
  };

  // Obje ya da renk bilgisi değişince tüm şablonları yeniden çiz.
  //
  // Her şablon ayrı yakalanıyor: bozuk bir obje görseli tüm sayfayı
  // götürmesin. Görsel yüklenemezse o şablon renk alanıyla çizilir,
  // diğerleri etkilenmez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!fontReady.current) await document.fonts.ready;
      const out = {};
      for (const tpl of TEMPLATES) {
        try {
          // eslint-disable-next-line no-await-in-loop
          out[tpl.id] = await renderToDataUrl({ templateId: tpl.id, objectImage, paint });
        } catch {
          // eslint-disable-next-line no-await-in-loop
          out[tpl.id] = await renderToDataUrl({ templateId: tpl.id, objectImage: null, paint });
        }
      }
      if (!cancelled) setPreviews(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [objectImage, paint]);

  const downloadAll = () => {
    for (const tpl of TEMPLATES) {
      const url = previews[tpl.id];
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${paint.code}-${tpl.id}.png`;
      a.click();
    }
  };

  const field = (key, label, placeholder) => (
    <div>
      <label className="text-[11px] text-neutral-400">{label}</label>
      <input
        value={paint[key]}
        onChange={(e) => setPaint({ ...paint, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
      />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Şablonlar</h1>
      <p className="mt-1.5 text-sm text-neutral-500 max-w-2xl">
        Renk bilgisini gir, referans görselleri yükle. AI objeyi o renkte üretir, şablonlar
        markalı çıktıları hazırlar. Pazaryeri ana görseli bilerek metinsiz — Amazon ve
        benzerleri ana görselde yazı kabul etmiyor.
      </p>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6 mt-6">
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium tracking-wide text-neutral-400">
                KÜTÜPHANE ({colors.length})
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={newColor}
                  className="text-[11px] text-neutral-400 hover:text-neutral-900"
                >
                  + Yeni renk
                </button>
                <button
                  type="button"
                  onClick={wipeAll}
                  className="text-[11px] text-neutral-300 hover:text-rose-600"
                >
                  Tümünü temizle
                </button>
              </div>
            </div>

            {colors.length === 0 ? (
              <div className="text-xs text-neutral-400 py-2">
                Henüz kayıtlı renk yok. Üretince buraya kaydedilir.
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto -mx-1 px-1 space-y-1">
                {colors.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer ${
                      paint.id === c.id ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
                    }`}
                    onClick={() => loadFromLibrary(c)}
                  >
                    <i
                      className="w-7 h-7 rounded-md ring-1 ring-black/10 shrink-0"
                      style={{ background: c.hex }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{c.code}</div>
                      <div
                        className={`text-[10px] truncate ${
                          paint.id === c.id ? 'text-neutral-400' : 'text-neutral-400'
                        }`}
                      >
                        {c.nameEn} · {(c.generated || []).length} görsel
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteColor(c.id);
                        if (paint.id === c.id) newColor();
                      }}
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center opacity-40 hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-medium tracking-wide text-neutral-400">RENK</div>
              {saved && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                  <Check className="w-3 h-3" /> {saved} kaydedildi
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {field('code', 'Kod', 'VP1104')}
              <div>
                <label className="text-[11px] text-neutral-400">Seri</label>
                <select
                  value={paint.seriesCode}
                  onChange={(e) => {
                    const seriesCode = e.target.value;
                    // Seri değişince ambalaj da o hatta geçmeli — yoksa
                    // Vivid rengin yanında Meteor kutusu kalıyor.
                    setPaint({
                      ...paint,
                      seriesCode,
                      packaging: defaultPackagingFor(seriesCode, paint.packaging),
                    });
                  }}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
                >
                  {SERIES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {field('nameTr', 'Türkçe isim', 'SEDEFLİ MAVİ')}
            {field('nameEn', 'İngilizce isim', 'SEABLUE')}
            <div className="flex items-end gap-2">
              <div className="flex-1">{field('hex', 'Renk (hex)', '#0a56d6')}</div>
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(paint.hex) ? paint.hex : '#808080'}
                onChange={(e) => setPaint({ ...paint, hex: e.target.value })}
                className="w-11 h-[38px] rounded-lg border border-neutral-200 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-[11px] text-neutral-400">Ambalaj</label>
              <select
                value={defaultPackagingFor(paint.seriesCode, paint.packaging)}
                onChange={(e) => setPaint({ ...paint, packaging: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
              >
                {packagingForLine(getSeries(paint.seriesCode).line).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-medium tracking-wide text-neutral-400 mb-2">
              REFERANS GÖRSELLER
            </div>
            {refs.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-2">
                {refs.map((r) => (
                  <div key={r.id} className="relative shrink-0">
                    <img src={r.url} alt="" className="w-16 h-14 object-cover rounded-lg border border-neutral-200" />
                    <button
                      type="button"
                      onClick={() => setRefs((p) => p.filter((x) => x.id !== r.id))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-xl py-4 cursor-pointer text-xs text-neutral-500">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addFiles([...e.target.files])}
              />
              <Upload className="w-4 h-4" />
              {refs.length ? 'Görsel ekle' : 'Referans yükle (yoksa hex kullanılır)'}
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

            <div className="flex gap-2 mt-3">
              <select
                value={provider.id}
                onChange={(e) => {
                  const p = PROVIDERS.find((x) => x.id === e.target.value);
                  setProvider(p);
                  setModel(p.models[0]);
                }}
                className="px-2 py-2 rounded-lg border border-neutral-200 text-xs bg-white focus:outline-none"
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
                className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-neutral-200 text-xs bg-white focus:outline-none"
              >
                {provider.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`mt-3 rounded-lg px-3 py-2 text-[11px] border ${
                masterOn
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="flex items-start gap-1.5">
                {masterOn ? (
                  <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  {masterOn ? (
                    <>
                      <b>Master kilitli.</b> Yeni renkler bu şekli koruyarak üretilecek.
                      <button
                        type="button"
                        onClick={() => clearMaster(object.id)}
                        className="block mt-1 underline hover:no-underline"
                      >
                        Master&apos;ı kaldır
                      </button>
                    </>
                  ) : (
                    <>
                      <b>Master yok.</b> Her renk ayrı şekil üretir, katalog tutarsızlaşır.
                      Beğendiğin bir obje üretip master yap.
                    </>
                  )}
                </div>
              </div>
            </div>

            {objectImage && !masterOn && (
              <button
                type="button"
                onClick={() => setMaster(object.id, objectImage, { fromColor: paint.code })}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-white border border-neutral-300 text-sm px-4 py-2 rounded-lg hover:bg-neutral-100"
              >
                Bu objeyi master yap
              </button>
            )}

            {fromLibrary && objectImage ? (
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  Bu obje kütüphaneden geldi — yeniden üretilmiyor.
                </div>
                <button
                  type="button"
                  onClick={regenerate}
                  className="w-full inline-flex items-center justify-center gap-2 bg-white border border-neutral-200 text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-100"
                >
                  <RefreshCw className="w-4 h-4" /> Sil ve yeniden üret
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-800 disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Üretiliyor…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Objeyi Üret ve Kaydet
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={saveMetaOnly}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 text-xs text-neutral-500 hover:text-neutral-900 py-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Yalnızca renk bilgisini kaydet
            </button>

            {error && (
              <div className="mt-3 flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="break-words">{error.message}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={downloadAll}
            disabled={!Object.keys(previews).length}
            className="w-full inline-flex items-center justify-center gap-2 bg-white border border-neutral-200 text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-100 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Tümünü indir
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 content-start">
          {TEMPLATES.map((tpl) => (
            <div key={tpl.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-neutral-100 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-900 truncate">{tpl.label}</div>
                  <div className="text-[10px] text-neutral-400">
                    {tpl.width}×{tpl.height}
                    {tpl.bare && ' · metinsiz'}
                  </div>
                </div>
                {previews[tpl.id] && (
                  <a
                    href={previews[tpl.id]}
                    download={`${paint.code}-${tpl.id}.png`}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-neutral-900 text-white"
                  >
                    <Download className="w-3 h-3" /> İndir
                  </a>
                )}
              </div>
              {previews[tpl.id] ? (
                <img src={previews[tpl.id]} alt={tpl.label} className="w-full bg-neutral-50" />
              ) : (
                <div className="p-10 text-center text-xs text-neutral-400">hazırlanıyor…</div>
              )}
              <div className="px-3 py-2 text-[10px] text-neutral-400 border-t border-neutral-100">
                {tpl.hint}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
