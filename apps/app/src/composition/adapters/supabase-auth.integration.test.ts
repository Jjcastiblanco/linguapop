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

  it('borrar la cuenta quita al usuario, su perfil y sus eventos sin tocar los de otra cuenta', async () => {
    const correo = nuevoCorreo();
    const auth = crear();
    expect((await auth.signUp(correo, 'secreto-123')).kind).toBe('ok');
    const otra = createClient(url!, anonKey!);
    await otra.auth.signUp({ email: nuevoCorreo(), password: 'secreto-123' });
    const evento = {
      id: crypto.randomUUID(),
      type: 'purchase@1',
      payload: {},
      occurred_at: new Date().toISOString(),
      content_version: '0',
    };
    expect((await otra.from('progress_events').insert(evento)).error).toBeNull();

    // La cuenta que se borra guarda un evento con su propio cliente.
    const propio = createClient(url!, anonKey!);
    await propio.auth.signInWithPassword({ email: correo, password: 'secreto-123' });
    await propio.from('progress_events').insert({ ...evento, id: crypto.randomUUID() });

    expect(await auth.deleteAccount()).toEqual({ kind: 'ok' });
    expect(auth.account()).toBeNull();
    expect(await crear().signIn(correo, 'secreto-123')).toEqual({
      kind: 'failed',
      reason: 'invalid-credentials',
    });
    // El cliente propio conserva un token que aún no venció, pero el usuario ya no existe.
    expect((await propio.from('progress_events').select('id')).data ?? []).toEqual([]);
    expect((await otra.from('progress_events').select('id')).data).toHaveLength(1);
  });

  it('sin sesión no se puede borrar ninguna cuenta', async () => {
    const invitado = createClient(url!, anonKey!);
    const { error } = await invitado.rpc('delete_my_account');
    expect(error).not.toBeNull();
  });
});
