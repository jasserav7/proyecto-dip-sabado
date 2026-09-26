import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool } from '../db.js';
import { loadUser, requireRole } from '../middleware/auth.js';
import { registrarAuditoria } from '../utils/auditoria.js';
import { docenteImparteAEstudiante } from '../utils/alcance.js';
import { generarRemisionPDF } from '../utils/generarRemisionPDF.js';
import { generarExpedientePDF } from '../utils/generarExpedientePDF.js';
import { formatearFecha } from '../utils/formato.js';
import { parseCsv } from '../utils/csv.js';

const router = Router();
router.use(loadUser);

const CLASIFICACIONES = ['I', 'II', 'III'];
const ESTADOS_CASO = ['Abierto', 'En seguimiento', 'Remitido', 'Cerrado'];

const ETIQUETAS_CASO = {
  id_estudiante: 'estudiante',
  fecha_hecho: 'fecha y hora del hecho',
  lugar: 'lugar',
  descripcion: 'descripción',
  clasificacion: 'clasificación'
};
const ETIQUETAS_ACTUACION = { tipo: 'tipo', descripcion: 'descripción', responsable: 'responsable' };

const ESTADOS_ACTUACION = ['Pendiente', 'Cumplido', 'Incumplido'];

function mensajeCamposFaltantes(body, etiquetas) {
  const faltantes = Object.entries(etiquetas).filter(([campo]) => !body?.[campo]).map(([, etiqueta]) => etiqueta);
  return faltantes.length ? `Complete los campos obligatorios: ${faltantes.join(', ')}` : null;
}

// Los limites replican el tamano de las columnas para responder 400 en lugar de un error de MySQL.
function errorEnTexto(valor, etiqueta, maximo) {
  if (typeof valor !== 'string') return `El campo ${etiqueta} debe ser texto`;
  if (valor.length > maximo) return `El campo ${etiqueta} no puede superar ${maximo} caracteres`;
  return null;
}

function errorDeFecha(valor, etiqueta, { futuraPermitida }) {
  const fecha = new Date(valor);
  if (typeof valor !== 'string' || Number.isNaN(fecha.getTime())) return `La ${etiqueta} no es válida`;
  if (!futuraPermitida && fecha.getTime() > Date.now() + 5 * 60 * 1000) return `La ${etiqueta} no puede ser futura`;
  return null;
}

function errorValidacionCaso({ id_estudiante, fecha_hecho, lugar, descripcion }) {
  if (!['string', 'number'].includes(typeof id_estudiante) || !/^\d+$/.test(String(id_estudiante))) {
    return 'Seleccione un estudiante válido';
  }
  return errorEnTexto(lugar, 'lugar', 120)
    || errorEnTexto(descripcion, 'descripción', 2000)
    || errorDeFecha(fecha_hecho, 'fecha y hora del hecho', { futuraPermitida: false });
}

function errorValidacionActuacion({ tipo, descripcion, responsable, estado, fecha_compromiso, fecha_cumplimiento }) {
  if (estado && !ESTADOS_ACTUACION.includes(estado)) return 'Estado de la actuación inválido';
  return errorEnTexto(tipo, 'tipo', 40)
    || errorEnTexto(descripcion, 'descripción', 2000)
    || errorEnTexto(responsable, 'responsable', 120)
    || (fecha_compromiso && errorDeFecha(fecha_compromiso, 'fecha de compromiso', { futuraPermitida: true }))
    || (fecha_cumplimiento && errorDeFecha(fecha_cumplimiento, 'fecha de cumplimiento', { futuraPermitida: true }))
    || null;
}

