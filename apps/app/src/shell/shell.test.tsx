// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../test/helpers';
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

const barra = () => ({
  racha: screen.getByTestId('streak').textContent,
  gemas: screen.getByTestId('gems').textContent,
  vidas: screen.getByTestId('hearts').textContent,
});

describe('barra superior', () => {
  it('muestra la marca, la insignia PRO, racha, gemas y vidas ilimitadas del estado inicial', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    renderApp(services);
    expect(screen.getByText('LinguaPop')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('PRO')).toBeInTheDocument();
    expect(barra()).toEqual({ racha: '0', gemas: '50', vidas: '∞' });
  });

  it('en el plan gratis muestra el número de vidas y quita la insignia', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    await services.progress
      .getState()
      .record([{ type: 'settings_changed@1', payload: { plan: 'free' } }]);
    renderApp(services);
    expect(within(screen.getByRole('banner')).queryByText('PRO')).not.toBeInTheDocument();
    expect(barra().vidas).toBe('5');
  });

  it('se actualiza al registrar progreso', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    renderApp(services);
    await act(async () => {
      await services.progress.getState().record([leccion]);
    });
    expect(barra()).toEqual({ racha: '1', gemas: '90', vidas: '∞' });
  });

  it('tras recargar muestra el mismo estado guardado (recorrido de adaptador a pantalla)', async () => {
    const m = memoria();
    const reloj = relojFalso();
    const antes = await crearServicios({ storage: m.storage, clock: reloj });
    await antes.progress.getState().record([leccion]);
    const despues = await crearServicios({ storage: m.storage, clock: reloj });
    renderApp(despues);
    expect(barra()).toEqual({ racha: '1', gemas: '90', vidas: '∞' });
    expect(despues.progress.getState().progress.xp).toBe(120);
  });

  it('la racha se pierde si pasaron más días sin actividad', async () => {
    const m = memoria();
    const reloj = relojFalso();
    const services = await crearServicios({ storage: m.storage, clock: reloj });
    await services.progress.getState().record([leccion]);
    reloj.avanzar(3 * 24 * 3600 * 1000);
    renderApp(services);
    expect(barra().racha).toBe('0');
  });
});

describe('tema', () => {
  it('el botón alterna entre claro y oscuro y recuerda la elección al recargar', async () => {
    const m = memoria();
    const services = await crearServicios({ storage: m.storage, clock: relojFalso() });
    renderApp(services);
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar tema' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(services.ui.getState().theme).toBe('dark');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar tema' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar tema' }));

    const otra = await crearServicios({ storage: m.storage, clock: relojFalso() });
    document.documentElement.dataset.theme = '';
    renderApp(otra);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('navegación', () => {
  it('muestra las cuatro pestañas y la actual queda marcada', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    renderApp(services, '/practicar');
    const nav = within(screen.getByRole('navigation', { name: 'Navegación principal' }));
    expect(
      nav
        .getAllByRole('link')
        .map((l) => l.textContent?.replace(/\p{Extended_Pictographic}/gu, '').trim()),
    ).toEqual(['Aprender', 'Practicar', 'Ligas', 'Perfil']);
    expect(nav.getByRole('link', { name: /Practicar/ })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: /Aprender/ })).not.toHaveAttribute('aria-current');
  });

  it('la navegación inferior cambia de pantalla', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    const { router } = renderApp(services);
    expect(screen.getByRole('heading', { name: 'Aprender' })).toBeInTheDocument();
    for (const [nombre, ruta] of [
      ['Practicar', '/practicar'],
      ['Ligas', '/ligas'],
      ['Perfil', '/perfil'],
      ['Aprender', '/aprender'],
    ] as const) {
      await userEvent.click(screen.getByRole('link', { name: new RegExp(nombre) }));
      expect(router.state.location.pathname).toBe(ruta);
      expect(screen.getByRole('heading', { name: nombre })).toBeInTheDocument();
    }
  });

  it('la raíz y las rutas desconocidas llevan a Aprender', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    for (const ruta of ['/', '/no-existe', '/perfil/otra/cosa']) {
      const { router, unmount } = renderApp(services, ruta);
      const esperado = ruta === '/perfil/otra/cosa' ? '/aprender' : '/aprender';
      await act(async () => {});
      expect(router.state.location.pathname).toBe(esperado);
      unmount();
    }
  });

  it('Atrás vuelve a la pantalla anterior sin salir de la app', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    const { router } = renderApp(services);
    await userEvent.click(screen.getByRole('link', { name: /Ligas/ }));
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.pathname).toBe('/aprender');
  });
});
