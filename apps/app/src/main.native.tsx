import { createBrowserRouter } from 'react-router';
import { startApp } from './bootstrap';
import { composeWithContent } from './composition';
import { createNativeComposition } from './composition/native';
import { appRoutes } from './routes';

// Arranque del APK: sin service worker (la app va empaquetada) y con la composición nativa.
void composeWithContent(createNativeComposition).then((composition) =>
  startApp(composition, { router: createBrowserRouter(appRoutes) }),
);
