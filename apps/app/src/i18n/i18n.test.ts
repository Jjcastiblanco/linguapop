import { describe, expect, it } from 'vitest';
import { es } from './es';
import { t } from './index';

describe('catálogo de textos', () => {
  it('devuelve el texto en español de una clave', () => {
    expect(t('nav.learn')).toBe('Aprender');
    expect(t('app.name')).toBe('LinguaPop');
  });

  it('ninguna clave está vacía y todas las claves de navegación existen', () => {
    for (const [clave, texto] of Object.entries(es)) expect(texto.length, clave).toBeGreaterThan(0);
    for (const clave of ['nav.learn', 'nav.practice', 'nav.leagues', 'nav.profile'] as const) {
      expect(es[clave]).toBeDefined();
    }
  });

  it('reemplaza los marcadores con los parámetros, incluso números', () => {
    expect(t('learn.goal', { xp: 40, goal: 50 })).toBe('Meta diaria: 40/50 XP');
    expect(t('learn.unit', { n: 2 })).toBe('UNIDAD 2');
  });

  it('un marcador sin parámetro se deja visible y una clave sin marcadores no cambia', () => {
    expect(t('learn.unit')).toBe('UNIDAD {n}');
    expect(t('nav.learn', { n: 1 })).toBe('Aprender');
  });

  it('las pistas de sonido de hablar traen la palabra esperada y la oída', () => {
    expect(t('feedback.sound.b-v', { expected: 'very', heard: 'berry' })).toBe(
      'Se oyó «berry» en lugar de «very». La v se dice con los dientes de arriba sobre el labio de abajo, sin juntar los labios.',
    );
    expect(t('feedback.sound.long-short-i', { expected: 'sheep', heard: 'ship' })).toContain(
      'Se oyó «ship» en lugar de «sheep»',
    );
    expect(t('feedback.sound.word', { expected: 'thank', heard: 'banana' })).toBe(
      'Revisa la palabra «thank»: se oyó «banana».',
    );
  });
});
