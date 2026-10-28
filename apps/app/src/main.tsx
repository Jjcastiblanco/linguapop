import { createBrowserRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { startApp } from './bootstrap';
import { createComposition } from './composition';
import { createWebUpdate } from './composition/adapters/web-update';
import { appRoutes } from './routes';

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

void startApp(createComposition({ update }), { router: createBrowserRouter(appRoutes) });
