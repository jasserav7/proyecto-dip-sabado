import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { docenteAsignadoACurso, docenteImparteAEstudiante } from '../src/utils/alcance.js';

const ids = {};
// Único punto a cambiar si la autenticación deja de usar el encabezado x-user-id
const como = (usuario) => ({ 'x-user-id': String(ids[usuario]) });

const datosCaso = () => ({
  id_estudiante: ids.est001,
  fecha_hecho: '2026-03-10 09:30:00',
  lugar: 'Prueba automatizada',
  descripcion: 'Caso creado por las pruebas automatizadas',
  clasificacion: 'I'
});

let idCaso;

async function crearCaso() {
  const res = await request(app).post('/api/casos').set(como('docente1')).send(datosCaso());
  expect(res.status).toBe(201);
  return res.body.id;
}

// La API ya no expone forma alguna de eliminar un caso (regla de negocio:
// solo se cierra, nunca se borra). Las pruebas igual necesitan descartar
// los casos que ellas mismas crean, asi que lo hacen directamente contra
// la base, replicando lo que antes hacia el endpoint retirado.
async function purgarCasoDePrueba(id) {
  const [evidencias] = await pool.query('SELECT nombre_tecnico FROM evidencia WHERE id_caso = ?', [id]);
  const [remisiones] = await pool.query('SELECT ruta_pdf FROM remision WHERE id_caso = ?', [id]);
  await pool.query('DELETE FROM evidencia WHERE id_caso = ?', [id]);
  await pool.query('DELETE FROM remision WHERE id_caso = ?', [id]);
  await pool.query('DELETE FROM actuacion WHERE id_caso = ?', [id]);
  await pool.query('DELETE FROM caso_convivencia WHERE id = ?', [id]);
  for (const ev of evidencias) fs.rm(path.resolve('uploads', 'evidencias', ev.nombre_tecnico), { force: true }, () => {});
  for (const rem of remisiones) fs.rm(path.resolve('uploads', 'remisiones', rem.ruta_pdf), { force: true }, () => {});
}

beforeAll(async () => {
  const [rows] = await pool.query('SELECT id, usuario FROM usuario');
  for (const { id, usuario } of rows) ids[usuario] = id;
  idCaso = await crearCaso();
});

afterAll(async () => {
  await purgarCasoDePrueba(idCaso);
  await pool.end();
});

