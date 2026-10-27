import { describe, expect, it } from 'vitest';
import { createComposition } from '../composition';
import { createServices } from '../composition/context';
import { memoria, nuevoId, relojFalso } from '../test/helpers';
import type { PendingEvent } from '@linguapop/domain';

const leccion: PendingEvent = {
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: 'u-saludos-l1',
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
  },
};

async function arrancar(
  m = memoria(),
  opts: { timeZone?: string; clock?: ReturnType<typeof relojFalso> } = {},
) {
  const services = createServices(
    createComposition({
      storage: m.storage,
      timeZone: opts.timeZone ?? 'UTC',
      newId: nuevoId,
      ...(opts.clock ? { clock: opts.clock } : {}),
    }),
  );
  await Promise.all([services.ui.getState().load(), services.progress.getState().load()]);
  return services;
}

describe('almacén de progreso', () => {
  it('arranca vacío y listo, sin eventos si la zona horaria ya coincide', async () => {
    const { progress } = await arrancar();
    expect(progress.getState().ready).toBe(true);
    expect(progress.getState().events).toEqual([]);
    expect(progress.getState().progress.xp).toBe(0);
  });

  it('registra la zona horaria del dispositivo una sola vez, también tras recargar', async () => {
    const m = memoria();
    const a = await arrancar(m, { timeZone: 'America/Bogota' });
    expect(a.progress.getState().progress.settings.timeZone).toBe('America/Bogota');
    expect(a.progress.getState().events).toHaveLength(1);
    const b = await arrancar(m, { timeZone: 'America/Bogota' });
    expect(b.progress.getState().events).toHaveLength(1);
    expect(b.progress.getState().progress.settings.timeZone).toBe('America/Bogota');
  });

  it('guarda los eventos con id, instante y versión de contenido, y reconstruye el estado', async () => {
    const m = memoria();
    const reloj = relojFalso();
    const { progress } = await arrancar(m, { clock: reloj });
    await progress.getState().record([leccion]);
    const [evento] = progress.getState().events;
    expect(evento).toMatchObject({
      type: 'session_completed@1',
      contentVersion: 0,
      occurredAt: '2026-10-27T12:00:00.000Z',
    });
    expect(evento!.id).toMatch(/^[0-9a-f-]{36}$/);
    const p = progress.getState().progress;
    expect(p).toMatchObject({ xp: 120, gems: 90 });
    expect(p.lessonsDone['u-saludos']).toBe(1);
    expect(p.streak.streak).toBe(1);
  });

  it('conserva el progreso tras recargar la página', async () => {
    const m = memoria();
    const reloj = relojFalso();
    const a = await arrancar(m, { clock: reloj });
    await a.progress.getState().record([leccion]);
    const b = await arrancar(m, { clock: reloj });
    expect(b.progress.getState().progress).toEqual(a.progress.getState().progress);
    expect(b.progress.getState().progress.xp).toBe(120);
  });

  it('dos eventos en el mismo milisegundo se guardan y pliegan en el orden en que se registraron', async () => {
    const { progress } = await arrancar(memoria(), { clock: relojFalso() });
    await progress.getState().record([
      { type: 'settings_changed@1', payload: { plan: 'free' } },
      {
        type: 'exercise_answered@1',
        payload: { exerciseId: 'u-saludos-e01', correct: false, mode: 'lesson' },
      },
    ]);
    const ms = progress.getState().events.map((e) => Date.parse(e.occurredAt));
    expect(ms[1]! > ms[0]!).toBe(true);
    expect(progress.getState().progress.hearts).toBe(4); // el cambio a plan gratis se aplicó antes del fallo
  });

  it('borrar el progreso lo deja en cero y también tras recargar', async () => {
    const m = memoria();
    const a = await arrancar(m, { clock: relojFalso() });
    await a.progress.getState().record([leccion]);
    await a.progress.getState().reset();
    expect(a.progress.getState().progress.xp).toBe(0);
    const b = await arrancar(m, { clock: relojFalso() });
    expect(b.progress.getState().events).toEqual([]);
  });
});

describe('almacén de preferencias', () => {
  it('empieza con tema automático, sonido y subtítulos activados', async () => {
    const { ui } = await arrancar();
    expect(ui.getState()).toMatchObject({ theme: 'auto', sound: true, subtitles: true });
  });

  it('guarda cada cambio y lo recuerda al recargar', async () => {
    const m = memoria();
    const a = await arrancar(m);
    await a.ui.getState().setTheme('dark');
    await a.ui.getState().setSound(false);
    await a.ui.getState().setSubtitles(false);
    const b = await arrancar(m);
    expect(b.ui.getState()).toMatchObject({ theme: 'dark', sound: false, subtitles: false });
  });

  it('ignora preferencias corruptas o inválidas', async () => {
    const m = memoria();
    m.data.set('linguapop:ui:v1', '{roto');
    expect((await arrancar(m)).ui.getState()).toMatchObject({ theme: 'auto', sound: true });
    m.data.set('linguapop:ui:v1', JSON.stringify({ theme: 'neón', sound: 'sí', subtitles: false }));
    expect((await arrancar(m)).ui.getState()).toMatchObject({
      theme: 'auto',
      sound: true,
      subtitles: false,
    });
  });
});
