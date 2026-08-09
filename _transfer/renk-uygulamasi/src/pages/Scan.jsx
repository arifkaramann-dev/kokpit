import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Crosshair, Sparkles, Check } from 'lucide-react';
import PaintSwatch from '@/components/PaintSwatch.jsx';
import { deltaELabel, fmt, labToHex, rgbToLab, rgbToXyz } from '@/lib/color.js';
import { imageToData, samplePoint, smartAverage, extractAngleProfile, estimateFinish, toHex, rgbLabel } from '@/lib/sampling.js';
import { findClosest } from '@/lib/match.js';
import { listPaints, createFingerprint, nextScanCode } from '@/lib/store.js';
import { SERIES, getSeries } from '@/lib/series.js';

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lime: 'bg-lime-50 text-lime-700 border-lime-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function ScanPage() {
  const [src, setSrc] = useState(null);
  const [mode, setMode] = useState('average'); // 'average' | 'point'
  const [sample, setSample] = useState(null);
  const [marker, setMarker] = useState(null);
  const [name, setName] = useState('');
  const [series, setSeries] = useState('Solid');
  const [saved, setSaved] = useState(null);

  const imgRef = useRef(null);
  const dataRef = useRef(null);
  const paints = useMemo(() => listPaints(), [saved]);

  const runAverage = useCallback(() => {
    if (!dataRef.current) return;
    const avg = smartAverage(dataRef.current);
    const profile = extractAngleProfile(dataRef.current);
    const finish = estimateFinish(profile);
    setSample({ rgb: avg.rgb, lab: avg.lab, profile, finish, pixels: avg.count });
    setMarker(null);
  }, []);

  const handleFile = (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setSample(null);
    setSaved(null);
    setMarker(null);
  };

  const onImageLoad = () => {
    if (!imgRef.current) return;
    dataRef.current = imageToData(imgRef.current);
    runAverage();
  };

  const onImageClick = (e) => {
    if (mode !== 'point' || !dataRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rgb = samplePoint(dataRef.current, x, y, 8);
    const lab = rgbToLab(rgb);
    const profile = extractAngleProfile(dataRef.current);
    setSample({ rgb, lab, profile, finish: estimateFinish(profile), pixels: null });
    setMarker({ x, y });
  };

  const matches = useMemo(() => {
    if (!sample) return [];
    return findClosest(sample.lab, paints, { limit: 10 });
  }, [sample, paints]);

  const save = () => {
    if (!sample) return;
    const finish = sample.finish;
    const hex = toHex(sample.rgb).toLowerCase();
    const record = createFingerprint({
      code: nextScanCode(),
      name: name.trim() || 'İsimsiz tarama',
      series,
      hex,
      srgb: {
        r: Math.round(sample.rgb.r),
        g: Math.round(sample.rgb.g),
        b: Math.round(sample.rgb.b),
      },
      lab: sample.lab,
      xyz: rgbToXyz(sample.rgb),
      gloss: finish.gloss,
      metallic: finish.metallic,
      pearl: finish.pearl,
      flake: finish.flake,
      transparency: 0,
      basecoat: null,
      clearcoat: 'High-Gloss',
      render_params: getSeries(series).pbr,
      light_profiles: { D65: true, A: false, F11: false },
      multi_angle: sample.profile,
    });
    setSaved(record);
    setName('');
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Renk Tara</h1>
      <p className="mt-1.5 text-sm text-neutral-500 max-w-2xl">
        Fotoğraf yükle — akıllı örnek gölge/parlamayı atlar, çok-açılı profil gradyan ve gerçek
        sahnelerden face/flop renk geçişini çıkarır. ΔE2000 motoru en yakın boyaları sıralar.
      </p>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 mt-6">
        <div className="space-y-4">
          {!src ? (
            <label className="block bg-white rounded-2xl border-2 border-dashed border-neutral-300 hover:border-neutral-400 transition-colors p-12 text-center cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <Upload className="w-8 h-8 mx-auto text-neutral-400" />
              <div className="mt-3 font-medium text-neutral-900">Fotoğraf yükle veya çek</div>
              <div className="text-xs text-neutral-400 mt-1">JPG, PNG — kamera desteği var</div>
              <span className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2 rounded-full">
                Dosya Seç
              </span>
            </label>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
                <div
                  className={`relative ${mode === 'point' ? 'cursor-crosshair' : ''}`}
                  onClick={onImageClick}
                >
                  <img
                    ref={imgRef}
                    src={src}
                    alt="Taranan fotoğraf"
                    onLoad={onImageLoad}
                    className="w-full max-h-[420px] object-contain bg-neutral-100"
                  />
                  {marker && (
                    <div
                      className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full border-2 border-white ring-2 ring-neutral-900 pointer-events-none"
                      style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-neutral-100">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('average');
                        runAverage();
                      }}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                        mode === 'average' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Akıllı ortalama
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('point')}
                      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full ${
                        mode === 'point' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" /> Nokta seç
                    </button>
                  </div>
                  <label className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(e.target.files?.[0])}
                    />
                    Fotoğraf Değiştir
                  </label>
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                {mode === 'point'
                  ? 'Fotoğrafa dokunarak renk örneği alın.'
                  : 'Renk örneği alın — ortalama veya nokta seç.'}
              </p>
            </>
          )}

          {sample && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-5">
              <div className="text-[11px] font-medium tracking-wide text-neutral-400">
                ÖRNEKLENEN RENK
              </div>
              <div className="flex items-center gap-4 mt-3">
                <PaintSwatch
                  paint={{ hex: toHex(sample.rgb), ...sample.finish }}
                  className="w-20 h-20 rounded-xl shrink-0"
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <Field label="HEX" value={toHex(sample.rgb)} mono />
                  <Field label="sRGB" value={rgbLabel(sample.rgb)} mono />
                  <Field
                    label="LAB"
                    value={`${fmt(sample.lab.l)} · ${fmt(sample.lab.a)} · ${fmt(sample.lab.b)}`}
                    mono
                  />
                  <Field label="Tahmini seri" value={suggestSeries(sample.finish)} />
                </div>
              </div>

              <div className="mt-5">
                <div className="text-[11px] font-medium tracking-wide text-neutral-400">
                  ÇOK-AÇILI PROFİL <span className="text-neutral-300">face → flop</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {sample.profile.map((p) => (
                    <div key={p.angle} className="flex-1">
                      <div
                        className="h-10 rounded-md ring-1 ring-black/10"
                        style={{ background: labToHex(p.lab) }}
                      />
                      <div className="text-[10px] text-neutral-400 text-center mt-1">{p.angle}°</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                  <Metric label="Parlaklık" value={`${sample.finish.gloss}`} />
                  <Metric label="Metalik" value={fmt(sample.finish.metallic)} />
                  <Metric label="Pearl" value={fmt(sample.finish.pearl)} />
                  <Metric label="Pulcuk" value={fmt(sample.finish.flake)} />
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-neutral-100">
                <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
                  <div>
                    <label className="text-[11px] text-neutral-400">İsim</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="örn. vivid hot magenta"
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-neutral-400">Seri (3D görünüm için)</label>
                    <select
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
                    >
                      {SERIES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={save}
                    className="self-end bg-neutral-900 text-white text-sm px-5 py-2 rounded-lg hover:bg-neutral-800"
                  >
                    Oluştur
                  </button>
                </div>
                {saved && (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                    <Check className="w-3.5 h-3.5" />
                    Boya oluşturuldu: {saved.code}
                    <Link to={`/boya/${saved.id}`} className="underline">
                      görüntüle
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-100">
              <div className="text-sm font-semibold text-neutral-900">En Yakın 10 Renk</div>
              <div className="text-[11px] text-neutral-400 mt-0.5">
                Eşleştirme, en parlak (face) renk üzerinden yapıldı.
              </div>
            </div>
            {!sample ? (
              <div className="p-8 text-center text-sm text-neutral-400">
                Sonuç bulunamadı.
                <div className="text-xs mt-1">Önce bir fotoğraf yükleyin.</div>
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {matches.map(({ paint, deltaE }, i) => {
                  const label = deltaELabel(deltaE);
                  return (
                    <li key={paint.id}>
                      <Link
                        to={`/boya/${paint.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50"
                      >
                        <span className="text-xs text-neutral-300 w-4 tabular-nums">{i + 1}</span>
                        <PaintSwatch paint={paint} className="w-10 h-10 rounded-lg shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-neutral-400">
                            {paint.code} · {paint.series}
                          </div>
                          <div className="text-sm font-medium text-neutral-900 truncate">
                            {paint.name}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-mono text-neutral-900">
                            ΔE {deltaE.toFixed(2)}
                          </div>
                          <div
                            className={`text-[10px] mt-0.5 px-1.5 py-0.5 rounded border ${TONE[label.tone]}`}
                          >
                            {label.text}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className={`text-neutral-900 ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-neutral-50 rounded-lg py-2">
      <div className="text-sm font-mono text-neutral-900">{value}</div>
      <div className="text-[10px] text-neutral-400">{label}</div>
    </div>
  );
}

function suggestSeries({ metallic, pearl, flake }) {
  if (pearl > 0.5) return 'Pearl';
  if (metallic > 0.55 && flake > 0.4) return 'Meteor';
  if (metallic > 0.4) return 'Metallic';
  if (flake > 0.3) return 'Candy';
  return 'Solid';
}
