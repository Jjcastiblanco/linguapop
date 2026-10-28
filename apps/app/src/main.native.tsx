import { createBrowserRouter } from 'react-router';
import { startApp } from './bootstrap';
import { createNativeComposition } from './composition/native';
import { appRoutes } from './routes';

// Arranque del APK: sin service worker (la app va empaquetada) y con la composición nativa.
void startApp(createNativeComposition(), { router: createBrowserRouter(appRoutes) });
