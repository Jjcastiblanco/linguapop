import { describe, expect, it, vi } from 'vitest';
import type { ProgressEvent } from '@linguapop/domain';
import {
  createSupabaseProgressRemote,
  PAGE_SIZE,
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
  rechazados?: string[];
}) {
  const upsert = vi.fn(async (rows: Array<{ id: string }>) =>
    (opciones.upsert ?? (() => ({ error: null, status: 201 })))(rows),
  );
  const consultas: Array<[number, number]> = [];
  const filtros: string[] = [];
  const cliente = {
    from: () => ({
      upsert,
      select: (columnas: string) => {
        let estado = '';
        const q = {
          eq: (_columna: string, valor: string) => {
            estado = valor;
            filtros.push(`${columnas}:${valor}`);
            return q;
          },
          order: () => q,
          range: async (from: number, to: number) => {
            consultas.push([from, to]);
            const fuente =
              estado === 'rejected'
                ? (opciones.rechazados ?? []).map((id) => ({ id }))
                : (opciones.filas ?? []);
            return { data: fuente.slice(from, to + 1), error: null };
          },
        };
        return q;
      },
    }),
  } as unknown as EventsClientLike;
  return { cliente, upsert, consultas, filtros };
}

describe('copia del progreso en Supabase', () => {
  it('sin servidor no está disponible y no hace nada', async () => {
    expect(unavailableRemote.available()).toBe(false);
    expect(await unavailableRemote.pull()).toEqual([]);
    expect(await unavailableRemote.rejected()).toEqual([]);
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
    const filas = Array.from({ length: PAGE_SIZE + 1 }, (_v, i) => ({
      id: evento(i + 1).id,
      type: 'purchase@1',
      payload: { item: 'hearts', costGems: 10 },
      occurred_at: '2026-10-28T12:00:00+00:00',
      content_version: '3',
    }));
    filas.push({ ...filas[0]!, id: evento(9999).id, type: 'futuro@7' });
    const { cliente, consultas } = clienteFalso({ filas });
    const traidos = await createSupabaseProgressRemote(cliente).pull();
    expect(traidos).toHaveLength(PAGE_SIZE + 1);
    expect(traidos[0]).toMatchObject({ occurredAt: '2026-10-28T12:00:00.000Z', contentVersion: 3 });
    expect(consultas).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });

  it('pide solo los eventos aceptados y trae aparte los ids de los rechazados', async () => {
    const { cliente, filtros } = clienteFalso({ rechazados: [evento(5).id, evento(6).id] });
    const remoto = createSupabaseProgressRemote(cliente);
    expect(await remoto.pull()).toEqual([]);
    expect(await remoto.rejected()).toEqual([evento(5).id, evento(6).id]);
    expect(filtros).toEqual([
      'id, type, payload, occurred_at, content_version:accepted',
      'id:rejected',
    ]);
  });

  it('un fallo al pedir los rechazados lanza para reintentar en la próxima pasada', async () => {
    const cliente = {
      from: () => ({
        select: () => {
          const q = {
            eq: () => q,
            order: () => q,
            range: async () => ({ data: null, error: { message: 'sin red' } }),
          };
          return q;
        },
      }),
    } as unknown as EventsClientLike;
    await expect(createSupabaseProgressRemote(cliente).rejected()).rejects.toThrow('sin red');
  });

  it('trae los ids rechazados por páginas cuando son más que una página', async () => {
    const rechazados = Array.from({ length: PAGE_SIZE + 3 }, (_v, i) => evento(i + 1).id);
    const { cliente, consultas } = clienteFalso({ rechazados });
    expect(await createSupabaseProgressRemote(cliente).rejected()).toEqual(rechazados);
    expect(consultas).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, 2 * PAGE_SIZE - 1],
    ]);
  });
});
