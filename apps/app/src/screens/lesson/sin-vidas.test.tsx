// @vitest-environment jsdom
import type { PendingEvent } from '@linguapop/domain';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const RUTA = '/leccion/u-saludos/u-saludos-l1';
const fallo = (): PendingEvent => ({
  type: 'exercise_answered@1',
  payload: { exerciseId: 'u-saludos-e01', correct: false, mode: 'lesson' },
});
const sinVidas = () => Array.from({ length: 5 }, fallo);
const gratis: PendingEvent = { type: 'settings_changed@1', payload: { plan: 'free' } };

async function abrir(antes: PendingEvent[]) {
  const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
  await services.progress.getState().record(antes);
  const app = renderApp(services, RUTA);
  return { services, ...app };
}
const progreso = (s: Awaited<ReturnType<typeof abrir>>['services']) =>
  s.progress.getState().progress;

describe('lección sin vidas', () => {
  it('ofrece recargar vidas, activar PRO o volver', async () => {
    await abrir([gratis, ...sinVidas()]);
    expect(await screen.findByRole('heading', { name: 'Sin vidas 💔' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar vidas · 30 💎' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar PRO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  });

  it('recargar descuenta 30 gemas, devuelve las vidas, avisa y vuelve al camino', async () => {
    const { services, router } = await abrir([gratis, ...sinVidas()]);
    expect(progreso(services).hearts).toBe(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Recargar vidas · 30 💎' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/aprender'));
    expect(progreso(services).gems).toBe(20);
    expect(progreso(services).hearts).toBe(5);
    expect(screen.getByText('✅ Compra realizada')).toBeInTheDocument();
  });

  it('sin gemas suficientes avisa y se queda en la pantalla', async () => {
    const compra: PendingEvent = {
      type: 'purchase@1',
      payload: { item: 'hearts', costGems: 30 },
    };
    const { services, router } = await abrir([gratis, fallo(), compra, ...sinVidas()]);
    expect(progreso(services).gems).toBe(20);
    await userEvent.click(await screen.findByRole('button', { name: 'Recargar vidas · 30 💎' }));
    expect(await screen.findByText('Te faltan gemas 💎')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(RUTA);
    expect(progreso(services).gems).toBe(20);
  });

  it('activar PRO cambia el plan, avisa y vuelve al camino', async () => {
    const { services, router } = await abrir([gratis, ...sinVidas()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar PRO' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/aprender'));
    expect(progreso(services).settings.plan).toBe('pro');
    expect(screen.getByText('⭐ PRO activado')).toBeInTheDocument();
  });
});
