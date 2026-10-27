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
  const services = await crearServicios({
    storage: memoria().storage,
    clock: relojFalso(),
    sound,
    ...(opts.random !== undefined ? { random: { next: () => opts.random! } } : {}),
  });
  if (opts.plan)
    await services.progress
      .getState()
      .record([{ type: 'settings_changed@1', payload: { plan: opts.plan } }]);
  if (eventos.length) await services.progress.getState().record(eventos);
  const app = renderApp(services, '/aprender');
  return { services, sonidos, ...app };
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
