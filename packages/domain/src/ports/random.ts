/** Aleatoriedad inyectable para que las mezclas y selecciones sean repetibles en pruebas. */
export interface Random {
  /** Número en [0, 1). */
  next(): number;
}
