import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pool } from './db.js';
import authRouter from './routes/auth.routes.js';
import catalogosRouter from './routes/catalogos.routes.js';
import casosRouter from './routes/casos.routes.js';
import auditoriaRouter from './routes/auditoria.routes.js';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/catalogos', catalogosRouter);
app.use('/api/casos', casosRouter);
app.use('/api/auditoria', auditoriaRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejador global de errores: respuestas y codigos comunes, sin exponer detalles internos
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }
  if (err.type === 'archivo.invalido') {
    return res.status(400).json({ error: 'Tipo de archivo no permitido: adjunte un PDF, JPG o PNG' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El archivo supera el tamaño máximo de 10 MB' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});
