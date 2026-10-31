import { createBrowserRouter } from 'react-router';
import { startApp } from './bootstrap';
import { composeWithContent } from './composition';
import { createNativeComposition } from './composition/native';
import { createNativeGoogle } from './composition/native/native-google';
import { appRoutes } from './routes';

// Arranque del APK: sin service worker (la app va empaquetada) y con la composición nativa.
// Google en el APK usa el selector nativo, no la redirección web; sin el ID del cliente web de
// Google (público) la app ofrece solo correo y contraseña.
const googleWebClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

void composeWithContent(createNativeComposition, {
  googleSignIn: false,
  nativeGoogle: googleWebClientId ? createNativeGoogle(googleWebClientId) : undefined,
}).then((composition) => startApp(composition, { router: createBrowserRouter(appRoutes) }));