describe('Autenticación básica', () => {
  it('inicia sesión con credenciales válidas y no devuelve la contraseña', async () => {
    const res = await request(app).post('/api/auth/login').send({ usuario: 'admin', contrasena: 'Temporal2026*' });
    expect(res.status).toBe(200);
    expect(res.body.rol).toBe('Administrador');
    expect(res.body).not.toHaveProperty('contrasena');
  });

  it('rechaza una contraseña incorrecta', async () => {
    const res = await request(app).post('/api/auth/login').send({ usuario: 'admin', contrasena: 'incorrecta' });
    expect(res.status).toBe(401);
  });

  it('exige usuario y contraseña', async () => {
    const res = await request(app).post('/api/auth/login').send({ usuario: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rechaza peticiones sin identificar al usuario', async () => {
    const res = await request(app).get('/api/casos');
    expect(res.status).toBe(401);
  });

  it('rechaza un usuario inexistente', async () => {
    const res = await request(app).get('/api/casos').set({ 'x-user-id': '999999' });
    expect(res.status).toBe(401);
  });

  it('guarda las contraseñas cifradas con bcrypt (RNF-01)', async () => {
    const [[fila]] = await pool.query('SELECT COUNT(*) AS sinCifrar FROM usuario WHERE contrasena NOT LIKE ?', ['$2%']);
    const [[admin]] = await pool.query('SELECT contrasena FROM usuario WHERE usuario = ?', ['admin']);
    expect(fila.sinCifrar).toBe(0);
    expect(admin.contrasena).toMatch(/^\$2[aby]\$10\$.{53}$/);
  });

  it('no acepta usuario o contraseña que no sean texto (evita inyectar objetos en la consulta)', async () => {
    const res = await request(app).post('/api/auth/login').send({ usuario: { $ne: '' }, contrasena: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('Control de acceso por rol', () => {
  it('el estudiante no puede listar casos', async () => {
    const res = await request(app).get('/api/casos').set(como('est001'));
    expect(res.status).toBe(403);
  });

  it('el acudiente no puede registrar casos', async () => {
    const res = await request(app).post('/api/casos').set(como('acud001')).send(datosCaso());
    expect(res.status).toBe(403);
  });

  it('el docente no puede cambiar el estado de un caso', async () => {
    const res = await request(app).put(`/api/casos/${idCaso}`).set(como('docente1')).send({ estado: 'Cerrado' });
    expect(res.status).toBe(403);
  });

  it('el docente no puede eliminar actuaciones', async () => {
    const actuacion = await request(app).delete(`/api/casos/${idCaso}/actuaciones/1`).set(como('docente1'));
    expect(actuacion.status).toBe(403);
  });

  it('el docente no puede exportar el CSV del caso', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}/exportar`).set(como('docente1'));
    expect(res.status).toBe(403);
  });

  it('la auditoría es exclusiva del administrador', async () => {
    const coordinador = await request(app).get('/api/auditoria').set(como('coordinador'));
    const admin = await request(app).get('/api/auditoria').set(como('admin'));
    expect(coordinador.status).toBe(403);
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.body)).toBe(true);
  });
});

describe('Alcance sobre un caso según el rol', () => {
  it('el docente que reportó ve el caso completo', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('docente1'));
    expect(res.status).toBe(200);
    expect(res.body.nivelAcceso).toBe('completo');
  });

  it('otro docente no ve el caso ni aparece en su listado', async () => {
    const detalle = await request(app).get(`/api/casos/${idCaso}`).set(como('docente2'));
    const listado = await request(app).get('/api/casos').set(como('docente2'));
    expect(detalle.status).toBe(403);
    expect(listado.body.map((c) => c.id)).not.toContain(idCaso);
  });

  it('el coordinador ve el caso completo', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('coordinador'));
    expect(res.body.nivelAcceso).toBe('completo');
  });

  it('el acudiente vinculado ve la vista familiar sin evidencias', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('acud001'));
    expect(res.status).toBe(200);
    expect(res.body.nivelAcceso).toBe('familiar');
    expect(res.body.evidencias).toEqual([]);
  });

  it('un acudiente no vinculado no ve el caso', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('acud002'));
    expect(res.status).toBe(403);
  });

  it('el estudiante solo ve el estado general de su propio caso', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('est001'));
    expect(res.status).toBe(200);
    expect(res.body.nivelAcceso).toBe('propio');
    expect(res.body.caso).not.toHaveProperty('descripcion');
    expect(res.body.caso).not.toHaveProperty('lugar');
  });

  it('un estudiante no ve casos de otro estudiante', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}`).set(como('est016'));
    expect(res.status).toBe(403);
  });
});

describe('Validación de datos', () => {
  it('indica qué campos obligatorios faltan y no menciona los ya diligenciados', async () => {
    const res = await request(app).post('/api/casos').set(como('docente1')).send({ lugar: 'Patio' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('estudiante');
    expect(res.body.error).toContain('descripción');
    expect(res.body.error).not.toContain('lugar');
  });

  it('indica qué campos faltan al registrar una actuación', async () => {
    const res = await request(app)
      .post(`/api/casos/${idCaso}/actuaciones`)
      .set(como('coordinador'))
      .send({ tipo: 'Compromiso' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('responsable');
  });

  it('rechaza una clasificación inválida', async () => {
    const res = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), clasificacion: 'IV' });
    expect(res.status).toBe(400);
  });

  it('rechaza textos más largos que las columnas de la base de datos en lugar de fallar con error interno', async () => {
    const lugarLargo = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), lugar: 'x'.repeat(121) });
    const descripcionLarga = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), descripcion: 'x'.repeat(2001) });
    expect(lugarLargo.status).toBe(400);
    expect(lugarLargo.body.error).toContain('lugar');
    expect(descripcionLarga.status).toBe(400);
    expect(descripcionLarga.body.error).toContain('descripción');
  });

  it('rechaza fechas del hecho inválidas o futuras', async () => {
    const invalida = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), fecha_hecho: 'no-es-fecha' });
    const futura = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), fecha_hecho: '2999-01-01T10:00' });
    expect(invalida.status).toBe(400);
    expect(futura.status).toBe(400);
    expect(futura.body.error).toContain('futura');
  });

  it('rechaza un identificador de estudiante que no sea numérico', async () => {
    const res = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), id_estudiante: { id: 1 } });
    expect(res.status).toBe(400);
  });

  it('rechaza un estado de actuación inválido', async () => {
    const res = await request(app)
      .post(`/api/casos/${idCaso}/actuaciones`)
      .set(como('coordinador'))
      .send({ tipo: 'Compromiso', descripcion: 'x', responsable: 'y', estado: 'Inventado' });
    expect(res.status).toBe(400);
  });

  it('rechaza un estudiante inexistente', async () => {
    const res = await request(app).post('/api/casos').set(como('docente1')).send({ ...datosCaso(), id_estudiante: 999999 });
    expect(res.status).toBe(404);
  });

  it('rechaza un estado de caso inválido', async () => {
    const res = await request(app).put(`/api/casos/${idCaso}`).set(como('coordinador')).send({ estado: 'Inventado' });
    expect(res.status).toBe(400);
  });

  it('responde 404 para un caso inexistente', async () => {
    const res = await request(app).get('/api/casos/999999').set(como('coordinador'));
    expect(res.status).toBe(404);
  });

  it('responde 400 ante un JSON malformado en lugar de un error interno', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{malo');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('Alcance de los docentes por curso asignado', () => {
  it('reconoce a los estudiantes de sus cursos y rechaza a quien no comparte curso', async () => {
    expect(await docenteImparteAEstudiante(ids.docente1, ids.est001)).toBe(true);
    expect(await docenteImparteAEstudiante(ids.docente1, ids.coordinador)).toBe(false);
  });

  it('verifica la asignación de curso y de vigencia', async () => {
    const [[asignacion]] = await pool.query(
      'SELECT id_curso, id_vigencia FROM usuario_curso_vigencia WHERE id_usuario = ? LIMIT 1',
      [ids.docente1]
    );
    expect(await docenteAsignadoACurso(ids.docente1, asignacion.id_curso, asignacion.id_vigencia)).toBe(true);
    expect(await docenteAsignadoACurso(ids.docente1, asignacion.id_curso, 1999)).toBe(false);
    expect(await docenteAsignadoACurso(ids.docente1, 999999, asignacion.id_vigencia)).toBe(false);
  });

  it('el catálogo de cursos del docente contiene solo los cursos que tiene asignados', async () => {
    const res = await request(app).get('/api/catalogos/cursos').set(como('docente1'));
    const [asignados] = await pool.query(
      'SELECT DISTINCT id_curso FROM usuario_curso_vigencia WHERE id_usuario = ?',
      [ids.docente1]
    );
    const ordenar = (lista) => [...lista].sort((a, b) => a - b);
    expect(ordenar(res.body.map((c) => c.id))).toEqual(ordenar(asignados.map((a) => a.id_curso)));
  });

  it('no permite al docente listar estudiantes de una vigencia en la que no tiene el curso asignado', async () => {
    const res = await request(app)
      .get('/api/catalogos/estudiantes-por-curso?id_curso=111&id_vigencia=1999')
      .set(como('docente1'));
    expect(res.status).toBe(403);
  });

  it('un docente solo ve por estudiante los casos que él reportó', async () => {
    const propio = await request(app).get(`/api/casos/estudiante/${ids.est001}`).set(como('docente1'));
    const ajeno = await request(app).get(`/api/casos/estudiante/${ids.est001}`).set(como('docente2'));
    expect(propio.body.casos.map((c) => c.id)).toContain(idCaso);
    expect(ajeno.body.casos.map((c) => c.id)).not.toContain(idCaso);
  });
});

