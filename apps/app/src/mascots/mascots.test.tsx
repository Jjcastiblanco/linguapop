// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Fox, Nova, type FoxMood, type NovaExpression } from './index';

/** El texto del CSS (no el objeto de clases que devuelve el módulo) para comprobar qué declara. */
const css = (archivo: string) => readFileSync(new URL(archivo, import.meta.url), 'utf8');
const foxCss = css('./Fox.module.css');
const novaCss = css('./Nova.module.css');

const parte = (c: HTMLElement, nombre: string) => c.querySelector(`[data-part="${nombre}"]`);

describe('zorro', () => {
  it('tiene accesibilidad: una imagen con nombre, o se oculta si es adorno', () => {
    render(<Fox />);
    expect(screen.getByRole('img', { name: 'Zorro de LinguaPop' })).toBeInTheDocument();
    const { container } = render(<Fox decorative />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0]).not.toHaveAttribute('role');
  });

  it.each(['idle', 'happy', 'sad', 'celebrate'] as FoxMood[])(
    'el estado %s queda marcado en el dibujo',
    (mood) => {
      const { container } = render(<Fox mood={mood} />);
      expect(container.querySelector('svg')).toHaveAttribute('data-mood', mood);
    },
  );

  it('en reposo parpadea con los ojos abiertos y sonríe', () => {
    const { container } = render(<Fox mood="idle" />);
    expect(parte(container, 'eyes-open')).toBeInTheDocument();
    expect(parte(container, 'eyes-closed')).toBeNull();
    expect(parte(container, 'mouth-smile')).toBeInTheDocument();
    expect(parte(container, 'tear')).toBeNull();
    expect(parte(container, 'sparkles')).toBeNull();
  });

  it('feliz cierra los ojos en arco y abre la boca', () => {
    const { container } = render(<Fox mood="happy" />);
    expect(parte(container, 'eyes-closed')).toBeInTheDocument();
    expect(parte(container, 'eyes-open')).toBeNull();
    expect(parte(container, 'mouth-open')).toBeInTheDocument();
    expect(parte(container, 'sparkles')).toBeNull();
  });

  it('triste tiene cejas caídas, una lágrima y la boca hacia abajo', () => {
    const { container } = render(<Fox mood="sad" />);
    expect(parte(container, 'tear')).toBeInTheDocument();
    expect(parte(container, 'sad-details')).toBeInTheDocument();
    expect(parte(container, 'mouth-sad')).toBeInTheDocument();
    expect(parte(container, 'eyes-open')).toBeInTheDocument();
  });

  it('celebrando es feliz y suma chispas y estrellas', () => {
    const { container } = render(<Fox mood="celebrate" />);
    expect(parte(container, 'eyes-closed')).toBeInTheDocument();
    expect(parte(container, 'mouth-open')).toBeInTheDocument();
    expect(parte(container, 'sparkles')?.querySelectorAll('text')).toHaveLength(4);
  });

  it('cada estado con movimiento usa su clase de animación; el reposo no', () => {
    const clases = (mood: FoxMood) =>
      render(<Fox mood={mood} />)
        .container.querySelector('svg')!
        .getAttribute('class')!
        .split(' ');
    expect(clases('idle')).toHaveLength(1);
    expect(clases('happy')).toHaveLength(2);
    expect(clases('sad')).toHaveLength(2);
    expect(clases('celebrate')).toHaveLength(2);
    expect(new Set([...clases('happy'), ...clases('sad'), ...clases('celebrate')]).size).toBe(4);
  });

  it('el ancho y la clase se aplican al dibujo', () => {
    const { container } = render(<Fox width={90} className="extra" />);
    const svg = container.querySelector('svg')!;
    expect(svg.style.width).toBe('90px');
    expect(svg).toHaveClass('extra');
  });

  it('la cola se mueve y el CSS declara cada animación', () => {
    for (const nombre of ['blink', 'hop', 'droop', 'jump', 'wag']) {
      expect(foxCss, nombre).toContain(`@keyframes ${nombre}`);
    }
    expect(foxCss).toMatch(/\.happy\s*{[^}]*animation:\s*hop/);
    expect(foxCss).toMatch(/\.sad\s*{[^}]*animation:\s*droop/);
    expect(foxCss).toMatch(/\.celebrate\s*{[^}]*animation:\s*jump/);
  });

  it('respeta la preferencia de menos movimiento', () => {
    expect(foxCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  });
});

