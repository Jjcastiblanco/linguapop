import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseContentRemote,
  unavailableContentRemote,
  type ContentClientLike,
} from './supabase-content-remote';

function cliente(respuesta: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => respuesta }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as ContentClientLike, from, select, eq };
}

describe('contenido publicado en Supabase', () => {
  it('lee solo el puntero de su versión de esquema', async () => {
    const { client, from, select, eq } = cliente({
      data: { content_snapshots: { version: 4, content: { a: 1 } } },
      error: null,
    });
    expect(await createSupabaseContentRemote(client).latest(1)).toEqual({
      version: 4,
      content: { a: 1 },
    });
    expect(from).toHaveBeenCalledWith('content_latest');
    expect(select).toHaveBeenCalledWith('content_snapshots(version, content)');
    expect(eq).toHaveBeenCalledWith('schema_version', 1);
  });

  it('sin puntero o sin snapshot visible devuelve null; un error lanza', async () => {
    expect(
      await createSupabaseContentRemote(cliente({ data: null, error: null }).client).latest(1),
    ).toBeNull();
    expect(
      await createSupabaseContentRemote(
        cliente({ data: { content_snapshots: null }, error: null }).client,
      ).latest(1),
    ).toBeNull();
    await expect(
      createSupabaseContentRemote(
        cliente({ data: null, error: { message: 'caído' } }).client,
      ).latest(1),
    ).rejects.toThrow('caído');
  });

  it('sin servidor no está disponible', async () => {
    expect(unavailableContentRemote.available()).toBe(false);
    expect(await unavailableContentRemote.latest(1)).toBeNull();
  });
});
