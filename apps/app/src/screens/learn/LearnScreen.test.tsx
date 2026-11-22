// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PendingEvent, SoundEffect } from '@linguapop/domain';
import { createWebSound } from '../../composition/adapters/web-sound';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const leccion = (unitId: string, n: number, over: Record<string, number> = {}): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId,
    lessonId: `${unitId}-l${n}`,
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
    ...over,
  },
});
const unidad = (unitId: string) => [1, 2, 3].map((n) => leccion(unitId, n));

async function preparar(
  eventos: PendingEvent[] = [],
  opts: { random?: number; plan?: 'free' | 'pro' } = {},
) {
  const sonidos: SoundEffect[] = [];
  const sound = Object.assign(createWebSound({ createContext: () => null }), {
    play: (e: SoundEffect) => void sonidos.push(e),
  });
  const clock = relojFalso();
  const services = await crearServicios({
    storage: memoria().storage,
    clock,
    sound,
    ...(opts.random !== undefined ? { random: { next: () => opts.random! } } : {}),
  });
  if (opts.plan)
    await services.progress
      .getState()
      .record([{ type: 'settings_changed@1', payload: { plan: opts.plan } }]);
  if (eventos.length) await services.progress.getState().record(eventos);
  const app = renderApp(services, '/aprender');
  return { services, sonidos, clock, ...app };
}

const nodo = (id: string) => screen.getByTestId(`node-${id}`);
const estados = (unitId: string) =>
  [1, 2, 3].map((n) => nodo(`${unitId}-l${n}`).getAttribute('data-status'));

afterEach(() => vi.restoreAllMocks());

describe('camino de aprendizaje', () => {
  it('con el progreso vacío solo la primera lección está por hacer y el resto cerrado', async () => {
    await preparar();
    expect(estados('u-saludos')).toEqual(['current', 'locked', 'locked']);
    expect(estados('u-comida')).toEqual(['locked', 'locked', 'locked']);
    expect(nodo('u-saludos-l1')).toBeEnabled();
    expect(nodo('u-saludos-l2')).toBeDisabled();
    expect(nodo('u-comida-l1')).toBeDisabled();
  });

  it('muestra las cinco unidades con su número, nombre y descripción', async () => {
    await preparar();
    const u2 = within(screen.getByTestId('unit-u-comida'));
    expect(u2.getByText('UNIDAD 2')).toBeInTheDocument();
    expect(u2.getByRole('heading', { name: 'Comida' })).toBeInTheDocument();
    expect(u2.getByText('Pedir en un restaurante')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid^="unit-"]')).toHaveLength(5);
  });

  it('completar una lección la marca como hecha y deja la siguiente por hacer', async () => {
    await preparar([leccion('u-saludos', 1)]);
    expect(estados('u-saludos')).toEqual(['done', 'current', 'locked']);
    expect(nodo('u-saludos-l1')).toHaveTextContent('✓');
    expect(nodo('u-saludos-l1')).toHaveAccessibleName('Lección 1, completada');
    expect(nodo('u-saludos-l2')).toHaveAccessibleName('Lección 2');
    expect(nodo('u-saludos-l3')).toHaveAccessibleName('Lección 3, bloqueada');
  });

  it('al completar una unidad se abre la siguiente', async () => {
    await preparar(unidad('u-saludos'));
    expect(estados('u-saludos')).toEqual(['done', 'done', 'done']);
    expect(estados('u-comida')).toEqual(['current', 'locked', 'locked']);
    expect(estados('u-familia')).toEqual(['locked', 'locked', 'locked']);
  });

  it('un nodo abierto lleva a su lección y uno hecho se puede repetir', async () => {
    const primera = await preparar([leccion('u-saludos', 1)]);
    await userEvent.click(nodo('u-saludos-l2'));
    expect(primera.router.state.location.pathname).toBe('/leccion/u-saludos/u-saludos-l2');
    primera.unmount();
    const segunda = await preparar([leccion('u-saludos', 1)]);
    await userEvent.click(nodo('u-saludos-l1'));
    expect(segunda.router.state.location.pathname).toBe('/leccion/u-saludos/u-saludos-l1');
  });

  it('un nodo cerrado no lleva a ninguna parte', async () => {
    const { router } = await preparar();
    await userEvent.click(nodo('u-saludos-l3'));
    expect(router.state.location.pathname).toBe('/aprender');
  });

  it('centra la lección actual al abrir', async () => {
    const visto = vi.fn();
    Element.prototype.scrollIntoView = visto;
    await preparar([leccion('u-saludos', 1)]);
    expect(visto).toHaveBeenCalledTimes(1);
  });

  it('las unidades sin completar ofrecen la prueba de nivel y las completas muestran su marca', async () => {
    const { router } = await preparar(unidad('u-saludos'));
    const u1 = within(screen.getByTestId('unit-u-saludos'));
    expect(u1.getByRole('img', { name: 'Unidad completada' })).toBeInTheDocument();
    expect(u1.queryByRole('link', { name: /Saltar/ })).toBeNull();
    const saltar = within(screen.getByTestId('unit-u-familia')).getByRole('link', {
      name: /Saltar/,
    });
    await userEvent.click(saltar);
    expect(router.state.location.pathname).toBe('/practicar');
    expect(router.state.location.state).toEqual({ placement: 'u-familia' });
  });
});

