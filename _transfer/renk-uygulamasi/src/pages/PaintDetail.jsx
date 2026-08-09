import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Image, Trash2 } from 'lucide-react';
import PaintSwatch from '@/components/PaintSwatch.jsx';
import { getPaint, deleteFingerprint } from '@/lib/store.js';
import { getSeries } from '@/lib/series.js';
import { fmt, labToHex } from '@/lib/color.js';
import { useSyncedPaints } from '@/hooks/usePaints.js';

export default function PaintDetailPage() {
  useSyncedPaints();
  const { id } = useParams();
  const navigate = useNavigate();
  const paint = getPaint(id);

  if (!paint) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="text-sm text-neutral-400">Boya bulunamadı.</div>
        <Link to="/kutuphane" className="mt-4 inline-block text-sm underline">
          Kütüphaneye dön
        </Link>
      </div>
    );
  }

  const series = getSeries(paint.series);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Link
        to="/kutuphane"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft className="w-4 h-4" /> Kütüphaneye dön
      </Link>

      <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 mt-5">
        <div>
          <PaintSwatch paint={paint} className="w-full h-56 rounded-2xl" />
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Tile label="HEX" value={paint.hex.toUpperCase()} mono />
            <Tile label="sRGB" value={`${paint.srgb.r} ${paint.srgb.g} ${paint.srgb.b}`} mono />
            <Tile label="Seri" value={paint.series} />
          </div>

          <div className="flex gap-2 mt-4">
            <Link
              to={`/stl?boya=${paint.id}`}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm px-4 py-2.5 rounded-xl hover:bg-neutral-800"
            >
              <Box className="w-4 h-4" /> STL'de Dene
            </Link>
            <Link
              to={`/fotograf?boya=${paint.id}`}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-white border border-neutral-200 text-sm px-4 py-2.5 rounded-xl hover:bg-neutral-100"
            >
              <Image className="w-4 h-4" /> Fotoğrafta Dene
            </Link>
          </div>

          {paint.is_scan && (
            <button
              type="button"
              onClick={() => {
                deleteFingerprint(paint.id);
                navigate('/kutuphane');
              }}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 px-4 py-2 rounded-xl"
            >
              <Trash2 className="w-3.5 h-3.5" /> Bu taramayı sil
            </button>
          )}
        </div>

        <div>
          <div className="text-xs text-neutral-400">{paint.code}</div>
          <h1 className="text-2xl font-semibold text-neutral-900">{paint.name}</h1>
          <p className="mt-2 text-sm text-neutral-500">{series.description}</p>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-6">
            <Row
              label="LAB (D65/2°)"
              value={`${fmt(paint.lab.l)} · ${fmt(paint.lab.a)} · ${fmt(paint.lab.b)}`}
            />
            <Row
              label="XYZ"
              value={
                paint.xyz ? `${fmt(paint.xyz.x)} · ${fmt(paint.xyz.y)} · ${fmt(paint.xyz.z)}` : '—'
              }
            />
            <Row label="Parlaklık (GU)" value={`${paint.gloss}/100`} />
            <Row label="Metalik" value={fmt(paint.metallic)} />
            <Row label="Pearl" value={fmt(paint.pearl)} />
            <Row label="Pulcuk (Flake)" value={fmt(paint.flake)} />
            <Row label="Şeffaflık" value={fmt(paint.transparency)} />
            <Row label="Basecoat" value={paint.basecoat || '—'} />
            <Row label="Clearcoat" value={paint.clearcoat || '—'} />
          </div>

          <div className="mt-7">
            <h2 className="text-sm font-semibold text-neutral-900">Çok Açılı Davranış</h2>
            <div className="mt-3 space-y-1.5">
              {paint.multi_angle.map((m) => (
                <div key={m.angle} className="flex items-center gap-3">
                  <div
                    className="w-10 h-8 rounded-md ring-1 ring-black/10 shrink-0"
                    style={{ background: labToHex(m.lab) }}
                  />
                  <div className="text-xs text-neutral-400 w-10 shrink-0">{m.angle}°</div>
                  <div className="text-xs font-mono text-neutral-600 truncate">
                    L {fmt(m.lab.l)} · a {fmt(m.lab.a)} · b {fmt(m.lab.b)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-7">
            <Bar label="Parlaklık" value={paint.gloss} suffix="/100" />
            <Bar label="Metalik" value={Math.round(paint.metallic * 100)} suffix="%" />
            <Bar label="Pearl" value={Math.round(paint.pearl * 100)} suffix="%" />
            <Bar label="Pulcuk" value={Math.round(paint.flake * 100)} suffix="%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, mono }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3 py-2.5">
      <div className="text-[10px] text-neutral-400">{label}</div>
      <div className={`text-neutral-900 truncate ${mono ? 'font-mono text-xs' : 'text-sm'}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="text-sm text-neutral-900 font-mono break-words">{value}</div>
    </div>
  );
}

function Bar({ label, value, suffix }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3">
      <div className="text-sm font-medium text-neutral-900">
        {value}
        <span className="text-neutral-400 text-xs">{suffix}</span>
      </div>
      <div className="h-1 bg-neutral-100 rounded-full mt-2 overflow-hidden">
        <div
          className="h-full bg-neutral-900 rounded-full"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <div className="text-[10px] text-neutral-400 mt-1.5">{label}</div>
    </div>
  );
}
