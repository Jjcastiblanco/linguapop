import type { ModelPack, ModelPackState } from '@linguapop/domain';

/** Un modelo que se carga una vez (descargándolo la primera vez) y luego se usa. */
export type ModelEngine = {
  load(onProgress: (fraction: number) => void): Promise<void>;
};

/** Dónde se recuerda que el modelo ya se descargó (por dispositivo). */
export type PackStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type ModelPackController<E extends ModelEngine> = {
  pack: ModelPack;
  /** Usa el motor ya cargado; si la copia guardada ya no carga, vuelve a ofrecer la descarga. */
  use<T>(work: (engine: E) => Promise<T>): Promise<T>;
};

const describe = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)) || 'error desconocido';

function safeStorage(): PackStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
const read = (s: PackStorage | null, key: string) => {
  try {
    return s?.getItem(key) === '1';
  } catch {
    return false;
  }
};
const write = (s: PackStorage | null, key: string, on: boolean) => {
  try {
    if (on) s?.setItem(key, '1');
    else s?.removeItem(key);
  } catch {
    /* sin almacenamiento: se vuelve a preguntar en la próxima visita */
  }
};

/**
 * Estado de un modelo de respaldo. Solo descarga cuando alguien llama a `pack.download()`. Si ya se
 * descargó en una visita anterior arranca `ready` y se carga, desde la caché del navegador, en el
 * primer uso; si esa carga falla, vuelve a `idle` para poder bajarlo de nuevo. Un fallo al usarlo
 * (con el modelo cargado) se guarda en `error()` y no borra la copia.
 */
export function createModelPack<E extends ModelEngine>(
  engine: E,
  sizeMb: number,
  storageKey: string,
  storage: PackStorage | null = safeStorage(),
): ModelPackController<E> {
  const listeners = new Set<() => void>();
  let state: ModelPackState = read(storage, storageKey) ? 'ready' : 'idle';
  let progress = 0;
  let lastError: string | null = null;
  let loaded: Promise<void> | null = null;
  let downloading: Promise<boolean> | null = null;

  const notify = () => listeners.forEach((l) => l());
  const set = (next: ModelPackState, nextProgress = progress) => {
    state = next;
    progress = nextProgress;
    notify();
  };
  const ensureLoaded = () => {
    loaded ??= engine.load((f) => {
      if (state !== 'downloading') return;
      progress = Math.min(1, Math.max(0, f));
      notify();
    });
    return loaded;
  };

  const pack: ModelPack = {
    sizeMb,
    state: () => state,
    progress: () => progress,
    error: () => lastError,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    download() {
      if (state === 'ready') return Promise.resolve(true);
      downloading ??= (async () => {
        lastError = null;
        set('downloading', 0);
        try {
          await ensureLoaded();
          write(storage, storageKey, true);
          set('ready', 1);
          return true;
        } catch (e) {
          loaded = null;
          lastError = describe(e);
          set('failed', 0);
          return false;
        } finally {
          downloading = null;
        }
      })();
      return downloading;
    },
  };

  return {
    pack,
    async use(work) {
      if (state !== 'ready') throw new Error('el modelo no está descargado');
      try {
        await ensureLoaded();
      } catch (e) {
        loaded = null;
        write(storage, storageKey, false);
        lastError = describe(e);
        set('idle', 0);
        throw e;
      }
      try {
        const result = await work(engine);
        if (lastError !== null) {
          lastError = null;
          notify();
        }
        return result;
      } catch (e) {
        lastError = describe(e);
        notify();
        throw e;
      }
    },
  };
}
