import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, Crosshair, AlertTriangle, CheckCircle2, Save } from 'lucide-react';
import PaintSwatch from '@/components/PaintSwatch.jsx';
import { imageToData, detectWideGamut } from '@/lib/sampling.js';
import { buildMask } from '@/lib/selection.js';
import { analyzeImage, buildFingerprint } from '@/lib/fingerprint.js';
import { SERIES } from '@/lib/series.js';
import { createFingerprint, nextScanCode } from '@/lib/store.js';
import { fmt } from '@/lib/color.js';

const LEVEL_STYLE = {
  yüksek: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  orta: 'bg-amber-50 text-amber-700 border-amber-200',
  düşük: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function CreatePage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [meta, setMeta] = useState({ name: '', code: '', series: 'Metallic' });
  const [saved, setSaved] = useState(null);

  const active = sources.find((s) => s.id === activeId) || null;

  const addFiles = useCallback(async (files) => {
    const added = [];
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;
      // eslint-disable-next-line no-await-in-loop
      await img.decode();
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        data: imageToData(img, 900),
        gamut: detectWideGamut(img),
        seeds: [],
        tolerance: 12,
        mask: null,
        observation: null,
      });
    }
    setSources((prev) => {
      const next = [...prev, ...added];
      return next;
    });
    if (added.length) setActiveId((cur) => cur ?? added[0].id);
  }, []);

  /** Bir kaynağın maskesini ve gözlemini yeniden hesaplar. */
  const recompute = useCallback((source) => {
    if (!source.seeds.length) return { ...source, mask: null, observation: null };
    const { mask, count } = buildMask(source.data, source.seeds, source.tolerance);
    if (count < 100) {
      return { ...source, mask, observation: { rejected: true, reason: 'seçim çok küçük', name: source.name } };
    }
    const observation = analyzeImage(source.data, mask, { name: source.name });
    return { ...source, mask, observation };
  }, []);

  const updateSource = useCallback(
    (id, patch) => {
      setSources((prev) =>
        prev.map((s) => (s.id === id ? recompute({ ...s, ...patch }) : s))
      );
    },
    [recompute]
  );

  const observations = useMemo(
    () => sources.map((s) => s.observation).filter((o) => o && !o.rejected),
    [sources]
  );

  const fingerprint = useMemo(() => {
    if (observations.length < 1) return null;
    try {
      return buildFingerprint(observations, {
        code: meta.code || 'ÖNİZLEME',
        name: meta.name || 'İsimsiz',
        series: meta.series,
      });
    } catch {
      return null;
    }
  }, [observations, meta]);

  const save = () => {
    if (!fingerprint) return;
    const record = createFingerprint({
      ...fingerprint,
      code: meta.code || nextScanCode(),
      name: meta.name || 'İsimsiz renk',
      series: meta.series,
      // Render katmanının beklediği alanlar.
      // metallic BURADAN GELMİYOR: paintToPbr onu seriden alıyor. Fotoğraftaki
      // parlaklık aralığı gölgenin eseri, malzemenin değil (bkz. analyzeImage).
      // Buradan gelen tek gerçek malzeme sinyali ölçülen pulcuk parıltısı.
      flake: fingerprint.effect.sparkle != null ? Math.min(1, fingerprint.effect.sparkle * 6) : 0.3,
      pearl: fingerprint.effect.graininess != null
        ? Math.min(1, fingerprint.effect.graininess * 4)
        : 0,
      transparency: 0,
      gloss: 78,
      basecoat: null,
      clearcoat: 'High-Gloss',
      multi_angle: [{ angle: 45, lab: fingerprint.lab }],
    });
    setSaved(record);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold text-neutral-900">Renk Üretimi</h1>
      <p className="mt-1.5 text-sm text-neutral-500 max-w-2xl">
        Aynı boyanın birden fazla referans görselini yükle, her birinde boya bölgesini işaretle.
        Sistem her görselin ışığını ayrı ayrı kestirip D65'e taşır, aykırı kaynakları eler ve
        kalanların uzlaşısından tek bir parmak izi üretir.
      </p>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mt-6">
        <div className="space-y-4">
          <SourceStrip
            sources={sources}
            activeId={activeId}
            onSelect={setActiveId}
            onAdd={addFiles}
            onRemove={(id) =>
              setSources((prev) => {
                const next = prev.filter((s) => s.id !== id);
                if (activeId === id) setActiveId(next[0]?.id ?? null);
                return next;
              })
            }
          />

          {active ? (
            <Editor source={active} onChange={(patch) => updateSource(active.id, patch)} />
          ) : (
            <div className="bg-white rounded-2xl border-2 border-dashed border-neutral-300 p-12 text-center">
              <Upload className="w-8 h-8 mx-auto text-neutral-400" />
              <div className="mt-3 font-medium text-neutral-900">Referans görselleri yükle</div>
              <div className="text-xs text-neutral-400 mt-1">
                Aynı rengin farklı ışık ve açılardaki fotoğrafları — en az 3, ideali 5-10
              </div>
              <label className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2 rounded-full cursor-pointer hover:bg-neutral-800">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles([...e.target.files])}
                />
                Dosya Seç
              </label>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Consensus
            fingerprint={fingerprint}
            sources={sources}
            meta={meta}
            setMeta={setMeta}
            onSave={save}
            saved={saved}
            onOpenSaved={() => saved && navigate(`/boya/${saved.id}`)}
          />
        </div>
      </div>
    </div>
  );
}

function SourceStrip({ sources, activeId, onSelect, onAdd, onRemove }) {
  if (!sources.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {sources.map((s) => {
        const obs = s.observation;
        const state = !obs ? 'idle' : obs.rejected ? 'bad' : 'ok';
        return (
          <div key={s.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`block w-24 h-20 rounded-xl overflow-hidden border-2 transition-colors ${
                activeId === s.id ? 'border-neutral-900' : 'border-transparent hover:border-neutral-300'
              }`}
            >
              <img src={s.url} alt={s.name} className="w-full h-full object-cover" />
            </button>
            <span
              className={`absolute bottom-1 left-1 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                state === 'ok' ? 'bg-emerald-500' : state === 'bad' ? 'bg-rose-500' : 'bg-neutral-300'
              }`}
            />
            <button
              type="button"
              onClick={() => onRemove(s.id)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      <label className="shrink-0 w-24 h-20 rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center cursor-pointer hover:border-neutral-400">
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onAdd([...e.target.files])}
        />
        <Upload className="w-4 h-4 text-neutral-400" />
      </label>
    </div>
  );
}

function Editor({ source, onChange }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const { data, mask, url } = source;
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext('2d');

    let cancelled = false;
    const img = new window.Image();
    img.src = url;

    const draw = () => {
      if (cancelled) return;
      // Görsel putImageData ile DEĞİL drawImage ile çiziliyor.
      // putImageData ham sayı yazar, renk yönetimini tamamen atlar; geniş
      // gamutlu bir kaynakta önizleme gerçekte olduğundan soluk görünür.
      // drawImage tarayıcının renk dönüşümünden geçer — üstteki küçük
      // <img> thumbnail'ları ile aynı görünsün diye.
      ctx.clearRect(0, 0, data.width, data.height);
      ctx.drawImage(img, 0, 0, data.width, data.height);

      if (!mask) return;
      const overlay = ctx.createImageData(data.width, data.height);
      for (let i = 0; i < mask.length; i += 1) {
        if (!mask[i]) continue;
        const p = i * 4;
        overlay.data[p] = 56;
        overlay.data[p + 1] = 189;
        overlay.data[p + 2] = 248;
        overlay.data[p + 3] = 120;
      }
      const tmp = document.createElement('canvas');
      tmp.width = data.width;
      tmp.height = data.height;
      tmp.getContext('2d').putImageData(overlay, 0, 0);
      ctx.drawImage(tmp, 0, 0);
    };

    if (img.complete && img.naturalWidth) draw();
    else img.onload = draw;

    return () => {
      cancelled = true;
    };
  }, [source]);

  const addSeed = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onChange({ seeds: [...source.seeds, { x, y }] });
  };

  const obs = source.observation;

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      <canvas
        ref={canvasRef}
        onClick={addSeed}
        className="w-full max-h-[420px] object-contain bg-neutral-100 cursor-crosshair"
      />

      <div className="px-4 py-3 border-t border-neutral-100 space-y-3">
        <div className="flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-neutral-400 shrink-0" />
          <span className="text-xs text-neutral-500 shrink-0">
            {source.seeds.length
              ? `${source.seeds.length} nokta işaretlendi`
              : 'Boyanın üstüne tıkla'}
          </span>
          {source.seeds.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ seeds: [] })}
              className="text-xs text-neutral-400 hover:text-neutral-900 ml-auto"
            >
              Temizle
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 shrink-0 w-20">Tolerans {source.tolerance}</span>
          <input
            type="range"
            min="3"
            max="30"
            value={source.tolerance}
            onChange={(e) => onChange({ tolerance: Number(e.target.value) })}
          />
        </div>

        {source.gamut?.wide && (
          <div className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Bu görsel sRGB'den geniş bir uzayda (muhtemelen Display P3).
              Piksellerin %{(source.gamut.clippedRatio * 100).toFixed(1)}'i sRGB gamut sınırında
              kırpılıyor — doygun renklerde ölçüm gerçeğinden bir miktar soluk çıkar.
            </span>
          </div>
        )}

        {obs && !obs.rejected && <ObservationRow obs={obs} />}
        {obs?.rejected && (
          <div className="flex items-center gap-2 text-xs text-rose-600">
            <AlertTriangle className="w-3.5 h-3.5" /> {obs.reason}
          </div>
        )}
      </div>
    </div>
  );
}

