const DB_NAME = "shotstack-html5-cache";
const DB_VERSION = 1;
const STORE_NAME = "captures";
const MAX_ENTRIES = 30;

export interface Html5CacheEntry {
	pngs: Blob[];
	fps: number;
	frameCount: number;
	width: number;
	height: number;
	createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let evictionPromise: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase | null> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise<IDBDatabase | null>(resolve => {
		try {
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => {
				console.warn("[Html5CaptureCache] indexedDB.open failed:", req.error);
				resolve(null);
			};
			req.onblocked = () => {
				console.warn("[Html5CaptureCache] indexedDB.open blocked");
				resolve(null);
			};
		} catch (err) {
			// SSR / non-browser / disabled storage — silently disable cache.
			console.warn("[Html5CaptureCache] indexedDB unavailable:", err);
			resolve(null);
		}
	});
	return dbPromise;
}

function evictOldEntries(db: IDBDatabase): Promise<void> {
	if (evictionPromise) return evictionPromise;
	evictionPromise = new Promise<void>(resolve => {
		try {
			const tx = db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const keysReq = store.getAllKeys();
			const valuesReq = store.getAll();
			tx.oncomplete = () => resolve();
			tx.onerror = () => resolve();
			tx.onabort = () => resolve();
			Promise.all([
				new Promise<IDBValidKey[]>(r => {
					keysReq.onsuccess = () => r(keysReq.result);
					keysReq.onerror = () => r([]);
				}),
				new Promise<Html5CacheEntry[]>(r => {
					valuesReq.onsuccess = () => r(valuesReq.result as Html5CacheEntry[]);
					valuesReq.onerror = () => r([]);
				})
			])
				.then(([keys, values]) => {
					if (keys.length <= MAX_ENTRIES) return;
					const paired = keys.map((key, i) => ({ key, createdAt: values[i]?.createdAt ?? 0 }));
					paired.sort((a, b) => a.createdAt - b.createdAt);
					const toDelete = paired.slice(0, keys.length - MAX_ENTRIES);
					const delTx = db.transaction(STORE_NAME, "readwrite");
					const delStore = delTx.objectStore(STORE_NAME);
					for (const entry of toDelete) delStore.delete(entry.key);
				})
				.catch(err => {
					console.warn("[Html5CaptureCache] eviction failed:", err);
				});
		} catch (err) {
			console.warn("[Html5CaptureCache] eviction threw:", err);
			resolve();
		}
	});
	return evictionPromise;
}

export async function html5CacheGet(key: string): Promise<Html5CacheEntry | null> {
	const db = await openDb();
	if (!db) return null;
	evictOldEntries(db).catch(() => undefined);
	return new Promise<Html5CacheEntry | null>(resolve => {
		try {
			const tx = db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const req = store.get(key);
			req.onsuccess = () => {
				const value = req.result as Html5CacheEntry | undefined;
				resolve(value ?? null);
			};
			req.onerror = () => {
				console.warn("[Html5CaptureCache] get failed:", req.error);
				resolve(null);
			};
		} catch (err) {
			console.warn("[Html5CaptureCache] get threw:", err);
			resolve(null);
		}
	});
}

export async function html5CachePut(key: string, value: Html5CacheEntry): Promise<void> {
	const db = await openDb();
	if (!db) return;
	evictOldEntries(db).catch(() => undefined);
	await new Promise<void>(resolve => {
		try {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const req = store.put(value, key);
			req.onsuccess = () => resolve();
			req.onerror = () => {
				console.warn("[Html5CaptureCache] put failed:", req.error);
				resolve();
			};
			tx.onerror = () => resolve();
		} catch (err) {
			console.warn("[Html5CaptureCache] put threw:", err);
			resolve();
		}
	});
}

export { computeHtml5CacheKey } from "@shotstack/shotstack-canvas";
