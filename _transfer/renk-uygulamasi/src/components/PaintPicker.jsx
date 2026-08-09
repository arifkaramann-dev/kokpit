import PaintSwatch from './PaintSwatch.jsx';

/** Sağ panelde kullanılan dikey boya seçici. */
export default function PaintPicker({ paints, value, onChange, title = 'BOYA SEÇ' }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 text-[11px] font-medium tracking-wide text-neutral-400">
        {title}
      </div>
      <div className="max-h-[520px] overflow-y-auto p-2 space-y-1">
        {paints.map((paint) => {
          const active = value?.id === paint.id;
          return (
            <button
              key={paint.id}
              type="button"
              onClick={() => onChange(paint)}
              className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors ${
                active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
              }`}
            >
              <PaintSwatch paint={paint} className="w-10 h-10 rounded-lg shrink-0" />
              <div className="min-w-0">
                <div className={`text-[11px] ${active ? 'text-neutral-400' : 'text-neutral-400'}`}>
                  {paint.code}
                </div>
                <div className="text-sm font-medium truncate">{paint.name}</div>
                <div className={`text-[11px] ${active ? 'text-neutral-400' : 'text-neutral-400'}`}>
                  {paint.series}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
