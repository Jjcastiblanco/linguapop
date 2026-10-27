/** Frases fijas de Nova cuando el estudiante no responde o no se le entiende. */
export const NOVA_LINES = {
  slowAfterWrong: 'Hmm, not quite. Let me say it slowly.',
  slowAfterSilence: "Hello? Did you fall asleep? I'll say it slowly.",
  hintIntro: "Okay, here's a hint.",
  hintTry: ' Try saying: ',
  giveUp: "No worries, we'll practice that later. Next question!",
  giveUpLast: "Okay, that's enough. We'll practice that later. ",
  aiOpening: ' So, tell me about yourself!',
  aiFarewell: 'Okay, enough chatting for today. Bye!',
} as const;

/** Velocidades de habla de Nova al repetir. */
export const SLOW_RATE = 0.6;
export const HINT_RATE = 0.7;
/** Intercambios de la conversación libre con IA antes de despedirse. */
export const AI_MAX_EXCHANGES = 10;

/** Palabras demasiado comunes para marcarlas como "a mejorar". */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'is',
  'am',
  'are',
  'to',
  'of',
  'in',
  'my',
  'i',
  'it',
  'you',
  'and',
]);
