/**
 * Parser minimo de CSV (RFC 4180): soporta campos entre comillas dobles,
 * comillas escapadas (""), comas dentro de campos citados, y finales de
 * linea CRLF o LF. Se usa para la carga masiva de casos (server/src/routes/casos.routes.js)
 * porque no vale la pena traer una dependencia externa para esto.
 */
export function parseCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;
  const normalizado = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalizado.length; i++) {
    const c = normalizado[i];
    if (dentroComillas) {
      if (c === '"') {
        if (normalizado[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  // Descarta lineas completamente vacias (comunes al final del archivo)
  return filas.filter((f) => !(f.length === 1 && f[0].trim() === ''));
}