describe('Evidencias autorizadas (RNF-04)', () => {
  const adjuntar = (idDelCaso, usuario, { nombre = 'acta.pdf', tipo = 'application/pdf', nivel = 'restringido' } = {}) =>
    request(app)
      .post(`/api/casos/${idDelCaso}/evidencias`)
      .set(como(usuario))
      .field('nivel_acceso', nivel)
      .attach('archivo', Buffer.from('%PDF-1.4 prueba'), { filename: nombre, contentType: tipo });

  it('el docente que reportó carga una evidencia y la carga queda en la auditoría', async () => {
    const res = await adjuntar(idCaso, 'docente1', { nombre: 'general.pdf', nivel: 'general' });
    expect(res.status).toBe(201);
    const [auditoria] = await pool.query(
      'SELECT id FROM auditoria WHERE id_caso = ? AND detalle LIKE ?',
      [idCaso, 'Evidencia cargada%general.pdf']
    );
    expect(auditoria).toHaveLength(1);
  });

  it('otro docente no puede cargar evidencias en un caso ajeno', async () => {
    const res = await adjuntar(idCaso, 'docente2');
    expect(res.status).toBe(403);
  });

  it('rechaza tipos de archivo no autorizados y exige adjuntar un archivo', async () => {
    const tipoInvalido = await adjuntar(idCaso, 'docente1', { nombre: 'nota.txt', tipo: 'text/plain' });
    const sinArchivo = await request(app).post(`/api/casos/${idCaso}/evidencias`).set(como('docente1'));
    expect(tipoInvalido.status).toBe(400);
    expect(sinArchivo.status).toBe(400);
  });

  it('la evidencia restringida no es visible ni descargable para el docente, pero sí para el coordinador', async () => {
    const carga = await adjuntar(idCaso, 'docente1', { nombre: 'reservada.pdf', nivel: 'restringido' });
    expect(carga.status).toBe(201);

    const comoCoordinador = await request(app).get(`/api/casos/${idCaso}`).set(como('coordinador'));
    const comoDocente = await request(app).get(`/api/casos/${idCaso}`).set(como('docente1'));
    const reservada = comoCoordinador.body.evidencias.find((e) => e.nombre_original === 'reservada.pdf');
    const general = comoCoordinador.body.evidencias.find((e) => e.nombre_original === 'general.pdf');
    expect(reservada).toBeDefined();
    expect(general).toBeDefined();
    expect(comoDocente.body.evidencias.map((e) => e.nombre_original)).toEqual(['general.pdf']);

    const descargar = (evidencia, usuario) =>
      request(app).get(`/api/casos/${idCaso}/evidencias/${evidencia.id}/descarga`).set(como(usuario));
    expect((await descargar(reservada, 'docente1')).status).toBe(403);
    expect((await descargar(reservada, 'coordinador')).status).toBe(200);
    expect((await descargar(general, 'docente1')).status).toBe(200);
  });
});

