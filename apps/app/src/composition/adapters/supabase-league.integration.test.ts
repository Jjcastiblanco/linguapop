import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseLeagueRemote, type LeagueClientLike } from './supabase-league-remote';

// Contra una base de Supabase real y local: se corre con `pnpm db:test:auth` (y en el CI, job
// database). Sin SUPABASE_TEST_URL y SUPABASE_TEST_ANON_KEY se omite.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

describe.skipIf(!url || !anonKey)('liga contra Supabase local', () => {
  async function persona() {
    const cliente = createClient(url!, anonKey!);
    const alta = await cliente.auth.signUp({
      email: `liga-${crypto.randomUUID()}@prueba.test`,
      password: 'secreto-123',
    });
    expect(alta.error).toBeNull();
    return createSupabaseLeagueRemote(cliente as unknown as LeagueClientLike);
  }

  it('abrir la liga mete a la persona en una cohorte con bots marcados, una sola vez', async () => {
    const liga = await persona();
    const tabla = await liga.open();
    expect(tabla).toHaveLength(30);
    expect(tabla.filter((f) => f.isMe)).toHaveLength(1);
    // Otras corridas dejan personas en la misma cohorte: cada una ocupa el lugar de un bot.
    const personas = tabla.filter((f) => !f.isBot).length;
    expect(tabla.filter((f) => f.isBot)).toHaveLength(30 - personas);
    expect(personas).toBeGreaterThanOrEqual(1);
    const otra = await liga.open();
    expect(otra).toHaveLength(30);
    expect(otra.filter((f) => f.isMe)).toHaveLength(1);
  });

  it('sin sesión no se abre la liga', async () => {
    const cliente = createClient(url!, anonKey!);
    const liga = createSupabaseLeagueRemote(cliente as unknown as LeagueClientLike);
    await expect(liga.open()).rejects.toThrow();
  });
});
