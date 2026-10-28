// @vitest-environment jsdom
import type { PendingEvent, Speech } from '@linguapop/domain';
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS } from './toast-store';
import { crearServicios, memoria, relojFalso, renderApp } from '../test/helpers';

const DIA = 86_400_000;
const leccion = (n: number, correct = 10, wrong = 0): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: `u-saludos-l${n}`,
    correct,
    wrong,
    answered: correct + wrong,
    durationSec: 60,
    outOfHearts: false,
  },
});

async function preparar(opts: { storage?: ReturnType<typeof memoria>['storage'] } = {}) {
  const clock = relojFalso();
  const services = await crearServicios({ storage: opts.storage ?? memoria().storage, clock });
  const avisos = () => services.toast.getState().toasts.map((t) => t.text);
  return { services, clock, avisos };
}

afterEach(() => vi.useRealTimers());

describe('avisos que nacen del progreso', () => {
  it('avisa una sola vez al cruzar la meta diaria', async () => {
    const { services, avisos } = await preparar();
    await services.progress.getState().record([leccion(1, 4, 1)]); // 40 XP: aún no
    expect(avisos().filter((a) => a.includes('Meta diaria cumplida'))).toEqual([]);
    await services.progress.getState().record([leccion(2, 2, 1)]); // 60 XP: cruza 50
    expect(avisos().filter((a) => a.includes('Meta diaria cumplida'))).toEqual([
      '🎯 ¡Meta diaria cumplida! +10 💎',
    ]);
    await services.progress.getState().record([leccion(3, 2, 1)]);
    expect(avisos().filter((a) => a.includes('Meta diaria cumplida'))).toHaveLength(1);
  });

  it('bajar la meta en Ajustes no cuenta como cumplirla', async () => {
    const { services, avisos } = await preparar();
    await services.progress.getState().record([leccion(1, 4, 1)]); // 40 XP con meta 50
    await services.progress
      .getState()
      .record([{ type: 'settings_changed@1', payload: { dailyGoalXp: 20 } }]);
    expect(avisos().filter((a) => a.includes('Meta diaria cumplida'))).toEqual([]);
  });

  it('avisa de cada logro desbloqueado con su icono, nombre y gemas', async () => {
    const { services, avisos } = await preparar();
    await services.progress.getState().record([leccion(1)]);
    expect(avisos()).toContain('🎯 Logro: Primer paso (+5 💎)');
    const antes = avisos().length;
    await services.progress.getState().record([leccion(1)]);
    expect(avisos().filter((a) => a.includes('Primer paso'))).toHaveLength(1);
    expect(avisos().length).toBeGreaterThanOrEqual(antes);
  });

  it('avisa cuando el protector salva la racha, pero no al comprar uno', async () => {
    const { services, clock, avisos } = await preparar();
    await services.progress.getState().record([leccion(1)]);
    clock.avanzar(2 * DIA); // falta un día: el protector del mes se usa
    await services.progress.getState().record([leccion(2)]);
    expect(avisos()).toContain('🛡️ Protector de racha usado: tu racha sigue viva');
    expect(services.progress.getState().progress.streak.shieldMonth).not.toBe('');

    const antes = avisos().length;
    await services.progress
      .getState()
      .record([{ type: 'purchase@1', payload: { item: 'streak_shield', costGems: 60 } }]);
    expect(services.progress.getState().progress.streak.shieldMonth).toBe('');
    expect(avisos()).toHaveLength(antes);
  });

  it('cargar, importar y borrar el progreso nunca avisan', async () => {
    const storage = memoria().storage;
    const origen = await preparar({ storage });
    await origen.services.progress.getState().record([leccion(1), leccion(2), leccion(3)]);
    const eventos = origen.services.progress.getState().events;

    const recargada = await preparar({ storage }); // carga al arrancar
    expect(recargada.avisos()).toEqual([]);

    const vacia = await preparar();
    await vacia.services.progress.getState().importEvents(eventos);
    expect(vacia.services.progress.getState().progress.xp).toBeGreaterThan(0);
    expect(vacia.avisos()).toEqual([]);

    await vacia.services.progress.getState().reset();
    expect(vacia.avisos()).toEqual([]);
  });
});

describe('avisos del dispositivo', () => {
  it('avisa cuando la app termina de instalarse', async () => {
    let instalada: () => void = () => undefined;
    const services = await crearServicios({
      storage: memoria().storage,
      install: {
        available: () => false,
        subscribe: () => () => undefined,
        prompt: async () => 'unavailable',
        onInstalled: (fn) => ((instalada = fn), () => undefined),
      },
    });
    instalada();
    expect(services.toast.getState().toasts.map((t) => t.text)).toEqual(['✅ LinguaPop instalada']);
  });

  it('avisa una sola vez de que el navegador no puede hablar', async () => {
    const mudo: Speech = {
      capabilities: () => ({ canSpeak: false, canListen: false }),
      speak: async () => false,
      listen: async () => ({ kind: 'unavailable', reason: 'unsupported' }),
      cancel: () => undefined,
    };
    const services = await crearServicios({ storage: memoria().storage, speech: mudo });
    const ejercicios = services.composition.course.units[0]!.exercises.slice(0, 1);
    const config = { mode: 'lesson', exercises: ejercicios, plan: 'pro', hearts: 5 } as const;
    services.lesson.getState().start(config);
    services.lesson.getState().clear();
    services.lesson.getState().start(config);
    expect(services.toast.getState().toasts.map((t) => t.text)).toEqual([
      '🔇 Este navegador no puede reproducir voz.',
    ]);
  });

  it('con voz no avisa', async () => {
    const hablador: Speech = {
      capabilities: () => ({ canSpeak: true, canListen: false }),
      speak: async () => true,
      listen: async () => ({ kind: 'unavailable', reason: 'unsupported' }),
      cancel: () => undefined,
    };
    const services = await crearServicios({ storage: memoria().storage, speech: hablador });
    const ejercicios = services.composition.course.units[0]!.exercises.slice(0, 1);
    services.lesson
      .getState()
      .start({ mode: 'lesson', exercises: ejercicios, plan: 'pro', hearts: 5 });
    expect(services.toast.getState().toasts).toEqual([]);
  });
});

describe('Toaster', () => {
  it('muestra el aviso sobre la pantalla y lo quita solo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { services } = await preparar();
    renderApp(services, '/aprender');
    act(() => services.toast.getState().show('Hola aviso'));
    expect(screen.getByText('Hola aviso')).toBeInTheDocument();
    expect(screen.getByTestId('toaster')).toHaveAttribute('aria-live', 'polite');
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(screen.queryByText('Hola aviso')).not.toBeInTheDocument();
  });
});
