import { seedDialogues } from '@linguapop/content';
import { describe, expect, it } from 'vitest';
import texto from '../../fixtures/texto.json';
import { matchesTurn } from './index';

// Los turnos del contenido semilla deben ser exactamente los que usó la versión heredada.
describe('turnos de Nova del contenido semilla frente a los casos de referencia', () => {
  it.each(texto.respuestasNova)('$tema, turno $turno: "$texto"', (c) => {
    const tema = seedDialogues.find((d) => d.title === c.tema);
    expect(tema, `tema ${c.tema}`).toBeDefined();
    const turno = tema!.turns[c.turno - 1]!;
    expect(turno.accepted).toEqual(c.giro.accepted);
    expect(turno.rejectWords).toEqual(c.giro.rejectWords);
    expect(turno.requiredPattern).toEqual(c.giro.requiredPattern);
    expect(matchesTurn(c.texto, turno)).toBe(c.esperado);
  });
});
