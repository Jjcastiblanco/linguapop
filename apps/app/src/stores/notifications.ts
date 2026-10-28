import { dayKey, type ProgressState } from '@linguapop/domain';
import type { Composition } from '../composition';
import { t } from '../i18n';
import type { CallStore } from './call-store';
import type { LessonSessionStore } from './lesson-session-store';
import type { ToastStore } from './toast-store';

/**
 * Avisos que nacen de un evento recién registrado: meta diaria cumplida, logros desbloqueados y
 * protector de racha usado. Compara el progreso de antes con el de después; cargar, importar o
 * borrar el progreso no pasa por aquí y nunca avisa.
 */
export function notifyProgress(
  c: Composition,
  toast: ToastStore,
  prev: ProgressState,
  next: ProgressState,
): void {
  const show = toast.getState().show;
  const today = dayKey(c.clock.now(), next.settings.timeZone);
  const before = prev.xpByDay[today] ?? 0;
  const after = next.xpByDay[today] ?? 0;
  const goal = next.settings.dailyGoalXp;
  // Solo cuenta si el XP subió: bajar la meta en Ajustes no es "cumplirla".
  if (after > before && before < goal && after >= goal) show(t('toast.goal'));

  for (const id of Object.keys(next.achievements)) {
    if (id in prev.achievements) continue;
    const achievement = c.course.achievements.find((a) => a.id === id);
    if (achievement)
      show(t('toast.achievement', { icon: achievement.icon, name: achievement.name }));
  }

  // Comprar un protector lo deja libre (mes vacío): eso no es usarlo.
  const month = next.streak.shieldMonth;
  if (month !== '' && month !== prev.streak.shieldMonth) show(t('toast.shield'));
}

/**
 * Avisos que no dependen del progreso: la app quedó instalada y el navegador no puede hablar
 * (una sola vez, al empezar una lección o una llamada).
 */
export function startNotifications(
  c: Composition,
  toast: ToastStore,
  lesson: LessonSessionStore,
  call: CallStore,
): void {
  const show = toast.getState().show;
  c.install.onInstalled(() => show(t('toast.installed')));

  let warnedNoVoice = false;
  const warnIfMute = () => {
    if (warnedNoVoice || c.speech.capabilities().canSpeak) return;
    warnedNoVoice = true;
    show(t('toast.novoice'));
  };
  lesson.subscribe((state, prev) => {
    if (state.lesson && !prev.lesson) warnIfMute();
  });
  call.subscribe((state, prev) => {
    if (state.call && !prev.call) warnIfMute();
  });
}
