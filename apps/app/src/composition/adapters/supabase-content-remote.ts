import type { ContentRemote } from '@linguapop/domain';

type Row = { content_snapshots: { version: number; content?: unknown } | null };

/** Lo que el adaptador usa de supabase-js; las pruebas lo reemplazan por uno falso. */
export type ContentClientLike = {
  from(table: 'content_latest'): {
    select(columns: string): {
      eq(
        column: 'schema_version',
        value: number,
      ): {
        maybeSingle(): PromiseLike<{ data: Row | null; error: { message: string } | null }>;
      };
    };
  };
};

/** Sin servidor: la app usa solo su caché y la semilla. */
export const unavailableContentRemote: ContentRemote = {
  available: () => false,
  latest: async () => null,
};

/** Lee el puntero `latest` de la versión de esquema y el snapshot publicado al que apunta (AD-5). */
export function createSupabaseContentRemote(client: ContentClientLike): ContentRemote {
  return {
    available: () => true,
    // Solo la versión: unos pocos bytes en vez del curso completo (~80 KB) en cada arranque.
    async latestVersion(schemaVersion) {
      const { data, error } = await client
        .from('content_latest')
        .select('content_snapshots(version)')
        .eq('schema_version', schemaVersion)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.content_snapshots?.version ?? null;
    },
    async latest(schemaVersion) {
      const { data, error } = await client
        .from('content_latest')
        .select('content_snapshots(version, content)')
        .eq('schema_version', schemaVersion)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const snapshot = data?.content_snapshots;
      return snapshot?.content !== undefined
        ? { version: snapshot.version, content: snapshot.content }
        : null;
    },
  };
}
