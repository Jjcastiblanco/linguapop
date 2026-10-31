import type { ProgressEvent } from '../events';

/** Qué hizo el servidor con los eventos enviados. Un id repetido cuenta como aceptado. */
export type PushOutcome = {
  accepted: string[];
  /** El servidor los rechazó de forma definitiva (AD-7): no se reintentan y no cuentan. */
  rejected: string[];
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
  /** Todos los eventos de la cuenta que esta versión entiende, también los de otros dispositivos. */
  pull(): Promise<ProgressEvent[]>;
}
