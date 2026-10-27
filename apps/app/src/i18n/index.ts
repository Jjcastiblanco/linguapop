import { es, type TextKey } from './es';

export type { TextKey };

/**
 * Texto de la interfaz para una clave. Los marcadores `{nombre}` se reemplazan con los
 * parámetros; un marcador sin parámetro se deja tal cual para que el error se note.
 */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  return es[key].replace(/\{(\w+)\}/g, (marcador, nombre: string) =>
    nombre in params ? String(params[nombre]) : marcador,
  );
}
