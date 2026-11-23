import { describe, expect, it, vi } from 'vitest';
import { seedCourse, seedPairs, seedReadings } from '@linguapop/content';
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

describe('lecturas dentro del snapshot', () => {
  const lecturas = () => JSON.parse(JSON.stringify(seedReadings)) as Array<Record<string, any>>;
  const conLecturas = (
    version: number,
    cambio: (l: Array<Record<string, any>>) => void = () => undefined,
  ) =>
    publicado(version, (c) => {
      const l = lecturas();
      cambio(l);
      c.readings = l;
    });

  it('un snapshot con lecturas válidas las trae y las guarda para el próximo arranque', async () => {
    const { content } = montar(() =>
      conLecturas(2, (l) => {
        l[0]!.title = 'Un título cambiado desde la base de datos';
      }),
    );
    expect(await content.refresh()).toBe('updated');
    const local = await content.loadLocal();
    expect(local.readings).toHaveLength(seedReadings.length);
    expect(local.readings![0]!.title).toBe('Un título cambiado desde la base de datos');
  });

  it('sin el campo `readings`, con `null` o sin lecturas válidas, no hay lecturas y el curso sí cambia', async () => {
    for (const cambio of [
      (c: Record<string, any>) => void c,
      (c: Record<string, any>) => void (c.readings = null),
    ]) {
      const { content, m } = montar(() => publicado(2, cambio));
      expect(await content.refresh()).toBe('updated');
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('readings');
      expect(m.data.has(CONTENT_CACHE_KEY)).toBe(true);
    }
  });

  it('una lectura inválida descarta todas las lecturas, se registra con su ubicación y el curso se conserva', async () => {
    const { content, log } = montar(() =>
      conLecturas(2, (l) => {
        l[0]!.lines[0] = 'Hello zebra giraffe okapi';
      }),
    );
    expect(await content.refresh()).toBe('updated');
    const local = await content.loadLocal();
    expect(local.course.level).toBe('A1-A2 v2');
    expect(local).not.toHaveProperty('readings');
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/Lecturas del snapshot 2 descartadas.*read-saludos-1: solo el/),
    );
  });

  it('lecturas que no son una lista, o con un id repetido, se descartan sin perder el snapshot', async () => {
    for (const malas of ['no soy una lista', {}, [...lecturas(), ...lecturas()]]) {
      const { content } = montar(() => publicado(2, (c) => void (c.readings = malas)));
      expect(await content.refresh()).toBe('updated');
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('readings');
    }
  });

  it('lecturas que apuntan a una unidad que el snapshot no tiene se descartan', async () => {
    const { content } = montar(() =>
      conLecturas(2, (l) => {
        l[0]!.unitId = 'u-inventada';
      }),
    );
    await content.refresh();
    expect(await content.loadLocal()).not.toHaveProperty('readings');
  });

  it('las lecturas se validan contra las unidades del propio snapshot, no contra la semilla', async () => {
    const { content } = montar(() =>
      publicado(2, (c) => {
        c.readings = lecturas();
        for (const l of c.units[0].lessons) {
          l.teach = (l.teach ?? []).filter((t: { en: string }) => !/Ana|name/i.test(t.en));
        }
      }),
    );
    await content.refresh();
    expect(await content.loadLocal()).not.toHaveProperty('readings');
  });

  it('una lista vacía en el snapshot es una decisión: no hay lecturas propias, pero tampoco error', async () => {
    const { content } = montar(() => publicado(2, (c) => void (c.readings = [])));
    await content.refresh();
    expect((await content.loadLocal()).readings).toEqual([]);
  });

  it('una caché guardada por una versión anterior, sin lecturas, sigue funcionando', async () => {
    const { content, m } = montar(() => null);
    m.data.set(CONTENT_CACHE_KEY, JSON.stringify({ schemaVersion: 1, ...publicado(4) }));
    const local = await content.loadLocal();
    expect(local.version).toBe(4);
    expect(local).not.toHaveProperty('readings');
  });

  it('una caché con lecturas dañadas conserva el curso en vez de borrarse', async () => {
    const { content, m } = montar(() => null);
    m.data.set(
      CONTENT_CACHE_KEY,
      JSON.stringify({ schemaVersion: 1, ...publicado(4, (c) => void (c.readings = [{ id: 1 }])) }),
    );
    const local = await content.loadLocal();
    expect(local.version).toBe(4);
    expect(local).not.toHaveProperty('readings');
    expect(m.data.has(CONTENT_CACHE_KEY)).toBe(true);
  });
});

