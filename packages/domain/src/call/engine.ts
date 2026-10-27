import type { DialogueTopic } from '@linguapop/content';
import type { PendingEvent } from '../events';
import type { DialogueMessage, SoundEffect } from '../ports';
import { scoreCall } from '../scoring';
import { matchesTurn, normalizeText } from '../text';
import { AI_MAX_EXCHANGES, HINT_RATE, NOVA_LINES, SLOW_RATE, STOP_WORDS } from './lines';

/** Cómo debe verse Nova al hablar. */
export type Expression = 'neutral' | 'smirk' | 'happy' | 'surprised' | 'think';

export type FluencyLabel = 'excellent' | 'good' | 'practice' | 'no-data';

export type CallSummary = {
  durationSec: number;
  xp: number;
  /** De 0 a 100. */
  fluency: number;
  label: FluencyLabel;
  /** Frases dichas correctamente, con la primera letra en mayúscula. */
  phrases: string[];
  weakWords: string[];
  /** Se llegó al final de la conversación (no se colgó antes). */
  completed: boolean;
  /** Cuenta para la estadística de llamadas. */
  counted: boolean;
};

export type CallState = {
  topic: DialogueTopic;
  /** `ringing` suena; `active` en curso; `ended` terminó con resumen; `cancelled` se colgó antes de conectar. */
  phase: 'ringing' | 'active' | 'ended' | 'cancelled';
  startedAtMs: number;
  turn: number;
  retries: number;
  phrases: string[];
  weakWords: string[];
  firstTry: number;
  later: number;
  gaveUp: number;
  aiExchanges: number;
  ai: { enabled: boolean; failed: boolean };
  history: DialogueMessage[];
  /** Qué espera el motor ahora: la respuesta del estudiante o la del agente de IA. */
  awaiting: 'answer' | 'agent' | null;
  /** Último texto del estudiante que no valió. */
  lastHeard: string;
  hintVisible: boolean;
  summary: CallSummary | null;
};

export type CallInput =
  /** Terminó de sonar y Nova contesta. */
  | { type: 'connected'; nowMs: number }
  /** El estudiante respondió (por voz, con varias alternativas, o por texto con una). */
  | { type: 'heard'; alternatives: readonly string[]; nowMs: number }
  /** No se oyó nada a tiempo. */
  | { type: 'silence'; nowMs: number }
  | { type: 'agent-reply'; text: string; nowMs: number }
  | { type: 'agent-error'; nowMs: number }
  | { type: 'hangup'; nowMs: number };

/**
 * Lo que el motor pide al exterior, para ejecutarlo en orden y esperando a que cada voz termine.
 * Si la llamada termina, hay que descartar los efectos que queden pendientes y cortar la voz.
 */
export type CallEffect =
  | { kind: 'say'; text: string; expression: Expression; rate?: number }
  | { kind: 'listen' }
  | { kind: 'show-hint'; text: string }
  | { kind: 'hide-hint' }
  | { kind: 'sound'; sound: SoundEffect }
  | { kind: 'ask-agent'; topicId: string; history: DialogueMessage[]; userText: string }
  /** Aviso a la persona; el código lo traduce la interfaz. */
  | { kind: 'notice'; code: 'ai-unavailable' }
  | { kind: 'record'; event: PendingEvent };

export type CallStep = { state: CallState; effects: CallEffect[] };

const unchanged = (state: CallState): CallStep => ({ state, effects: [] });
const say = (text: string, expression: Expression, rate?: number): CallEffect =>
  rate === undefined ? { kind: 'say', text, expression } : { kind: 'say', text, expression, rate };
const capitalize = (s: string) => {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** La frase modelo de la pista: lo que va entre comillas, sin puntos suspensivos ni paréntesis. */
export function hintPhrase(hint: string): string {
  const quoted = /"([^"]+)"/.exec(hint);
  if (!quoted) return '';
  return quoted[1]!
    .replace(/…/g, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
}

/** Prepara una llamada que está sonando. */
export function startCall(topic: DialogueTopic, options: { ai?: boolean } = {}): CallStep {
  const state: CallState = {
    topic,
    phase: 'ringing',
    startedAtMs: 0,
    turn: 0,
    retries: 0,
    phrases: [],
    weakWords: [],
    firstTry: 0,
    later: 0,
    gaveUp: 0,
    aiExchanges: 0,
    ai: { enabled: options.ai === true, failed: false },
    history: [],
    awaiting: null,
    lastHeard: '',
    hintVisible: false,
    summary: null,
  };
  return { state, effects: [{ kind: 'sound', sound: 'ring' }] };
}

const usesAi = (s: CallState) => s.ai.enabled && !s.ai.failed;

