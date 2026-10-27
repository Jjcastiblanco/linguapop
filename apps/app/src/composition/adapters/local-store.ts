import type { LocalStore } from '@linguapop/domain';

/** Lo mínimo que se necesita de `localStorage`; permite probar con un almacén falso. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type WebLocalStore = LocalStore & {
  /** El navegador no dejó usar su almacenamiento: los datos solo viven mientras la página siga abierta. */
  readonly usingMemory: () => boolean;
};

/**
 * Almacenamiento local que nunca lanza: si `localStorage` no existe o falla (modo privado,
 * almacenamiento bloqueado, cuota llena), sigue funcionando en memoria.
 */
export function createLocalStore(storage?: StorageLike | null): WebLocalStore {
  const memory = new Map<string, string>();
  let memoryOnly = storage === null;

  const resolved = (): StorageLike | null => {
    if (memoryOnly) return null;
    if (storage) return storage;
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null; // el acceso a localStorage puede lanzar con el almacenamiento bloqueado
    }
  };

  return {
    usingMemory: () => memoryOnly || resolved() === null,
    async get(key) {
      const s = resolved();
      if (s) {
        try {
          return s.getItem(key);
        } catch {
          memoryOnly = true;
        }
      }
      return memory.get(key) ?? null;
    },
    async set(key, value) {
      const s = resolved();
      if (s) {
        try {
          s.setItem(key, value);
          return;
        } catch {
          memoryOnly = true;
        }
      }
      memory.set(key, value);
    },
    async remove(key) {
      memory.delete(key);
      const s = resolved();
      if (s) {
        try {
          s.removeItem(key);
        } catch {
          memoryOnly = true;
        }
      }
    },
  };
}
