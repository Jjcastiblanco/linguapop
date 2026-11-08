import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseLeagueRemote,
  unavailableLeagueRemote,
  type LeagueClientLike,
} from './supabase-league-remote';

function clienteFalso(opciones: {
  rpc?: { message: string } | null;
  filas?: unknown[] | null;
  lectura?: { message: string } | null;
}) {
  const llamadas: string[] = [];
  const ordenes: string[] = [];
  const rpc = vi.fn(async (fn: string) => {
    llamadas.push(`rpc:${fn}`);
    return { error: opciones.rpc ?? null };
  });
  const cliente = {
    rpc,
    from: (tabla: string) => ({
      select: (columnas: string) => {
        llamadas.push(`select:${tabla}:${columnas}`);
        const q = {
          order: (columna: string) => {
            ordenes.push(columna);
            return q;
          },
          then: (ok: (v: unknown) => unknown) =>
            Promise.resolve({
              data: opciones.filas === undefined ? [] : opciones.filas,
              error: opciones.lectura ?? null,
            }).then(ok),
        };
        return q;
      },
    }),
  } as unknown as LeagueClientLike;
  return { cliente, llamadas, ordenes };
}

const fila = (n: number, extra: object = {}) => ({
  display_name: `Persona ${n}`,
  weekly_xp: 100 - n,
  is_bot: false,
  is_me: false,
  rank: n,
  ...extra,
});

describe('liga sobre Supabase', () => {
  it('abre la liga y luego lee la vista, por puesto', async () => {
    const { cliente, llamadas, ordenes } = clienteFalso({
      filas: [fila(1, { is_bot: true }), fila(2, { is_me: true })],
    });
    const liga = createSupabaseLeagueRemote(cliente);
    expect(liga.available()).toBe(true);
    expect(await liga.open()).toEqual([
      { rank: 1, name: 'Persona 1', xp: 99, isBot: true, isMe: false },
      { rank: 2, name: 'Persona 2', xp: 98, isBot: false, isMe: true },
    ]);
    expect(llamadas).toEqual([
      'rpc:open_league',
      'select:league_standings:display_name, weekly_xp, is_bot, is_me, rank',
    ]);
    expect(ordenes).toEqual(['rank', 'display_name']);
  });

  it('conserva el nombre tal cual, aunque parezca markup o el de un bot', async () => {
    const { cliente } = clienteFalso({ filas: [fila(1, { display_name: '<b>Robi</b>' })] });
    expect((await createSupabaseLeagueRemote(cliente).open())[0]).toMatchObject({
      name: '<b>Robi</b>',
      isBot: false,
    });
  });

  it.each([
    ['una fila incompleta', { rank: 2 }],
    ['una fila nula', null],
    ['un puesto en texto', fila(3, { rank: '3' })],
    ['un puesto cero', fila(0)],
    ['un puesto decimal', fila(2, { rank: 2.5 })],
    ['un XP que no es número', fila(2, { weekly_xp: Number.NaN })],
    ['un XP negativo', fila(2, { weekly_xp: -1 })],
  ])('si llega %s, lanza en vez de mostrar una tabla parcial', async (_caso, mala) => {
    const { cliente } = clienteFalso({ filas: [fila(1), mala] });
    await expect(createSupabaseLeagueRemote(cliente).open()).rejects.toThrow(/inválidas/);
  });

  it('sin filas devuelve una tabla vacía', async () => {
    const { cliente } = clienteFalso({ filas: null });
    expect(await createSupabaseLeagueRemote(cliente).open()).toEqual([]);
  });

  it('si abrir la liga falla, lanza y no lee la vista', async () => {
    const { cliente, llamadas } = clienteFalso({ rpc: { message: 'sin sesión' } });
    await expect(createSupabaseLeagueRemote(cliente).open()).rejects.toThrow('sin sesión');
    expect(llamadas).toEqual(['rpc:open_league']);
  });

  it('si la lectura falla, lanza', async () => {
    const { cliente } = clienteFalso({ lectura: { message: 'caído' } });
    await expect(createSupabaseLeagueRemote(cliente).open()).rejects.toThrow('caído');
  });

  it('sin servidor no está disponible y no abre', async () => {
    expect(unavailableLeagueRemote.available()).toBe(false);
    await expect(unavailableLeagueRemote.open()).rejects.toThrow();
  });
});
