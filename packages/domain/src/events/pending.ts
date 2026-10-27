import type { ProgressEvent } from './schema';

/** Un evento tal como lo produce el dominio, antes de que el adaptador le ponga id, fecha y versión. */
export type PendingEvent = {
  [T in ProgressEvent['type']]: {
    type: T;
    payload: Extract<ProgressEvent, { type: T }>['payload'];
  };
}[ProgressEvent['type']];

/**
 * Completa un evento pendiente con lo que solo el exterior sabe: un id nuevo, el instante y la
 * versión del contenido. Convertir un instante dado a texto no lee el reloj del sistema.
 */
export function completeEvent(
  pending: PendingEvent,
  meta: { id: string; nowMs: number; contentVersion: number },
): ProgressEvent {
  return {
    id: meta.id,
    type: pending.type,
    occurredAt: new Date(meta.nowMs).toISOString(),
    contentVersion: meta.contentVersion,
    payload: pending.payload,
  } as ProgressEvent;
}
