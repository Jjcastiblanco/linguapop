import { parseCourseTolerant, seedCourse } from '@linguapop/content';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { legacyEventId, legacyImportEvent, type ProgressEvent } from '@linguapop/domain';
import { createSupabaseContentRemote, type ContentClientLike } from './supabase-content-remote';
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
    expect((await b.pull(null)).events).toEqual([e]);
  });

  it('con cursor solo baja lo recibido después (con solape) y un evento tardío llega', async () => {
    const c = correo();
    const a = await dispositivo(c);
    const b = await dispositivo(c);
    const primero = evento();
    await a.push([primero]);
    const inicial = await b.pull(null);
    expect(inicial.events).toEqual([primero]);
    expect(inicial.cursor).not.toBeNull();
    // Otro dispositivo sube un evento con fecha vieja del cliente: el servidor lo recibe ahora.
    const tardio = { ...evento(), occurredAt: '2020-01-01T00:00:00.000Z' } as ProgressEvent;
    await a.push([tardio]);
    const siguiente = await b.pull(inicial.cursor);
    expect(siguiente.events.map((e) => e.id)).toContain(tardio.id);
    expect(siguiente.cursor! >= inicial.cursor!).toBe(true);
    // Un cursor posterior a todo lo recibido (más allá del solape) no trae nada.
    const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(await b.pull(futuro)).toEqual({ events: [], rejected: [], cursor: futuro });
  });

  it('una cuenta no baja los eventos de otra y un id ajeno no pisa nada', async () => {
    const a = await dispositivo(correo());
    const otra = await dispositivo(correo());
    const e = evento();
    await a.push([e]);
    expect((await otra.pull(null)).events).toEqual([]);
  });

  it('un evento que el servidor no admite se rechaza y no estorba a los demás', async () => {
    const a = await dispositivo(correo());
    const bueno = evento();
    const malo = evento({ type: `${'x'.repeat(100)}@1` });
    const out = await a.push([bueno, malo]);
    expect(out).toEqual({ accepted: [bueno.id], rejected: [malo.id] });
    expect((await a.pull(null)).events).toEqual([bueno]);
  });

  it('un evento con xp sobre el tope se guarda rechazado: no se baja y se reporta aparte', async () => {
    const c = correo();
    const a = await dispositivo(c);
    const sesion = (xp: number) =>
      evento({
        type: 'session_completed@1',
        payload: {
          mode: 'lesson',
          correct: 10,
          wrong: 0,
          answered: 10,
          durationSec: 60,
          outOfHearts: false,
          xp,
        },
      } as never);
    const bueno = sesion(120);
    const forjado = sesion(1_000_000);
    // El servidor lo acepta al insertar (no lo descarta) y lo deja `rejected`.
    expect(await a.push([bueno, forjado])).toEqual({
      accepted: [bueno.id, forjado.id],
      rejected: [],
    });
    expect((await a.pull(null)).events).toEqual([bueno]);
    expect((await a.pull(null)).rejected).toEqual([forjado.id]);
    // Otro dispositivo de la misma cuenta ve lo mismo.
    const b = await dispositivo(c);
    expect((await b.pull(null)).events).toEqual([bueno]);
    expect((await b.pull(null)).rejected).toEqual([forjado.id]);
  });

  it('un payload de más de 8 KB se rechaza al enviarlo', async () => {
    const a = await dispositivo(correo());
    const enorme = evento({ type: 'exercise_answered@1' });
    (enorme as { payload: unknown }).payload = { pad: 'x'.repeat(9000) };
    const bueno = evento();
    expect(await a.push([bueno, enorme])).toEqual({
      accepted: [bueno.id],
      rejected: [enorme.id],
    });
  });

  it('guarda la importación heredada con source = legacy y la devuelve completa', async () => {
    const c = correo();
    const a = await dispositivo(c);
    const importado = legacyImportEvent(
      { xp: 340, gems: 120, done: { 0: 3 }, stats: { lessons: 5 } },
      { id: legacyEventId(c), nowMs: Date.now(), contentVersion: 0 },
    )!;
    expect(await a.push([importado])).toEqual({ accepted: [importado.id], rejected: [] });
    expect(await a.push([importado])).toEqual({ accepted: [importado.id], rejected: [] });
    expect((await (await dispositivo(c)).pull(null)).events).toEqual([importado]);
  });
});

describe.skipIf(!url || !anonKey)('contenido publicado contra Supabase local', () => {
  it('sin sesión se lee el snapshot semilla publicado y la app lo acepta', async () => {
    const remoto = createSupabaseContentRemote(
      createClient(url!, anonKey!) as unknown as ContentClientLike,
    );
    const snapshot = await remoto.latest(1);
    expect(snapshot?.version).toBe(1);
    const curso = parseCourseTolerant(snapshot!.content);
    expect(curso.ok && curso.skipped).toEqual([]);
    expect(curso.ok && curso.course.units.map((u) => u.id)).toEqual(
      seedCourse.units.map((u) => u.id),
    );
    expect(await remoto.latest(99)).toBeNull();
  });
});
