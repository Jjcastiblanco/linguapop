import { createBrowserRouter } from 'react-router';
import { startApp } from './bootstrap';
import { composeWithContent } from './composition';
import { createNativeComposition } from './composition/native';
import { appRoutes } from './routes';

// Arranque del APK: sin service worker (la app va empaquetada) y con la composición nativa.
// En el APK Google se habilita en su propia historia: hasta entonces solo correo y contraseña.
void composeWithContent(createNativeComposition, { googleSignIn: false }).then((composition) =>
  startApp(composition, { router: createBrowserRouter(appRoutes) }),
);
