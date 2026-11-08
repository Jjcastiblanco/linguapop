import type { LeagueRemote, LeagueStanding } from '@linguapop/domain';

/** Fila de `public.league_standings` tal como la entrega el servidor (AD-7, AD-8). */
type StandingRow = {
  cohort_id: string;
  display_name: string;
  weekly_xp: number;
  is_bot: boolean;
  is_me: boolean;
  rank: number;
};

type RemoteError = { message: string };

type StandingsQuery = PromiseLike<{ data: StandingRow[] | null; error: RemoteError | null }> & {
  order(column: 'rank' | 'display_name', options: { ascending: true }): StandingsQuery;
};

/** Canal y evento del aviso: son los de `league_members_notify` en la migración de la liga en vivo. */
export const LEAGUE_CHANNEL_PREFIX = 'league:';
export const LEAGUE_EVENT = 'xp';

/** Un canal de Realtime, lo mínimo que usa el adaptador. */
export type ChannelLike = {
  on(type: 'broadcast', filter: { event: string }, callback: () => void): ChannelLike;
  subscribe(onStatus?: (status: string) => void): unknown;
};

/** Lo que el adaptador usa de supabase-js; las pruebas lo reemplazan por uno falso. */
export type LeagueClientLike = {
  rpc(fn: 'open_league'): PromiseLike<{ error: RemoteError | null }>;
  from(table: 'league_standings'): { select(columns: string): StandingsQuery };
  channel(name: string, options: { config: { private: true } }): ChannelLike;
  removeChannel(channel: ChannelLike): unknown;
  realtime: { setAuth(): PromiseLike<unknown> | void };
};

/** Sin servidor: la pantalla queda con la liga simulada. */
export const unavailableLeagueRemote: LeagueRemote = {
  available: () => false,
  open: async () => {
    throw new Error('Sin servidor de liga');
  },
  refresh: async () => {
    throw new Error('Sin servidor de liga');
  },
  watch: () => () => undefined,
};

const isRow = (r: unknown): r is StandingRow => {
  const row = r as Partial<StandingRow> | null;
  return (
    !!row &&
    typeof row.cohort_id === 'string' &&
    typeof row.display_name === 'string' &&
    typeof row.weekly_xp === 'number' &&
    Number.isInteger(row.weekly_xp) &&
    row.weekly_xp >= 0 &&
    typeof row.is_bot === 'boolean' &&
    typeof row.is_me === 'boolean' &&
    typeof row.rank === 'number' &&
    Number.isInteger(row.rank) &&
    row.rank >= 1
  );
};

/**
 * La liga sobre Supabase. `open_league` asigna la cohorte de la semana en el servidor; la tabla se
 * lee de la vista, que ya trae puestos y filtra por la sesión. El cliente no calcula nada.
 */
export function createSupabaseLeagueRemote(client: LeagueClientLike): LeagueRemote {
  /** Cohorte de la última lectura: es el canal que se escucha. */
  let cohortId: string | null = null;

  async function read(): Promise<LeagueStanding[]> {
    const { data, error } = await client
      .from('league_standings')
      .select('cohort_id, display_name, weekly_xp, is_bot, is_me, rank')
      .order('rank', { ascending: true })
      .order('display_name', { ascending: true });
    if (error) throw new Error(error.message);
    // Una fila con otra forma es un cambio de esquema, no una tabla parcial que se pueda mostrar.
    if (!(data ?? []).every(isRow)) throw new Error('La tabla de la liga tiene filas inválidas');
    cohortId = data?.[0]?.cohort_id ?? null;
    return (data ?? []).map((r): LeagueStanding => ({
      rank: r.rank,
      name: r.display_name,
      xp: r.weekly_xp,
      isBot: r.is_bot,
      isMe: r.is_me,
    }));
  }

  return {
    available: () => true,
    async open() {
      const opened = await client.rpc('open_league');
      if (opened.error) throw new Error(opened.error.message);
      return read();
    },
    refresh: read,
    watch(onChange) {
      if (!cohortId) return () => undefined;
      const channel = client.channel(`${LEAGUE_CHANNEL_PREFIX}${cohortId}`, {
        config: { private: true },
      });
      let active = true;
      channel.on('broadcast', { event: LEAGUE_EVENT }, () => active && onChange());
      // El canal es privado: necesita la sesión actual para que la política lo autorice. Al quedar
      // suscrito (también al reconectar) se pide una lectura: lo que cambió antes de estar
      // escuchando, o mientras el canal estaba caído, no llega como aviso.
      Promise.resolve(client.realtime.setAuth())
        .then(
          () =>
            active &&
            channel.subscribe((status) => {
              if (active && status === 'SUBSCRIBED') onChange();
            }),
        )
        .catch(() => undefined);
      return () => {
        active = false;
        void client.removeChannel(channel);
      };
    },
  };
}
