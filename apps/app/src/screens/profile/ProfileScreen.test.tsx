// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PendingEvent } from '@linguapop/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

const DIA = 86_400_000;
const MIERCOLES = Date.UTC(2026, 9, 28, 12, 0, 0);

const sesion = (correct: number): PendingEvent => ({
  type: 'session_completed@1',
  payload: {
    mode: 'lesson',
    unitId: 'u-saludos',
    lessonId: 'u-saludos-l1',
    correct,
    wrong: 0,
    answered: correct,
    durationSec: 60,
    outOfHearts: false,
  },
});

async function abrir(
  opts: { storage?: ReturnType<typeof memoria>['storage']; antes?: PendingEvent[] } = {},
) {
  const storage = opts.storage ?? memoria().storage;
  const clock = relojFalso(MIERCOLES);
  const services = await crearServicios({ storage, clock });
  if (opts.antes?.length) await services.progress.getState().record(opts.antes);
  const app = renderApp(services, '/perfil');
  return { services, clock, storage, ...app };
}

const progreso = (s: Awaited<ReturnType<typeof abrir>>['services']) =>
  s.progress.getState().progress;
const interruptor = (nombre: string) => screen.getByRole('switch', { name: nombre });

afterEach(() => vi.restoreAllMocks());

describe('estadísticas y gráfico', () => {
  it('muestra las estadísticas del progreso', async () => {
    await abrir({ antes: [sesion(10)] });
    const stats = screen.getByLabelText('Estadísticas');
    expect(within(stats).getByText('🔥 Racha').nextSibling).toHaveTextContent('1 días');
    expect(within(stats).getByText('⚡ XP total').nextSibling).toHaveTextContent('120');
    expect(within(stats).getByText('📚 Lecciones').nextSibling).toHaveTextContent('1');
    expect(within(stats).getByText('🎯 Precisión').nextSibling).toHaveTextContent('100%');
  });

  it('el gráfico suma el XP de cada día y deja la última barra para hoy', async () => {
    const { services, clock } = await abrir({ antes: [sesion(10)] });
    clock.avanzar(DIA);
    await act(() => services.progress.getState().record([sesion(5)]));
    const barras = screen.getAllByTestId(/^bar-/);
    expect(barras).toHaveLength(7);
    expect(barras.at(-1)).toHaveAttribute('data-testid', 'bar-2026-10-29');
    expect(barras.at(-1)).toHaveAttribute(
      'data-xp',
      String(progreso(services).xpByDay['2026-10-29']),
    );
    expect(screen.getByTestId('bar-2026-10-28')).toHaveAttribute(
      'data-xp',
      String(progreso(services).xpByDay['2026-10-28']),
    );
    expect(screen.getByTestId('bar-2026-10-23')).toHaveAttribute('data-xp', '0');
  });
});

describe('logros', () => {
  it('cuenta los desbloqueados y atenúa el resto', async () => {
    await abrir({ antes: [sesion(10)] });
    const lista = screen.getByRole('region', { name: 'Logros' });
    expect(
      within(lista)
        .getByText(/Primer paso/)
        .closest('li'),
    ).toHaveAttribute('data-unlocked', 'true');
    expect(
      within(lista)
        .getAllByRole('listitem')
        .some((li) => li.getAttribute('data-unlocked') === 'false'),
    ).toBe(true);
    expect(within(lista).getByText(/^🏆 Logros \(\d+\/\d+\)$/)).toBeInTheDocument();
  });
});

