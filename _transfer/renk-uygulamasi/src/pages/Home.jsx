import { Link } from 'react-router-dom';
import { ArrowRight, Layers, ScanLine, Box, Image } from 'lucide-react';
import PaintSwatch from '@/components/PaintSwatch.jsx';
import { SERIES } from '@/lib/series.js';
import { recent } from '@/lib/store.js';
import { useSyncedPaints } from '@/hooks/usePaints.js';

const CARDS = [
  {
    to: '/tara',
    icon: ScanLine,
    gradient: 'from-rose-500 to-orange-500',
    title: 'Renk Tara',
    body: 'Fotoğraf yükle veya çek — CIELAB ΔE2000 motoru en yakın 10 Art of Colour boyasını bulur.',
  },
  {
    to: '/stl',
    icon: Box,
    gradient: 'from-sky-500 to-indigo-500',
    title: 'STL Boyama',
    body: '3D modeli yükle, 360° döndür ve gerçek PBR malzemeyle gerçek zamanlı boyayı uygula.',
  },
  {
    to: '/fotograf',
    icon: Image,
    gradient: 'from-violet-500 to-fuchsia-500',
    title: 'Fotoğraf Boyama',
    body: 'Herhangi bir fotoğrafı yükle, boya rengini uygula, gerçek zamanlı önizleme.',
  },
];

export default function HomePage() {
  useSyncedPaints();
  const latest = recent(6);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white px-8 py-12 md:py-16">
        <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-rose-500 via-violet-500 to-sky-500 blur-3xl opacity-40" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-medium bg-white/10 px-3 py-1 rounded-full mb-4">
            <Layers className="w-3.5 h-3.5" />
            Digital Paint Fingerprint™ Motoru
          </div>
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            Fiziksel boyayı dijitalde{' '}
            <span className="bg-gradient-to-r from-rose-400 via-violet-400 to-sky-400 bg-clip-text text-transparent">
              birebir
            </span>{' '}
            temsil et.
          </h1>
          <p className="mt-4 text-neutral-300 text-sm md:text-base max-w-xl">
            Telefon kamerası + CIELAB renk bilimi + fizik tabanlı render. Solid, Candy, Metallic,
            Pearl ve Meteor serilerinin tamamı desteklenir.
          </p>
          <Link
            to="/tara"
            className="mt-7 inline-flex items-center gap-2 bg-white text-neutral-900 font-medium text-sm px-5 py-2.5 rounded-full hover:bg-neutral-100 transition-colors"
          >
            Renk Taramaya Başla
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-6">
        {CARDS.map(({ to, icon: Icon, gradient, title, body }) => (
          <Link
            key={to}
            to={to}
            className="group bg-white rounded-2xl border border-neutral-200 p-6 hover:shadow-lg hover:border-neutral-300 transition-all"
          >
            <div
              className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-sm`}
            >
              <Icon className="w-5 h-5 text-white" />
            </div>
            <h3 className="font-semibold text-neutral-900">{title}</h3>
            <p className="mt-1.5 text-sm text-neutral-500 leading-relaxed">{body}</p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-neutral-900 group-hover:gap-2 transition-all">
              Aç <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-neutral-900">Boya Serileri</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
          {SERIES.map((s) => (
            <Link
              key={s.id}
              to={`/kutuphane?seri=${s.id}`}
              className="bg-white rounded-xl border border-neutral-200 p-4 hover:shadow-md transition-all"
            >
              <div
                className="w-full h-12 rounded-lg mb-3"
                style={{ background: `linear-gradient(135deg, ${s.swatch}, ${s.swatch}99)` }}
              />
              <div className="font-medium text-sm text-neutral-900">{s.label}</div>
              <div className="text-[11px] text-neutral-400 mt-0.5 line-clamp-2">{s.description}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Son Eklenen Parmak İzleri</h2>
          <Link to="/kutuphane" className="text-sm text-neutral-500 hover:text-neutral-900">
            Tümünü gör
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          {latest.map((paint) => (
            <Link
              key={paint.id}
              to={`/boya/${paint.id}`}
              className="group bg-white rounded-2xl border border-neutral-200 overflow-hidden hover:shadow-md transition-all"
            >
              <PaintSwatch paint={paint} className="h-24 w-full" />
              <div className="p-3">
                <div className="text-xs text-neutral-400">{paint.code}</div>
                <div className="font-medium text-sm text-neutral-900 truncate">{paint.name}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