// ------------------------------------------------------------
// Multer: evidencias FUERA del directorio publico (RNF-04), con nombre
// tecnico aleatorio (nunca el nombre original) y solo tipos autorizados.
// ------------------------------------------------------------
const EVIDENCIAS_DIR = path.resolve('uploads', 'evidencias');
const TIPOS_EVIDENCIA_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(EVIDENCIAS_DIR)) fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });
      cb(null, EVIDENCIAS_DIR);
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS_EVIDENCIA_PERMITIDOS.includes(file.mimetype)) return cb(null, true);
    const err = new Error('Tipo de archivo no permitido');
    err.type = 'archivo.invalido';
    cb(err);
  }
});

// ------------------------------------------------------------
// Multer: carga masiva de casos por CSV. El archivo se procesa en
// memoria (nunca se guarda en disco): es solo un insumo temporal para
// crear filas en caso_convivencia, no un documento que deba persistir.
// ------------------------------------------------------------
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

const COLUMNAS_CARGA_MASIVA = ['identificacion_estudiante', 'fecha_hecho', 'lugar', 'descripcion', 'clasificacion'];

// ------------------------------------------------------------
// Helpers de autorizacion sobre un caso puntual
// ------------------------------------------------------------
async function obtenerCasoBase(idCaso) {
  const [rows] = await pool.query(
    `SELECT c.*, e.nombre AS estudiante_nombre, e.apellido AS estudiante_apellido, e.identificacion AS estudiante_identificacion
     FROM caso_convivencia c
     JOIN usuario e ON e.id = c.id_estudiante
     WHERE c.id = ?`,
    [idCaso]
  );
  return rows[0] || null;
}

async function esAcudienteDe(idAcudiente, idEstudiante) {
  const [rows] = await pool.query(
    'SELECT 1 FROM acudiente_estudiante WHERE id_acudiente = ? AND id_estudiante = ?',
    [idAcudiente, idEstudiante]
  );
  return rows.length > 0;
}

/**
 * Determina si el usuario autenticado puede ver el caso, y con que
 * nivel de detalle: 'completo' (staff), 'familiar' (acudiente) o
 * 'propio' (el mismo estudiante, solo estado general).
 */
async function nivelAccesoCaso(user, caso) {
  if (['Administrador', 'Coordinador'].includes(user.rol)) return 'completo';
  if (user.rol === 'Docente') {
    return caso.id_usuario_reporta === user.id ? 'completo' : null;
  }
  if (user.rol === 'Acudiente') {
    const vinculado = await esAcudienteDe(user.id, caso.id_estudiante);
    return vinculado ? 'familiar' : null;
  }
  if (user.rol === 'Estudiante') {
    return caso.id_estudiante === user.id ? 'propio' : null;
  }
  return null;
}

