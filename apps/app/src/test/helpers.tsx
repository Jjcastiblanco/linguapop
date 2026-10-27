import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createComposition, type CompositionOverrides } from '../composition';
import { AppProvider, createServices, type AppServices } from '../composition/context';
import { appRoutes } from '../routes';

export type Memoria = {
  data: Map<string, string>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
};

/** Un `localStorage` falso en memoria; permite simular "recargar" creando otra composición con el mismo almacén. */
export function memoria(): Memoria {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    },
  };
}

let contador = 0;
/** UUID válidos y distintos en cada llamada, para pruebas repetibles. */
export const nuevoId = () => `00000000-0000-4000-8000-${String(++contador).padStart(12, '0')}`;

/** Un reloj que se puede mover. */
export function relojFalso(inicio = Date.UTC(2026, 9, 27, 12, 0, 0)) {
  let ahora = inicio;
  return {
    now: () => ahora,
    set: (ms: number) => (ahora = ms),
    avanzar: (ms: number) => (ahora += ms),
  };
}

export async function crearServicios(overrides: CompositionOverrides = {}): Promise<AppServices> {
  const services = createServices(
    createComposition({ timeZone: 'UTC', newId: nuevoId, ...overrides }),
  );
  await Promise.all([services.ui.getState().load(), services.progress.getState().load()]);
  return services;
}

/** Dibuja la app completa en una ruta, con rutas en memoria. */
export function renderApp(services: AppServices, ruta = '/aprender') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [ruta] });
  const utils = render(
    <AppProvider services={services}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { ...utils, router };
}
