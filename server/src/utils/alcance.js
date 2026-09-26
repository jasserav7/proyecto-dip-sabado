import { pool } from '../db.js';

export async function docenteAsignadoACurso(idDocente, idCurso, idVigencia) {
  const [rows] = await pool.query(
    'SELECT 1 FROM usuario_curso_vigencia WHERE id_usuario = ? AND id_curso = ? AND id_vigencia = ?',
    [idDocente, idCurso, idVigencia]
  );
  return rows.length > 0;
}

export async function docenteImparteAEstudiante(idDocente, idEstudiante) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM usuario_curso_vigencia e
     JOIN usuario_curso_vigencia d ON d.id_curso = e.id_curso AND d.id_vigencia = e.id_vigencia
     WHERE e.id_usuario = ? AND d.id_usuario = ?
     LIMIT 1`,
    [idEstudiante, idDocente]
  );
  return rows.length > 0;
}