describe('oferta de la prueba de nivel', () => {
  const oferta = () => screen.queryByTestId('placement-offer');

  it('al empezar, un PRO ve la prueba de la primera unidad y la tarjeta inicia la sesión de prueba', async () => {
    const { router, services } = await preparar([], { plan: 'pro' });
    expect(within(oferta()!).getByText(/Saludos/)).toBeInTheDocument();
    await userEvent.click(within(oferta()!).getByRole('button', { name: /¿Ya sabes esto\?/ }));
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(services.lesson.getState().lesson?.config.mode).toBe('test');
    expect(services.lesson.getState().lesson?.config.unitId).toBe('u-saludos');
    expect(services.ui.getState().placementDismissed).toEqual(['u-saludos']);
  });

  it('al cerrar una unidad ofrece la siguiente', async () => {
    await preparar(unidad('u-saludos'), { plan: 'pro' });
    expect(within(oferta()!).getByText(/Comida/)).toBeInTheDocument();
  });

  it('a mitad de una unidad no ofrece nada', async () => {
    await preparar([leccion('u-saludos', 1)], { plan: 'pro' });
    expect(oferta()).toBeNull();
  });

  it('el plan gratis no la ve', async () => {
    await preparar([], { plan: 'free' });
    expect(oferta()).toBeNull();
  });

  it('«Ahora no» la oculta y no vuelve al recargar', async () => {
    const { services } = await preparar([], { plan: 'pro' });
    await userEvent.click(within(oferta()!).getByRole('button', { name: 'Ahora no' }));
    expect(oferta()).toBeNull();
    expect(services.ui.getState().placementDismissed).toEqual(['u-saludos']);
  });
});

describe('meta diaria', () => {
  it('empieza en 0 de 50 XP', async () => {
    await preparar();
    expect(screen.getByText('Meta diaria: 0/50 XP')).toBeInTheDocument();
  });

  it('suma el XP del día y cambia el icono al cumplirla', async () => {
    const { container } = await preparar([leccion('u-saludos', 1, { correct: 3, wrong: 7 })]);
    expect(screen.getByText('Meta diaria: 30/50 XP')).toBeInTheDocument();
    expect(container.querySelector('section[aria-label^="Meta"] [aria-hidden]')).toHaveTextContent(
      '🎯',
    );
  });

  it('con la meta cumplida muestra el regalo y la barra llena', async () => {
    const { container } = await preparar([leccion('u-saludos', 1)]);
    expect(screen.getByText('Meta diaria: 120/50 XP')).toBeInTheDocument();
    expect(container.querySelector('section[aria-label^="Meta"] [aria-hidden]')).toHaveTextContent(
      '🎁',
    );
    expect(container.querySelector('section[aria-label^="Meta"] i')).toHaveStyle({ width: '100%' });
  });

  it('respeta la meta elegida', async () => {
    await preparar([{ type: 'settings_changed@1', payload: { dailyGoalXp: 100 } }]);
    expect(screen.getByText('Meta diaria: 0/100 XP')).toBeInTheDocument();
  });
});

