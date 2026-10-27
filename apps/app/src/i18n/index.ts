import { es, type TextKey } from './es';

export type { TextKey };

/** Texto de la interfaz para una clave. */
export function t(key: TextKey): string {
  return es[key];
}
