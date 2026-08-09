// Üretilen görsellerin kalıcı deposu.
//
// Neden IndexedDB, neden localStorage değil: 1024×1024 bir PNG base64 olarak
// ~1.5 MB. localStorage'ın sınırı 5-10 MB, yani üç dört görselden sonra dolar
// ve sessizce yazmayı bırakır. IndexedDB kotası disk boşluğuyla ölçekleniyor,
// binlerce renk için tek uygun seçenek.
//
// Metadata (kod, isim, seri, hex) ayrı tutuluyor — o küçük ve sık okunuyor.

const DB_NAME = 'aoc-assets';
const DB_VERSION = 1;
const STORE = 'images';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = () => {
          // fn bir IDBRequest döndürdüyse değerini aç, döndürmediyse olduğu
          // gibi geç.
          //
          // Burada `result?.result ?? result` yazmıştım ve sinsi bir hataydı:
          // kayıt bulunamadığında request.result === undefined oluyor, `??`
          // devreye girip REQUEST NESNESİNİ döndürüyordu. Nesne truthy olduğu
          // için uygulama "bu rengin görseli var" sanıyordu — kütüphane
          // temizlendikten sonra bile.
          resolve(result instanceof IDBRequest ? result.result : result);
        };
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

/**
 * Açık bağlantıyı kapatır.
 *
 * IndexedDB'de açık bağlantı varken deleteDatabase BLOKE olur; silme sessizce
 * gerçekleşmez. Temizlik yaparken önce bu çağrılmalı, yoksa "silindi" denir
 * ama veri yerinde durur.
 */
export async function closeDb() {
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    db.close();
  } catch {
    // zaten kapalıysa sorun değil
  }
  dbPromise = null;
}

/** Anahtar: `${colorId}:${objectId}` — her renk için her obje ayrı kayıt. */
export function assetKey(colorId, objectId) {
  return `${colorId}:${objectId}`;
}

export async function putAsset(colorId, objectId, dataUrl) {
  await tx('readwrite', (s) => s.put(dataUrl, assetKey(colorId, objectId)));
  return true;
}

export async function getAsset(colorId, objectId) {
  return tx('readonly', (s) => s.get(assetKey(colorId, objectId)));
}

export async function deleteAsset(colorId, objectId) {
  await tx('readwrite', (s) => s.delete(assetKey(colorId, objectId)));
}

/** Bir rengin tüm görsellerini siler. */
export async function deleteColorAssets(colorId) {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  const mine = (keys || []).filter((k) => String(k).startsWith(`${colorId}:`));
  await tx('readwrite', (s) => {
    mine.forEach((k) => s.delete(k));
  });
  return mine.length;
}

/** Hangi objeler için görsel var — arayüzde rozet göstermek için. */
export async function listAssetObjects(colorId) {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  return (keys || [])
    .filter((k) => String(k).startsWith(`${colorId}:`))
    .map((k) => String(k).slice(String(colorId).length + 1));
}

/**
 * Depodaki tüm görselleri siler.
 *
 * Veritabanının kendisini silmiyoruz: `deleteDatabase` açık bağlantı varken
 * bloke oluyor, üstelik bekleyen silme isteği sonraki açılışları da kilitliyor
 * (denedim, sayfa dondu). Object store'u boşaltmak aynı sonucu veriyor ve
 * açık bağlantıyla sorunsuz çalışıyor.
 */
export async function clearAllAssets() {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  await tx('readwrite', (s) => s.clear());
  return (keys || []).length;
}

/** Kaba depo kullanımı — kullanıcı ne kadar yer kapladığını görebilsin. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage, quota, usageMb: usage / 1048576, quotaMb: quota / 1048576 };
}
