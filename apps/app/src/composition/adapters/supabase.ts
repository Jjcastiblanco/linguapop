import { createClient } from '@supabase/supabase-js';
import type { Auth, ContentRemote, ProgressRemote } from '@linguapop/domain';
import {
  createSupabaseAuth,
  unavailableAuth,
  type AuthClientLike,
  type GoogleOption,
  type NativeGoogleCredential,
  type SupabaseConfig,
} from './supabase-auth';
import {
  createSupabaseContentRemote,
  unavailableContentRemote,
  type ContentClientLike,
} from './supabase-content-remote';
import {
  createSupabaseProgressRemote,
  unavailableRemote,
  type EventsClientLike,
} from './supabase-progress-remote';

/** El selector nativo de Google del APK; el adaptador lo crea `createNativeGoogle`. */
export type NativeGoogle = () => Promise<NativeGoogleCredential>;

/**
 * Los servicios sobre Supabase comparten un solo cliente, para que la sesión de las cuentas sea la
 * misma con la que se envían los eventos. Sin URL y clave anónima, la app queda como invitado.
 */
export function createSupabaseServices(
  { url, anonKey }: SupabaseConfig,
  { google = true, nativeGoogle }: { google?: boolean; nativeGoogle?: NativeGoogle } = {},
): {
  auth: Auth;
  progressRemote: ProgressRemote;
  contentRemote: ContentRemote;
} {
  if (!url || !anonKey) {
    return {
      auth: unavailableAuth,
      progressRemote: unavailableRemote,
      contentRemote: unavailableContentRemote,
    };
  }
  const googleOption: GoogleOption | undefined = nativeGoogle
    ? { native: nativeGoogle }
    : google
      ? { redirectTo: () => `${window.location.origin}/perfil` }
      : undefined;
  const client = createClient(url, anonKey, {
    // Con Google en la web la sesión vuelve en la dirección (flujo PKCE) y el cliente la recoge sola.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: google,
      flowType: google ? 'pkce' : 'implicit',
    },
  });
  return {
    auth: createSupabaseAuth(
      client.auth as unknown as AuthClientLike,
      () => client.rpc('delete_my_account'),
      googleOption,
    ),
    progressRemote: createSupabaseProgressRemote(client as unknown as EventsClientLike),
    contentRemote: createSupabaseContentRemote(client as unknown as ContentClientLike),
  };
}
