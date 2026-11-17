import { useEffect, useRef } from 'react';
import { renderTurnstile, type TurnstileHandle } from '../composition/adapters/turnstile';

type Props = {
  siteKey: string;
  /** Cada vez que cambia, se pide un token nuevo (un token sirve una sola vez). */
  resetSignal: number;
  onToken: (token: string | null) => void;
  /** El widget no pudo cargar o falló; la pantalla decide qué avisar. */
  onUnavailable: () => void;
};

/** Verificación de Turnstile dentro de un formulario. No pinta nada propio: Cloudflare dibuja el widget. */
export function CaptchaWidget({ siteKey, resetSignal, onToken, onUnavailable }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<TurnstileHandle | null>(null);
  const callbacks = useRef({ onToken, onUnavailable });
  callbacks.current = { onToken, onUnavailable };
  const lastSignal = useRef(resetSignal);

  useEffect(() => {
    let cancelled = false;
    let mounted: TurnstileHandle | null = null;
    // Un widget ya cancelado (hoja cerrada, doble efecto de StrictMode) no debe tocar el estado de la pantalla.
    const live =
      <A extends unknown[]>(fn: (...a: A) => void) =>
      (...a: A) => {
        if (!cancelled) fn(...a);
      };
    void renderTurnstile(
      box.current!,
      siteKey,
      {
        onToken: live((t: string) => callbacks.current.onToken(t)),
        onClear: live(() => callbacks.current.onToken(null)),
        onError: live(() => callbacks.current.onUnavailable()),
      },
      () => cancelled,
    ).then((h) => {
      if (cancelled) return h?.remove();
      mounted = h;
      handle.current = h;
    });
    return () => {
      cancelled = true;
      mounted?.remove();
      handle.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (lastSignal.current === resetSignal) return;
    lastSignal.current = resetSignal;
    handle.current?.reset();
  }, [resetSignal]);

  return <div ref={box} data-testid="captcha" />;
}
