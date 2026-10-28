// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import type { PendingEvent } from '@linguapop/domain';
import { describe, expect, it } from 'vitest';
import { crearServicios, memoria, relojFalso, renderApp } from '../../test/helpers';

// 2026-10-28 12:00 UTC es miércoles: quedan 5 días de la semana.
const MIERCOLES = Date.UTC(2026, 9, 28, 12, 0, 0);

async function abrir(antes: PendingEvent[] = [], ms = MIERCOLES) {
  const services = await crearServicios({ storage: memoria().storage, clock: relojFalso(ms) });
  if (antes.length) await services.progress.getState().record(antes);
  return renderApp(services, '/ligas');
}

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
const filas = () => screen.getAllByTestId(/^league-row-/);
const mia = () => filas().find((f) => f.getAttribute('data-me') === 'true')!;

describe('pantalla Ligas', () => {
  it('muestra la liga, los días restantes y 30 jugadores', async () => {
    await abrir();
    expect(screen.getByTestId('league-tier')).toHaveTextContent('Liga Bronce');
    expect(screen.getByTestId('league-days')).toHaveTextContent('Quedan 5 días');
    expect(filas()).toHaveLength(30);
    expect(screen.getByText('Clasificación simulada con jugadores bot.')).toBeInTheDocument();
  });

  it('abrirla dos veces el mismo día da la misma tabla', async () => {
    const a = await abrir();
    const antes = filas().map((f) => f.textContent);
    a.unmount();
    await abrir();
    expect(filas().map((f) => f.textContent)).toEqual(antes);
  });

  it('el estudiante sin XP queda al final, resaltado con "(tú)" y en zona de descenso', async () => {
    await abrir();
    expect(mia()).toHaveTextContent('Explorador (tú)');
    expect(mia()).toHaveAttribute('data-zone', 'demotion');
    expect(Number(within(mia()).getAllByText(/^\d+$/)[0]!.textContent)).toBeGreaterThanOrEqual(26);
  });

  it('el XP de la semana lo sube de puesto', async () => {
    await abrir([sesion(60)]);
    expect(mia()).toHaveAttribute('data-zone', 'promotion');
    expect(mia()).toHaveAttribute('data-testid', 'league-row-1');
  });

  it('marca las tres zonas con sus separadores', async () => {
    await abrir();
    expect(screen.getByText('▲ ZONA DE ASCENSO ▲')).toBeInTheDocument();
    expect(screen.getByText('— ZONA SEGURA —')).toBeInTheDocument();
    expect(screen.getByText('▼ ZONA DE DESCENSO ▼')).toBeInTheDocument();
    expect(screen.getByTestId('league-row-10')).toHaveAttribute('data-zone', 'promotion');
    expect(screen.getByTestId('league-row-26')).toHaveAttribute('data-zone', 'demotion');
  });

  it('con 500 XP totales la liga es Plata', async () => {
    await abrir([sesion(50)]);
    expect(screen.getByTestId('league-tier')).toHaveTextContent('Liga Plata');
  });

  it('el domingo queda 1 día', async () => {
    await abrir([], Date.UTC(2026, 10, 1, 12, 0, 0));
    expect(screen.getByTestId('league-days')).toHaveTextContent('Queda 1 día');
  });
});
