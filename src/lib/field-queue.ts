/**
 * Offline-first capture queue (browser only). Every photo, voice note, annotation and status tap is
 * written to IndexedDB first, then uploaded in the background. Nothing is removed from the queue until
 * the server has it, so a crash, reload or dead zone never loses a capture.
 */

export type QueueStatus = "queued" | "uploading" | "done" | "failed";

export type Shape =
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number };

export type QueueItem = {
  id: string; // client_id (idempotency key)
  op: "file" | "annotate" | "event";
  orgId: string;
  jobId: string;
  createdAt: number;
  status: QueueStatus;
  attempts: number;
  nextAt: number;
  error?: string | null;
  info?: string | null;
  doneAt?: number;
  // op = file
  kind?: "photo" | "voice";
  blob?: Blob;
  mime?: string;
  ext?: string;
  caption?: string | null;
  slope?: string | null;
  category?: string;
  hits?: number | null;
  takenAt?: string | null;
  annotations?: { shapes: Shape[] } | null;
  annotatedBlob?: Blob | null;
  // op = annotate (photo already on the server)
  targetFileId?: string;
  targetClientId?: string | null;
  // op = event
  event?: { kind: string; note: string | null; fileClientId: string | null; fileId: string | null };
};

const DB = "rb-field";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("jobId", "jobId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted (storage full?)"));
      }),
  );
}

export const queue = {
  put: (item: QueueItem) => tx("readwrite", (s) => s.put(item)).then(() => item),
  get: (id: string) => tx<QueueItem>("readonly", (s) => s.get(id)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
  async list(jobId: string): Promise<QueueItem[]> {
    const rows = (await tx<QueueItem[]>("readonly", (s) => s.index("jobId").getAll(jobId))) ?? [];
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },
  async patch(id: string, p: Partial<QueueItem>) {
    const cur = await queue.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...p };
    await queue.put(next);
    return next;
  },
};

export function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Exponential backoff: 2s, 4s, 8s … capped at 60s. */
export const backoffMs = (attempts: number) => Math.min(60_000, 1000 * 2 ** Math.max(1, attempts));

export function extFor(mime: string | undefined) {
  if (!mime) return "bin";
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
}
