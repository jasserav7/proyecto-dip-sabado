import { Router } from 'express';
import { pool } from '../db.js';
import { loadUser, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(loadUser, requireRole('Administrador'));

router.get('/', async (req, res, next) => {
  try {
    const { id_caso } = req.query;
    const condiciones = [];
    const valores = [];
    if (id_caso) {
      condiciones.push('a.id_caso = ?');
      valores.push(id_caso);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT a.id, a.id_caso, a.tipo_accion, a.detalle, a.fecha_hora,
              u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, r.nombre AS usuario_rol
       FROM auditoria a
       JOIN usuario u ON u.id = a.id_usuario_responsable
       JOIN rol r ON r.id = u.id_rol
       ${where}
       ORDER BY a.fecha_hora DESC
       LIMIT 500`,
      valores
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
