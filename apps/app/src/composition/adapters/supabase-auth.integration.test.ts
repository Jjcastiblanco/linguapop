import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createAuthFromConfig } from './supabase-auth';

// Contra una base de Supabase real y local: se corre con `pnpm db:test:auth` (y en el CI, job
// database). Sin SUPABASE_TEST_URL y SUPABASE_TEST_ANON_KEY se omite, para que `pnpm test` no la necesite.
const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

describe.skipIf(!url || !anonKey)('cuentas contra Supabase local', () => {
  const nuevoCorreo = () => `ana-${crypto.randomUUID()}@prueba.test`;
  const crear = () => createAuthFromConfig({ url, anonKey });

  it('crear cuenta, cerrar sesión, iniciar sesión y reconocer los errores', async () => {
    const correo = nuevoCorreo();
    const auth = crear();
    expect(auth.account()).toBeNull();

    const creada = await auth.signUp(correo, 'secreto-123');
    expect(creada.kind).toBe('ok');
    expect(auth.account()?.email).toBe(correo);

    await auth.signOut();
    expect(auth.account()).toBeNull();

    expect(await auth.signIn(correo, 'otra-contraseña')).toEqual({
      kind: 'failed',
      reason: 'invalid-credentials',
    });
    const dentro = await auth.signIn(correo, 'secreto-123');
    expect(dentro.kind).toBe('ok');
    expect(auth.account()?.email).toBe(correo);

    expect(await crear().signUp(correo, 'secreto-123')).toEqual({
      kind: 'failed',
      reason: 'email-taken',
    });
    expect(await crear().signUp(nuevoCorreo(), '123')).toEqual({
      kind: 'failed',
      reason: 'weak-password',
    });
  });

  it('la cuenta nueva tiene su perfil de estudiante y no ve nada de otras cuentas', async () => {
    const cliente = createClient(url!, anonKey!);
    const { data, error } = await cliente.auth.signUp({
      email: nuevoCorreo(),
      password: 'secreto-123',
    });
    expect(error).toBeNull();
    const perfiles = await cliente.from('profiles').select('id, role');
    expect(perfiles.data).toEqual([{ id: data.user!.id, role: 'student' }]);
    const eventos = await cliente.from('progress_events').select('id');
    expect(eventos.data).toEqual([]);
  });

  it('sin sesión no se escriben eventos de progreso', async () => {
    const invitado = createClient(url!, anonKey!);
    const { error } = await invitado.from('progress_events').insert({
      id: crypto.randomUUID(),
      type: 'x@1',
      payload: {},
      occurred_at: new Date().toISOString(),
      content_version: '0',
    });
    expect(error).not.toBeNull();
  });
});
