import { AUDIO_KEY_PATTERN, type RemoteAudio } from '@linguapop/content';

/** La parte de la API de caché que se usa; las pruebas la reemplazan por una en memoria. */
export type ClipCache = {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  keys(): Promise<readonly string[]>;
  delete(url: string): Promise<boolean>;
};

export type RemoteClipsOptions = {
  /** Abre la caché de los clips; sin ella (`null`) se reproduce directo desde la red. */
  openCache: () => Promise<ClipCache | null>;
  fetchClip?: typeof fetch;
  /** Convierte lo descargado en una dirección que `Audio` pueda reproducir. */
  objectUrl?: (blob: Blob) => string;
  /** Libera una dirección creada con `objectUrl`. */
  revokeUrl?: (url: string) => void;
  /** Cuántas descargas a la vez al guardar por adelantado. */
  concurrency?: number;
  /** Espera máxima de un clip pedido para sonar ya; el guardado por adelantado espera más. */
  playTimeoutMs?: number;
  prefetchTimeoutMs?: number;
  /** Si el dispositivo pidió ahorrar datos no se guarda por adelantado. */
  saveData?: () => boolean;
  log?: (message: string) => void;
};

/** Un clip pesa unos 10 KB; el bucket admite 1 MiB: más que eso no es un clip. */
export const MAX_CLIP_BYTES = 1024 * 1024;

export const CLIP_CACHE_NAME = 'linguapop-audio-remote-v1';

export function browserClipCache(): Promise<ClipCache | null> {
  if (typeof caches === 'undefined') return Promise.resolve(null);
  return caches
    .open(CLIP_CACHE_NAME)
    .then((cache): ClipCache => ({
      match: (url) => cache.match(url),
      put: (url, response) => cache.put(url, response),
      keys: async () => (await cache.keys()).map((request) => request.url),
      delete: (url) => cache.delete(url),
    }))
    .catch(() => null);
}

/**
 * Los clips de audio que publica el snapshot y no vienen empaquetados en la app. Un clip se
 * descarga una vez, se guarda en la caché del dispositivo y suena sin red después. Los nombres son
 * huellas del contenido, así que lo guardado nunca queda viejo: solo se retira lo que el snapshot
 * ya no menciona. Todo lo que falle (red, caché, un archivo que no es audio) lanza, y quien llama
 * cae a la voz de respaldo.
 */
export function createRemoteClips({
  openCache,
  fetchClip = (...args) => fetch(...args),
  objectUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
  concurrency = 2,
  playTimeoutMs = 4000,
  prefetchTimeoutMs = 20000,
  saveData = () =>
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
    true,
  log = (m) => console.warn(m),
}: RemoteClipsOptions) {
  let audio: RemoteAudio | null = null;
  let keys: ReadonlySet<string> = new Set();
  let cache: Promise<ClipCache | null> | null = null;
  const urls = new Map<string, string>();
  const inFlight = new Map<string, Promise<Blob>>();

  const cacheOf = () => (cache ??= openCache().catch(() => null));
  const clipUrl = (key: string) => `${audio!.baseUrl}${key}.mp3`;

  /** Lee el cuerpo sin pasar de `MAX_CLIP_BYTES`: corta en cuanto se excede. */
  async function readLimited(response: Response): Promise<Blob> {
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_CLIP_BYTES) throw new Error('el archivo pasa del tamaño de un clip');
    const reader = response.body?.getReader();
    if (!reader) {
      const blob = await response.blob();
      if (blob.size > MAX_CLIP_BYTES) throw new Error('el archivo pasa del tamaño de un clip');
      return blob;
    }
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_CLIP_BYTES) {
        void reader.cancel().catch(() => undefined); // no se espera: en un `clone` solo termina al cancelar las dos ramas
        throw new Error('el archivo pasa del tamaño de un clip');
      }
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
  }

  async function blobOf(key: string, timeoutMs: number): Promise<Blob> {
    const url = clipUrl(key);
    const store = await cacheOf();
    const saved = await store?.match(url).catch(() => undefined);
    if (saved) return saved.blob();
    const pending = inFlight.get(url);
    if (pending) return pending;
    const download = (async () => {
      const response = await fetchClip(url, {
        credentials: 'omit',
        signal: AbortSignal.timeout(timeoutMs),
      });
      try {
        if (!response.ok) throw new Error(`clip ${response.status}`);
        const blob = await readLimited(response.clone());
        if (blob.size === 0 || !blob.type.startsWith('audio/')) {
          throw new Error('el archivo no es un clip de audio válido');
        }
        await store?.put(url, response).catch(() => undefined); // sin caché sigue sonando, solo no se guarda
        return blob;
      } catch (error) {
        void response.body?.cancel().catch(() => undefined);
        throw error;
      }
    })().finally(() => inFlight.delete(url));
    inFlight.set(url, download);
    return download;
  }

  function forgetUrls() {
    for (const url of urls.values()) revokeUrl(url);
    urls.clear();
  }

  return {
    /** Registra el audio del snapshot, retira lo que ya no menciona y guarda por adelantado lo que falta. */
    async use(next: RemoteAudio | undefined): Promise<void> {
      const mine = next ?? null;
      audio = mine;
      forgetUrls();
      keys = new Set(next?.keys.filter((k) => AUDIO_KEY_PATTERN.test(k)) ?? []);
      const store = await cacheOf();
      if (!store) return;
      if (!mine) {
        // Un snapshot sin audio remoto: nada de lo guardado se vuelve a usar.
        for (const url of await store.keys().catch(() => [])) {
          await store.delete(url).catch(() => undefined);
        }
        return;
      }
      if (saveData()) return; // los clips se guardan al reproducirlos, no por adelantado
      const wanted = new Set([...keys].map(clipUrl));
      const present = new Set<string>();
      for (const url of await store.keys().catch(() => [])) {
        if (wanted.has(url)) present.add(url);
        else await store.delete(url).catch(() => undefined);
      }
      const missing = [...keys].filter((k) => !present.has(clipUrl(k)));
      for (let i = 0; i < missing.length; i += concurrency) {
        if (mine !== audio) return; // llegó otro snapshot: lo que queda lo guarda quien lo registró
        await Promise.all(
          missing.slice(i, i + concurrency).map((k) =>
            blobOf(k, prefetchTimeoutMs).catch((error: unknown) => {
              log(
                `Clip ${k} sin guardar: ${error instanceof Error ? error.message : String(error)}`,
              );
            }),
          ),
        );
      }
    },
    has: (key: string) => keys.has(key),
    /** Una dirección reproducible del clip; lanza si no se pudo obtener. */
    async urlOf(key: string): Promise<string> {
      if (!keys.has(key)) throw new Error('clip desconocido');
      const known = urls.get(key);
      if (known) return known;
      const snapshot = audio;
      const url = objectUrl(await blobOf(key, playTimeoutMs));
      if (snapshot !== audio) {
        // Llegó otro snapshot mientras bajaba: esta dirección ya no se guarda.
        revokeUrl(url);
        throw new Error('el audio cambió mientras se descargaba el clip');
      }
      urls.set(key, url);
      return url;
    },
  };
}

export type RemoteClips = ReturnType<typeof createRemoteClips>;
