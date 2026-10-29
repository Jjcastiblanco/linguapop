import type { ListenResult } from '@linguapop/domain';

type Unavailable = Extract<ListenResult, { kind: 'unavailable' }>['reason'];

/** Resultado del puerto para un fallo del plugin; `permanent` dice si desde aquí ya no se intenta más. */
export type ListenFailure = { result: ListenResult; permanent: boolean };

const unavailable = (reason: Unavailable, permanent: boolean): ListenFailure => ({
  result: { kind: 'unavailable', reason },
  permanent,
});

const SILENCE: ListenFailure = { result: { kind: 'silence' }, permanent: false };

/**
 * Traduce un rechazo de `SpeechRecognition.start()` a un resultado del puerto (AD-19, AD-20). El
 * plugin rechaza con el texto del error de Android (`No match`, `No speech input`, `Missing
 * permission`...) y con el código `UNAVAILABLE` cuando el teléfono no tiene servicio de
 * reconocimiento; también se aceptan los códigos `NO_MATCH` y `SPEECH_TIMEOUT` de su evento `error`.
 */
export function translateListenError(error: unknown): ListenFailure {
  const { code, message } = describe(error);
  const text = `${code} ${message}`;

  if (/NO_MATCH|SPEECH_TIMEOUT|no match|no speech input|stopped before final results/i.test(text)) {
    return SILENCE;
  }
  if (/missing permission|INSUFFICIENT_PERMISSIONS|insufficient permissions/i.test(text)) {
    return unavailable('not-allowed', true);
  }
  if (/UNAVAILABLE|UNIMPLEMENTED|not available|not supported/i.test(text)) {
    return unavailable('unsupported', true);
  }
  if (/\bAUDIO\b|audio recording error/i.test(text)) return unavailable('no-microphone', true);
  if (/network|server/i.test(text)) return unavailable('network', false);
  return unavailable('error', false);
}

function describe(error: unknown): { code: string; message: string } {
  if (typeof error === 'string') return { code: '', message: error };
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return {
      code: typeof code === 'string' ? code : '',
      message: typeof message === 'string' ? message : '',
    };
  }
  return { code: '', message: '' };
}
