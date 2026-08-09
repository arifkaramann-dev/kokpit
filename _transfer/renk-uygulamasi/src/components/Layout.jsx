import { NavLink } from 'react-router-dom';
import {
  Home,
  ScanLine,
  Library,
  Box,
  Image,
  Palette,
  FlaskConical,
  Sparkles,
  LayoutTemplate,
  Package,
} from 'lucide-react';

const NAV = [
  { to: '/', label: 'Genel Bakış', icon: Home },
  { to: '/sablonlar', label: 'Şablonlar', icon: LayoutTemplate },
  { to: '/ambalajlar', label: 'Ambalajlar', icon: Package },
  { to: '/ai', label: 'AI Üretim', icon: Sparkles },
  { to: '/uret', label: 'Renk Üretimi', icon: FlaskConical },
  { to: '/tara', label: 'Renk Tara', icon: ScanLine },
  { to: '/kutuphane', label: 'Boya Kütüphanesi', icon: Library },
  { to: '/stl', label: 'STL Boyama', icon: Box },
  { to: '/fotograf', label: 'Fotoğraf Boyama', icon: Image },
];

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-neutral-200 bg-white">
        <div className="px-6 py-7 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 via-violet-500 to-sky-500 flex items-center justify-center shadow-sm">
              <Palette className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-semibold text-neutral-900 leading-tight">Art of Colour</div>
              <div className="text-[11px] text-neutral-400 leading-tight">Digital Paint Engine</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-neutral-100 text-[11px] text-neutral-400">
          CIELAB ΔE2000 · D65 / 2°
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-rose-500 via-violet-500 to-sky-500" />
            <span className="font-semibold text-sm">Art of Colour</span>
          </div>
        </div>
        <div className="flex overflow-x-auto px-2 pb-2 gap-1 no-scrollbar">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
                  isActive ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'
                }`
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="flex-1 min-w-0 pt-[104px] md:pt-0">{children}</main>
    </div>
  );
}
