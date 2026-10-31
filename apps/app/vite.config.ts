import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA: la app se instala y abre sin conexión. El contenido semilla va dentro del código, así que
 * el precaché lo incluye. La versión heredada vive en `/legacy/` con su propio service worker y
 * este nunca debe atenderla (C8): por eso la navegación la excluye y nada de `legacy/` se precachea.
 */
export const LEGACY_PATH = /^\/legacy(\/|$)/;

export const pwaOptions = {
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'LinguaPop – Aprende inglés jugando',
    short_name: 'LinguaPop',
    description: 'Aprende inglés con lecciones gamificadas, repaso de errores y llamadas con Nova.',
    lang: 'es',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fff8f0',
    theme_color: '#ff7a1a',
    categories: ['education'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: 'icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
    globIgnores: ['legacy/**'],
    // El alojamiento (Cloudflare Pages) redirige /index.html a /. Precachear esa dirección deja un
    // servicio que, si no encuentra la copia, devuelve una respuesta redirigida y el navegador
    // falla al abrir cualquier ruta (p. ej. al volver de Google a /perfil). Se precachea `/`.
    manifestTransforms: [
      async (entries: Array<{ url: string; revision: string | null; size: number }>) => ({
        manifest: entries.map((e) => (e.url === 'index.html' ? { ...e, url: '/' } : e)),
        warnings: [],
      }),
    ],
    navigateFallback: '/',
    navigateFallbackDenylist: [LEGACY_PATH],
    cleanupOutdatedCaches: true,
  },
} satisfies Parameters<typeof VitePWA>[0];

const NATIVE_ENTRY = '/src/main.native.tsx';

/** En el modo `native` el HTML carga el arranque del APK en vez del de la web. */
function nativeEntry(): Plugin {
  return {
    name: 'linguapop-native-entry',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('src="/src/main.tsx"', `src="${NATIVE_ENTRY}"`),
    },
  };
}

/**
 * Dos destinos con el mismo código (AD-17, AD-27): la PWA (por defecto) y el APK (`--mode native`),
 * que sale en `dist-native` sin service worker ni manifiesto y con su propio arranque.
 */
export default defineConfig(({ mode }) =>
  mode === 'native'
    ? { plugins: [react(), nativeEntry()], build: { outDir: 'dist-native' } }
    : { plugins: [react(), VitePWA(pwaOptions)] },
);