describe('pares dentro del snapshot', () => {
  const pares = () => JSON.parse(JSON.stringify(seedPairs)) as Array<Record<string, any>>;
  const conPares = (
    version: number,
    cambio: (p: Array<Record<string, any>>) => void = () => undefined,
  ) =>
    publicado(version, (c) => {
      const p = pares();
      cambio(p);
      c.pairs = p;
    });

  it('un snapshot con pares válidos los trae y los guarda para el próximo arranque', async () => {
    const { content } = montar(() =>
      conPares(2, (p) => {
        p[0]!.a.es = 'Un par cambiado desde la base de datos';
      }),
    );
    expect(await content.refresh()).toBe('updated');
    const local = await content.loadLocal();
    expect(local.pairs).toHaveLength(seedPairs.length);
    expect(local.pairs![0]!.a.es).toBe('Un par cambiado desde la base de datos');
  });

  it('sin el campo `pairs` o con `null` no hay pares y el curso sí cambia', async () => {
    for (const cambio of [
      (c: Record<string, any>) => void c,
      (c: Record<string, any>) => void (c.pairs = null),
    ]) {
      const { content } = montar(() => publicado(2, cambio));
      await content.refresh();
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('pairs');
    }
  });

  it('pares inválidos o con id repetido se descartan todos, se registran y el curso se conserva', async () => {
    for (const malos of ['no soy una lista', {}, [...pares(), ...pares()], [{ id: 1 }]]) {
      const { content, log } = montar(() => publicado(2, (c) => void (c.pairs = malos)));
      expect(await content.refresh()).toBe('updated');
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('pairs');
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/Pares del snapshot 2 descartados/));
    }
  });

  it('pares malos no tiran las lecturas buenas, ni al revés', async () => {
    const { content } = montar(() =>
      publicado(2, (c) => {
        c.pairs = 'mal';
        c.readings = JSON.parse(JSON.stringify(seedReadings));
      }),
    );
    await content.refresh();
    const local = await content.loadLocal();
    expect(local).not.toHaveProperty('pairs');
    expect(local.readings).toHaveLength(seedReadings.length);
  });

  it('una lista vacía en el snapshot es una decisión: sin pares propios, pero sin error', async () => {
    const { content } = montar(() => publicado(2, (c) => void (c.pairs = [])));
    await content.refresh();
    expect((await content.loadLocal()).pairs).toEqual([]);
  });
});

describe('audio remoto dentro del snapshot', () => {
  const audio = {
    baseUrl: 'https://proyecto.supabase.co/storage/v1/object/public/audio/',
    keys: ['0123456789abcd'],
  };

  it('un snapshot con audio válido lo trae y lo guarda para el próximo arranque', async () => {
    const { content } = montar(() => publicado(2, (c) => void (c.audio = audio)));
    await content.refresh();
    expect((await content.loadLocal()).audio).toEqual(audio);
  });

  it('sin el campo o con null no hay audio y el curso sí cambia', async () => {
    for (const cambio of [
      (c: Record<string, any>) => void c,
      (c: Record<string, any>) => void (c.audio = null),
    ]) {
      const { content } = montar(() => publicado(2, cambio));
      await content.refresh();
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('audio');
    }
  });

  it('un audio inválido se descarta entero con su motivo, sin tocar curso, lecturas ni pares', async () => {
    for (const malo of [
      { ...audio, baseUrl: 'http://inseguro.test/audio/' },
      { ...audio, keys: ['../x'] },
      'no',
      [],
    ]) {
      const { content, log } = montar(() =>
        publicado(2, (c) => {
          c.audio = malo;
          c.pairs = JSON.parse(JSON.stringify(seedPairs));
        }),
      );
      await content.refresh();
      const local = await content.loadLocal();
      expect(local.course.level).toBe('A1-A2 v2');
      expect(local).not.toHaveProperty('audio');
      expect(local.pairs).toHaveLength(seedPairs.length);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/Audio del snapshot 2 descartado/));
    }
  });
});
