import { describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '@linguapop/domain';
import {
  createSupabaseProgressRemote,
  PAGE_SIZE,
  PULL_OVERLAP_MS,
  unavailableRemote,
  type EventsClientLike,
} from './supabase-progress-remote';

const evento = (n: number): ProgressEvent => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: 'purchase@1',
  occurredAt: new Date(Date.UTC(2026, 9, 28, 12, 0, n)).toISOString(),
  contentVersion: 0,
  payload: { item: 'hearts', costGems: 10 },
});

type Respuesta = { error: { code?: string; message: string } | null; status?: number };

function clienteFalso(opciones: {
  upsert?: (rows: Array<{ id: string }>) => Respuesta;
  filas?: unknown[];
}) {
  const upsert = vi.fn(async (rows: Array<{ id: string }>) =>
    (opciones.upsert ?? (() => ({ error: null, status: 201 })))(rows),
  );
  const consultas: Array<[number, number]> = [];
  const desdes: Array<string | null> = [];
  const columnasPedidas: string[] = [];
  const cliente = {
    from: () => ({
      upsert,
      select: (columnas: string) => {
        columnasPedidas.push(columnas);
        let desde: string | null = null;
        const q = {
          gte: (_columna: string, valor: string) => {
            desde = valor;
            return q;
          },
          order: () => q,
          range: async (from: number, to: number) => {
            consultas.push([from, to]);
            if (from === 0) desdes.push(desde);
            const fuente = (opciones.filas ?? []) as Array<{ received_at: string }>;
            const filtradas =
              desde === null
                ? fuente
                : fuente.filter((r) => Date.parse(r.received_at) >= Date.parse(desde!));
            return { data: filtradas.slice(from, to + 1), error: null };
          },
        };
        return q;
      },
    }),
  } as unknown as EventsClientLike;
  return { cliente, upsert, consultas, desdes, columnasPedidas };
}

const fila = (
  n: number,
  extra: Partial<{ received_at: string; status: 'accepted' | 'rejected'; type: string }> = {},
) => ({
  id: evento(n).id,
  type: 'purchase@1',
  payload: { item: 'hearts', costGems: 10 },
  occurred_at: '2026-10-28T12:00:00+00:00',
  content_version: '3',
  received_at: '2026-11-11T12:00:00.123456+00:00',
  status: 'accepted' as const,
  ...extra,
});