/** Nova hace la pregunta del turno actual y se queda escuchando. */
function ask(state: CallState, before: CallEffect[] = []): CallStep {
  const turn = state.topic.turns[state.turn]!;
  return {
    state: { ...state, awaiting: 'answer' },
    effects: [...before, say(turn.nova, 'neutral'), { kind: 'listen' }],
  };
}

function fluencyOf(s: CallState): number {
  if (usesAi(s)) return Math.min(100, 50 + s.aiExchanges * 5);
  const attempted = s.firstTry + s.later + s.gaveUp;
  return attempted > 0 ? Math.round((100 * (s.firstTry + 0.6 * s.later)) / attempted) : 0;
}

function labelOf(fluency: number, attempted: number): FluencyLabel {
  if (fluency >= 85) return 'excellent';
  if (fluency >= 60) return 'good';
  return attempted > 0 ? 'practice' : 'no-data';
}

/** Cuelga: calcula el resumen y registra la llamada. */
function end(
  state: CallState,
  nowMs: number,
  completed: boolean,
  before: CallEffect[] = [],
): CallStep {
  const durationSec = Math.round((nowMs - state.startedAtMs) / 1000);
  const aiExchanges = usesAi(state) ? state.aiExchanges : 0;
  const score = scoreCall({
    firstTry: state.firstTry,
    later: state.later,
    gaveUp: state.gaveUp,
    aiExchanges,
    completed,
    durationSec,
  });
  const fluency = fluencyOf(state);
  const attempted = state.firstTry + state.later + state.gaveUp;
  const summary: CallSummary = {
    durationSec,
    xp: score.xp,
    fluency,
    label: labelOf(fluency, attempted),
    phrases: state.phrases,
    weakWords: state.weakWords,
    completed,
    counted: score.counted,
  };
  const effects: CallEffect[] = [
    ...before,
    { kind: 'sound', sound: 'hangup' },
    {
      kind: 'record',
      event: {
        type: 'call_completed@1',
        payload: {
          topicId: state.topic.id,
          durationSec,
          completed,
          firstTry: state.firstTry,
          later: state.later,
          gaveUp: state.gaveUp,
          weakWords: state.weakWords,
          aiExchanges,
        },
      },
    },
  ];
  if (completed) effects.push({ kind: 'sound', sound: 'win' });
  return { state: { ...state, phase: 'ended', awaiting: null, summary }, effects };
}

function connected(state: CallState, nowMs: number): CallStep {
  const started: CallState = { ...state, phase: 'active', startedAtMs: nowMs };
  if (usesAi(started)) {
    return {
      state: { ...started, awaiting: 'answer' },
      effects: [say(state.topic.intro + NOVA_LINES.aiOpening, 'surprised'), { kind: 'listen' }],
    };
  }
  return ask(started, [say(state.topic.intro, 'surprised')]);
}

function onAiAnswer(state: CallState, text: string): CallStep {
  return {
    state: {
      ...state,
      awaiting: 'agent',
      aiExchanges: state.aiExchanges + 1,
      firstTry: state.firstTry + 1,
      phrases: [...state.phrases, capitalize(text)],
      lastHeard: text,
    },
    effects: [
      { kind: 'ask-agent', topicId: state.topic.id, history: state.history, userText: text },
    ],
  };
}

function success(state: CallState, hit: string, nowMs: number): CallStep {
  const turn = state.topic.turns[state.turn]!;
  const first = state.retries === 0;
  const next: CallState = {
    ...state,
    firstTry: state.firstTry + (first ? 1 : 0),
    later: state.later + (first ? 0 : 1),
    phrases: [...state.phrases, capitalize(hit)],
    retries: 0,
    turn: state.turn + 1,
    hintVisible: false,
    awaiting: null,
  };
  const before: CallEffect[] = [
    ...(state.hintVisible ? [{ kind: 'hide-hint' } as const] : []),
    { kind: 'sound', sound: 'ok' },
  ];
  if (next.turn >= state.topic.turns.length) {
    return end(next, nowMs, true, [
      ...before,
      say(`${turn.comment} ${state.topic.outro}`, 'happy'),
    ]);
  }
  return ask(next, [...before, say(turn.comment, 'smirk')]);
}