function ObservationRow({ obs }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
      <Cell label="Ham">
        <span className="inline-flex items-center gap-1.5">
          <i className="w-3 h-3 rounded ring-1 ring-black/10" style={{ background: obs.raw.hex }} />
          <span className="font-mono text-[11px]">{obs.raw.hex.toUpperCase()}</span>
        </span>
      </Cell>
      <Cell label="Işık düzeltmeli">
        <span className="inline-flex items-center gap-1.5">
          <i
            className="w-3 h-3 rounded ring-1 ring-black/10"
            style={{ background: obs.corrected.hex }}
          />
          <span className="font-mono text-[11px]">{obs.corrected.hex.toUpperCase()}</span>
        </span>
      </Cell>
      <Cell label="Işık sapması">
        <span
          className={`font-mono text-[11px] ${
            obs.illuminant.reliable ? 'text-neutral-900' : 'text-amber-600'
          }`}
        >
          {obs.illuminant.cast}
          {!obs.illuminant.reliable && ' ⚠'}
        </span>
      </Cell>
      <Cell label="Ağırlık">
        <span className="font-mono text-[11px]">{obs.weight}</span>
      </Cell>
    </div>
  );
}

function Cell({ label, children }) {
  return (
    <div>
      <div className="text-[10px] text-neutral-400">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Consensus({ fingerprint, sources, meta, setMeta, onSave, saved, onOpenSaved }) {
  const ready = Boolean(fingerprint);

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden sticky top-6">
      <div className="px-4 py-3 border-b border-neutral-100 text-[11px] font-medium tracking-wide text-neutral-400">
        UZLAŞI
      </div>

      {!ready ? (
        <div className="p-8 text-center text-sm text-neutral-400">
          En az bir görselde boya bölgesi işaretle.
        </div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <PaintSwatch
              paint={{
                hex: fingerprint.hex,
                series: meta.series,
                metallic: 0,
                pearl: fingerprint.effect.graininess
                  ? Math.min(1, fingerprint.effect.graininess * 4)
                  : 0,
                flake: fingerprint.effect.sparkle ? Math.min(1, fingerprint.effect.sparkle * 6) : 0.3,
                gloss: 78,
              }}
              className="w-20 h-20 rounded-xl shrink-0"
            />
            <div className="min-w-0">
              <div className="font-mono text-sm text-neutral-900">
                {fingerprint.hex.toUpperCase()}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                L {fmt(fingerprint.lab.l)} · a {fmt(fingerprint.lab.a)} · b {fmt(fingerprint.lab.b)}
              </div>
              <div
                className={`inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded border ${
                  LEVEL_STYLE[fingerprint.confidence.level]
                }`}
              >
                güven: {fingerprint.confidence.level}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Kaynak" value={`${fingerprint.provenance.usedCount}`} />
            <Metric label="Dağılım ΔE" value={fingerprint.confidence.meanSpread} />
            <Metric label="Elenen" value={`${fingerprint.provenance.droppedCount}`} />
          </div>

          <div className="text-[11px] text-neutral-500 leading-relaxed">
            {fingerprint.confidence.note}
          </div>

          {fingerprint.provenance.dropped.length > 0 && (
            <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3 h-3" /> Elenen kaynaklar
              </div>
              {fingerprint.provenance.dropped.map((d) => (
                <div key={d.name} className="mt-0.5">
                  {d.name} — medyandan ΔE {d.deltaFromMedian}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-[10px] text-neutral-400 mb-1.5">KAYNAK DAĞILIMI</div>
            <div className="space-y-1">
              {fingerprint.provenance.sources.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-[11px]">
                  <i
                    className="w-3 h-3 rounded ring-1 ring-black/10 shrink-0"
                    style={{ background: s.hex }}
                  />
                  <span className="truncate text-neutral-600 flex-1">{s.name}</span>
                  <span className="font-mono text-neutral-400">ΔE {s.deltaFromMedian}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-100 space-y-2">
            <input
              value={meta.name}
              onChange={(e) => setMeta({ ...meta, name: e.target.value })}
              placeholder="Renk adı"
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
            />
            <div className="flex gap-2">
              <input
                value={meta.code}
                onChange={(e) => setMeta({ ...meta, code: e.target.value })}
                placeholder="Kod"
                className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-neutral-200 text-sm font-mono focus:outline-none"
              />
              <select
                value={meta.series}
                onChange={(e) => setMeta({ ...meta, series: e.target.value })}
                className="px-3 py-2 rounded-lg border border-neutral-200 text-sm bg-white focus:outline-none"
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
              onClick={onSave}
              className="w-full inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-800"
            >
              <Save className="w-4 h-4" /> Kütüphaneye Kaydet
            </button>
            {saved && (
              <button
                type="button"
                onClick={onOpenSaved}
                className="w-full inline-flex items-center justify-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saved.code} kaydedildi — görüntüle
              </button>
            )}
          </div>
        </div>
      )}

      {sources.length > 0 && sources.length < 3 && (
        <div className="px-4 pb-4 text-[11px] text-amber-600">
          Sadece {sources.length} kaynak var. Güvenilir uzlaşı için en az 3 farklı koşulda çekilmiş
          görsel gerekiyor.
        </div>
      )}
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
