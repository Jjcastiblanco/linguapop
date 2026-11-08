import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseLeagueRemote,
  LEAGUE_CHANNEL_PREFIX,
  LEAGUE_EVENT,
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
  const canales: Array<{
    nombre: string;
    opciones: unknown;
    eventos: string[];
    avisar: () => void;
    estado: (s: string) => void;
    suscrito: boolean;
  }> = [];
  const retiros: string[] = [];
  const auth: string[] = [];
  const cliente = {
    rpc,
    realtime: {
      setAuth: vi.fn(async () => {
        auth.push('setAuth');
      }),
    },
    channel: (nombre: string, opciones: unknown) => {
      let callback: () => void = () => undefined;
      const canal = {
        nombre,
        opciones,
        eventos: [] as string[],
        avisar: () => callback(),
        estado: (() => undefined) as (s: string) => void,
        suscrito: false,
        on(_tipo: string, filtro: { event: string }, cb: () => void) {
          canal.eventos.push(filtro.event);
          callback = cb;
          return canal;
        },
        subscribe(onStatus?: (s: string) => void) {
          if (onStatus) canal.estado = onStatus;
          canal.suscrito = true;
          auth.push('subscribe');
          return canal;
        },
      };
      canales.push(canal);
      return canal;
    },
    removeChannel: (canal: { nombre: string }) => {
      retiros.push(canal.nombre);
    },
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
  return { cliente, llamadas, ordenes, canales, retiros, auth };
}

const fila = (n: number, extra: object = {}) => ({
  cohort_id: 'c-1',
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
      'select:league_standings:cohort_id, display_name, weekly_xp, is_bot, is_me, rank',
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
    await expect(unavailableLeagueRemote.refresh()).rejects.toThrow();
    expect(() => unavailableLeagueRemote.watch(() => undefined)()).not.toThrow();
  });

  it('refresh lee la vista sin abrir la liga', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [fila(1, { is_me: true })] });
    const liga = createSupabaseLeagueRemote(cliente);
    expect(await liga.refresh()).toHaveLength(1);
    expect(llamadas).toEqual([
      'select:league_standings:cohort_id, display_name, weekly_xp, is_bot, is_me, rank',
    ]);
  });

  it('escucha el canal privado de la cohorte, con la sesión, y avisa sin datos', async () => {
    const { cliente, canales, auth } = clienteFalso({ filas: [fila(1)] });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    const avisos = vi.fn();
    liga.watch(avisos);
    await vi.waitFor(() => expect(canales[0]!.suscrito).toBe(true));
    expect(canales[0]).toMatchObject({
      nombre: 'league:c-1',
      opciones: { config: { private: true } },
      eventos: ['xp'],
    });
    expect(auth).toEqual(['setAuth', 'subscribe']);
    canales[0]!.avisar();
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(avisos).toHaveBeenCalledWith();
  });

  it('al dejar de escuchar cierra el canal y ya no avisa', async () => {
    const { cliente, canales, retiros } = clienteFalso({ filas: [fila(1)] });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    const avisos = vi.fn();
    const parar = liga.watch(avisos);
    parar();
    canales[0]!.avisar();
    expect(avisos).not.toHaveBeenCalled();
    expect(retiros).toEqual(['league:c-1']);
  });

  it('si se deja de escuchar antes de tener la sesión, no llega a suscribir', async () => {
    const { cliente, canales } = clienteFalso({ filas: [fila(1)] });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    liga.watch(() => undefined)();
    await Promise.resolve();
    await Promise.resolve();
    expect(canales[0]!.suscrito).toBe(false);
  });

  it('sin una lectura previa no hay cohorte que escuchar', () => {
    const { cliente, canales } = clienteFalso({ filas: [] });
    const parar = createSupabaseLeagueRemote(cliente).watch(() => undefined);
    expect(canales).toHaveLength(0);
    expect(() => parar()).not.toThrow();
  });

  it('un fallo al obtener la sesión del canal no rompe nada', async () => {
    const { cliente, canales } = clienteFalso({ filas: [fila(1)] });
    (cliente.realtime.setAuth as unknown) = vi.fn(async () => {
      throw new Error('sin sesión');
    });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    expect(() => liga.watch(() => undefined)).not.toThrow();
    await Promise.resolve();
    expect(canales[0]!.suscrito).toBe(false);
  });

  it('al quedar suscrito (y al reconectar) pide una lectura; un fallo no', async () => {
    const { cliente, canales } = clienteFalso({ filas: [fila(1)] });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    const avisos = vi.fn();
    liga.watch(avisos);
    await vi.waitFor(() => expect(canales[0]!.suscrito).toBe(true));
    canales[0]!.estado('CHANNEL_ERROR');
    canales[0]!.estado('TIMED_OUT');
    expect(avisos).not.toHaveBeenCalled();
    canales[0]!.estado('SUBSCRIBED');
    canales[0]!.estado('SUBSCRIBED');
    expect(avisos).toHaveBeenCalledTimes(2);
  });

  it('tras dejar de escuchar, un estado tardío del canal no avisa', async () => {
    const { cliente, canales } = clienteFalso({ filas: [fila(1)] });
    const liga = createSupabaseLeagueRemote(cliente);
    await liga.open();
    const avisos = vi.fn();
    const parar = liga.watch(avisos);
    await vi.waitFor(() => expect(canales[0]!.suscrito).toBe(true));
    parar();
    canales[0]!.estado('SUBSCRIBED');
    expect(avisos).not.toHaveBeenCalled();
  });

  it('el canal y el evento son los que la migración manda', () => {
    const sql = readFileSync(
      new URL(
        '../../../../../supabase/migrations/20261106000000_liga_en_tiempo_real.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(sql).toContain(`'${LEAGUE_CHANNEL_PREFIX}' || `);
    expect(sql).toContain(`'{}'::jsonb,\n    '${LEAGUE_EVENT}',`);
    expect(sql).toMatch(/realtime\.send\([^;]*true\s*\)/);
  });
});