// ------------------------------------------------------------
// POST /api/casos — Registro del hecho
// ------------------------------------------------------------
router.post('/', requireRole('Docente', 'Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const { id_estudiante, fecha_hecho, lugar, descripcion, clasificacion } = req.body;

    const faltantes = mensajeCamposFaltantes(req.body, ETIQUETAS_CASO);
    if (faltantes) {
      return res.status(400).json({ error: faltantes });
    }
    if (!CLASIFICACIONES.includes(clasificacion)) {
      return res.status(400).json({ error: 'Clasificación inválida (use I, II o III)' });
    }
    const errorCaso = errorValidacionCaso(req.body);
    if (errorCaso) {
      return res.status(400).json({ error: errorCaso });
    }

    const [estudianteRows] = await pool.query('SELECT id FROM usuario WHERE id = ? AND id_rol = 3', [id_estudiante]);
    if (!estudianteRows.length) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    if (req.user.rol === 'Docente' && !(await docenteImparteAEstudiante(req.user.id, id_estudiante))) {
      return res.status(403).json({ error: 'El estudiante no pertenece a un curso asignado a su usuario' });
    }

    const [result] = await pool.query(
      `INSERT INTO caso_convivencia (id_estudiante, fecha_hecho, lugar, descripcion, clasificacion, estado, id_usuario_reporta)
       VALUES (?, ?, ?, ?, ?, 'Abierto', ?)`,
      [id_estudiante, fecha_hecho, lugar, descripcion, clasificacion, req.user.id]
    );

    await registrarAuditoria({
      idCaso: result.insertId,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'CREACION',
      detalle: `Registro del hecho (tipo ${clasificacion})`
    });

    res.status(201).json({ id: result.insertId, message: 'Caso registrado' });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// POST /api/casos/carga-masiva — Registro de varios hechos a la vez
// desde un CSV (mismas reglas que el registro individual, fila por fila:
// un Docente solo puede cargar casos de estudiantes de sus cursos; el
// archivo NO se persiste, solo se usa para crear filas en caso_convivencia).
// Encabezado esperado: identificacion_estudiante,fecha_hecho,lugar,descripcion,clasificacion
// ------------------------------------------------------------
router.post('/carga-masiva', requireRole('Docente', 'Coordinador', 'Administrador'), uploadCsv.single('archivo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Adjunte un archivo CSV' });
    if (!/\.csv$/i.test(req.file.originalname)) {
      return res.status(400).json({ error: 'El archivo debe tener extensión .csv' });
    }

    const texto = req.file.buffer.toString('utf8').replace(/^﻿/, '');
    const filas = parseCsv(texto);
    if (!filas.length) return res.status(400).json({ error: 'El archivo está vacío' });

    const encabezado = filas[0].map((c) => c.trim().toLowerCase());
    const columnasFaltantes = COLUMNAS_CARGA_MASIVA.filter((c) => !encabezado.includes(c));
    if (columnasFaltantes.length) {
      return res.status(400).json({
        error: `Faltan columnas en el encabezado del CSV: ${columnasFaltantes.join(', ')}. ` +
          `Encabezado esperado: ${COLUMNAS_CARGA_MASIVA.join(',')}`
      });
    }
    const idx = Object.fromEntries(COLUMNAS_CARGA_MASIVA.map((c) => [c, encabezado.indexOf(c)]));

    const creados = [];
    const errores = [];

    for (let i = 1; i < filas.length; i++) {
      const numeroFila = i + 1; // 1-based; la fila 1 es el encabezado
      const cols = filas[i];
      const identificacion = (cols[idx.identificacion_estudiante] || '').trim();
      const fecha_hecho = (cols[idx.fecha_hecho] || '').trim();
      const lugar = (cols[idx.lugar] || '').trim();
      const descripcion = (cols[idx.descripcion] || '').trim();
      const clasificacion = (cols[idx.clasificacion] || '').trim().toUpperCase();

      try {
        if (!identificacion || !fecha_hecho || !lugar || !descripcion || !clasificacion) {
          throw new Error('Faltan datos obligatorios en la fila');
        }
        if (!CLASIFICACIONES.includes(clasificacion)) {
          throw new Error('Clasificación inválida (use I, II o III)');
        }
        const errorFecha = errorDeFecha(fecha_hecho, 'fecha y hora del hecho', { futuraPermitida: false });
        if (errorFecha) throw new Error(errorFecha);
        const errorLugar = errorEnTexto(lugar, 'lugar', 120);
        if (errorLugar) throw new Error(errorLugar);
        const errorDescripcion = errorEnTexto(descripcion, 'descripción', 2000);
        if (errorDescripcion) throw new Error(errorDescripcion);

        const [estudianteRows] = await pool.query(
          'SELECT id FROM usuario WHERE identificacion = ? AND id_rol = 3',
          [identificacion]
        );
        if (!estudianteRows.length) throw new Error(`No existe un estudiante con identificación ${identificacion}`);
        const idEstudiante = estudianteRows[0].id;

        if (req.user.rol === 'Docente' && !(await docenteImparteAEstudiante(req.user.id, idEstudiante))) {
          throw new Error('El estudiante no pertenece a un curso asignado a su usuario');
        }

        const [result] = await pool.query(
          `INSERT INTO caso_convivencia (id_estudiante, fecha_hecho, lugar, descripcion, clasificacion, estado, id_usuario_reporta)
           VALUES (?, ?, ?, ?, ?, 'Abierto', ?)`,
          [idEstudiante, fecha_hecho, lugar, descripcion, clasificacion, req.user.id]
        );
        await registrarAuditoria({
          idCaso: result.insertId,
          idUsuarioResponsable: req.user.id,
          tipoAccion: 'CREACION',
          detalle: `Registro del hecho (tipo ${clasificacion}) — carga masiva CSV, fila ${numeroFila}`
        });
        creados.push({ fila: numeroFila, id: result.insertId, identificacion });
      } catch (err) {
        errores.push({ fila: numeroFila, identificacion: identificacion || null, error: err.message });
      }
    }

    await registrarAuditoria({
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'CREACION',
      detalle: `Carga masiva por CSV: ${creados.length} caso(s) creado(s), ${errores.length} fila(s) con error (archivo "${req.file.originalname}")`
    });

    res.status(creados.length ? 201 : 400).json({ creados, errores });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos — Consulta institucional (staff)
// ------------------------------------------------------------
router.get('/', requireRole('Docente', 'Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const { estado, clasificacion } = req.query;
    const condiciones = [];
    const valores = [];

    if (req.user.rol === 'Docente') {
      condiciones.push('c.id_usuario_reporta = ?');
      valores.push(req.user.id);
    }
    if (estado) {
      condiciones.push('c.estado = ?');
      valores.push(estado);
    }
    if (clasificacion) {
      condiciones.push('c.clasificacion = ?');
      valores.push(clasificacion);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const [rows] = await pool.query(
      `SELECT c.id, c.fecha_hecho, c.lugar, c.clasificacion, c.estado, c.fecha_registro,
              e.nombre AS estudiante_nombre, e.apellido AS estudiante_apellido, e.identificacion AS estudiante_identificacion,
              r.nombre AS reportado_por_rol, ru.nombre AS reportado_por_nombre, ru.apellido AS reportado_por_apellido
       FROM caso_convivencia c
       JOIN usuario e ON e.id = c.id_estudiante
       JOIN usuario ru ON ru.id = c.id_usuario_reporta
       JOIN rol r ON r.id = ru.id_rol
       ${where}
       ORDER BY c.fecha_registro DESC`,
      valores
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/estudiante/:idEstudiante — Expediente por estudiante
// (consulta institucional, familiar o del propio estudiante segun rol)
// ------------------------------------------------------------
router.get('/estudiante/:idEstudiante', async (req, res, next) => {
  try {
    const idEstudiante = Number(req.params.idEstudiante);
    let nivel;

    if (['Administrador', 'Coordinador', 'Docente'].includes(req.user.rol)) {
      nivel = 'completo';
    } else if (req.user.rol === 'Acudiente') {
      nivel = (await esAcudienteDe(req.user.id, idEstudiante)) ? 'familiar' : null;
    } else if (req.user.rol === 'Estudiante') {
      nivel = req.user.id === idEstudiante ? 'propio' : null;
    }

    if (!nivel) return res.status(403).json({ error: 'No tiene acceso a este expediente' });

    const columnas = nivel === 'propio'
      ? 'c.id, c.fecha_hecho, c.clasificacion, c.estado'
      : 'c.id, c.fecha_hecho, c.lugar, c.descripcion, c.clasificacion, c.estado, c.fecha_registro';

    const soloReportadosPorMi = req.user.rol === 'Docente';
    const [rows] = await pool.query(
      `SELECT ${columnas} FROM caso_convivencia c
       WHERE c.id_estudiante = ?${soloReportadosPorMi ? ' AND c.id_usuario_reporta = ?' : ''}
       ORDER BY c.fecha_registro DESC`,
      soloReportadosPorMi ? [idEstudiante, req.user.id] : [idEstudiante]
    );

    if (nivel !== 'completo') {
      await registrarAuditoria({
        idUsuarioResponsable: req.user.id,
        tipoAccion: 'CONSULTA_SENSIBLE',
        detalle: `Consulta de expediente (nivel ${nivel}) del estudiante ${idEstudiante}`
      });
    }

    res.json({ nivelAcceso: nivel, casos: rows });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/:id — Detalle del caso (segun nivel de acceso)
// ------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const nivel = await nivelAccesoCaso(req.user, caso);
    if (!nivel) return res.status(403).json({ error: 'No tiene acceso a este caso' });

    if (nivel === 'propio') {
      await registrarAuditoria({
        idCaso: caso.id,
        idUsuarioResponsable: req.user.id,
        tipoAccion: 'CONSULTA_SENSIBLE',
        detalle: 'Consulta propia del estudiante'
      });
      return res.json({
        nivelAcceso: nivel,
        caso: { id: caso.id, fecha_hecho: caso.fecha_hecho, clasificacion: caso.clasificacion, estado: caso.estado }
      });
    }

    const [actuaciones] = await pool.query(
      `SELECT id, tipo, descripcion, responsable, fecha_compromiso, fecha_cumplimiento, estado, fecha_registro
       FROM actuacion WHERE id_caso = ? ORDER BY fecha_registro`,
      [caso.id]
    );

    let evidencias = [];
    if (nivel === 'completo') {
      const [evRows] = await pool.query(
        `SELECT id, nombre_original, tipo_archivo, nivel_acceso, fecha_carga
         FROM evidencia WHERE id_caso = ? ORDER BY fecha_carga`,
        [caso.id]
      );
      evidencias = req.user.rol === 'Docente' ? evRows.filter((ev) => ev.nivel_acceso === 'general') : evRows;
    }

    if (nivel === 'familiar') {
      await registrarAuditoria({
        idCaso: caso.id,
        idUsuarioResponsable: req.user.id,
        tipoAccion: 'CONSULTA_SENSIBLE',
        detalle: 'Consulta familiar del expediente'
      });
    }

    res.json({ nivelAcceso: nivel, caso, actuaciones, evidencias });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// PUT /api/casos/:id — Cambiar estado del caso
// ------------------------------------------------------------
router.put('/:id', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!ESTADOS_CASO.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    await pool.query('UPDATE caso_convivencia SET estado = ? WHERE id = ?', [estado, caso.id]);
    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'CAMBIO_ESTADO',
      detalle: `${caso.estado} -> ${estado}`
    });

    res.json({ message: 'Estado actualizado' });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// POST /api/casos/:id/actuaciones — Seguimiento
// ------------------------------------------------------------
router.post('/:id/actuaciones', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const { tipo, descripcion, responsable, fecha_compromiso, fecha_cumplimiento, estado } = req.body;
    const faltantes = mensajeCamposFaltantes(req.body, ETIQUETAS_ACTUACION);
    if (faltantes) {
      return res.status(400).json({ error: faltantes });
    }
    const errorActuacion = errorValidacionActuacion(req.body);
    if (errorActuacion) {
      return res.status(400).json({ error: errorActuacion });
    }

    await pool.query(
      `INSERT INTO actuacion (id_caso, tipo, descripcion, responsable, fecha_compromiso, fecha_cumplimiento, estado, id_usuario_registra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [caso.id, tipo, descripcion, responsable, fecha_compromiso || null, fecha_cumplimiento || null, estado || 'Pendiente', req.user.id]
    );

    if (caso.estado === 'Abierto') {
      await pool.query("UPDATE caso_convivencia SET estado = 'En seguimiento' WHERE id = ?", [caso.id]);
    }

    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'CREACION',
      detalle: `Actuación registrada: [${tipo}] ${descripcion}`
    });

    res.status(201).json({ message: 'Actuacion registrada' });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// DELETE /api/casos/:id/actuaciones/:idActuacion — Elimina una actuacion o compromiso
// ------------------------------------------------------------
router.delete('/:id/actuaciones/:idActuacion', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const [rows] = await pool.query(
      'SELECT * FROM actuacion WHERE id = ? AND id_caso = ?',
      [req.params.idActuacion, caso.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Actuación no encontrada' });

    await pool.query('DELETE FROM actuacion WHERE id = ?', [rows[0].id]);
    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'ELIMINACION',
      detalle: `Actuación eliminada: [${rows[0].tipo}] ${rows[0].descripcion}`
    });

    res.json({ message: 'Actuación eliminada' });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// A proposito NO existe un DELETE /api/casos/:id: un caso de convivencia
// jamas se elimina, por minimo/desestimado que resulte. Si quedo
// inconcluso o sin merito, se cierra con PUT /api/casos/:id (estado
// 'Cerrado'); el expediente permanece completo para trazabilidad.
// ------------------------------------------------------------

// ------------------------------------------------------------
// GET /api/casos/:id/exportar — Reporte CSV del caso
// ------------------------------------------------------------
const ETIQUETA_TIPO_ACTUACION_CSV = { Actuacion: 'Actuación', Compromiso: 'Compromiso', Observacion: 'Observación' };

function celdaCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Fila de titulo de seccion: repite la etiqueta en cada columna del ancho de
// la tabla para que, al abrirse en Excel/Sheets, se vea como un encabezado
// solido en vez de una celda suelta seguida de columnas vacias.
function filaSeccion(etiqueta, anchoColumnas) {
  return [`— ${etiqueta.toUpperCase()} —`, ...Array(Math.max(anchoColumnas - 1, 0)).fill('')];
}

router.get('/:id/exportar', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const [actuaciones] = await pool.query(
      'SELECT tipo, descripcion, responsable, fecha_compromiso, fecha_cumplimiento, estado FROM actuacion WHERE id_caso = ? ORDER BY fecha_registro',
      [caso.id]
    );
    const [evidencias] = await pool.query(
      'SELECT nombre_original, tipo_archivo, nivel_acceso, fecha_carga FROM evidencia WHERE id_caso = ? ORDER BY fecha_carga',
      [caso.id]
    );

    const filas = [];

    filas.push([`Expediente de convivencia — Caso #${caso.id}`]);
    filas.push([`Exportado el ${formatearFecha(new Date().toISOString())} por ${req.user.nombre} ${req.user.apellido} (${req.user.rol})`]);
    filas.push([]);

    filas.push(filaSeccion('Datos del caso', 9));
    filas.push(['#', 'Estudiante', 'Identificación', 'Fecha del hecho', 'Lugar', 'Descripción', 'Clasificación', 'Estado', 'Fecha de registro']);
    filas.push([
      caso.id,
      `${caso.estudiante_nombre} ${caso.estudiante_apellido}`,
      caso.estudiante_identificacion,
      formatearFecha(caso.fecha_hecho),
      caso.lugar,
      caso.descripcion,
      `Tipo ${caso.clasificacion}`,
      caso.estado,
      formatearFecha(caso.fecha_registro)
    ]);
    filas.push([]);

    filas.push(filaSeccion('Actuaciones y compromisos', 6));
    filas.push(['Tipo', 'Descripción', 'Responsable', 'Fecha compromiso', 'Fecha cumplimiento', 'Estado']);
    if (!actuaciones.length) {
      filas.push(['Sin actuaciones registradas.']);
    } else {
      for (const a of actuaciones) {
        filas.push([
          ETIQUETA_TIPO_ACTUACION_CSV[a.tipo] || a.tipo,
          a.descripcion,
          a.responsable,
          formatearFecha(a.fecha_compromiso),
          formatearFecha(a.fecha_cumplimiento),
          a.estado
        ]);
      }
    }
    filas.push([]);

    filas.push(filaSeccion('Evidencias', 4));
    filas.push(['Nombre', 'Tipo de archivo', 'Nivel de acceso', 'Fecha de carga']);
    if (!evidencias.length) {
      filas.push(['Sin evidencias cargadas.']);
    } else {
      for (const ev of evidencias) {
        filas.push([ev.nombre_original, ev.tipo_archivo || 'desconocido', ev.nivel_acceso, formatearFecha(ev.fecha_carga)]);
      }
    }

    const csv = filas.map((fila) => fila.map(celdaCsv).join(',')).join('\r\n');

    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'DESCARGA',
      detalle: `Exportación CSV del caso #${caso.id}`
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="caso-${caso.id}.csv"`);
    res.send('﻿' + csv);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/:id/exportar-pdf — Expediente completo en PDF (uso interno,
// distinto de la remision oficial a Orientacion Escolar generada mas abajo)
// ------------------------------------------------------------
router.get('/:id/exportar-pdf', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const [actuaciones] = await pool.query(
      'SELECT tipo, descripcion, responsable, fecha_compromiso, fecha_cumplimiento, estado FROM actuacion WHERE id_caso = ? ORDER BY fecha_registro',
      [caso.id]
    );
    const [evidencias] = await pool.query(
      'SELECT nombre_original, tipo_archivo, nivel_acceso, fecha_carga FROM evidencia WHERE id_caso = ? ORDER BY fecha_carga',
      [caso.id]
    );

    const buffer = await generarExpedientePDF({
      caso,
      estudiante: {
        nombre: caso.estudiante_nombre,
        apellido: caso.estudiante_apellido,
        identificacion: caso.estudiante_identificacion
      },
      actuaciones,
      evidencias,
      generadoPor: req.user
    });

    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'DESCARGA',
      detalle: `Exportación PDF del expediente del caso #${caso.id}`
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="expediente-caso-${caso.id}.pdf"`);
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// POST /api/casos/:id/evidencias — Carga de evidencia autorizada
// ------------------------------------------------------------
router.post('/:id/evidencias', requireRole('Docente', 'Coordinador', 'Administrador'), upload.single('archivo'), async (req, res, next) => {
  try {
    const descartarArchivo = () => req.file && fs.rm(req.file.path, { force: true }, () => {});

    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) {
      descartarArchivo();
      return res.status(404).json({ error: 'Caso no encontrado' });
    }
    if (req.user.rol === 'Docente' && caso.id_usuario_reporta !== req.user.id) {
      descartarArchivo();
      return res.status(403).json({ error: 'No tiene acceso a este caso' });
    }
    if (!req.file) return res.status(400).json({ error: 'Adjunte un archivo (PDF, JPG o PNG)' });

    const nivelAcceso = req.body.nivel_acceso === 'general' ? 'general' : 'restringido';

    await pool.query(
      `INSERT INTO evidencia (id_caso, nombre_tecnico, nombre_original, tipo_archivo, nivel_acceso, id_usuario_carga)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [caso.id, req.file.filename, req.file.originalname, req.file.mimetype, nivelAcceso, req.user.id]
    );
    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'CREACION',
      detalle: `Evidencia cargada (${nivelAcceso}): ${req.file.originalname}`
    });

    res.status(201).json({ message: 'Evidencia cargada' });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/:id/evidencias/:idEvidencia/descarga
// ------------------------------------------------------------
router.get('/:id/evidencias/:idEvidencia/descarga', requireRole('Docente', 'Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (req.user.rol === 'Docente' && caso.id_usuario_reporta !== req.user.id) {
      return res.status(403).json({ error: 'No tiene acceso a esta evidencia' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM evidencia WHERE id = ? AND id_caso = ?',
      [req.params.idEvidencia, caso.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Evidencia no encontrada' });

    const evidencia = rows[0];
    if (req.user.rol === 'Docente' && evidencia.nivel_acceso === 'restringido') {
      return res.status(403).json({ error: 'No tiene acceso a esta evidencia' });
    }
    const rutaAbsoluta = path.resolve('uploads', 'evidencias', evidencia.nombre_tecnico);
    if (!fs.existsSync(rutaAbsoluta)) return res.status(404).json({ error: 'Archivo no disponible' });

    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'DESCARGA',
      detalle: `Descarga de evidencia: ${evidencia.nombre_original}`
    });

    res.download(rutaAbsoluta, evidencia.nombre_original);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// POST /api/casos/:id/remision — Activacion expresa de remision
// ------------------------------------------------------------
router.post('/:id/remision', requireRole('Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    if (req.body?.confirmar !== true) {
      return res.status(400).json({ error: 'Debe confirmar de forma expresa la generación de la remisión' });
    }

    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });

    const [actuaciones] = await pool.query(
      'SELECT tipo, descripcion, responsable, estado FROM actuacion WHERE id_caso = ? ORDER BY fecha_registro',
      [caso.id]
    );

    const anio = new Date().getFullYear();
    const prefijo = `REM-${anio}-`;
    const [[{ ultimo }]] = await pool.query(
      'SELECT COALESCE(MAX(CAST(SUBSTRING(numero, ?) AS UNSIGNED)), 0) AS ultimo FROM remision WHERE numero LIKE ?',
      [prefijo.length + 1, `${prefijo}%`]
    );
    const numero = `${prefijo}${String(ultimo + 1).padStart(4, '0')}`;

    const { nombreTecnico } = await generarRemisionPDF({
      numero,
      caso,
      estudiante: {
        nombre: caso.estudiante_nombre,
        apellido: caso.estudiante_apellido,
        identificacion: caso.estudiante_identificacion
      },
      actuaciones,
      generadoPor: req.user
    });

    await pool.query(
      `INSERT INTO remision (id_caso, numero, id_usuario_genera, ruta_pdf) VALUES (?, ?, ?, ?)`,
      [caso.id, numero, req.user.id, nombreTecnico]
    );
    await pool.query("UPDATE caso_convivencia SET estado = 'Remitido' WHERE id = ?", [caso.id]);
    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'GENERACION_PDF',
      detalle: `Remisión ${numero} generada`
    });

    res.status(201).json({ message: 'Remisión generada', numero });
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/:id/remisiones — Listado de remisiones del caso
// ------------------------------------------------------------
router.get('/:id/remisiones', requireRole('Docente', 'Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (req.user.rol === 'Docente' && caso.id_usuario_reporta !== req.user.id) {
      return res.status(403).json({ error: 'No tiene acceso a las remisiones de este caso' });
    }

    const [rows] = await pool.query(
      'SELECT id, numero, fecha_generacion FROM remision WHERE id_caso = ? ORDER BY fecha_generacion DESC',
      [caso.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// ------------------------------------------------------------
// GET /api/casos/:id/remisiones/:idRemision/descarga
// ------------------------------------------------------------
router.get('/:id/remisiones/:idRemision/descarga', requireRole('Docente', 'Coordinador', 'Administrador'), async (req, res, next) => {
  try {
    const caso = await obtenerCasoBase(req.params.id);
    if (!caso) return res.status(404).json({ error: 'Caso no encontrado' });
    if (req.user.rol === 'Docente' && caso.id_usuario_reporta !== req.user.id) {
      return res.status(403).json({ error: 'No tiene acceso a esta remisión' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM remision WHERE id = ? AND id_caso = ?',
      [req.params.idRemision, caso.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Remisión no encontrada' });

    const remision = rows[0];
    const rutaAbsoluta = path.resolve('uploads', 'remisiones', remision.ruta_pdf);
    if (!fs.existsSync(rutaAbsoluta)) return res.status(404).json({ error: 'Archivo no disponible' });

    await registrarAuditoria({
      idCaso: caso.id,
      idUsuarioResponsable: req.user.id,
      tipoAccion: 'DESCARGA',
      detalle: `Descarga de remisión ${remision.numero}`
    });

    res.download(rutaAbsoluta, `${remision.numero}.pdf`);
  } catch (e) {
    next(e);
  }
});

export default router;
