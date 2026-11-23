// Lee un contenido de una carpeta con la misma forma que `packages/content/seed`:
//   curso.json            datos generales y el orden: { schemaVersion, from, to, level, units: [...], dialogues: [...] }
//   units/<nombre>.json   una unidad por archivo
//   dialogues/<nombre>.json
//   achievements.json, pairs.json, readings.json
// Devuelve datos crudos: quien los usa los valida con `validateContent`.
import fs from 'node:fs';
import path from 'node:path';

const leer = (archivo) => {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (error) {
    throw new Error(
      `No se pudo leer ${archivo}: ${error instanceof Error ? error.message : error}`,
    );
  }
};

export function cargarFuente(dir) {
  const { units = [], dialogues = [], ...cabecera } = leer(path.join(dir, 'curso.json'));
  const porNombre = (carpeta, nombres) =>
    nombres.map((nombre) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(nombre))
        throw new Error(`Nombre de archivo no válido: ${nombre}`);
      return leer(path.join(dir, carpeta, `${nombre}.json`));
    });
  const opcional = (nombre, vacio) =>
    fs.existsSync(path.join(dir, nombre)) ? leer(path.join(dir, nombre)) : vacio;
  return {
    course: {
      ...cabecera,
      units: porNombre('units', units),
      dialogues: porNombre('dialogues', dialogues),
      achievements: opcional('achievements.json', []),
    },
    readings: opcional('readings.json', []),
    pairs: opcional('pairs.json', []),
  };
}

/** Copia la semilla a una carpeta de trabajo para editarla sin tocar el repositorio. */
export function copiarSemilla(origen, destino) {
  if (fs.existsSync(destino) && fs.readdirSync(destino).length > 0) {
    throw new Error(`${destino} ya existe y no está vacía`);
  }
  fs.cpSync(origen, destino, { recursive: true });
}
