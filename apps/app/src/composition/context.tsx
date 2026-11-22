import {
  Fragment,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import {
  createCallStore,
  createLessonSessionStore,
  createProgressStore,
  createToastStore,
  createUiStore,
  notifyProgress,
  startNotifications,
  startProgressSync,
  type CallStore,
  type CallStoreState,
  type LessonSessionState,
  type LessonSessionStore,
  type ProgressStore,
  type ProgressStoreState,
  type ToastStore,
  type UiState,
  type UiStore,
} from '../stores';
import { setInterfaceLanguage } from '../i18n';
import type { Composition } from '.';

export type AppServices = {
  composition: Composition;
  progress: ProgressStore;
  ui: UiStore;
  lesson: LessonSessionStore;
  call: CallStore;
  toast: ToastStore;
};

const AppContext = createContext<AppServices | null>(null);

/** Crea los almacenes sobre una composición y los entrega a toda la app. */
export function createServices(composition: Composition): AppServices {
  const ui = createUiStore(composition.store);
  // El sonido obedece a la preferencia del dispositivo.
  composition.sound.setEnabledSource(() => ui.getState().sound);
  const toast = createToastStore();
  const progress = createProgressStore(composition, {
    onRecorded: (prev, next) => notifyProgress(composition, toast, prev, next),
  });
  const lesson = createLessonSessionStore(composition, progress);
  const call = createCallStore(composition, progress);
  startNotifications(composition, toast, lesson, call);
  startProgressSync(composition, progress);
  return { composition, progress, ui, lesson, call, toast };
}

export function AppProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  const value = useMemo(() => services, [services]);
  return (
    <AppContext.Provider value={value}>
      <LanguageBoundary services={services}>{children}</LanguageBoundary>
    </AppContext.Provider>
  );
}

/**
 * Fija el idioma de la interfaz según el modo inmersión del progreso. Al cambiar de idioma el
 * árbol se vuelve a montar (la clave cambia): `t` no es reactiva, así que todo se recalcula.
 */
function LanguageBoundary({ services, children }: { services: AppServices; children: ReactNode }) {
  const immersion = useStore(services.progress, (s) => s.progress.settings.immersion === true);
  const language = immersion ? 'en' : 'es';
  setInterfaceLanguage(language);
  // Los lectores de pantalla y el corrector del navegador usan el idioma del documento.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <Fragment key={language}>{children}</Fragment>;
}

export function useServices(): AppServices {
  const services = useContext(AppContext);
  if (!services) throw new Error('Falta el AppProvider');
  return services;
}

export function useProgress<T>(selector: (s: ProgressStoreState) => T): T {
  return useStore(useServices().progress, selector);
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(useServices().ui, selector);
}

export function useLesson<T>(selector: (s: LessonSessionState) => T): T {
  return useStore(useServices().lesson, selector);
}

export function useCall<T>(selector: (s: CallStoreState) => T): T {
  return useStore(useServices().call, selector);
}

/** ¿Se puede ofrecer instalar la app ahora mismo? */
export function useInstallAvailable(): boolean {
  const { install } = useServices().composition;
  return useSyncExternalStore(install.subscribe, install.available);
}

/** ¿Hay una versión nueva de la app lista para activar? */
export function useUpdateAvailable(): boolean {
  const { update } = useServices().composition;
  return useSyncExternalStore(update.subscribe, update.available);
}

/** La cuenta con la sesión abierta, o `null` si es invitado. */
export function useAccount() {
  const { auth } = useServices().composition;
  return useSyncExternalStore(auth.subscribe, auth.account);
}
