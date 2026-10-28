/** Aviso de que hay una versión nueva de la app esperando a que el estudiante la active. */
export type WebUpdate = {
  /** ¿Hay una versión nueva lista y el estudiante aún no la ha descartado? */
  available(): boolean;
  subscribe(listener: () => void): () => void;
  /** Lo llama el registro del service worker cuando hay una versión nueva; `apply` la activa y recarga. */
  offer(apply: () => void): void;
  /** El estudiante acepta: se activa la versión nueva. */
  apply(): void;
  /** El estudiante lo deja para después. */
  dismiss(): void;
};

/**
 * Estado de "hay una actualización". La app no se actualiza sola a media sesión: avisa y espera a
 * que el estudiante pulse Actualizar, porque recargar cortaría lo que esté haciendo.
 */
export function createWebUpdate(): WebUpdate {
  let pending: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  return {
    available: () => pending !== null,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    offer(apply) {
      pending = apply;
      notify();
    },
    apply() {
      const apply = pending;
      pending = null;
      notify();
      apply?.();
    },
    dismiss() {
      pending = null;
      notify();
    },
  };
}
