/** Aviso de instalación que lanzan los navegadores compatibles (aún no es estándar). */
export type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** Instalación de la app como PWA: dice si se puede ofrecer y lanza el aviso del navegador. */
export type WebInstall = {
  available(): boolean;
  subscribe(listener: () => void): () => void;
  prompt(): Promise<InstallOutcome>;
  /** Avisa cuando la app termina de instalarse. */
  onInstalled(listener: () => void): () => void;
};

type InstallEnv = {
  target: EventTarget;
  /** ¿La app ya corre instalada, como app independiente? */
  standalone: () => boolean;
};

function browserEnv(): InstallEnv | null {
  if (typeof window === 'undefined') return null;
  return {
    target: window,
    standalone: () =>
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

/**
 * Guarda el aviso de instalación para ofrecerlo cuando el estudiante lo pida, en vez de dejar que
 * el navegador lo muestre solo. Sin aviso, o con la app ya instalada, no hay nada que ofrecer.
 */
export function createWebInstall(env: InstallEnv | null = browserEnv()): WebInstall {
  let saved: InstallPromptEvent | null = null;
  const listeners = new Set<() => void>();
  const installedListeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  env?.target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    saved = event as InstallPromptEvent;
    notify();
  });
  env?.target.addEventListener('appinstalled', () => {
    saved = null;
    notify();
    installedListeners.forEach((l) => l());
  });

  return {
    onInstalled(listener) {
      installedListeners.add(listener);
      return () => void installedListeners.delete(listener);
    },
    available: () => saved !== null && env?.standalone() !== true,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async prompt() {
      const event = saved;
      if (!event) return 'unavailable';
      saved = null; // el aviso solo se puede usar una vez
      notify();
      try {
        await event.prompt();
        return (await event.userChoice).outcome;
      } catch {
        return 'unavailable';
      }
    },
  };
}
