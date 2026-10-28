// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PendingEvent } from '@linguapop/domain';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../composition/context';
import { appRoutes } from '../../routes';
import { SALUDOS } from '../../test/curso-de-prueba';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const DIA = 86_400_000;
const fallo = (exerciseId: string): PendingEvent => ({
  type: 'exercise_answered@1',
  payload: { exerciseId, correct: false, mode: 'lesson' },
});
const leccion = (n: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: `u-saludos-l${n}`,
    correct: 10,
    wrong: 0,
    answered: 10,
    durationSec: 60,
    outOfHearts: false,
  },
});

async function abrir(plan: 'free' | 'pro' = 'pro', antes: PendingEvent[] = []) {
  const clock = relojFalso();
  const services = await crearServicios({
    storage: memoria().storage,
    clock,
    random: { next: () => 0.4 },
  });
  await services.progress
    .getState()
    .record([{ type: 'settings_changed@1', payload: { plan } }, ...antes]);
  const app = renderApp(services, '/practicar');
  return { services, clock, ...app };
}

const progreso = (s: Awaited<ReturnType<typeof abrir>>['services']) =>
  s.progress.getState().progress;
const tarjeta = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

afterEach(() => vi.useRealTimers());

describe('pantalla Practicar', () => {
  it('muestra los modos, el récord, los pendientes y la tarjeta de Nova bloqueada', async () => {
    await abrir('pro', [fallo(SALUDOS.mc[0]), fallo(SALUDOS.mc[1])]);
    expect(tarjeta(/Repaso de errores/)).toHaveTextContent('2 pendientes por repasar');
    expect(tarjeta(/Modo desafío/)).toHaveTextContent('récord: 0 aciertos');
    expect(tarjeta(/Llamadas con Nova/)).toBeDisabled();
    expect(screen.getByText('Tienes 50 💎')).toBeInTheDocument();
  });

  it('repaso sin pendientes avisa y no abre sesión', async () => {
    const { router } = await abrir();
    await userEvent.click(tarjeta(/Repaso de errores/));
    expect(await screen.findByText('🎉 ¡Sin errores pendientes!')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/practicar');
  });

  it('el repaso arma la sesión con los errores y al acertar el error sale de la lista', async () => {
    const { services, router } = await abrir('pro', [fallo(SALUDOS.mc[0])]);
    await userEvent.click(tarjeta(/Repaso de errores/));
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    await userEvent.click(await screen.findByRole('button', { name: /Hello/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Comprobar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(
      await screen.findByRole('heading', { name: '¡Práctica completada!' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(progreso(services).errors).toEqual([]));
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(router.state.location.pathname).toBe('/practicar');
  });

  it('la práctica personalizada lanza una sesión', async () => {
    const { router } = await abrir();
    await userEvent.click(tarjeta(/Práctica personalizada/));
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });

  it('con StrictMode la sesión sobrevive al montaje repetido', async () => {
    const services = await crearServicios({ storage: memoria().storage, clock: relojFalso() });
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/practicar'] });
    render(
      <StrictMode>
        <AppProvider services={services}>
          <RouterProvider router={router} />
        </AppProvider>
      </StrictMode>,
    );
    await userEvent.click(tarjeta(/Práctica personalizada/));
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });

  it('recargar en la sesión vuelve a Practicar', async () => {
    const { router } = await abrir();
    await act(() => router.navigate('/practicar/sesion'));
    expect(router.state.location.pathname).toBe('/practicar');
  });

  it('el desafío cuenta atrás desde 90 s y termina al agotarse el tiempo', async () => {
    const { router, clock } = await abrir();
    vi.useFakeTimers();
    await act(async () => {
      tarjeta(/Modo desafío/).click();
    });
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(screen.getByTestId('session-time')).toHaveTextContent('1:30');

    await act(async () => {
      clock.avanzar(30_000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('session-time')).toHaveTextContent('1:00');

    await act(async () => {
      clock.avanzar(60_000);
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('heading', { name: '¡Se acabó el tiempo!' })).toBeInTheDocument();
    expect(screen.getByTestId('result-timed')).toHaveTextContent('0 aciertos · récord: 0');
  });

  it('la prueba de nivel deshabilita las unidades completadas y lanza la sesión de otra', async () => {
    const { router } = await abrir('pro', [leccion(1), leccion(2), leccion(3)]);
    await userEvent.click(tarjeta(/Prueba de nivel/));
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('button', { name: /Saltar hasta Saludos/ })).toBeDisabled();
    expect(within(dialogo).getByRole('button', { name: /Saltar hasta Saludos ✅/ })).toBeDisabled();
    await userEvent.click(within(dialogo).getByRole('button', { name: /Saltar hasta Comida/ }));
    expect(router.state.location.pathname).toBe('/practicar/sesion');
    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });

  it.each([
    [/Repaso de errores/, 'Repaso de errores'],
    [/Práctica personalizada/, 'Práctica personalizada'],
    [/Modo desafío/, 'Modo desafío'],
    [/Prueba de nivel/, 'Prueba de nivel'],
  ])('en el plan gratis %s pide activar PRO', async (card, nombre) => {
    const { services, router } = await abrir('free');
    await userEvent.click(tarjeta(card));
    const dialogo = screen.getByRole('dialog', { name: `🔒 ${nombre}` });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ahora no' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/practicar');
    expect(progreso(services).settings.plan).toBe('free');
  });

  it('activar PRO desde el diálogo cambia el plan', async () => {
    const { services } = await abrir('free');
    await userEvent.click(tarjeta(/Modo desafío/));
    await userEvent.click(screen.getByRole('button', { name: 'Activar PRO' }));
    await waitFor(() => expect(progreso(services).settings.plan).toBe('pro'));
    expect(await screen.findByText('⭐ PRO activado')).toBeInTheDocument();
  });
});

describe('tienda y protector de racha', () => {
  it('comprar vidas descuenta 30 gemas y las recarga', async () => {
    const { services } = await abrir('free', [fallo(SALUDOS.mc[0])]);
    expect(progreso(services).hearts).toBe(4);
    await userEvent.click(screen.getByRole('button', { name: /Recargar vidas/ }));
    expect(await screen.findByText('✅ Compra realizada')).toBeInTheDocument();
    expect(progreso(services).gems).toBe(20);
    expect(progreso(services).hearts).toBe(5);
    expect(screen.getByText('Tienes 20 💎')).toBeInTheDocument();
  });

  it('con las vidas llenas avisa y no registra la compra', async () => {
    const { services } = await abrir();
    const antes = services.progress.getState().events.length;
    await userEvent.click(screen.getByRole('button', { name: /Recargar vidas/ }));
    expect(await screen.findByText('Ya tienes todas las vidas')).toBeInTheDocument();
    expect(services.progress.getState().events).toHaveLength(antes);
  });

  it('sin gemas suficientes avisa y no registra la compra', async () => {
    const { services } = await abrir();
    const antes = services.progress.getState().events.length;
    await userEvent.click(screen.getByRole('button', { name: /Protector extra/ }));
    expect(await screen.findByText('Te faltan gemas 💎')).toBeInTheDocument();
    expect(services.progress.getState().events).toHaveLength(antes);
  });

  it('el protector extra solo se compra si el del mes ya se usó', async () => {
    const { services, clock } = await abrir('pro', [leccion(1)]);
    // Hay gemas de sobra y el protector del mes sigue disponible.
    await services.progress
      .getState()
      .record([{ type: 'chest_opened@1', payload: { unitId: 'u-saludos', gems: 0, xp: 0 } }]);
    expect(screen.getByTestId('shield-status')).toHaveTextContent(
      'Disponible este mes: salva tu racha si faltas un día',
    );
    // Faltar un día lo gasta: la racha se salva con el protector.
    clock.avanzar(2 * DIA);
    await services.progress.getState().record([leccion(2), leccion(3)]);
    expect(progreso(services).gems).toBeGreaterThanOrEqual(60);
    await waitFor(() =>
      expect(screen.getByTestId('shield-status')).toHaveTextContent('Ya lo usaste este mes'),
    );
    const gemas = progreso(services).gems;
    await userEvent.click(screen.getByRole('button', { name: /Protector extra/ }));
    await waitFor(() => expect(progreso(services).gems).toBe(gemas - 60));
    expect(screen.getByTestId('shield-status')).toHaveTextContent('Disponible este mes');
  });

  it('con el protector disponible avisa y no cobra', async () => {
    const { services } = await abrir('pro', [leccion(1), leccion(2), leccion(3)]);
    expect(progreso(services).gems).toBeGreaterThanOrEqual(60);
    const gemas = progreso(services).gems;
    await userEvent.click(screen.getByRole('button', { name: /Protector extra/ }));
    expect(
      await screen.findByText('Tu protector de este mes sigue disponible'),
    ).toBeInTheDocument();
    expect(progreso(services).gems).toBe(gemas);
  });

  it('en el plan gratis el protector se anuncia solo para PRO', async () => {
    await abrir('free');
    expect(screen.getByTestId('shield-status')).toHaveTextContent('Solo para PRO');
  });

  it('las palabras a mejorar de Nova se pueden escuchar', async () => {
    const habladas: string[] = [];
    const clock = relojFalso();
    const services = await crearServicios({
      storage: memoria().storage,
      clock,
      speech: {
        speak: async (texto: string) => void habladas.push(texto),
        cancel: () => undefined,
        listen: async () => ({ ok: false as const, reason: 'unsupported' as const }),
        capabilities: () => ({ speak: true, listen: false }),
      } as never,
    });
    await services.progress.getState().record([
      {
        type: 'call_completed@1',
        payload: {
          topicId: 't-presentarse',
          durationSec: 60,
          turns: 4,
          score: 80,
          weakWords: ['water'],
          aiExchanges: 0,
        },
      } as never,
    ]);
    renderApp(services, '/practicar');
    await userEvent.click(screen.getByRole('button', { name: 'Escuchar water' }));
    expect(habladas).toEqual(['water']);
  });
});
