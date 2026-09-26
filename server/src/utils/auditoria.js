import { pool } from '../db.js';

/**
 * Registra una entrada de auditoria. Se usa en creacion de casos,
 * consultas sensibles, cambios de estado, descargas y generacion de PDF,
 * tal como lo exige el documento de analisis del Proyecto B.
 */
export async function registrarAuditoria({ idCaso = null, idUsuarioResponsable, tipoAccion, detalle = null }) {
  await pool.query(
    'INSERT INTO auditoria (id_caso, id_usuario_responsable, tipo_accion, detalle) VALUES (?, ?, ?, ?)',
    [idCaso, idUsuarioResponsable, tipoAccion, detalle?.slice(0, 255) ?? null]
  );
}
