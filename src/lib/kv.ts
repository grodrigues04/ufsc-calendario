// Tiny IndexedDB key-value store, shared by the app and the service worker (which cannot read
// localStorage). Everything stays on the device.

const DATABASE = 'chamada'
const STORE = 'kv'

let opening: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      opening = null
      reject(request.error)
    }
  })
  return opening
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export function kvGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('readonly', (store) => store.get(key))
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await run('readwrite', (store) => store.put(value, key))
}

export async function kvDelete(key: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key))
}
