import { describe, expect, it, vi } from 'vitest';
import { seedCourse } from '@linguapop/content';
import type { ContentRemote, ContentSnapshot } from '@linguapop/domain';
import { createCachedContent, CONTENT_CACHE_KEY } from './cached-content';
import { createLocalStore } from './local-store';
import { memoria } from '../../test/helpers';

const clonar = () => JSON.parse(JSON.stringify(seedCourse)) as Record<string, any>;
/** Una semilla distinguible: el curso con otro nivel. */
const publicado = (version: number, cambio: (c: Record<string, any>) => void = () => undefined) => {
  const content = clonar();
  content.level = `A1-A2 v${version}`;
  cambio(content);
  return { version, content } satisfies ContentSnapshot;
};

function montar(remoto: () => Promise<ContentSnapshot | null> | ContentSnapshot | null) {
  const m = memoria();
  const store = createLocalStore(m.storage);
  const remote: ContentRemote = {
    available: () => true,
    latest: async () => remoto(),
  };
  const log = vi.fn();
  const content = createCachedContent({ store, remote, seed: seedCourse, schemaVersion: 1, log });
  return { m, store, content, log, remote };
}

describe('contenido remoto con caché', () => {
  it('sin caché arranca con la semilla (versión 0) sin tocar la red', async () => {
    const latest = vi.fn();
    const { content } = montar(latest);
    expect(await content.loadLocal()).toEqual({ course: seedCourse, version: 0 });
    expect(latest).not.toHaveBeenCalled();
  });

  it('con el snapshot publicado, se guarda y el próximo arranque lo muestra', async () => {
    const { content, m } = montar(() => publicado(3));
    expect(await content.refresh()).toBe('updated');
    expect(m.data.has(CONTENT_CACHE_KEY)).toBe(true);
    const local = await content.loadLocal();
    expect(local.version).toBe(3);
    expect(local.course.level).toBe('A1-A2 v3');
  });

  it('el mismo snapshot o uno más viejo no cambia nada', async () => {
    let publicadoAhora = publicado(3);
    const { content } = montar(() => publicadoAhora);
    await content.refresh();
    expect(await content.refresh()).toBe('unchanged');
    publicadoAhora = publicado(2);
    expect(await content.refresh()).toBe('unchanged');
    expect((await content.loadLocal()).version).toBe(3);
  });

  it('sin red usa la caché y, sin caché, la semilla', async () => {
    const { content, m } = montar(() => Promise.reject(new Error('sin red')));
    expect(await content.refresh()).toBe('offline');
    expect((await content.loadLocal()).course).toBe(seedCourse);
    m.data.set(CONTENT_CACHE_KEY, JSON.stringify({ schemaVersion: 1, ...publicado(4) }));
    expect(await content.refresh()).toBe('offline');
    expect((await content.loadLocal()).version).toBe(4);
  });

  it('un snapshot inválido se descarta y se conserva el anterior', async () => {
    let siguiente: ContentSnapshot = publicado(2);
    const { content, log } = montar(() => siguiente);
    await content.refresh();
    siguiente = publicado(3, (c) => (c.units[0].exercises[0].prompt = ''));
    expect(await content.refresh()).toBe('invalid');
    expect((await content.loadLocal()).version).toBe(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Snapshot 3 descartado'));
  });

  it('un ejercicio desconocido se omite y se registra sin descartar el snapshot', async () => {
    const { content, log } = montar(() =>
      publicado(2, (c) => {
        const u = c.units[0];
        u.exercises.push({ id: `${u.id}-futuro`, type: 'hologram' });
        u.lessons[0].exerciseIds.push(`${u.id}-futuro`);
      }),
    );
    expect(await content.refresh()).toBe('updated');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('hologram'));
    const local = await content.loadLocal();
    expect(local.version).toBe(2);
    expect(local.course.units[0]!.exercises.some((e) => e.type === ('hologram' as never))).toBe(
      false,
    );
  });

  it('una caché corrupta o de otro esquema se ignora y se borra', async () => {
    const { content, m } = montar(() => null);
    for (const malo of ['{no es json', JSON.stringify({ schemaVersion: 2, ...publicado(9) })]) {
      m.data.set(CONTENT_CACHE_KEY, malo);
      expect((await content.loadLocal()).version).toBe(0);
      expect(m.data.has(CONTENT_CACHE_KEY)).toBe(false);
    }
  });

  it('sin servidor o sin nada publicado no hace nada', async () => {
    const { content } = montar(() => null);
    expect(await content.refresh()).toBe('unchanged');
    const sinServidor = createCachedContent({
      store: createLocalStore(memoria().storage),
      remote: { available: () => false, latest: async () => null },
      seed: seedCourse,
      schemaVersion: 1,
    });
    expect(await sinServidor.refresh()).toBe('skipped');
  });
});
