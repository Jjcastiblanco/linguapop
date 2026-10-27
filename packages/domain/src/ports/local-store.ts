/** Almacenamiento clave-valor local (en la web, `localStorage` o IndexedDB; en Android, Preferences). */
export interface LocalStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
