import type { Achievement } from '@linguapop/content';
import { ProgressEventSchema, type ProgressEvent } from '../events';
import { ACHIEVEMENT_GEM_BONUS, dailyGoalBonus, scoreCall, scoreSession } from '../scoring';
import { dayKey, monthKey, registerActivity, type DayKey } from '../streak';
import {
  MAX_HEARTS,
  MAX_PENDING_ERRORS,
  PRICES,
  WORD_EXERCISE_PREFIX,
  initialProgress,
  type ProgressState,
} from './state';

/** Lo que el pliegue necesita saber del contenido: la estructura de las unidades y los logros. */
export type ProgressContext = {
  units: ReadonlyArray<{ id: string; lessonIds: readonly string[] }>;
  achievements: readonly Achievement[];
};

const eventDay = (state: ProgressState, event: ProgressEvent): DayKey =>
  dayKey(Date.parse(event.occurredAt), state.settings.timeZone);

/** Al empezar un día nuevo las vidas se recargan. */
function refreshHearts(state: ProgressState, day: DayKey): ProgressState {
  return state.heartsDay === day ? state : { ...state, hearts: MAX_HEARTS, heartsDay: day };
}

/** Suma XP al día y paga el bono de gemas si cruza la meta diaria. */
function addXp(state: ProgressState, day: DayKey, amount: number): ProgressState {
  const before = state.xpByDay[day] ?? 0;
  return {
    ...state,
    xp: state.xp + amount,
    gems: state.gems + dailyGoalBonus(before, amount, state.settings.dailyGoalXp),
    xpByDay: { ...state.xpByDay, [day]: before + amount },
  };
}

function unitsCompleted(state: ProgressState, ctx: ProgressContext): number {
  return ctx.units.filter((u) => (state.lessonsDone[u.id] ?? 0) >= u.lessonIds.length).length;
}

function statValue(
  stat: Achievement['condition']['stat'],
  state: ProgressState,
  ctx: ProgressContext,
  day: DayKey,
): number {
  switch (stat) {
    case 'lessons':
      return state.stats.lessons;
    case 'streak':
      return state.streak.streak;
    case 'xp':
      return state.xp;
    case 'perfectLessons':
      return state.stats.perfect;
    case 'unitsCompleted':
      return unitsCompleted(state, ctx);
    case 'calls':
      return state.stats.calls;
    case 'correctAnswers':
      return state.stats.correct;
    case 'gems':
      return state.gems;
    case 'dailyGoalReached':
      return (state.xpByDay[day] ?? 0) >= state.settings.dailyGoalXp ? 1 : 0;
    case 'timedBest':
      return state.stats.timedBest;
  }
}

/** Desbloquea los logros cumplidos, en orden; cada uno paga su bono, que puede desbloquear el siguiente. */
function unlockAchievements(
  state: ProgressState,
  ctx: ProgressContext,
  day: DayKey,
  at: string,
): ProgressState {
  let next = state;
  for (const a of ctx.achievements) {
    if (next.achievements[a.id]) continue;
    if (statValue(a.condition.stat, next, ctx, day) >= a.condition.atLeast) {
      next = {
        ...next,
        gems: next.gems + ACHIEVEMENT_GEM_BONUS,
        achievements: { ...next.achievements, [a.id]: at },
      };
    }
  }
  return next;
}

function addError(state: ProgressState, exerciseId: string): ProgressState {
  if (exerciseId.startsWith(WORD_EXERCISE_PREFIX)) {
    const word = exerciseId.slice(WORD_EXERCISE_PREFIX.length);
    return { ...state, words: { ...state.words, [word]: (state.words[word] ?? 0) + 1 } };
  }
  let errors = state.errors.includes(exerciseId) ? state.errors : [...state.errors, exerciseId];
  if (errors.length > MAX_PENDING_ERRORS) errors = errors.slice(errors.length - MAX_PENDING_ERRORS);
  return {
    ...state,
    errors,
    weak: { ...state.weak, [exerciseId]: (state.weak[exerciseId] ?? 0) + 1 },
  };
}

function removeError(state: ProgressState, exerciseId: string): ProgressState {
  if (exerciseId.startsWith(WORD_EXERCISE_PREFIX)) {
    const { [exerciseId.slice(WORD_EXERCISE_PREFIX.length)]: _quitada, ...words } = state.words;
    return { ...state, words };
  }
  return { ...state, errors: state.errors.filter((e) => e !== exerciseId) };
}

type Of<T extends ProgressEvent['type']> = Extract<ProgressEvent, { type: T }>;

