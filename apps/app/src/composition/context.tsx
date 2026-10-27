import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  createProgressStore,
  createUiStore,
  type ProgressStore,
  type ProgressStoreState,
  type UiState,
  type UiStore,
} from '../stores';
import type { Composition } from '.';

export type AppServices = {
  composition: Composition;
  progress: ProgressStore;
  ui: UiStore;
};

const AppContext = createContext<AppServices | null>(null);

/** Crea los almacenes sobre una composición y los entrega a toda la app. */
export function createServices(composition: Composition): AppServices {
  const ui = createUiStore(composition.store);
  // El sonido obedece a la preferencia del dispositivo.
  composition.sound.setEnabledSource(() => ui.getState().sound);
  return { composition, progress: createProgressStore(composition), ui };
}

export function AppProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  const value = useMemo(() => services, [services]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
