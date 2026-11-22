import type { LocalStore } from '@linguapop/domain';
import { createStore, type StoreApi } from 'zustand/vanilla';

export const UI_KEY = 'linguapop:ui:v1';

export type Theme = 'auto' | 'light' | 'dark';

/** Preferencias del dispositivo: no son progreso, no viajan entre dispositivos. */
export type UiState = {
  theme: Theme;
  sound: boolean;
  subtitles: boolean;
  /** Unidades cuya oferta de prueba de nivel ya se aceptó o descartó en este dispositivo. */
  placementDismissed: string[];
  load: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setSound: (on: boolean) => Promise<void>;
  setSubtitles: (on: boolean) => Promise<void>;
  dismissPlacement: (unitId: string) => Promise<void>;
};

export type UiStore = StoreApi<UiState>;

type Saved = Pick<UiState, 'theme' | 'sound' | 'subtitles' | 'placementDismissed'>;
const DEFAULTS: Saved = { theme: 'auto', sound: true, subtitles: true, placementDismissed: [] };

function readSaved(raw: string | null): Saved {
  if (!raw) return DEFAULTS;
  try {
    const v = JSON.parse(raw) as Partial<Saved>;
    return {
      theme:
        v.theme === 'light' || v.theme === 'dark' || v.theme === 'auto' ? v.theme : DEFAULTS.theme,
      sound: typeof v.sound === 'boolean' ? v.sound : DEFAULTS.sound,
      subtitles: typeof v.subtitles === 'boolean' ? v.subtitles : DEFAULTS.subtitles,
      placementDismissed: Array.isArray(v.placementDismissed)
        ? [...new Set(v.placementDismissed.filter((id): id is string => typeof id === 'string'))]
        : DEFAULTS.placementDismissed,
    };
  } catch {
    return DEFAULTS;
  }
}

export function createUiStore(local: LocalStore): UiStore {
  return createStore<UiState>((set, get) => {
    const persist = async (patch: Partial<Saved>) => {
      set(patch);
      const { theme, sound, subtitles, placementDismissed } = get();
      await local.set(UI_KEY, JSON.stringify({ theme, sound, subtitles, placementDismissed }));
    };
    return {
      ...DEFAULTS,
      async load() {
        set(readSaved(await local.get(UI_KEY)));
      },
      setTheme: (theme) => persist({ theme }),
      setSound: (sound) => persist({ sound }),
      setSubtitles: (subtitles) => persist({ subtitles }),
      dismissPlacement: (unitId) =>
        get().placementDismissed.includes(unitId)
          ? Promise.resolve()
          : persist({ placementDismissed: [...get().placementDismissed, unitId] }),
    };
  });
}