function onExerciseAnswered(
  state: ProgressState,
  e: Of<'exercise_answered@1'>,
  day: DayKey,
): ProgressState {
  const s = refreshHearts(state, day);
  const { exerciseId, correct, mode, skipped } = e.payload;
  if (skipped) return s;
  if (correct) return mode === 'review' ? removeError(s, exerciseId) : s;
  const failed = addError(s, exerciseId);
  const losesHeart = failed.settings.plan === 'free' && mode !== 'timed';
  return losesHeart ? { ...failed, hearts: Math.max(0, failed.hearts - 1) } : failed;
}

function onSessionCompleted(
  state: ProgressState,
  e: Of<'session_completed@1'>,
  ctx: ProgressContext,
  day: DayKey,
): ProgressState {
  const p = e.payload;
  const unit = ctx.units.find((u) => u.id === p.unitId);
  const lessonIndex = unit && p.lessonId ? unit.lessonIds.indexOf(p.lessonId) : -1;
  const done = unit ? (state.lessonsDone[unit.id] ?? 0) : 0;
  const score = scoreSession({
    mode: p.mode,
    correct: p.correct,
    wrong: p.wrong,
    answered: p.answered,
    outOfHearts: p.outOfHearts,
    isReplay: p.mode === 'lesson' && lessonIndex >= 0 && lessonIndex < done,
  });

  let s = refreshHearts(state, day);
  const stats = {
    ...s.stats,
    correct: s.stats.correct + p.correct,
    total: s.stats.total + p.answered,
    seconds: s.stats.seconds + p.durationSec,
  };
  const lessonsDone = { ...s.lessonsDone };

  if (!p.outOfHearts) {
    if (p.mode === 'lesson') {
      stats.lessons += 1;
      if (score.perfect) stats.perfect += 1;
      if (unit && lessonIndex === done) lessonsDone[unit.id] = done + 1;
    } else if (p.mode === 'review' || p.mode === 'practice') {
      stats.lessons += 1;
    } else if (p.mode === 'timed') {
      stats.timedBest = Math.max(stats.timedBest, p.correct);
    } else if (p.mode === 'test' && score.passed && unit) {
      const upTo = ctx.units.findIndex((u) => u.id === unit.id);
      ctx.units.slice(0, upTo + 1).forEach((u) => (lessonsDone[u.id] = u.lessonIds.length));
    }
  }

  s = { ...s, stats, lessonsDone, gems: s.gems + score.gems };
  s = addXp(s, day, score.xp);
  s = { ...s, streak: registerActivity(s.streak, day, s.settings.plan).state };
  return unlockAchievements(s, ctx, day, e.occurredAt);
}

function onChestOpened(
  state: ProgressState,
  e: Of<'chest_opened@1'>,
  ctx: ProgressContext,
  day: DayKey,
): ProgressState {
  const { unitId, gems, xp } = e.payload;
  const unit = ctx.units.find((u) => u.id === unitId);
  const complete = unit !== undefined && (state.lessonsDone[unitId] ?? 0) >= unit.lessonIds.length;
  if (!complete || state.chestsOpened.includes(unitId)) return state; // solo se abre una vez y con la unidad completa
  let s = refreshHearts(state, day);
  s = addXp({ ...s, gems: s.gems + gems, chestsOpened: [...s.chestsOpened, unitId] }, day, xp);
  return unlockAchievements(s, ctx, day, e.occurredAt);
}

function onCallCompleted(
  state: ProgressState,
  e: Of<'call_completed@1'>,
  ctx: ProgressContext,
  day: DayKey,
): ProgressState {
  const p = e.payload;
  const score = scoreCall(p);
  let s = refreshHearts(state, day);
  const words = { ...s.words };
  for (const w of p.weakWords) words[w] = (words[w] ?? 0) + 1;
  s = {
    ...s,
    words,
    stats: {
      ...s.stats,
      calls: s.stats.calls + (score.counted ? 1 : 0),
      callSeconds: s.stats.callSeconds + p.durationSec,
    },
  };
  s = addXp(s, day, score.xp);
  s = { ...s, streak: registerActivity(s.streak, day, s.settings.plan).state };
  return unlockAchievements(s, ctx, day, e.occurredAt);
}

function onSettingsChanged(state: ProgressState, e: Of<'settings_changed@1'>): ProgressState {
  const p = e.payload;
  const settings = {
    dailyGoalXp: p.dailyGoalXp ?? state.settings.dailyGoalXp,
    plan: p.plan ?? state.settings.plan,
    timeZone: p.timeZone ?? state.settings.timeZone,
    displayName: p.displayName ?? state.settings.displayName,
  };
  return { ...state, settings };
}

