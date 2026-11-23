/** Un snapshot de contenido publicado, tal como llega del servidor y sin validar. */
export type ContentSnapshot = { version: number; content: unknown };

/**
 * Contenido publicado en el servidor (AD-5). Solo lectura: el puntero `latest` de cada versión de
 * esquema dice cuál es el snapshot vigente. Si no hay red o el servidor falla, lanza.
 */
export interface ContentRemote {
  /** Hay un servidor configurado. */
  available(): boolean;
  /**
   * Solo el número de versión del snapshot vigente (o `null` si no hay ninguno), sin su contenido:
   * así la app sabe si hay algo nuevo sin bajar el curso entero en cada arranque. Opcional: sin él
   * se pide `latest` directamente.
   */
  latestVersion?(schemaVersion: number): Promise<number | null>;
  /** El snapshot vigente para esta versión de esquema, o `null` si aún no hay ninguno publicado. */
  latest(schemaVersion: number): Promise<ContentSnapshot | null>;
}
