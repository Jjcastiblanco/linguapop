import type { ProgressEvent } from '../events';

/** Registro local-primero de eventos de progreso (AD-6): se guarda al instante y se sincroniza después. */
export interface ProgressSink {
  /** Idempotente: reenviar un evento con el mismo id no lo duplica. */
  append(event: ProgressEvent): Promise<void>;
  /** Todos los eventos conocidos, para reconstruir el estado plegándolos. */
  readAll(): Promise<ProgressEvent[]>;
}