describe('copia del progreso en Supabase', () => {
  it('sin servidor no está disponible y no hace nada', async () => {
    expect(unavailableRemote.available()).toBe(false);
    expect(await unavailableRemote.pull(null)).toEqual({ events: [], rejected: [], cursor: null });
  });

  it('envía los eventos de forma idempotente, con el contenido como texto y sin user_id', async () => {
    const { cliente, upsert } = clienteFalso({});
    const remoto = createSupabaseProgressRemote(cliente);
    const out = await remoto.push([evento(1)]);
    expect(out).toEqual({ accepted: [evento(1).id], rejected: [] });
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: evento(1).id,
          type: 'purchase@1',
          payload: { item: 'hearts', costGems: 10 },
          occurred_at: evento(1).occurredAt,
          content_version: '0',
          source: 'app',
        },
      ],
      { onConflict: 'id', ignoreDuplicates: true },
    );
  });

  it('marca la importación heredada con source = legacy', async () => {
    const { cliente, upsert } = clienteFalso({});
    const importado = {
      ...evento(1),
      type: 'legacy_imported@1',
      payload: {},
    } as unknown as ProgressEvent;
    await createSupabaseProgressRemote(cliente).push([importado, evento(2)]);
    const filas = upsert.mock.calls[0]![0] as unknown as Array<{ source: string }>;
    expect(filas.map((f) => f.source)).toEqual(['legacy', 'app']);
  });

  it('si un lote falla de forma definitiva, aísla el evento malo y acepta el resto', async () => {
    const malo = evento(2).id;
    const { cliente } = clienteFalso({
      upsert: (rows) =>
        rows.some((r) => r.id === malo)
          ? { error: { code: '23514', message: 'check' }, status: 400 }
          : { error: null, status: 201 },
    });
    const out = await createSupabaseProgressRemote(cliente).push([evento(1), evento(2), evento(3)]);
    expect(out.accepted).toEqual([evento(1).id, evento(3).id]);
    expect(out.rejected).toEqual([malo]);
  });

  it.each([
    ['sin red', { error: { message: 'TypeError: Failed to fetch' }, status: 0 }],
    ['sesión vencida', { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }],
    ['servidor caído', { error: { message: 'bad gateway' }, status: 502 }],
  ])('un fallo pasajero (%s) lanza y no rechaza nada', async (_caso, respuesta) => {
    const { cliente } = clienteFalso({ upsert: () => respuesta });
    await expect(createSupabaseProgressRemote(cliente).push([evento(1)])).rejects.toThrow();
  });

  it('trae los eventos con fecha normalizada, por páginas, y descarta los desconocidos', async () => {
    const filas = Array.from({ length: PAGE_SIZE + 1 }, (_v, i) => fila(i + 1));
    filas.push(fila(9999, { type: 'futuro@7' }));
    const { cliente, consultas } = clienteFalso({ filas });
    const { events } = await createSupabaseProgressRemote(cliente).pull(null);
    expect(events).toHaveLength(PAGE_SIZE + 1);
    expect(events[0]).toMatchObject({ occurredAt: '2026-10-28T12:00:00.000Z', contentVersion: 3 });
    expect(consultas).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });

  it('sin cursor pide todo; con cursor pide desde cinco minutos antes', async () => {
    const { cliente, desdes } = clienteFalso({ filas: [fila(1)] });
    const remoto = createSupabaseProgressRemote(cliente);
    await remoto.pull(null);
    await remoto.pull('2026-11-11T12:10:00.000Z');
    expect(desdes).toEqual([null, '2026-11-11T12:05:00.000Z']);
    expect(PULL_OVERLAP_MS).toBe(5 * 60 * 1000);
  });

  it('con cursor no baja lo anterior al solape y el cursor sigue al último recibido', async () => {
    const viejo = fila(1, { received_at: '2026-11-11T11:00:00+00:00' });
    const reciente = fila(2, { received_at: '2026-11-11T12:08:00+00:00' });
    const nuevo = fila(3, { received_at: '2026-11-11T12:20:00.654321+00:00' });
    const { cliente } = clienteFalso({ filas: [viejo, reciente, nuevo] });
    const out = await createSupabaseProgressRemote(cliente).pull('2026-11-11T12:10:00.000Z');
    expect(out.events.map((e) => e.id)).toEqual([reciente.id, nuevo.id]);
    expect(out.cursor).toBe('2026-11-11T12:20:00.654Z');
  });

  it('una pasada sin eventos nuevos deja el mismo cursor y sin cursor devuelve nulo', async () => {
    const { cliente } = clienteFalso({ filas: [] });
    const remoto = createSupabaseProgressRemote(cliente);
    expect((await remoto.pull('2026-11-11T12:10:00.000Z')).cursor).toBe('2026-11-11T12:10:00.000Z');
    expect((await remoto.pull(null)).cursor).toBeNull();
  });

  it('trae en la misma consulta los rechazados y los separa de los aceptados', async () => {
    const filas = [fila(1), fila(5, { status: 'rejected' }), fila(6, { status: 'rejected' })];
    const { cliente, columnasPedidas } = clienteFalso({ filas });
    const out = await createSupabaseProgressRemote(cliente).pull(null);
    expect(out.events.map((e) => e.id)).toEqual([evento(1).id]);
    expect(out.rejected).toEqual([evento(5).id, evento(6).id]);
    expect(columnasPedidas).toHaveLength(1);
    expect(columnasPedidas[0]).toContain('status');
  });

  it('un rechazado o un tipo desconocido también adelantan el cursor', async () => {
    const filas = [
      fila(1, { received_at: '2026-11-11T12:00:00+00:00' }),
      fila(2, { status: 'rejected', received_at: '2026-11-11T12:30:00+00:00' }),
      fila(3, { type: 'futuro@7', received_at: '2026-11-11T12:40:00+00:00' }),
    ];
    const { cliente } = clienteFalso({ filas });
    expect((await createSupabaseProgressRemote(cliente).pull(null)).cursor).toBe(
      '2026-11-11T12:40:00.000Z',
    );
  });

  it('un cursor ilegible se trata como sin cursor', async () => {
    const { cliente, desdes } = clienteFalso({ filas: [fila(1)] });
    await createSupabaseProgressRemote(cliente).pull('no-es-una-fecha');
    expect(desdes).toEqual([null]);
  });

  it('un fallo al pedir los eventos lanza para reintentar en la próxima pasada', async () => {
    const cliente = {
      from: () => ({
        select: () => {
          const q = {
            gte: () => q,
            order: () => q,
            range: async () => ({ data: null, error: { message: 'sin red' } }),
          };
          return q;
        },
      }),
    } as unknown as EventsClientLike;
    await expect(createSupabaseProgressRemote(cliente).pull(null)).rejects.toThrow('sin red');
  });
});