/** Una compra inválida (precio distinto, sin gemas o sin necesidad) no cambia nada. */
function onPurchase(state: ProgressState, e: Of<'purchase@1'>, day: DayKey): ProgressState {
  const { item, costGems } = e.payload;
  const s = refreshHearts(state, day);
  if (costGems !== PRICES[item] || s.gems < costGems) return s;
  if (item === 'hearts') {
    return s.hearts >= MAX_HEARTS ? s : { ...s, gems: s.gems - costGems, hearts: MAX_HEARTS };
  }
  // El protector de racha solo se repone si ya se usó este mes.
  if (s.streak.shieldMonth !== monthKey(day)) return s;
  return { ...s, gems: s.gems - costGems, streak: { ...s.streak, shieldMonth: '' } };
}

/**
 * Suma el progreso heredado al actual (AD-15). Es aditivo para que el orden de llegada no importe:
 * XP, gemas y estadísticas se suman, lo completado se une y la racha toma la más reciente. No
 * paga bonos: las gemas heredadas ya los incluyen.
 */
function onLegacyImported(state: ProgressState, e: Of<'legacy_imported@1'>): ProgressState {
  const p = e.payload;
  const sum = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const lessonsDone = { ...state.lessonsDone };
  for (const [unit, n] of Object.entries(p.lessonsDone)) {
    lessonsDone[unit] = Math.max(lessonsDone[unit] ?? 0, n);
  }
  const mine = state.streak;
  const theirs = p.streak;
  const streak =
    theirs.lastDay > mine.lastDay
      ? { ...theirs, best: Math.max(theirs.best, mine.best) }
      : { ...mine, best: Math.max(theirs.best, mine.best) };
  const start = initialProgress();
  return {
    ...state,
    xp: state.xp + p.xp,
    gems: Math.max(0, state.gems + p.gems - start.gems),
    lessonsDone,
    chestsOpened: [...new Set([...state.chestsOpened, ...p.chestsOpened])],
    stats: {
      lessons: state.stats.lessons + p.stats.lessons,
      correct: state.stats.correct + p.stats.correct,
      total: state.stats.total + p.stats.total,
      perfect: state.stats.perfect + p.stats.perfect,
      timedBest: Math.max(state.stats.timedBest, p.stats.timedBest),
      calls: state.stats.calls + p.stats.calls,
      seconds: state.stats.seconds + p.stats.seconds,
      callSeconds: state.stats.callSeconds + p.stats.callSeconds,
    },
    streak,
    xpByDay: sum(state.xpByDay, p.xpByDay),
    words: sum(state.words, p.words),
    achievements: { ...p.achievements, ...state.achievements },
    settings: {
      ...state.settings,
      displayName:
        state.settings.displayName === start.settings.displayName && p.displayName
          ? p.displayName
          : state.settings.displayName,
      dailyGoalXp:
        state.settings.dailyGoalXp === start.settings.dailyGoalXp && p.dailyGoalXp
          ? p.dailyGoalXp
          : state.settings.dailyGoalXp,
    },
  };
}

/** Aplica un evento al estado. Pura: no modifica el estado recibido ni revisa ids repetidos. */
export function applyEvent(
  state: ProgressState,
  event: ProgressEvent,
  ctx: ProgressContext,
): ProgressState {
  const day = eventDay(state, event);
  switch (event.type) {
    case 'exercise_answered@1':
      return onExerciseAnswered(state, event, day);
    case 'session_completed@1':
      return onSessionCompleted(state, event, ctx, day);
    case 'chest_opened@1':
      return onChestOpened(state, event, ctx, day);
    case 'call_completed@1':
      return onCallCompleted(state, event, ctx, day);
    case 'settings_changed@1':
      return onSettingsChanged(state, event);
    case 'purchase@1':
      return onPurchase(state, event, day);
    case 'legacy_imported@1':
      return onLegacyImported(state, event);
  }
}

export type FoldOptions = {
  /** Estado desde el que se empieza; por defecto, el inicial. */
  initial?: ProgressState;
  /** Eventos que el servidor rechazó (AD-7): no cuentan. */
  rejectedIds?: ReadonlySet<string>;
};

/**
 * Reconstruye el estado plegando eventos. Es idempotente (un id repetido cuenta una vez)
 * y no depende del orden de llegada: ordena por fecha y desempata por id.
 */
export function foldEvents(
  events: readonly ProgressEvent[],
  ctx: ProgressContext,
  options: FoldOptions = {},
): ProgressState {
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id) || options.rejectedIds?.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  unique.sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || (a.id < b.id ? -1 : 1),
  );
  return unique.reduce((s, e) => applyEvent(s, e, ctx), options.initial ?? initialProgress());
}

/** Conserva solo los eventos que este cliente conoce; ignora tipos o versiones desconocidos. */
export function parseKnownEvents(raw: readonly unknown[]): ProgressEvent[] {
  const known: ProgressEvent[] = [];
  for (const item of raw) {
    const parsed = ProgressEventSchema.safeParse(item);
    if (parsed.success) known.push(parsed.data);
  }
  return known;
}
