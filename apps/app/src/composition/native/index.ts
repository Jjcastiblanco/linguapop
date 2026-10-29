import { createComposition, type Composition, type CompositionOverrides } from '..';
import { inertInstall, inertUpdate } from './inert';
import { createNativeSpeech } from './native-speech';

/**
 * Raíz de composición del APK (AD-17, AD-26): la misma composición que la web con la instalación y
 * la actualización inertes, de modo que el aviso de nueva versión y la tarjeta de instalar no
 * aparecen sin tocar ninguna pantalla, y con la voz nativa de Android (AD-19).
 */
export function createNativeComposition(overrides: CompositionOverrides = {}): Composition {
  return createComposition({
    install: inertInstall,
    update: inertUpdate,
    speech: createNativeSpeech(),
    ...overrides,
  });
}