describe('ajustes', () => {
  it('plan, meta y nombre se guardan como eventos y sobreviven a recargar', async () => {
    const { storage, services } = await abrir();
    await userEvent.click(interruptor('Plan PRO (todo desbloqueado)'));
    await userEvent.click(screen.getByRole('button', { name: '100 XP' }));
    await userEvent.click(screen.getByRole('button', { name: /Cambiar nombre/ }));
    const campo = screen.getByRole('textbox', { name: 'Tu nombre' });
    await userEvent.clear(campo);
    await userEvent.type(campo, '  Ana  ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(progreso(services).settings.displayName).toBe('Ana'));
    expect(progreso(services).settings).toMatchObject({ plan: 'free', dailyGoalXp: 100 });

    const otra = await crearServicios({ storage, clock: relojFalso(MIERCOLES) });
    expect(progreso(otra).settings).toMatchObject({
      plan: 'free',
      dailyGoalXp: 100,
      displayName: 'Ana',
    });
  });

  it('un nombre vacío no se puede guardar', async () => {
    const { services } = await abrir();
    const antes = services.progress.getState().events.length;
    await userEvent.click(screen.getByRole('button', { name: /Cambiar nombre/ }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Tu nombre' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Tu nombre' }), '   ');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(services.progress.getState().events).toHaveLength(antes);
  });

  it('tema, sonido y subtítulos se guardan en el dispositivo y sobreviven a recargar', async () => {
    const { storage, services } = await abrir();
    expect(interruptor('Sonidos')).toBeChecked();
    await userEvent.click(interruptor('Sonidos'));
    await userEvent.click(interruptor('Subtítulos en llamadas'));
    await userEvent.click(interruptor('Modo oscuro'));
    expect(services.ui.getState()).toMatchObject({ sound: false, subtitles: false, theme: 'dark' });

    const otra = await crearServicios({ storage });
    expect(otra.ui.getState()).toMatchObject({ sound: false, subtitles: false, theme: 'dark' });
  });
});

describe('exportar, importar y borrar', () => {
  async function exportar(services: Awaited<ReturnType<typeof abrir>>['services']) {
    const blobs: Blob[] = [];
    URL.createObjectURL = (b: Blob | MediaSource) => (blobs.push(b as Blob), 'blob:x');
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole('button', { name: /Exportar progreso/ }));
    expect(blobs).toHaveLength(1);
    const texto = await new Promise<string>((ok) => {
      const lector = new FileReader();
      lector.onload = () => ok(String(lector.result));
      lector.readAsText(blobs[0]!);
    });
    return new File([texto], 'linguapop-progreso.json', { type: 'application/json' });
  }

  it('exportar seguido de importar reproduce el mismo estado', async () => {
    const origen = await abrir({
      antes: [
        sesion(10),
        { type: 'settings_changed@1', payload: { displayName: 'Ana', dailyGoalXp: 100 } },
      ],
    });
    const archivo = await exportar(origen.services);
    origen.unmount();

    const destino = await abrir();
    expect(progreso(destino.services)).not.toEqual(progreso(origen.services));
    await userEvent.upload(screen.getByTestId('import-file'), archivo);
    expect(await screen.findByText('✅ Progreso importado')).toBeInTheDocument();
    expect(progreso(destino.services)).toEqual(progreso(origen.services));
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Ana');
  });

  it('un archivo inválido avisa y no cambia el progreso', async () => {
    const { services } = await abrir({ antes: [sesion(10)] });
    const antes = progreso(services);
    await userEvent.upload(
      screen.getByTestId('import-file'),
      new File(['{no es json'], 'malo.json', { type: 'application/json' }),
    );
    expect(await screen.findByText('Archivo no válido')).toBeInTheDocument();
    expect(progreso(services)).toEqual(antes);
  });

  it('borrar pide confirmación; cancelar no cambia nada', async () => {
    const { services } = await abrir({ antes: [sesion(10)] });
    await userEvent.click(screen.getByRole('button', { name: 'Borrar todo el progreso' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(progreso(services).xp).toBeGreaterThan(0);
  });

  it('confirmar el borrado deja el progreso en cero', async () => {
    const { services } = await abrir({ antes: [sesion(10)] });
    await userEvent.click(screen.getByRole('button', { name: 'Borrar todo el progreso' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, borrar todo' }));
    expect(await screen.findByText('Progreso borrado')).toBeInTheDocument();
    expect(progreso(services).xp).toBe(0);
    expect(progreso(services).stats.lessons).toBe(0);
  });
});
