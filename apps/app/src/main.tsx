import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { registerSW } from 'virtual:pwa-register';
import { createComposition } from './composition';
import { createWebUpdate } from './composition/adapters/web-update';
import { AppProvider, createServices } from './composition/context';
import { appRoutes } from './routes';
import './styles/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

const update = createWebUpdate();

// El service worker deja la app instalable y disponible sin conexión. Una versión nueva no se
// activa sola (recargar cortaría una lección): se avisa y el estudiante decide cuándo actualizar.
if (import.meta.env.PROD) {
  const activate = registerSW({
    immediate: true,
    onNeedRefresh: () => update.offer(() => void activate(true)),
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      // Una sesión larga o una app instalada y siempre abierta también se entera de las versiones nuevas.
      const check = () => void registration.update().catch(() => undefined);
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}

const services = createServices(createComposition({ update }));
const router = createBrowserRouter(appRoutes);

// Se leen las preferencias y el progreso guardados antes de mostrar nada.
void Promise.all([services.ui.getState().load(), services.progress.getState().load()]).then(() => {
  createRoot(root).render(
    <StrictMode>
      <AppProvider services={services}>
        <RouterProvider router={router} />
      </AppProvider>
    </StrictMode>,
  );
});
