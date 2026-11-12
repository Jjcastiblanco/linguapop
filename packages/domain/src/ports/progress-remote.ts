import type { ProgressEvent } from '../events';

/** Qué hizo el servidor con los eventos enviados. Un id repetido cuenta como aceptado. */
export type PushOutcome = {
  accepted: string[];
  /** El servidor los rechazó de forma definitiva (AD-7): no se reintentan y no cuentan. */
  rejected: string[];
};

/**
 * Lo que trae una pasada de `pull`. `cursor` es la hora del servidor (`received_at`) del último
 * evento recibido, que la siguiente pasada pasa como `since`; es nulo si no llegó ninguno.
 */
export type PullResult = {
  /** Eventos aceptados que esta versión entiende, también los de otros dispositivos. */
  events: ProgressEvent[];
  /** Ids de los eventos que el servidor guardó como rechazados (AD-7): no cuentan. */
  rejected: string[];
  cursor: string | null;
};

/**
 * Copia del progreso en el servidor (AD-6, AD-7). Solo conoce los eventos de la cuenta con la
 * sesión abierta. Si no hay red o el servidor no responde, lanza: los eventos siguen pendientes.
 */
export interface ProgressRemote {
  /** Hay un servidor configurado. */
  available(): boolean;
  /** Envía eventos de forma idempotente: reenviar un id ya guardado no lo duplica. */
  push(events: readonly ProgressEvent[]): Promise<PushOutcome>;
  /**
   * Lo que el servidor recibió de la cuenta desde `since` (con un pequeño solape que cubre las
   * escrituras que confirman fuera de orden); sin `since`, todo. Repetir un evento es inocuo: el
   * cliente lo ignora por su id.
   */
  pull(since: string | null): Promise<PullResult>;
}