function failure(state: CallState, heard: string, nowMs: number): CallStep {
  const turn = state.topic.turns[state.turn]!;
  const retries = state.retries + 1;
  const base: CallState = { ...state, retries, lastHeard: heard, awaiting: 'answer' };

  if (retries === 1) {
    return {
      state: base,
      effects: [
        say(heard ? NOVA_LINES.slowAfterWrong : NOVA_LINES.slowAfterSilence, 'think'),
        say(turn.nova, 'neutral', SLOW_RATE),
        { kind: 'listen' },
      ],
    };
  }
  if (retries === 2) {
    const phrase = hintPhrase(turn.hint);
    return {
      state: { ...base, hintVisible: true },
      effects: [
        { kind: 'show-hint', text: turn.hint },
        say(NOVA_LINES.hintIntro + (phrase ? NOVA_LINES.hintTry + phrase : ''), 'smirk', HINT_RATE),
        { kind: 'listen' },
      ],
    };
  }

  // Tercer intento fallido: se anotan las palabras que no dijo y se sigue.
  const said = normalizeText(heard).split(' ');
  const weak = [...state.weakWords];
  for (const raw of hintPhrase(turn.hint).split(/\s+/)) {
    const w = normalizeText(raw);
    if (w.length > 2 && !STOP_WORDS.has(w) && !said.includes(w) && !weak.includes(w)) weak.push(w);
  }
  const next: CallState = {
    ...state,
    weakWords: weak,
    gaveUp: state.gaveUp + 1,
    retries: 0,
    turn: state.turn + 1,
    hintVisible: false,
    lastHeard: heard,
    awaiting: null,
  };
  const before: CallEffect[] = state.hintVisible ? [{ kind: 'hide-hint' }] : [];
  if (next.turn >= state.topic.turns.length) {
    return end(next, nowMs, true, [
      ...before,
      say(NOVA_LINES.giveUpLast + state.topic.outro, 'happy'),
    ]);
  }
  return ask(next, [...before, say(NOVA_LINES.giveUp, 'happy')]);
}

function heard(state: CallState, alternatives: readonly string[], nowMs: number): CallStep {
  const texts = alternatives.map((a) => a.trim()).filter((a) => a.length > 0);
  // Una respuesta vacía no cuenta: se vuelve a escuchar.
  if (texts.length === 0) return { state, effects: [{ kind: 'listen' }] };
  if (usesAi(state)) return onAiAnswer({ ...state, awaiting: null }, texts[0]!);
  const turn = state.topic.turns[state.turn]!;
  const hit = texts.find((t) => matchesTurn(t, turn));
  return hit !== undefined ? success(state, hit, nowMs) : failure(state, texts[0]!, nowMs);
}

function onAgentReply(state: CallState, text: string, nowMs: number): CallStep {
  const history: DialogueMessage[] = [
    ...state.history,
    { role: 'user', text: state.lastHeard },
    { role: 'nova', text },
  ];
  const next: CallState = { ...state, history, awaiting: null };
  if (next.aiExchanges >= AI_MAX_EXCHANGES) {
    return end(next, nowMs, true, [say(text, 'smirk'), say(NOVA_LINES.aiFarewell, 'happy')]);
  }
  return {
    state: { ...next, awaiting: 'answer' },
    effects: [say(text, 'smirk'), { kind: 'listen' }],
  };
}

/** El agente de IA falló: se sigue con el guion del tema desde el principio. */
function onAgentError(state: CallState): CallStep {
  const reset: CallState = {
    ...state,
    ai: { ...state.ai, failed: true },
    aiExchanges: 0,
    phrases: [],
    firstTry: 0,
    history: [],
    turn: 0,
    retries: 0,
  };
  return ask(reset, [{ kind: 'notice', code: 'ai-unavailable' }]);
}

/**
 * Máquina pura de la llamada: recibe una entrada y devuelve el nuevo estado y los efectos.
 * Una entrada que no corresponde al momento actual se ignora (nunca lanza).
 */
export function stepCall(state: CallState, input: CallInput): CallStep {
  if (state.phase === 'ended' || state.phase === 'cancelled') return unchanged(state);

  if (input.type === 'hangup') {
    if (state.phase === 'ringing') return { state: { ...state, phase: 'cancelled' }, effects: [] };
    return end(state, input.nowMs, false);
  }
  if (input.type === 'connected')
    return state.phase === 'ringing' ? connected(state, input.nowMs) : unchanged(state);
  if (state.phase !== 'active') return unchanged(state);

  switch (input.type) {
    case 'heard':
      return state.awaiting === 'answer'
        ? heard(state, input.alternatives, input.nowMs)
        : unchanged(state);
    case 'silence':
      if (state.awaiting !== 'answer') return unchanged(state);
      return usesAi(state)
        ? { state, effects: [{ kind: 'listen' }] }
        : failure(state, '', input.nowMs);
    case 'agent-reply':
      return state.awaiting === 'agent'
        ? onAgentReply(state, input.text, input.nowMs)
        : unchanged(state);
    case 'agent-error':
      return state.awaiting === 'agent' ? onAgentError(state) : unchanged(state);
  }
}

/** Turno que se está tratando de responder, si la llamada sigue en curso con guion. */
export function currentTurn(state: CallState) {
  return state.phase === 'active' && !usesAi(state) ? state.topic.turns[state.turn] : undefined;
}
