import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { loadUser } from '../middleware/auth.js';

const router = Router();

// Hash valido que no corresponde a ninguna clave: iguala el tiempo de respuesta
// cuando el usuario no existe y evita revelar que cuentas existen.
const HASH_SIN_USUARIO = bcrypt.hashSync('sin-usuario', 10);

const limitarIntentosLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos, intente de nuevo en unos minutos' }
});

/**
 * POST /api/auth/login
 * Autenticacion basica para el prototipo academico: la contrasena se
 * verifica contra el hash bcrypt guardado en la tabla usuario (RNF-01).
 * Devuelve los datos del usuario y su rol; el frontend los guarda
 * localmente y los reenvia en el encabezado x-user-id en cada peticion.
 */
router.post('/login', limitarIntentosLogin, async (req, res, next) => {
  try {
    const { usuario, contrasena } = req.body;
    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    if (typeof usuario !== 'string' || typeof contrasena !== 'string') {
      return res.status(400).json({ error: 'Usuario y contraseña deben ser texto' });
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.apellido, u.email, u.contrasena, u.id_estado, u.id_rol, r.nombre AS rol
       FROM usuario u
       JOIN rol r ON r.id = u.id_rol
       WHERE u.usuario = ?`,
      [usuario]
    );

    const coincide = await bcrypt.compare(contrasena, rows[0]?.contrasena ?? HASH_SIN_USUARIO);
    if (!rows.length || !coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (rows[0].id_estado !== 1) {
      return res.status(403).json({ error: 'Usuario bloqueado, contacte al administrador' });
    }

    const { contrasena: _omit, ...usuarioSeguro } = rows[0];
    res.json(usuarioSeguro);
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/auth/me
 * Permite al frontend validar la sesion guardada localmente.
 */
router.get('/me', loadUser, (req, res) => {
  res.json(req.user);
});

export default router;