describe('llamada con Nova', () => {
  it('está bloqueada hasta terminar la primera unidad y lo explica', async () => {
    await preparar([leccion('u-saludos', 1), leccion('u-saludos', 2)]);
    const tarjeta = screen.getByRole('button', { name: /Llamar a Nova/ });
    expect(tarjeta).toBeDisabled();
    expect(tarjeta).toHaveTextContent('Termina la unidad Saludos para desbloquear');
  });

  it('se abre al terminar Saludos y lleva a la llamada', async () => {
    const { router } = await preparar(unidad('u-saludos'));
    const tarjeta = screen.getByRole('button', { name: /Llamar a Nova/ });
    expect(tarjeta).toBeEnabled();
    expect(tarjeta).toHaveTextContent('Videollamada para practicar hablando');
    await userEvent.click(tarjeta);
    expect(router.state.location.pathname).toBe('/llamada');
  });

  it('muestra la insignia PRO en el plan PRO y no en el gratis', async () => {
    await preparar();
    expect(
      within(screen.getByRole('button', { name: /Llamar a Nova/ })).getByText('PRO'),
    ).toBeInTheDocument();
  });
});

describe('plan gratis', () => {
  it('muestra el aviso de anuncios y lo oculta en PRO', async () => {
    const gratis = await preparar([], { plan: 'free' });
    expect(screen.getByText(/Anuncio · Espacio publicitario/)).toBeInTheDocument();
    expect(screen.getByText(/elimina los anuncios y da vidas ilimitadas/)).toBeInTheDocument();
    gratis.unmount();
    await preparar();
    expect(screen.queryByText(/Anuncio · Espacio publicitario/)).toBeNull();
  });
});

