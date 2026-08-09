import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, RotateCw, Pause } from 'lucide-react';
import PaintViewer3D, { loadModel, DEFAULT_TEXTURE } from '@/components/PaintViewer3D.jsx';
import PaintPicker from '@/components/PaintPicker.jsx';
import { listPaints } from '@/lib/store.js';
import { useSyncedPaints } from '@/hooks/usePaints.js';
import { SCENARIOS } from '@/lib/environment.js';

const SHAPES = [
  { id: 'knot', label: 'Düğüm' },
  { id: 'sphere', label: 'Küre' },
  { id: 'panel', label: 'Panel' },
];

export default function StlPaintPage() {
  useSyncedPaints();
  const [params] = useSearchParams();
  const paints = listPaints();

  const [paint, setPaint] = useState(
    () => paints.find((p) => p.id === params.get('boya')) || paints[0]
  );
  const [shape, setShape] = useState('knot');
  const [geometry, setGeometry] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [spinning, setSpinning] = useState(true);
  const [scenario, setScenario] = useState('studio');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [texture, setTexture] = useState(DEFAULT_TEXTURE);

  useEffect(() => {
    const wanted = params.get('boya');
    if (!wanted) return;
    const found = paints.find((p) => p.id === wanted);
    if (found) setPaint(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const onStl = async (file) => {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const geo = await loadModel(file);
      setGeometry(geo);
      setFileName(file.name);
    } catch (err) {
      setError(`Model okunamadı: ${err.message || 'bilinmeyen hata'}`);
    } finally {
      setLoading(false);
    }
  };

  const shapeLabel = useMemo(
    () => (fileName ? fileName : SHAPES.find((s) => s.id === shape)?.label),
    [fileName, shape]
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">STL Boyama</h1>
      <p className="mt-1.5 text-sm text-neutral-500">
        3D modeli gerçek zamanlı PBR malzemeyle boya, 360° döndür.
      </p>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-6 mt-6">
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="h-[460px] bg-gradient-to-b from-neutral-100 to-neutral-200">
              <PaintViewer3D
                paint={paint}
                shape={shape}
                geometry={geometry}
                spinning={spinning}
                scenario={scenario}
                texture={texture}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-neutral-100">
              <div className="flex gap-1">
                {SHAPES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setShape(s.id);
                      setGeometry(null);
                      setFileName(null);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full ${
                      !geometry && shape === s.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setSpinning((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              >
                {spinning ? <Pause className="w-3.5 h-3.5" /> : <RotateCw className="w-3.5 h-3.5" />}
                {spinning ? 'Dönüyor' : 'Durdu'}
              </button>

              <label className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-neutral-900 text-white cursor-pointer hover:bg-neutral-800">
                <input
                  type="file"
                  accept=".stl,.obj"
                  className="hidden"
                  onChange={(e) => onStl(e.target.files?.[0])}
                />
                <Upload className="w-3.5 h-3.5" /> {loading ? 'Yükleniyor…' : 'Model Yükle'}
              </label>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 px-4 py-3">
            <div className="text-[11px] font-medium tracking-wide text-neutral-400 mb-2">IŞIK</div>
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setScenario(s.id)}
                  title={s.description}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    scenario === s.id
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-neutral-400 mt-2">
              {SCENARIOS.find((s) => s.id === scenario)?.description}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-medium tracking-wide text-neutral-400">DOKU</div>
              <button
                type="button"
                onClick={() => setTexture(DEFAULT_TEXTURE)}
                className="text-[11px] text-neutral-400 hover:text-neutral-900"
              >
                Sıfırla
              </button>
            </div>

            <TextureSlider
              label="Pulcuk boyutu"
              hint="yüksek = daha küçük, daha sık pulcuk"
              min={8}
              max={220}
              step={4}
              value={texture.flakeScale}
              display={texture.flakeScale}
              onChange={(v) => setTexture({ ...texture, flakeScale: v })}
            />
            <TextureSlider
              label="Pulcuk şiddeti"
              hint="ölçülen parıltının çarpanı"
              min={0}
              max={300}
              step={5}
              value={Math.round(texture.flakeIntensity * 100)}
              display={`${Math.round(texture.flakeIntensity * 100)}%`}
              onChange={(v) => setTexture({ ...texture, flakeIntensity: v / 100 })}
            />
            <TextureSlider
              label="Portakal kabuğu"
              hint="verniğin dalgalılığı — kusursuz aynayı kırar"
              min={0}
              max={150}
              step={5}
              value={Math.round(texture.orangePeel * 100)}
              display={`${Math.round(texture.orangePeel * 100)}%`}
              onChange={(v) => setTexture({ ...texture, orangePeel: v / 100 })}
            />
            <TextureSlider
              label="Kabuk dalga boyu"
              hint="düşük = geniş dalga"
              min={1}
              max={40}
              step={1}
              value={texture.orangePeelScale}
              display={texture.orangePeelScale}
              onChange={(v) => setTexture({ ...texture, orangePeelScale: v })}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="truncate">Model: {shapeLabel}</span>
            <span>STL / OBJ · Sürükle: döndür · Tekerlek: yakınlaştır</span>
          </div>
          {error && <div className="text-xs text-rose-600">{error}</div>}

          {paint && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-neutral-400">{paint.code}</div>
                  <div className="font-medium text-neutral-900">{paint.name}</div>
                </div>
                <div className="text-xs text-neutral-500">{paint.series}</div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-center">
                <Chip label="Parlaklık" value={paint.gloss} />
                <Chip label="Metalik" value={paint.metallic.toFixed(2)} />
                <Chip label="Pearl" value={paint.pearl.toFixed(2)} />
                <Chip label="Pulcuk" value={paint.flake.toFixed(2)} />
              </div>
            </div>
          )}
        </div>

        <PaintPicker paints={paints} value={paint} onChange={setPaint} />
      </div>
    </div>
  );
}

function TextureSlider({ label, hint, min, max, step, value, display, onChange }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-600">{label}</span>
        <span className="text-xs font-mono text-neutral-900">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5"
      />
      <div className="text-[10px] text-neutral-400 mt-0.5">{hint}</div>
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <div className="bg-neutral-50 rounded-lg py-2">
      <div className="text-sm font-mono text-neutral-900">{value}</div>
      <div className="text-[10px] text-neutral-400">{label}</div>
    </div>
  );
}
