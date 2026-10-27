import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../composition/context';
import styles from './Confetti.module.css';

const COLORS = ['#ff7a1a', '#22b573', '#8b5cf6', '#2f8cff', '#ffc83a', '#ec4899'];
/** Cuánto vive la lluvia de confeti antes de quitarse (milisegundos). */
export const CONFETTI_LIFETIME_MS = 4200;

/** Lluvia de confeti para celebrar; desaparece sola y usa el azar de la composición. */
export function Confetti({ count = 50 }: { count?: number }) {
  const { composition } = useServices();
  const [visible, setVisible] = useState(true);
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: composition.random.next() * 100,
        duration: 1.6 + composition.random.next() * 1.8,
        delay: composition.random.next() * 0.5,
        color: COLORS[i % COLORS.length]!,
      })),
    [composition, count],
  );

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), CONFETTI_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div aria-hidden="true" data-testid="confetti">
      {pieces.map((p, i) => (
        <div
          key={i}
          className={styles.piece}
          style={{
            left: `${p.left}vw`,
            background: p.color,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
