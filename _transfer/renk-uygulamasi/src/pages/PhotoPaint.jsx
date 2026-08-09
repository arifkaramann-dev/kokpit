import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, Download } from 'lucide-react';
import PaintPicker from '@/components/PaintPicker.jsx';
import { listPaints } from '@/lib/store.js';
import { useSyncedPaints } from '@/hooks/usePaints.js';

const MODES = [
  { id: 'multiply', label: 'Multiply' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'color', label: 'Renk' },
  { id: 'soft-light', label: 'Soft Light' },
];

export default function PhotoPaintPage() {
  useSyncedPaints();
  const [params] = useSearchParams();
  const paints = listPaints();

  const [paint, setPaint] = useState(
    () => paints.find((p) => p.id === params.get('boya')) || paints[0]
  );
  const [src, setSrc] = useState(null);
  const [opacity, setOpacity] = useState(0.55);
  const [mode, setMode] = useState('multiply');

  useEffect(() => {
    const wanted = params.get('boya');
    if (!wanted) return;
    const found = paints.find((p) => p.id === wanted);
    if (found) setPaint(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const handleFile = (file) => {
    if (file) setSrc(URL.createObjectURL(file));
  };

  const exportPng = async () => {
    if (!src || !paint) return;
    const img = new window.Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = mode;
    ctx.fillStyle = paint.hex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${paint.code}-onizleme.png`;
    a.click();
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Fotoğraf Boyama</h1>
      <p className="mt-1.5 text-sm text-neutral-500">
        Fotoğrafı yükle, boya rengini uygula, gerçek zamanlı önizleme.
      </p>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 mt-6">
        <div className="space-y-4">
          {!src ? (
            <label className="block bg-white rounded-2xl border-2 border-dashed border-neutral-300 hover:border-neutral-400 transition-colors p-12 text-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Upload className="w-8 h-8 mx-auto text-neutral-400" />
              <div className="mt-3 font-medium text-neutral-900">Fotoğraf yükle</div>
              <span className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2 rounded-full">
                Dosya Seç
              </span>
            </label>
          ) : (
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
              <div className="relative bg-neutral-100">
                <img src={src} alt="Önizleme" className="w-full max-h-[460px] object-contain" />
                {paint && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: paint.hex,
                      opacity,
                      mixBlendMode: mode,
                    }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 border-t border-neutral-100">
                <label className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                  Fotoğraf Değiştir
                </label>
                <button
                  type="button"
                  onClick={exportPng}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-neutral-900 text-white hover:bg-neutral-800"
                >
                  <Download className="w-3.5 h-3.5" /> PNG indir
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-neutral-200 p-5 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-neutral-400">
                  KAPLAMA
                </span>
                <span className="text-xs text-neutral-500">Opaklık {Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                className="mt-3"
              />
            </div>

            <div>
              <div className="text-[11px] font-medium tracking-wide text-neutral-400">
                KARIŞTIRMA MODU
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`text-xs px-3 py-1.5 rounded-full ${
                      mode === m.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <PaintPicker paints={paints} value={paint} onChange={setPaint} />
      </div>
    </div>
  );
}
