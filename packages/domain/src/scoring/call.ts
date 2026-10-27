/** XP de una llamada con Nova según cómo respondió el estudiante. */
export const CALL_XP_FIRST_TRY = 15;
export const CALL_XP_LATER = 8;
export const CALL_XP_AI_EXCHANGE = 12;
export const CALL_XP_COMPLETED = 20;
/** Una llamada más corta que esto, sin respuestas, no cuenta como llamada. */
export const CALL_MIN_COUNTED_SECONDS = 30;

export type CallScoreInput = {
  firstTry: number;
  later: number;
  gaveUp: number;
  /** Intercambios de conversación libre con IA; 0 si se usó el árbol de diálogo. */
  aiExchanges: number;
  /** Se llegó al final de la conversación (no se colgó antes). */
  completed: boolean;
  durationSec: number;
};

export type CallScore = {
  xp: number;
  /** Cuenta para la estadística de llamadas. */
  counted: boolean;
};

export function scoreCall(input: CallScoreInput): CallScore {
  const answered =
    input.aiExchanges > 0
      ? input.aiExchanges * CALL_XP_AI_EXCHANGE
      : input.firstTry * CALL_XP_FIRST_TRY + input.later * CALL_XP_LATER;
  const xp = answered + (input.completed ? CALL_XP_COMPLETED : 0);
  const attempted = input.firstTry + input.later + input.gaveUp + input.aiExchanges;
  return { xp, counted: attempted > 0 || input.durationSec > CALL_MIN_COUNTED_SECONDS };
}
