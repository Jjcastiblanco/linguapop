import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCourseTolerant, seedCourse } from '../packages/content/src';

// La migración que publica la semilla como snapshot v1 debe llevar un curso que esta app lee sin
// omitir nada. Si cambia el esquema del curso, esta prueba avisa antes de que llegue a Supabase.
const carpeta = 'supabase/migrations';
const archivo = readdirSync(carpeta).find((f) => f.endsWith('_contenido_semilla_v1.sql'));

describe('semilla publicada en la migración', () => {
  it('existe y publica el snapshot 1 del esquema 1 apuntado por latest', () => {
    expect(archivo).toBeDefined();
    const sql = readFileSync(`${carpeta}/${archivo}`, 'utf8');
    expect(sql).toMatch(/values \(1, 1, \$seed\$/);
    expect(sql).toMatch(/'published', now\(\)/);
    expect(sql).toMatch(/insert into public\.content_latest/);
  });

  it('su contenido es un curso válido, completo y del esquema que la app lee', () => {
    const sql = readFileSync(`${carpeta}/${archivo}`, 'utf8');
    const json = /\$seed\$(.*)\$seed\$/s.exec(sql)?.[1];
    const leido = parseCourseTolerant(JSON.parse(json!));
    expect(leido.ok && leido.skipped).toEqual([]);
    expect(leido.ok && leido.course.schemaVersion).toBe(seedCourse.schemaVersion);
  });
});
