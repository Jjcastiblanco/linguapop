import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createSupabaseLeagueRemote,
  LEAGUE_CHANNEL_PREFIX,
  LEAGUE_EVENT,
  type LeagueClientLike,
} from './supabase-league-remote';

// Contra Supabase local CON el servidor Realtime (el CI no lo arranca): se corre con
// `SUPABASE_TEST_REALTIME=1 pnpm db:test:auth`. Comprueba de extremo a extremo que el aviso llega a
// la cohorte y solo a ella. Sin SUPABASE_TEST_REALTIME se omite.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const enabled = !!url && !!anonKey && process.env.SUPABASE_TEST_REALTIME === '1';

describe.skipIf(!enabled)('liga en tiempo real contra Supabase local con Realtime', () => {
  async function persona() {
    const client = createClient(url!, anonKey!);
    const alta = await client.auth.signUp({
      email: `vivo-${crypto.randomUUID()}@prueba.test`,
      password: 'secreto-123',
    });
    expect(alta.error).toBeNull();
    const liga = createSupabaseLeagueRemote(client as unknown as LeagueClientLike);
    await liga.open();
    const { data } = await client.from('league_standings').select('cohort_id').limit(1);
    return { client, liga, cohorte: (data?.[0] as { cohort_id: string }).cohort_id };
  }
  /** Dos personas en la misma cohorte: la segunda entra a la primera con lugar, salvo que se llene. */
  async function pareja() {
    for (let intento = 0; intento < 5; intento++) {
      const [a, b] = [await persona(), await persona()];
      if (a.cohorte === b.cohorte) return { a, b };
    }
    throw new Error('No se pudo juntar a dos personas en una cohorte');
  }
  const gana = async (client: SupabaseClient, xp: number) => {
    const { error } = await client.from('progress_events').insert({
      id: crypto.randomUUID(),
      type: 'session_completed@1',
      payload: { xp },
      occurred_at: new Date().toISOString(),
      content_version: '0',
    });
    expect(error).toBeNull();
  };
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Escucha un canal privado con un cliente "crudo", contando solo los avisos de difusión. */
  async function escuchar(client: SupabaseClient, cohorte: string) {
    const visto = { avisos: 0, estado: '' };
    await client.realtime.setAuth();
    const canal = client
      .channel(`${LEAGUE_CHANNEL_PREFIX}${cohorte}`, { config: { private: true } })
      .on('broadcast', { event: LEAGUE_EVENT }, () => void visto.avisos++)
      .subscribe((estado) => (visto.estado = estado));
    return { visto, canal };
  }

  it('el XP que gana una persona avisa a su cohorte y no a quien está fuera', async () => {
    const { a, b } = await pareja();
    const fuera = createClient(url!, anonKey!);
    expect(
      (
        await fuera.auth.signUp({
          email: `fuera-${crypto.randomUUID()}@prueba.test`,
          password: 'secreto-123',
        })
      ).error,
    ).toBeNull();

    const miembro = await escuchar(a.client, a.cohorte);
    const intruso = await escuchar(fuera, a.cohorte);
    // El primer canal tras reiniciar Realtime tarda más en suscribirse.
    await vi.waitFor(() => expect(miembro.visto.estado).toBe('SUBSCRIBED'), { timeout: 12_000 });
    await esperar(1000);
    const antes = miembro.visto.avisos;

    await gana(b.client, 10);
    await vi.waitFor(() => expect(miembro.visto.avisos).toBeGreaterThan(antes), { timeout: 8_000 });
    expect(intruso.visto.avisos).toBe(0);
    expect(intruso.visto.estado).not.toBe('SUBSCRIBED');

    await a.client.removeAllChannels();
    await b.client.removeAllChannels();
    await fuera.removeAllChannels();
  }, 40_000);

  it('el adaptador queda suscrito y pide una lectura al hacerlo', async () => {
    const a = await persona();
    const avisos = { n: 0 };
    const parar = a.liga.watch(() => void avisos.n++);
    await vi.waitFor(() => expect(avisos.n).toBeGreaterThanOrEqual(1), { timeout: 12_000 });
    parar();
    await a.client.removeAllChannels();
  }, 30_000);

  it('un miembro no puede difundir avisos al canal de su cohorte', async () => {
    const { a, b } = await pareja();
    const oyente = await escuchar(a.client, a.cohorte);
    const emisor = await escuchar(b.client, b.cohorte);
    await vi.waitFor(() => expect(oyente.visto.estado).toBe('SUBSCRIBED'), { timeout: 12_000 });
    await vi.waitFor(() => expect(emisor.visto.estado).toBe('SUBSCRIBED'), { timeout: 12_000 });
    await esperar(1000);
    const antes = oyente.visto.avisos;
    await emisor.canal.send({ type: 'broadcast', event: LEAGUE_EVENT, payload: { xp: 99999 } });
    await esperar(1500);
    expect(oyente.visto.avisos).toBe(antes);
    await a.client.removeAllChannels();
    await b.client.removeAllChannels();
  }, 40_000);
});
