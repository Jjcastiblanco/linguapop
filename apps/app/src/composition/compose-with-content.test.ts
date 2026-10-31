import { describe, expect, it, vi } from 'vitest';
import { seedCourse } from '@linguapop/content';
import { composeWithContent } from '.';
import { CONTENT_CACHE_KEY } from './adapters/cached-content';
import { memoria, nuevoId } from '../test/helpers';

const publicado = (version: number) => {
  const content = JSON.parse(JSON.stringify(seedCourse)) as Record<string, unknown>;
  content.level = `A1-A2 v${version}`;
  return { version, content };
};

describe('arranque con contenido publicado', () => {
  it('sin caché usa la semilla, no espera a la red y deja el snapshot para el próximo arranque', async () => {
    const m = memoria();
    let responder!: (s: ReturnType<typeof publicado>) => void;
    const latest = vi.fn(() => new Promise<ReturnType<typeof publicado>>((r) => (responder = r)));
    const c = await composeWithContent(undefined, {
      storage: m.storage,
      newId: nuevoId,
      contentRemote: { available: () => true, latest },
    });
    expect(c.course).toBe(seedCourse);
    expect(c.contentVersion).toBe(0);
    expect(latest).toHaveBeenCalledWith(1);
    responder(publicado(2));
    await vi.waitFor(() => expect(m.data.has(CONTENT_CACHE_KEY)).toBe(true));

    const siguiente = await composeWithContent(undefined, {
      storage: m.storage,
      contentRemote: { available: () => false, latest: async () => null },
    });
    expect(siguiente.course.level).toBe('A1-A2 v2');
    expect(siguiente.contentVersion).toBe(2);
    expect(await siguiente.content.load()).toBe(siguiente.course);
  });
});
