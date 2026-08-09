import { useId } from 'react';

/**
 * Fizik tabanlı boya numunesi.
 * Katmanlar: gövde rengi → pulcuk gürültüsü → interferans gradyanı →
 * specular parlama → clearcoat iç gölgesi. Şiddetleri parmak izinin
 * metallic / pearl / flake / gloss değerlerinden gelir.
 */
export default function PaintSwatch({ paint, className = '', style, children }) {
  const id = useId().replace(/:/g, '');
  const { hex = '#888888', metallic = 0, pearl = 0, flake = 0, gloss = 60 } = paint || {};

  const flakeOpacity = Math.min(0.5, flake * 0.55 + metallic * 0.15);
  const pearlOpacity = Math.min(0.75, pearl * 0.6);
  const specular = 0.18 + (gloss / 100) * 0.4;

  return (
    <div
      className={`relative overflow-hidden ring-1 ring-black/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),inset_0_-2px_6px_rgba(0,0,0,0.25)] ${className}`}
      style={{ background: hex, ...style }}
    >
      {flakeOpacity > 0.02 && (
        <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
          <filter id={`flake-${id}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect
            width="100%"
            height="100%"
            filter={`url(#flake-${id})`}
            opacity={flakeOpacity}
            style={{ mixBlendMode: 'screen' }}
          />
        </svg>
      )}

      {pearlOpacity > 0.02 && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(115deg, rgba(255,255,255,0.45) 0%, rgba(180,220,255,0.25) 25%, rgba(220,180,255,0.25) 50%, rgba(255,220,180,0.25) 75%, rgba(255,255,255,0.35) 100%)',
            mixBlendMode: 'soft-light',
            opacity: 0.35 + pearlOpacity,
          }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 45% at 32% 22%, rgba(255,255,255,${specular.toFixed(
            2
          )}) 0%, transparent 55%)`,
          mixBlendMode: 'screen',
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
      />

      {children}
    </div>
  );
}
