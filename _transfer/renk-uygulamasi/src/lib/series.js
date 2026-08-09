// Boya serileri — açıklama, temsil rengi ve 3B render varsayılanları.

export const SERIES = [
  {
    id: 'Solid',
    label: 'Solid',
    swatch: '#2b2b2b',
    description: 'Düz, tek tonlu son kat. Yüksek opaklık, etkili örtücülük.',
    // flopStrength pulcuk ölçeğinden AYRI: biri rengin açıyla ne kadar
    // derinleştiği, diğeri yüzeyde ne kadar parıltı göründüğü. Candy'de
    // flop güçlü ama görünür pulcuk azdır — pulcuk saydam katmanın ALTINDA.
    pbr: { metalness: 0.0, roughness: 0.42, clearcoat: 1, iridescence: 0, flakeScale: 0, flopStrength: 0.12 },
  },
  {
    id: 'Candy',
    label: 'Candy',
    swatch: '#c0392b',
    description: 'Saydam renk katmanı üzerine metalik baz. Derin, camsı görünüm.',
    // Saydam renk katmanının altında GÜMÜŞ METALİK BAZ var — parlama
    // çekirdeğinin candy'de bu kadar parlak olmasının sebebi o ayna.
    // Metalik specular albedoyla renklenir, yani yansıma da yeşil/kırmızı
    // çıkar; beyaza yıkanmaz. Derinliği soğurma katsayısı taşıyor.
    pbr: { metalness: 0.58, roughness: 0.22, clearcoat: 1, iridescence: 0.06, flakeScale: 0.35, flopStrength: 0.55 },
  },
  {
    id: 'Metallic',
    label: 'Metallic',
    swatch: '#7f8c8d',
    description: 'Alüminyum pulcuklu, açıya bağlı parlama değişimi.',
    pbr: { metalness: 0.34, roughness: 0.34, clearcoat: 1, iridescence: 0, flakeScale: 1, flopStrength: 0.45 },
  },
  {
    id: 'Pearl',
    label: 'Pearl',
    swatch: '#8e44ad',
    description: 'İnterferans pigmanları, iridesan renk geçişi.',
    pbr: { metalness: 0.16, roughness: 0.3, clearcoat: 1, iridescence: 0.85, flakeScale: 0.7, flopStrength: 0.4 },
  },
  {
    id: 'Meteor',
    label: 'Meteor',
    swatch: '#1a1a2e',
    description: 'Koyu baz, parlak pulcuk, derin uzaysı etki.',
    pbr: { metalness: 0.4, roughness: 0.24, clearcoat: 1, iridescence: 0.3, flakeScale: 1.4, flopStrength: 0.58 },
  },
];

export const SERIES_IDS = SERIES.map((s) => s.id);

export function getSeries(id) {
  return SERIES.find((s) => s.id === id) || SERIES[0];
}
