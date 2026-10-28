import type { WebInstall } from '../adapters/web-install';
import type { WebUpdate } from '../adapters/web-update';

/** Dentro del APK no hay nada que instalar: la tarjeta de instalar no se ofrece. */
export const inertInstall: WebInstall = {
  available: () => false,
  subscribe: () => () => undefined,
  prompt: async () => 'unavailable',
  onInstalled: () => () => undefined,
};

/** Dentro del APK no hay service worker: nunca hay una versión nueva que ofrecer desde la web. */
export const inertUpdate: WebUpdate = {
  available: () => false,
  subscribe: () => () => undefined,
  offer: () => undefined,
  apply: () => undefined,
  dismiss: () => undefined,
};
