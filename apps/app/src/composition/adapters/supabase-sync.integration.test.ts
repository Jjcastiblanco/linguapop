import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { ProgressEvent } from '@linguapop/domain';
import { createSupabaseProgressRemote, type EventsClientLike } from './supabase-progress-remote';

// Contra una base de Supabase real y local: se corre con `pnpm db:test:auth` (y en el CI, job
// database). Sin SUPABASE_TEST_URL y SUPABASE_TEST_ANON_KEY se omite.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

const evento = (extra: { type?: string } = {}): ProgressEvent =>
  ({
    id: crypto.randomUUID(),
    type: 'purchase@1',
    occurredAt: new Date().toISOString(),
    contentVersion: 0,
    payload: { item: 'hearts', costGems: 10 },
    ...extra,
  }) as ProgressEvent;

describe.skipIf(!url || !anonKey)('copia del progreso contra Supabase local', () => {
  async function dispositivo(correo: string) {
    const cliente = createClient(url!, anonKey!);
    const { error } = await cliente.auth.signInWithPassword({
      email: correo,
      password: 'secreto-123',
    });
    if (error) {
      const alta = await cliente.auth.signUp({ email: correo, password: 'secreto-123' });
      expect(alta.error).toBeNull();
    }
    return createSupabaseProgressRemote(cliente as unknown as EventsClientLike);
  }
  const correo = () => `sync-${crypto.randomUUID()}@prueba.test`;

  it('lo que sube un dispositivo lo baja otro con la misma cuenta, sin duplicar', async () => {
    const c = correo();
    const a = await dispositivo(c);
    const b = await dispositivo(c);
    const e = evento();
    expect(await a.push([e])).toEqual({ accepted: [e.id], rejected: [] });
    expect(await a.push([e])).toEqual({ accepted: [e.id], rejected: [] });
    expect(await b.pull()).toEqual([e]);
  });

  it('una cuenta no baja los eventos de otra y un id ajeno no pisa nada', async () => {
    const a = await dispositivo(correo());
    const otra = await dispositivo(correo());
    const e = evento();
    await a.push([e]);
    expect(await otra.pull()).toEqual([]);
  });

  it('un evento que el servidor no admite se rechaza y no estorba a los demás', async () => {
    const a = await dispositivo(correo());
    const bueno = evento();
    const malo = evento({ type: `${'x'.repeat(100)}@1` });
    const out = await a.push([bueno, malo]);
    expect(out).toEqual({ accepted: [bueno.id], rejected: [malo.id] });
    expect(await a.pull()).toEqual([bueno]);
  });
});
