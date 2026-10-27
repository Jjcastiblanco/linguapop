// Tipos de los comprobadores de Testing Library (`toBeInTheDocument`, etc.) para Vitest.
// Se declaran aquí porque, con pnpm, el paquete no encuentra el `vitest` del monorepo por sí solo.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
