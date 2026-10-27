import type { Course } from '@linguapop/content';

/** Origen del contenido publicado: caché local, semilla o servidor (AD-5). */
export interface ContentSource {
  /** Devuelve el contenido ya validado contra el esquema. */
  load(): Promise<Course>;
}
