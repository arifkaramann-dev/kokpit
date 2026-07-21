/**
 * Eşzamanlılık kilidi (yarış durumu koruması): aynı iş sürüyorken gelen
 * çağrılar yeni bir çalıştırma başlatmaz, süren işin sonucunu paylaşır.
 * Pazaryeri senkronunda "otomatik + elle aynı anda çekince sipariş mükerrer
 * düşüyor" hatasını engelleyen desenin test edilebilir hâli.
 */
export function createInflightGate<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (inFlight) return inFlight;
    inFlight = run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
