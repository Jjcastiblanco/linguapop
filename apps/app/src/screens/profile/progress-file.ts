import { parseKnownEvents, type ProgressEvent } from '@linguapop/domain';

export const EXPORT_APP = 'linguapop';
export const EXPORT_VERSION = 1;

/** Contenido del archivo que se descarga al exportar el progreso. */
export function buildExport(events: readonly ProgressEvent[]): string {
  return JSON.stringify({ app: EXPORT_APP, version: EXPORT_VERSION, events });
}

/**
 * Eventos válidos de un archivo exportado, o nulo si el archivo no sirve: no es JSON, no tiene la
 * forma esperada o no trae ningún evento válido (una importación vacía borraría el progreso por error).
 */
export function parseImport(text: string): ProgressEvent[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { app, events } = data as { app?: unknown; events?: unknown };
  if (app !== EXPORT_APP || !Array.isArray(events)) return null;
  const known = parseKnownEvents(events);
  return known.length > 0 ? known : null;
}
