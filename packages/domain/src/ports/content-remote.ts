/** Un snapshot de contenido publicado, tal como llega del servidor y sin validar. */
export type ContentSnapshot = { version: number; content: unknown };

/**
 * Contenido publicado en el servidor (AD-5). Solo lectura: el puntero `latest` de cada versión de
 * esquema dice cuál es el snapshot vigente. Si no hay red o el servidor falla, lanza.
 */
export interface ContentRemote {
  /** Hay un servidor configurado. */
  available(): boolean;
  /** El snapshot vigente para esta versión de esquema, o `null` si aún no hay ninguno publicado. */
  latest(schemaVersion: number): Promise<ContentSnapshot | null>;
}