describe('cofres', () => {
  it('el cofre está cerrado hasta completar la unidad', async () => {
    await preparar([leccion('u-saludos', 1)]);
    const cofre = screen.getByTestId('chest-u-saludos');
    expect(cofre).toBeDisabled();
    expect(cofre).toHaveAttribute('data-status', 'locked');
    expect(cofre).toHaveAccessibleName('Cofre de Saludos, se abre al completar la unidad');
  });

  it('con la unidad completa queda listo y al abrirlo da el premio una sola vez', async () => {
    const { services, sonidos } = await preparar(unidad('u-saludos'), { random: 0 });
    const antes = services.progress.getState().progress;
    const cofre = screen.getByTestId('chest-u-saludos');
    expect(cofre).toHaveAttribute('data-status', 'ready');
    await userEvent.click(cofre);

    const dialogo = screen.getByRole('dialog', { name: '¡Cofre de Saludos!' });
    expect(within(dialogo).getByText(/\+30 💎/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/\+20 XP/)).toBeInTheDocument();
    expect(sonidos).toContain('win');
    expect(screen.getByTestId('confetti')).toBeInTheDocument();

    const despues = services.progress.getState().progress;
    expect(despues.chestsOpened).toEqual(['u-saludos']);
    expect(despues.gems).toBeGreaterThanOrEqual(antes.gems + 30);
    expect(despues.xp).toBe(antes.xp + 20);

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Genial' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const abierto = screen.getByTestId('chest-u-saludos');
    expect(abierto).toHaveAttribute('data-status', 'opened');
    expect(abierto).toBeDisabled();
    expect(abierto).toHaveTextContent('🎉');
    expect(
      services.progress.getState().events.filter((e) => e.type === 'chest_opened@1'),
    ).toHaveLength(1);
  });

  it('el premio usa el azar de la composición: de 30 a 60 gemas', async () => {
    await preparar(unidad('u-saludos'), { random: 0.999999 });
    await userEvent.click(screen.getByTestId('chest-u-saludos'));
    expect(within(screen.getByRole('dialog')).getByText(/\+60 💎/)).toBeInTheDocument();
  });

  it('el diálogo se cierra con Escape', async () => {
    await preparar(unidad('u-saludos'));
    await userEvent.click(screen.getByTestId('chest-u-saludos'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('repaso de hoy', () => {
  const acierto = (exerciseId: string): PendingEvent => ({
    type: 'exercise_answered@1',
    payload: { exerciseId, correct: true, mode: 'lesson' },
  });

  async function conReloj(plan: 'free' | 'pro' = 'free') {
    const clock = relojFalso();
    const services = await crearServicios({ storage: memoria().storage, clock });
    const store = services.progress.getState();
    await store.record([{ type: 'settings_changed@1', payload: { plan } }]);
    await store.record([acierto('u-saludos-e01'), acierto('u-saludos-e02')]);
    return { clock, services };
  }

  it('sin vencidos la tarjeta dice que estás al día y no inicia sesión', async () => {
    const { services } = await conReloj();
    renderApp(services, '/aprender');
    const tarjeta = screen.getByTestId('daily-review');
    expect(tarjeta).toHaveTextContent('Estás al día');
    expect(tarjeta).toBeDisabled();
  });

  it('con vencidos muestra el contador e inicia la sesión también en el plan gratis', async () => {
    const { clock, services } = await conReloj('free');
    clock.avanzar(2 * 24 * 3600 * 1000);
    const { router } = renderApp(services, '/aprender');
    const tarjeta = screen.getByTestId('daily-review');
    expect(tarjeta).toHaveTextContent('2 por repasar');
    await userEvent.click(tarjeta);
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(services.lesson.getState().lesson?.config.mode).toBe('review');
  });
});

describe('repaso de hoy con lectura', () => {
  it('las preguntas de lectura vencidas de una unidad completa entran al contador y a la sesión', async () => {
    const clock = relojFalso();
    const services = await crearServicios({ storage: memoria().storage, clock });
    await services.progress.getState().record([
      ...unidad('u-saludos'),
      ...['q1', 'q2', 'q3'].map((q): PendingEvent => ({
        type: 'exercise_answered@1',
        payload: { exerciseId: `read-saludos-1-${q}`, correct: true, mode: 'practice' },
      })),
    ]);
    clock.avanzar(2 * 24 * 3600 * 1000);
    const { router } = renderApp(services, '/aprender');
    const tarjeta = screen.getByTestId('daily-review');
    expect(tarjeta).toHaveTextContent('3 por repasar');
    await userEvent.click(tarjeta);
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    const ids = services.lesson.getState().lesson?.config.exercises.map((e) => e.id);
    expect(ids).toEqual(['read-saludos-1-q1', 'read-saludos-1-q2', 'read-saludos-1-q3']);
  });
});

describe('reforzar', () => {
  const fallo = (exerciseId: string): PendingEvent => ({
    type: 'exercise_answered@1',
    payload: { exerciseId, correct: false, mode: 'lesson' },
  });

  it('sin condiciones no hay tarjeta', async () => {
    await preparar();
    expect(screen.queryByTestId('reinforce')).toBeNull();
  });

  it('con 5 errores de escribir muestra la tarjeta, inicia la sesión y desaparece al acertar', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    const exercises = services.composition.course.units[0]!.exercises.filter(
      (e) => (e.type === 'write' || e.type === 'order') && !e.retired,
    );
    const five = exercises.slice(0, 5).map((e) => e.id);
    await services.progress.getState().record(five.map(fallo));
    const { router } = renderApp(services, '/aprender');
    const tarjeta = screen.getByTestId('reinforce');
    expect(tarjeta).toHaveTextContent('Hay frases de escribir que conviene repasar');
    await userEvent.click(tarjeta);
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    const config = services.lesson.getState().lesson?.config;
    expect(config?.mode).toBe('review');
    expect(config?.exercises.map((e) => e.id).sort()).toEqual([...five].sort());

    await act(async () => {
      await services.progress.getState().record(
        five.map((id) => ({
          type: 'exercise_answered@1' as const,
          payload: { exerciseId: id, correct: true, mode: 'review' as const },
        })),
      );
    });
    router.navigate('/aprender');
    await act(async () => {});
    expect(screen.queryByTestId('reinforce')).toBeNull();
  });

  it('con retención baja y algo que reforzar muestra el texto de retención e inicia la sesión', async () => {
    const reloj = relojFalso();
    const services = await crearServicios({ storage: memoria().storage, clock: reloj });
    const ids = services.composition.course.units[0]!.exercises.filter((e) => !e.retired)
      .slice(0, 5)
      .map((e) => e.id);
    const base = reloj.now();
    const DIA = 86_400_000;
    // Cinco ejercicios con repaso a +7 días: dos aciertos y tres fallos dejan la retención en 40 %.
    for (const [dias, aciertos] of [
      [0, [true, true, true, true, true]],
      [1, [true, true, true, true, true]],
      [8, [true, true, false, false, false]],
    ] as const) {
      reloj.set(base + dias * DIA);
      await services.progress.getState().record(
        ids.map((exerciseId, i) => ({
          type: 'exercise_answered@1' as const,
          payload: { exerciseId, correct: aciertos[i]!, mode: 'lesson' as const },
        })),
      );
    }
    const { router } = renderApp(services, '/aprender');
    const tarjeta = screen.getByTestId('reinforce');
    expect(tarjeta).toHaveTextContent('Conviene repasar lo que viste hace unos días');
    await userEvent.click(tarjeta);
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(services.lesson.getState().lesson?.config.mode).toBe('review');
  });
});

describe('racha detenida', () => {
  const pausa = () => screen.queryByTestId('streak-paused');

  it('al detenerse la racha lo dice sin culpa e invita a retomar', async () => {
    const { services, clock } = await preparar([leccion('u-saludos', 1)]);
    expect(pausa()).toBeNull();
    clock.avanzar(5 * 86_400_000);
    await act(async () => {
      await services.progress.getState().load();
    });
    // el reloj cambió: la pantalla se vuelve a pintar al llegar cualquier cambio de progreso
    await act(async () => {
      await services.progress
        .getState()
        .record([{ type: 'settings_changed@1', payload: { dailyGoalXp: 60 } }]);
    });
    expect(pausa()).toHaveTextContent('Tu racha (🔥 1) hizo una pausa');
    expect(pausa()?.textContent).not.toMatch(/perdiste|fallaste|culpa/i);
  });

  it('con un solo día perdido la gracia mantiene la racha y no hay aviso', async () => {
    const { services, clock } = await preparar([leccion('u-saludos', 1)]);
    clock.avanzar(2 * 86_400_000);
    await act(async () => {
      await services.progress
        .getState()
        .record([{ type: 'settings_changed@1', payload: { dailyGoalXp: 60 } }]);
    });
    expect(pausa()).toBeNull();
  });

  it('el aviso nombra la racha y la mejor marca, que pueden ser distintas', async () => {
    const { services, clock } = await preparar([leccion('u-saludos', 1)], { plan: 'free' });
    clock.avanzar(86_400_000);
    await services.progress.getState().record([leccion('u-saludos', 2)]);
    clock.avanzar(86_400_000);
    await services.progress.getState().record([leccion('u-saludos', 3)]); // racha 3, mejor 3
    clock.avanzar(10 * 86_400_000);
    await services.progress.getState().record([leccion('u-comida', 1)]); // racha nueva de 1
    clock.avanzar(5 * 86_400_000);
    await act(async () => {
      await services.progress
        .getState()
        .record([{ type: 'settings_changed@1', payload: { dailyGoalXp: 60 } }]);
    });
    expect(pausa()).toHaveTextContent('Tu racha (🔥 1) hizo una pausa');
    expect(pausa()).toHaveTextContent('tu mejor marca (🔥 3)');
  });

  it('con la gracia gastada, PRO sigue con la racha viva por el protector y el plan gratis ve el aviso', async () => {
    for (const plan of ['pro', 'free'] as const) {
      const { services, clock, unmount } = await preparar([leccion('u-saludos', 1)], { plan });
      clock.avanzar(2 * 86_400_000); // día perdido: gasta la gracia de la semana
      await services.progress.getState().record([leccion('u-saludos', 2)]);
      clock.avanzar(2 * 86_400_000); // otro día perdido en la misma semana
      await act(async () => {
        await services.progress
          .getState()
          .record([{ type: 'settings_changed@1', payload: { dailyGoalXp: 60 } }]);
      });
      if (plan === 'pro') expect(pausa()).toBeNull();
      else expect(pausa()).not.toBeNull();
      unmount();
    }
  });
});
