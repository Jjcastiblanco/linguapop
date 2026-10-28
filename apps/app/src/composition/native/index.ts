import { createComposition, type Composition, type CompositionOverrides } from '..';
import { inertInstall, inertUpdate } from './inert';

/**
 * Raíz de composición del APK (AD-17, AD-26): la misma composición que la web con la instalación y
 * la actualización inertes, de modo que el aviso de nueva versión y la tarjeta de instalar no
 * aparecen sin tocar ninguna pantalla. Los adaptadores nativos de voz se conectan aquí.
 */
export function createNativeComposition(overrides: CompositionOverrides = {}): Composition {
  return createComposition({ install: inertInstall, update: inertUpdate, ...overrides });
}
