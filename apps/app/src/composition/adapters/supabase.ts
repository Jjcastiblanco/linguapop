import { createClient } from '@supabase/supabase-js';
import type { Auth, ContentRemote, ProgressRemote } from '@linguapop/domain';
import {
  createSupabaseAuth,
  unavailableAuth,
  type AuthClientLike,
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

/**
 * Los servicios sobre Supabase comparten un solo cliente, para que la sesión de las cuentas sea la
 * misma con la que se envían los eventos. Sin URL y clave anónima, la app queda como invitado.
 */
export function createSupabaseServices({ url, anonKey }: SupabaseConfig): {
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
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return {
    auth: createSupabaseAuth(client.auth as unknown as AuthClientLike, () =>
      client.rpc('delete_my_account'),
    ),
    progressRemote: createSupabaseProgressRemote(client as unknown as EventsClientLike),
    contentRemote: createSupabaseContentRemote(client as unknown as ContentClientLike),
  };
}
