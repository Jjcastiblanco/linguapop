// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter } from 'react-router';
import { startApp } from './bootstrap';
import { createComposition } from './composition';
import { appRoutes } from './routes';
import { memoria } from './test/helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

const composicion = (storage = memoria().storage) =>
  createComposition({ storage, timeZone: 'UTC' });
const router = () => createMemoryRouter(appRoutes, { initialEntries: ['/aprender'] });

describe('arranque compartido', () => {
  it('lee el progreso y las preferencias y monta la app en la raíz', async () => {
    const root = document.body.appendChild(document.createElement('div'));
    const services = await startApp(composicion(), { router: router(), root });
    expect(services.progress.getState().ready).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Aprender' })).toBeInTheDocument();
    expect(root.querySelector('header')).not.toBeNull();
  });

  it('usa #root cuando no se le da otra raíz', async () => {
    const root = document.body.appendChild(document.createElement('div'));
    root.id = 'root';
    await startApp(composicion(), { router: router() });
    expect(await screen.findByRole('heading', { name: 'Aprender' })).toBeInTheDocument();
  });

  it('sin raíz falla con el mismo error de siempre', async () => {
    await expect(startApp(composicion(), { router: router() })).rejects.toThrow(
      'No se encontró el elemento #root',
    );
  });
});
