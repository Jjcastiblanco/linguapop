import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA: la app se instala y abre sin conexión. El contenido semilla va dentro del código, así que
 * el precaché lo incluye. La versión heredada vive en `/legacy/` con su propio service worker y
 * este nunca debe atenderla (C8): por eso la navegación la excluye y nada de `legacy/` se precachea.
 */
export const LEGACY_PATH = /^\/legacy(\/|$)/;

export const pwaOptions = {
  registerType: 'autoUpdate',
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
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [LEGACY_PATH],
    cleanupOutdatedCaches: true,
  },
} satisfies Parameters<typeof VitePWA>[0];

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
});