describe('Seguimiento, exportación y cierre de casos', () => {
  it('registra en la auditoría quién agrega una actuación y admite descripciones largas', async () => {
    const descripcion = 'Descripción extensa de la actuación. '.repeat(20);
    const crear = await request(app)
      .post(`/api/casos/${idCaso}/actuaciones`)
      .set(como('coordinador'))
      .send({ tipo: 'Actuacion', descripcion, responsable: 'Coordinación' });
    expect(crear.status).toBe(201);

    const [auditoria] = await pool.query(
      'SELECT id_usuario_responsable FROM auditoria WHERE id_caso = ? AND detalle LIKE ?',
      [idCaso, 'Actuación registrada%']
    );
    expect(auditoria.length).toBeGreaterThanOrEqual(1);
    expect(auditoria[0].id_usuario_responsable).toBe(ids.coordinador);

    const detalle = await request(app).get(`/api/casos/${idCaso}`).set(como('coordinador'));
    const larga = detalle.body.actuaciones.find((a) => a.descripcion === descripcion);
    const borrar = await request(app).delete(`/api/casos/${idCaso}/actuaciones/${larga.id}`).set(como('coordinador'));
    expect(borrar.status).toBe(200);
  });

  it('registra una actuación, la elimina y no permite eliminarla dos veces', async () => {
    const crear = await request(app)
      .post(`/api/casos/${idCaso}/actuaciones`)
      .set(como('coordinador'))
      .send({ tipo: 'Compromiso', descripcion: 'Compromiso de prueba', responsable: 'Estudiante' });
    expect(crear.status).toBe(201);

    const detalle = await request(app).get(`/api/casos/${idCaso}`).set(como('coordinador'));
    const actuacion = detalle.body.actuaciones.find((a) => a.descripcion === 'Compromiso de prueba');
    expect(actuacion).toBeDefined();

    const borrar = await request(app).delete(`/api/casos/${idCaso}/actuaciones/${actuacion.id}`).set(como('coordinador'));
    const borrarOtraVez = await request(app).delete(`/api/casos/${idCaso}/actuaciones/${actuacion.id}`).set(como('coordinador'));
    expect(borrar.status).toBe(200);
    expect(borrarOtraVez.status).toBe(404);
  });

  it('exporta el caso como CSV', async () => {
    const res = await request(app).get(`/api/casos/${idCaso}/exportar`).set(como('coordinador'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('ACTUACIONES Y COMPROMISOS');
  });

  it('genera una remisión numerada solo con confirmación expresa y permite descargar el PDF', async () => {
    const otro = await crearCaso();
    const sinConfirmar = await request(app).post(`/api/casos/${otro}/remision`).set(como('coordinador')).send({});
    const generar = await request(app).post(`/api/casos/${otro}/remision`).set(como('coordinador')).send({ confirmar: true });
    expect(sinConfirmar.status).toBe(400);
    expect(generar.status).toBe(201);
    expect(generar.body.numero).toMatch(/^REM-\d{4}-\d{4}$/);

    const lista = await request(app).get(`/api/casos/${otro}/remisiones`).set(como('coordinador'));
    expect(lista.body).toHaveLength(1);
    const pdf = await request(app).get(`/api/casos/${otro}/remisiones/${lista.body[0].id}/descarga`).set(como('coordinador'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    await purgarCasoDePrueba(otro);
  });

  it('no repite números de remisión después de purgar un caso de la base', async () => {
    const a = await crearCaso();
    const b = await crearCaso();
    const c = await crearCaso();
    const generar = (id) => request(app).post(`/api/casos/${id}/remision`).set(como('coordinador')).send({ confirmar: true });

    const remA = await generar(a);
    const remB = await generar(b);
    await purgarCasoDePrueba(a);
    const remC = await generar(c);

    expect(remA.status).toBe(201);
    expect(remB.status).toBe(201);
    expect(remC.status).toBe(201);
    expect(remC.body.numero).not.toBe(remB.body.numero);

    for (const id of [b, c]) await purgarCasoDePrueba(id);
  });

  it('cierra un caso en lugar de eliminarlo y su expediente sigue disponible', async () => {
    const otro = await crearCaso();
    const cerrar = await request(app).put(`/api/casos/${otro}`).set(como('coordinador')).send({ estado: 'Cerrado' });
    const consultar = await request(app).get(`/api/casos/${otro}`).set(como('coordinador'));
    expect(cerrar.status).toBe(200);
    expect(consultar.status).toBe(200);
    expect(consultar.body.caso.estado).toBe('Cerrado');
    await purgarCasoDePrueba(otro);
  });

  it('no existe ninguna forma de eliminar un caso por la API, ni para coordinador ni para administrador', async () => {
    const otro = await crearCaso();
    const comoCoordinador = await request(app).delete(`/api/casos/${otro}`).set(como('coordinador'));
    const comoAdmin = await request(app).delete(`/api/casos/${otro}`).set(como('admin'));
    const sigueExistiendo = await request(app).get(`/api/casos/${otro}`).set(como('coordinador'));
    expect(comoCoordinador.status).toBe(404);
    expect(comoAdmin.status).toBe(404);
    expect(sigueExistiendo.status).toBe(200);
    await purgarCasoDePrueba(otro);
  });
});

describe('Auditoría inalterable (RNF-05)', () => {
  it.skipIf(process.env.DB_USER === 'root')('el usuario de la aplicación no puede modificar ni borrar la auditoría', async () => {
    await expect(pool.query('UPDATE auditoria SET detalle = ? WHERE id = -1', ['x']))
      .rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
    await expect(pool.query('DELETE FROM auditoria WHERE id = -1'))
      .rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
  });

  it('si un caso se purga de la base fuera de la API, su auditoría se conserva sin vínculo (no se borra)', async () => {
    const otro = await crearCaso();
    const [[antes]] = await pool.query('SELECT COUNT(*) AS n FROM auditoria');
    const [[conVinculoAntes]] = await pool.query('SELECT COUNT(*) AS n FROM auditoria WHERE id_caso = ?', [otro]);
    expect(conVinculoAntes.n).toBeGreaterThanOrEqual(1); // al menos la auditoria de creacion del caso

    await purgarCasoDePrueba(otro);

    const [[despues]] = await pool.query('SELECT COUNT(*) AS n FROM auditoria');
    const [[conVinculoDespues]] = await pool.query('SELECT COUNT(*) AS n FROM auditoria WHERE id_caso = ?', [otro]);

    expect(despues.n).toBe(antes.n); // ninguna fila de auditoria se borra
    expect(conVinculoDespues.n).toBe(0); // pero queda sin vinculo a un caso que ya no existe
  });
});

describe('Endurecimiento del servidor', () => {
  it('no anuncia el framework y envía encabezados de seguridad', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('solo permite el origen configurado en CORS', async () => {
    const permitido = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    const ajeno = await request(app).get('/api/health').set('Origin', 'http://sitio-ajeno.example');
    expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responde JSON ante rutas de la API que no existen', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('limita los intentos fallidos de inicio de sesión', async () => {
    let ultimo;
    for (let i = 0; i < 25; i++) {
      ultimo = await request(app).post('/api/auth/login').send({ usuario: 'admin', contrasena: 'incorrecta' });
    }
    expect(ultimo.status).toBe(429);
  });
});
