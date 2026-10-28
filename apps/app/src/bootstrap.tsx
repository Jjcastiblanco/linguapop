import { StrictMode, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import type { Composition } from './composition';
import { AppProvider, createServices, type AppServices } from './composition/context';
import './styles/theme.css';

type AppRouter = ComponentProps<typeof RouterProvider>['router'];

export type StartOptions = {
  router: AppRouter;
  /** Elemento donde se monta la app; por defecto `#root`. */
  root?: HTMLElement | null;
};

/**
 * Arranque común de todos los destinos de la app (AD-26): crea los servicios sobre la composición
 * que le pase cada punto de entrada, lee las preferencias y el progreso guardados y monta React.
 * Lo propio de cada destino (el service worker de la PWA, los adaptadores nativos) queda fuera.
 */
export async function startApp(
  composition: Composition,
  { router, root = document.getElementById('root') }: StartOptions,
): Promise<AppServices> {
  if (!root) throw new Error('No se encontró el elemento #root');
  const services = createServices(composition);
  // Se leen las preferencias y el progreso guardados antes de mostrar nada.
  await Promise.all([services.ui.getState().load(), services.progress.getState().load()]);
  createRoot(root).render(
    <StrictMode>
      <AppProvider services={services}>
        <RouterProvider router={router} />
      </AppProvider>
    </StrictMode>,
  );
  return services;
}
