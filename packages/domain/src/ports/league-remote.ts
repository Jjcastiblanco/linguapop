/** Una fila de la tabla semanal que entrega el servidor (AD-7). */
export type LeagueStanding = {
  /** Puesto que calcula el servidor; los empates comparten puesto. */
  rank: number;
  /** Nombre visible: el de la persona o el del bot. Texto libre, nunca markup. */
  name: string;
  /** XP de la semana, derivado por el servidor de los eventos aceptados. */
  xp: number;
  /** Solo este campo distingue a un bot, nunca el nombre. */
  isBot: boolean;
  /** Es la fila de la persona con la sesión abierta. */
  isMe: boolean;
};

/**
 * La liga semanal real (AD-7, AD-13). El servidor decide la semana, la cohorte y los puestos; el
 * cliente solo la abre y lee. Si no hay red, sesión o el servidor no responde, `open` lanza.
 */
export interface LeagueRemote {
  /** Hay un servidor configurado. */
  available(): boolean;
  /** Mete a la persona en su cohorte de la semana (una vez) y devuelve la tabla, ordenada por puesto. */
  open(): Promise<LeagueStanding[]>;
  /** Vuelve a leer la tabla sin abrir la liga: para después de un aviso. Lanza igual que `open`. */
  refresh(): Promise<LeagueStanding[]>;
  /**
   * Avisa cuando algo cambió en la cohorte de la persona (7.5). El aviso no trae datos: quien lo
   * recibe llama a `refresh`. Si no se puede escuchar no hace nada. Devuelve cómo dejar de escuchar.
   */
  watch(onChange: () => void): () => void;
}
