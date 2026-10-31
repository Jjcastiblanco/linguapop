/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL del proyecto de Supabase; sin ella la app no ofrece cuentas. */
  readonly VITE_SUPABASE_URL?: string;
  /** Clave anónima pública de Supabase (AD-9); nunca la de servicio. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** ID del cliente OAuth web de Google (público); sin él el APK no ofrece Google. Nunca el del cliente Android. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
}
