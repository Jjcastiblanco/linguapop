/** Única fuente de tiempo del dominio (AD-13): nada llama a `Date.now()` fuera del adaptador. */
export interface Clock {
  /** Milisegundos desde la época Unix, en UTC. */
  now(): number;
}
