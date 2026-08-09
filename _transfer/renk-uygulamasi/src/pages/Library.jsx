import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Trash2, ImageOff, Plus } from 'lucide-react';
import { SERIES, getSeries } from '@/lib/templates.js';
import { listColors, deleteColor, subscribe } from '@/lib/colorLibrary.js';
import { getAsset, listAssetObjects } from '@/lib/assetStore.js';

/**
 * Renk kütüphanesi.
 *
 * Şablonlar sayfasının yazdığı kayıtları okur — tek kaynak burası.
 * Önceden bu sayfa ayrı bir parmak izi deposundan okuyordu ve iki kütüphane
 * birbirinden habersizdi: Şablonlar'da kaydedilen renk burada görünmüyordu.
 */
export default function LibraryPage() {
  const [colors, setColors] = useState(() => listColors());
  const [thumbs, setThumbs] = useState({});
  const [params, setParams] = useSearchParams();
  const active = params.get('seri');

  useEffect(() => subscribe(() => setColors(listColors())), []);

  // Her renk için ilk üretilmiş görseli küçük resim olarak çek
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out = {};
      for (const c of colors) {
        // eslint-disable-next-line no-await-in-loop
        const objects = await listAssetObjects(c.id);
        if (!objects.length) continue;
        // eslint-disable-next-line no-await-in-loop
        const img = await getAsset(c.id, objects[0]);
        if (img) out[c.id] = { img, count: objects.length };
      }
      if (!cancelled) setThumbs(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [colors]);

  const shown = useMemo(
    () => (active ? colors.filter((c) => c.seriesCode === active) : colors),
    [colors, active]
  );

  const setFilter = (code) => (code ? setParams({ seri: code }) : setParams({}));

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Boya Kütüphanesi</h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {colors.length} renk kayıtlı. Şablonlar sayfasında kaydedilen her renk buraya düşer.
          </p>
        </div>
        <Link
          to="/sablonlar"
          className="shrink-0 inline-flex items-center gap-1.5 bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-lg hover:bg-neutral-800"
        >
          <Plus className="w-4 h-4" /> Renk ekle
        </Link>
      </div>

      {colors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-5">
          <Chip active={!active} onClick={() => setFilter(null)}>
            Tümü ({colors.length})
          </Chip>
          {SERIES.map((s) => {
            const n = colors.filter((c) => c.seriesCode === s.code).length;
            if (!n) return null;
            return (
              <Chip key={s.code} active={active === s.code} onClick={() => setFilter(s.code)}>
                {s.label} ({n})
              </Chip>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="mt-10 bg-white rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
          <div className="text-sm text-neutral-500">
            {colors.length === 0 ? 'Kütüphane boş.' : 'Bu seride renk yok.'}
          </div>
          <Link
            to="/sablonlar"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-neutral-900 underline"
          >
            Şablonlar sayfasından ilk rengi ekle
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
          {shown.map((c) => {
            const series = getSeries(c.seriesCode);
            const thumb = thumbs[c.id];
            return (
              <div
                key={c.id}
                className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-md hover:border-neutral-300 transition-all"
              >
                <Link to={`/sablonlar?renk=${c.id}`} className="block">
                  {thumb ? (
                    <img src={thumb.img} alt={c.code} className="w-full h-32 object-cover bg-neutral-50" />
                  ) : (
                    <div
                      className="w-full h-32 flex items-center justify-center"
                      style={{ background: c.hex }}
                    >
                      <ImageOff className="w-5 h-5 text-white/50" />
                    </div>
                  )}
                </Link>

                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-neutral-400">{c.code}</div>
                      <div className="font-medium text-sm text-neutral-900 truncate">
                        {c.nameEn || '—'}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">{c.nameTr}</div>
                    </div>
                    <i
                      className="w-7 h-7 rounded-md ring-1 ring-black/10 shrink-0"
                      style={{ background: c.hex }}
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-neutral-100">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                      {series.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">
                        {thumb ? `${thumb.count} görsel` : 'görsel yok'}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteColor(c.id)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3.5 py-1.5 rounded-full transition-colors ${
        active
          ? 'bg-neutral-900 text-white'
          : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}
