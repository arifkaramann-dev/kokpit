import { useEffect, useState } from 'react';
import { subscribe } from '@/lib/store.js';

/** Store'daki değişikliklerde bileşeni yeniden çizer. */
export function useSyncedPaints() {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((t) => t + 1)), []);
}
