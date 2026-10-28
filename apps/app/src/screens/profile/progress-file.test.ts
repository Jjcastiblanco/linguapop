import type { ProgressEvent } from '@linguapop/domain';
import { describe, expect, it } from 'vitest';
import { buildExport, parseImport } from './progress-file';

const evento: ProgressEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'settings_changed@1',
  occurredAt: '2026-10-28T12:00:00.000Z',
  contentVersion: 0,
  payload: { dailyGoalXp: 100 },
};

describe('archivo de progreso', () => {
  it('exportar e importar devuelve los mismos eventos', () => {
    expect(parseImport(buildExport([evento]))).toEqual([evento]);
  });

  it.each([
    ['JSON roto', '{no es json'],
    ['un número', '42'],
    ['null', 'null'],
    ['otra app', JSON.stringify({ app: 'otra', events: [evento] })],
    ['sin lista de eventos', JSON.stringify({ app: 'linguapop' })],
    ['lista vacía', JSON.stringify({ app: 'linguapop', events: [] })],
    ['eventos que no son del esquema', JSON.stringify({ app: 'linguapop', events: [{ x: 1 }] })],
  ])('rechaza %s', (_nombre, texto) => {
    expect(parseImport(texto)).toBeNull();
  });

  it('ignora los eventos desconocidos y conserva los válidos', () => {
    const texto = JSON.stringify({ app: 'linguapop', events: [{ x: 1 }, evento] });
    expect(parseImport(texto)).toEqual([evento]);
  });
});
