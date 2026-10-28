import { createStore, type StoreApi } from 'zustand/vanilla';

/** Cuánto tiempo se ve un aviso antes de quitarse solo. */
export const TOAST_MS = 3500;

export type Toast = { id: number; text: string };

export type ToastState = {
  toasts: Toast[];
  show: (text: string) => void;
  dismiss: (id: number) => void;
};

export type ToastStore = StoreApi<ToastState>;

/** Avisos breves ("toasts"): se apilan y cada uno se quita solo a los pocos segundos. */
export function createToastStore(lifetimeMs = TOAST_MS): ToastStore {
  let next = 1;
  return createStore<ToastState>((set, get) => ({
    toasts: [],
    show(text) {
      const id = next++;
      set({ toasts: [...get().toasts, { id, text }] });
      setTimeout(() => get().dismiss(id), lifetimeMs);
    },
    dismiss(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
  }));
}
