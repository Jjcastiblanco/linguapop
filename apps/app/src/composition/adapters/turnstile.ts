/**
 * Widget de Cloudflare Turnstile para el alta y el acceso con correo (11.3). Es lo único de la app que
 * conoce a Cloudflare. La clave del sitio es pública; el secreto vive solo en Supabase Auth. Cada token
 * sirve una sola vez (spike 11.2): quien lo use debe pedir otro con `reset()` tras cada intento.
 */
type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | null = null;

/** Carga el script una sola vez; si ya está en la página (o una prueba lo puso) lo usa tal cual. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile-missing'));
    script.onerror = () => reject(new Error('turnstile-blocked'));
    document.head.appendChild(script);
  }).catch((e: unknown) => {
    loading = null; // un fallo pasajero (sin red) no impide reintentar al abrir de nuevo
    throw e;
  });
  return loading;
}

export type TurnstileHandle = { reset(): void; remove(): void };

export type TurnstileCallbacks = {
  /** Llega un token nuevo, listo para un solo uso. */
  onToken(token: string): void;
  /** El token venció o el widget se reinició: ya no hay token válido. */
  onClear(): void;
  /** El widget no pudo cargar o dio un error que la persona no puede resolver. */
  onError(): void;
};

/**
 * Monta el widget en `el`. Si el script no carga o Turnstile no puede dibujarlo (clave o dominio
 * inválidos), avisa con `onError` y devuelve `null`. Si `isCancelled()` es cierto al terminar la carga
 * (la hoja ya se cerró), no monta nada ni avisa.
 */
export async function renderTurnstile(
  el: HTMLElement,
  siteKey: string,
  callbacks: TurnstileCallbacks,
  isCancelled: () => boolean = () => false,
): Promise<TurnstileHandle | null> {
  let api: TurnstileApi;
  try {
    api = await loadTurnstile();
  } catch {
    if (!isCancelled()) callbacks.onError();
    return null;
  }
  if (isCancelled()) return null;
  let id: string;
  try {
    id = api.render(el, {
      sitekey: siteKey,
      callback: (token: string) => callbacks.onToken(token),
      'expired-callback': () => callbacks.onClear(),
      'timeout-callback': () => callbacks.onClear(),
      'error-callback': () => {
        callbacks.onClear();
        callbacks.onError();
      },
    });
  } catch {
    callbacks.onError();
    return null;
  }
  return {
    reset() {
      callbacks.onClear();
      api.reset(id);
    },
    remove: () => api.remove(id),
  };
}
