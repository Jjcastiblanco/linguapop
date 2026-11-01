import { SocialLogin } from '@capgo/capacitor-social-login';
import type { NativeGoogle } from '../adapters/supabase';

/** Lo que el adaptador usa del plugin; las pruebas lo reemplazan por uno falso. */
export type SocialLoginPlugin = Pick<typeof SocialLogin, 'initialize' | 'login'>;

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Nonce aleatorio y su SHA-256 en hexadecimal: el hash va a Google y el valor crudo a Supabase. */
async function newNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: hex(new Uint8Array(digest)) };
}

const errorText = (e: unknown) => {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
};

/** Solo el cierre explícito del selector es silencioso; cualquier otro «cancelado» se muestra como error. */
const isUserCancel = (e: unknown) => (e as { code?: unknown } | null)?.code === 'USER_CANCELLED';

/**
 * Selector nativo de cuentas de Google del APK (Credential Manager). Solo `webClientId`, nunca el
 * ID del cliente Android. No pide `scopes` ni modo offline: el token por defecto ya trae correo y
 * nombre, y esas opciones exigirían modificar `MainActivity`. `initialize` se hace en la primera
 * entrada y se reintenta si falló.
 */
export function createNativeGoogle(
  webClientId: string,
  plugin: SocialLoginPlugin = SocialLogin,
  online: () => boolean = () => navigator.onLine,
): NativeGoogle {
  let ready: Promise<void> | null = null;
  const initialize = () => {
    ready ??= plugin.initialize({ google: { webClientId, mode: 'online' } }).catch((e: unknown) => {
      ready = null;
      throw e;
    });
    return ready;
  };

  return async () => {
    if (!online()) return { kind: 'failed', reason: 'network' };
    try {
      await initialize();
      const nonce = await newNonce();
      const { result } = await plugin.login({
        provider: 'google',
        options: { nonce: nonce.hashed },
      });
      if (result.responseType !== 'online' || !result.idToken) {
        return { kind: 'failed', reason: 'error' };
      }
      return { kind: 'ok', idToken: result.idToken, nonce: nonce.raw };
    } catch (e) {
      if (isUserCancel(e)) return { kind: 'cancelled' };
      const text = errorText(e);
      if (/network|timeout|unreachable/i.test(text)) return { kind: 'failed', reason: 'network' };
      return { kind: 'failed', reason: 'error' };
    }
  };
}