const EXPRESIONES: NovaExpression[] = ['neutral', 'smirk', 'happy', 'surprised', 'think'];

describe('Nova', () => {
  it('tiene accesibilidad: una imagen con nombre, o se oculta si es adorno', () => {
    render(<Nova />);
    expect(screen.getByRole('img', { name: 'Nova' })).toBeInTheDocument();
    const { container } = render(<Nova decorative />);
    expect(container.querySelectorAll('svg')[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(EXPRESIONES)('la expresión %s queda marcada en el dibujo', (expression) => {
    const { container } = render(<Nova expression={expression} />);
    expect(container.querySelector('svg')).toHaveAttribute('data-expr', expression);
  });

  it('empieza neutral y callada', () => {
    const { container } = render(<Nova />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('data-expr', 'neutral');
    expect(svg).toHaveAttribute('data-talking', 'false');
  });

  it('dibuja todas las bocas, las cejas, los ojos que parpadean y el pelo', () => {
    const { container } = render(<Nova />);
    for (const p of [
      'mouth-neutral',
      'mouth-smirk',
      'mouth-smile',
      'mouth-open',
      'mouth-talk',
      'eyes',
      'brow-left',
      'brow-right',
    ]) {
      expect(parte(container, p), p).toBeInTheDocument();
    }
  });

  it('al hablar alterna la boca; al callar vuelve a la expresión', () => {
    const { container, rerender } = render(<Nova expression="smirk" />);
    const svg = () => container.querySelector('svg')!;
    expect(svg()).not.toHaveClass(/talking/);
    rerender(<Nova expression="smirk" talking />);
    expect(svg()).toHaveAttribute('data-talking', 'true');
    expect(svg().getAttribute('class')).toMatch(/talking/);
    expect(svg()).toHaveAttribute('data-expr', 'smirk');
    rerender(<Nova expression="happy" />);
    expect(svg()).toHaveAttribute('data-talking', 'false');
    expect(svg()).toHaveAttribute('data-expr', 'happy');
  });

  it('el CSS muestra la boca de cada expresión', () => {
    expect(novaCss).toMatch(/\[data-expr='neutral'\] \.mNeutral/);
    expect(novaCss).toMatch(/\[data-expr='think'\] \.mNeutral/);
    expect(novaCss).toMatch(/\[data-expr='smirk'\] \.mSmirk/);
    expect(novaCss).toMatch(/\[data-expr='happy'\] \.mSmile/);
    expect(novaCss).toMatch(/\[data-expr='surprised'\] \.mOpen/);
  });

  it('el CSS mueve cejas y pupilas por expresión y anima el habla, el parpadeo y el balanceo', () => {
    expect(novaCss).toMatch(/\[data-expr='smirk'\] \.browR/);
    expect(novaCss).toMatch(/\[data-expr='think'\] \.pupil/);
    expect(novaCss).toMatch(/\[data-expr='surprised'\] \.pupil/);
    expect(novaCss).toMatch(/\.nova\.talking \.mTalk[^}]*animation:\s*talk/);
    for (const nombre of ['talk', 'blink', 'novabob', 'hairsway'])
      expect(novaCss, nombre).toContain(`@keyframes ${nombre}`);
  });

  it('respeta la preferencia de menos movimiento', () => {
    expect(novaCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none/);
  });

  it('no repite identificadores en el documento aunque haya varias Nova', () => {
    const { container } = render(
      <>
        <Nova />
        <Nova expression="happy" />
      </>,
    );
    expect(container.querySelectorAll('[id]')).toHaveLength(0);
  });
});
