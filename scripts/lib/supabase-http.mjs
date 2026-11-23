// Cliente mínimo de Supabase por HTTP para la herramienta de publicación. Solo usa la clave
// anónima y la sesión de quien publica: lo que puede hacer lo decide su rol en la base (13.8).
export class ApiError extends Error {
  constructor(message, status, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createApi({ url, anonKey, token = null, fetchFn = fetch }) {
  const base = url.replace(/\/$/, '');
  const headers = (extra = {}) => ({
    apikey: anonKey,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });

  async function call(ruta, init = {}) {
    const response = await fetchFn(`${base}${ruta}`, {
      ...init,
      headers: headers({ 'Content-Type': 'application/json', ...init.headers }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(
        body.message ??
          body.msg ??
          body.error_description ??
          body.error ??
          `HTTP ${response.status}`,
        response.status,
        String(body.code ?? body.error_code ?? body.statusCode ?? ''),
      );
    }
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  const api = {
    /** Acceso con correo y contraseña (no sirve si el proyecto exige captcha: usa un token). */
    async signIn(email, password) {
      const session = await call('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      return createApi({ url, anonKey, token: session.access_token, fetchFn });
    },

    rpc: (nombre, args) =>
      call(`/rest/v1/rpc/${nombre}`, { method: 'POST', body: JSON.stringify(args) }),

    /** El rol de la sesión, o null si no hay perfil. */
    async myRole() {
      const filas = await call('/rest/v1/profiles?select=role');
      return filas[0]?.role ?? null;
    },

    /** El contenido publicado vigente de una versión de esquema (o null). */
    async published(schemaVersion) {
      const [latest] = await call(
        `/rest/v1/content_latest?schema_version=eq.${Number(schemaVersion)}&select=snapshot_id`,
      );
      if (!latest) return null;
      const [snapshot] = await call(
        `/rest/v1/content_snapshots?id=eq.${encodeURIComponent(latest.snapshot_id)}&select=version,content`,
      );
      return snapshot ?? null;
    },

    /** El borrador abierto de una versión de esquema (o null); solo lo ven autores y publicadores. */
    async draft(schemaVersion) {
      const [draft] = await call(
        `/rest/v1/content_snapshots?schema_version=eq.${Number(schemaVersion)}&status=eq.draft&select=version,content,updated_at,updated_by`,
      );
      return draft ?? null;
    },

    /** Los nombres de los archivos del bucket de audio. */
    async audioNames() {
      const nombres = new Set();
      for (let offset = 0; ; offset += 1000) {
        const pagina = await call('/storage/v1/object/list/audio', {
          method: 'POST',
          body: JSON.stringify({ prefix: '', limit: 1000, offset }),
        });
        for (const objeto of pagina) nombres.add(objeto.name);
        if (pagina.length < 1000) return nombres;
      }
    },

    /** Sube un clip; si ya existe con ese nombre (es la huella de lo mismo) no es un error. */
    async uploadAudio(clave, bytes) {
      const response = await fetchFn(`${base}/storage/v1/object/audio/${clave}.mp3`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }),
        body: bytes,
      });
      if (response.ok) return 'subido';
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 || body.error === 'Duplicate') return 'existente';
      throw new ApiError(body.message ?? `HTTP ${response.status}`, response.status);
    },

    /** Si el clip se sirve por su dirección pública. */
    async audioPublic(baseUrl, clave) {
      const response = await fetchFn(`${baseUrl}${clave}.mp3`, { method: 'HEAD' });
      const largo = response.headers.get('content-length');
      return (
        response.ok &&
        (response.headers.get('content-type') ?? '').startsWith('audio/') &&
        (largo === null || Number(largo) > 0)
      );
    },

    publicBase: () => `${base}/storage/v1/object/public/audio/`,
  };
  return api;
}
