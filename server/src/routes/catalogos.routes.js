import { Router } from 'express';
import { pool } from '../db.js';
import { loadUser } from '../middleware/auth.js';
import { docenteAsignadoACurso } from '../utils/alcance.js';

const router = Router();

router.use(loadUser);

// Catalogo de roles
router.get('/roles', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM rol ORDER BY id');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Catalogo de estados
router.get('/estados', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM estado ORDER BY id');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Catalogo de cursos (un docente solo ve los cursos que tiene asignados)
router.get('/cursos', async (req, res, next) => {
  try {
    const [rows] = req.user.rol === 'Docente'
      ? await pool.query(
        `SELECT DISTINCT c.id, c.grado
         FROM curso c
         JOIN usuario_curso_vigencia ucv ON ucv.id_curso = c.id
         WHERE ucv.id_usuario = ?
         ORDER BY c.id`,
        [req.user.id]
      )
      : await pool.query('SELECT id, grado FROM curso ORDER BY id');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Catalogo de vigencias
router.get('/vigencias', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, fecha_inicio, fecha_fin FROM vigencia ORDER BY id DESC');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Estudiantes matriculados en un curso durante una vigencia
router.get('/estudiantes-por-curso', async (req, res, next) => {
  try {
    const { id_curso, id_vigencia } = req.query;
    if (!id_curso || !id_vigencia) {
      return res.status(400).json({ error: 'Seleccione el curso y la vigencia' });
    }
    if (req.user.rol === 'Docente' && !(await docenteAsignadoACurso(req.user.id, id_curso, id_vigencia))) {
      return res.status(403).json({ error: 'No tiene asignado el curso seleccionado' });
    }
    const [rows] = await pool.query(
      `SELECT u.id, u.identificacion, u.nombre, u.apellido
       FROM usuario_curso_vigencia ucv
       JOIN usuario u ON u.id = ucv.id_usuario
       WHERE ucv.id_curso = ? AND ucv.id_vigencia = ? AND u.id_rol = 3
       ORDER BY u.apellido, u.nombre`,
      [id_curso, id_vigencia]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Estudiantes a cargo de un acudiente autenticado
router.get('/mis-acudidos', async (req, res, next) => {
  try {
    if (req.user.rol !== 'Acudiente') {
      return res.status(403).json({ error: 'Solo un acudiente puede consultar sus acudidos' });
    }
    const [rows] = await pool.query(
      `SELECT u.id, u.identificacion, u.nombre, u.apellido
       FROM acudiente_estudiante ae
       JOIN usuario u ON u.id = ae.id_estudiante
       WHERE ae.id_acudiente = ?
       ORDER BY u.apellido, u.nombre`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
