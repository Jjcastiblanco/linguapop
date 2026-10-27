import { describe, expect, it } from 'vitest';
import { EVENTS_KEY, createLocalProgressSink } from './local-progress-sink';
import { createLocalStore } from './local-store';

const evento = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'purchase@1',
  occurredAt: '2026-10-27T12:00:00.000Z',
  contentVersion: 0,
  payload: { item: 'hearts', costGems: 30 },
  ...extra,
});
const ID1 = '00000000-0000-4000-8000-000000000001';
const ID2 = '00000000-0000-4000-8000-000000000002';

function almacen(fallar = false) {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (k: string) => {
        if (fallar) throw new Error('bloqueado');
        return data.get(k) ?? null;
      },
      setItem: (k: string, v: string) => {
        if (fallar) throw new Error('cuota llena');
        data.set(k, v);
      },
      removeItem: (k: string) => {
        if (fallar) throw new Error('bloqueado');
        data.delete(k);
      },
    },
  };
}

describe('almacenamiento local', () => {
  it('guarda, lee y borra', async () => {
    const a = almacen();
    const store = createLocalStore(a.storage);
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(a.data.get('k')).toBe('v');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
    expect(store.usingMemory()).toBe(false);
  });

  it('si el navegador lo bloquea sigue funcionando en memoria y lo avisa', async () => {
    const store = createLocalStore(almacen(true).storage);
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(store.usingMemory()).toBe(true);
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
  });

  it('sin almacenamiento disponible usa memoria', async () => {
    const store = createLocalStore(null);
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    expect(store.usingMemory()).toBe(true);
  });
});

describe('registro de progreso local', () => {
  it('conserva los eventos tras "recargar" (otro registro sobre el mismo almacén)', async () => {
    const a = almacen();
    const primero = createLocalProgressSink(createLocalStore(a.storage));
    await primero.append(evento(ID1) as never);
    const despues = createLocalProgressSink(createLocalStore(a.storage));
    expect((await despues.readAll()).map((e) => e.id)).toEqual([ID1]);
  });

  it('es idempotente por id', async () => {
    const sink = createLocalProgressSink(createLocalStore(almacen().storage));
    await sink.append(evento(ID1) as never);
    await sink.append(evento(ID1) as never);
    await sink.append(evento(ID2) as never);
    expect((await sink.readAll()).map((e) => e.id)).toEqual([ID1, ID2]);
  });

  it('ignora datos corruptos y eventos de tipos desconocidos sin romper', async () => {
    const a = almacen();
    a.data.set(EVENTS_KEY, '{no es json');
    expect(await createLocalProgressSink(createLocalStore(a.storage)).readAll()).toEqual([]);
    a.data.set(
      EVENTS_KEY,
      JSON.stringify([evento(ID1), evento(ID2, { type: 'level_up@1' }), 'basura', null]),
    );
    const leidos = await createLocalProgressSink(createLocalStore(a.storage)).readAll();
    expect(leidos.map((e) => e.id)).toEqual([ID1]);
    a.data.set(EVENTS_KEY, JSON.stringify({ no: 'una lista' }));
    expect(await createLocalProgressSink(createLocalStore(a.storage)).readAll()).toEqual([]);
  });

  it('borrar elimina todo, también tras recargar', async () => {
    const a = almacen();
    const sink = createLocalProgressSink(createLocalStore(a.storage));
    await sink.append(evento(ID1) as never);
    await sink.clear();
    expect(await sink.readAll()).toEqual([]);
    expect(await createLocalProgressSink(createLocalStore(a.storage)).readAll()).toEqual([]);
  });

  it('con el almacenamiento bloqueado sigue registrando en memoria', async () => {
    const sink = createLocalProgressSink(createLocalStore(almacen(true).storage));
    await sink.append(evento(ID1) as never);
    expect((await sink.readAll()).map((e) => e.id)).toEqual([ID1]);
  });
});
