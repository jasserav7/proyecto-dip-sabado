import { pool } from '../db.js';

/**
 * Autenticacion simplificada para el prototipo academico: el frontend
 * envia el id del usuario autenticado (obtenido al hacer login) en el
 * encabezado 'x-user-id'. Este middleware carga el usuario y su rol
 * desde la base de datos y lo deja disponible en req.user, de modo
 * que las rutas puedan aplicar control de acceso por rol.
 */
export async function loadUser(req, res, next) {
  try {
    const idUsuario = req.header('x-user-id');
    if (!idUsuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.apellido, u.id_estado, u.id_rol, r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id = u.id_rol
       WHERE u.id = ?`,
      [idUsuario]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    if (rows[0].id_estado !== 1) {
      return res.status(403).json({ error: 'Usuario bloqueado' });
    }

    req.user = rows[0];
    next();
  } catch (e) {
    next(e);
  }
}

/**
 * Restringe una ruta a uno o varios roles (por nombre).
 */
export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tiene permisos para esta acción' });
    }
    next();
  };
}
