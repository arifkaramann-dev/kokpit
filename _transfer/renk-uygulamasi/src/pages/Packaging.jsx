import { useCallback, useEffect, useState } from 'react';
import { Upload, Trash2, Check, AlertTriangle, Package } from 'lucide-react';
import { PACKAGING } from '@/lib/templates.js';
import {
  listUserPackaging,
  saveUserPackaging,
  deleteUserPackaging,
  getUserPackagingImage,
  hasTransparency,
  subscribe,
} from '@/lib/packagingStore.js';

const LINES = ['VIVID', 'METEOR'];

export default function PackagingPage() {
  const [items, setItems] = useState(() => listUserPackaging());
  const [images, setImages] = useState({});
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => subscribe(() => setItems(listUserPackaging())), []);

  // Kayıtlı görselleri önizleme için çek
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out = {};
      for (const it of items) {
        // eslint-disable-next-line no-await-in-loop
        const img = await getUserPackagingImage(it.id);
        if (img) out[it.id] = img;
      }
      if (!cancelled) setImages(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const onFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const img = new window.Image();
      img.src = dataUrl;
      await img.decode();

      // Şeffaflık kontrolü: varsa şablonda fon temizleme adımı atlanır
      const alpha = hasTransparency(img);

      setDraft({
        dataUrl,
        alpha,
        label: file.name.replace(/\.[^.]+$/, ''),
        line: LINES[0],
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    } catch (err) {
      setError(err.message || 'görsel okunamadı');
    }
  }, []);

  const save = async () => {
    if (!draft) return;
    const rec = await saveUserPackaging(draft);
    setDraft(null);
    setSaved(rec.label);
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Ambalajlar</h1>
      <p className="mt-1.5 text-sm text-neutral-500 max-w-2xl">
        Şablonlarda kullanılan ambalaj görselleri. Kendi mockup&apos;larını yükleyip hangi ürün
        hattına ait olduğunu seçebilirsin — kod değişikliği gerekmez.
      </p>

      <div className="bg-white rounded-2xl border border-neutral-200 p-4 mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] font-medium tracking-wide text-neutral-400">
            YENİ AMBALAJ EKLE
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Check className="w-3 h-3" /> {saved} kaydedildi
            </span>
          )}
        </div>

        {!draft ? (
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 hover:border-neutral-400 rounded-xl py-10 cursor-pointer text-sm text-neutral-500">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Upload className="w-5 h-5" />
            Ambalaj görselini sürükle veya seç
            <span className="text-[11px] text-neutral-400">
              Şeffaf PNG tercih edilir. Değilse fon otomatik beyaza çekilir.
            </span>
          </label>
        ) : (
          <div className="grid sm:grid-cols-[160px_1fr] gap-4">
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-2 flex items-center justify-center">
              <img src={draft.dataUrl} alt="" className="max-h-40 object-contain" />
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-neutral-400">Ad</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400">Ürün hattı</label>
                <select
                  value={draft.line}
                  onChange={(e) => setDraft({ ...draft, line: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
                >
                  {LINES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                <span className="px-2 py-0.5 rounded bg-neutral-100">
                  {draft.width}×{draft.height}
                </span>
                <span
                  className={`px-2 py-0.5 rounded ${
                    draft.alpha ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {draft.alpha ? 'şeffaf zemin' : 'opak — fon beyaza çekilecek'}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={save}
                  className="bg-neutral-900 text-white text-sm px-4 py-2 rounded-lg hover:bg-neutral-800"
                >
                  Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="text-sm text-neutral-500 px-3 py-2 rounded-lg hover:bg-neutral-100"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold text-neutral-900 mt-8">Senin ambalajların</h2>
      {items.length === 0 ? (
        <div className="mt-3 text-sm text-neutral-400">Henüz eklenmemiş.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          {items.map((it) => (
            <div key={it.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="h-40 bg-neutral-50 flex items-center justify-center p-3">
                {images[it.id] ? (
                  <img src={images[it.id]} alt={it.label} className="max-h-full object-contain" />
                ) : (
                  <Package className="w-6 h-6 text-neutral-300" />
                )}
              </div>
              <div className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-900 truncate">{it.label}</div>
                  <div className="text-[11px] text-neutral-400">
                    {it.line}
                    {it.alpha ? ' · şeffaf' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteUserPackaging(it.id)}
                  className="shrink-0 opacity-50 hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-neutral-900 mt-8">Yerleşik ambalajlar</h2>
      <p className="text-[11px] text-neutral-400 mt-1">
        Projeyle gelen görseller. Silinemez ama kendi yüklediklerin bunların yanında listelenir.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
        {PACKAGING.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="h-32 bg-neutral-50 flex items-center justify-center p-3">
              <img src={p.src} alt={p.label} className="max-h-full object-contain" />
            </div>
            <div className="p-3">
              <div className="text-sm font-medium text-neutral-900 truncate">{p.label}</div>
              <div className="text-[11px] text-neutral-400">{p.line}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
