import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { registerSW } from 'virtual:pwa-register';
import { createComposition } from './composition';
import { AppProvider, createServices } from './composition/context';
import { appRoutes } from './routes';
import './styles/theme.css';

// El service worker deja la app instalable y disponible sin conexión. Se actualiza solo, sin
// recargar la página: así una actualización nunca corta una lección en curso.
if (import.meta.env.PROD) registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root');

const services = createServices(createComposition());
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
