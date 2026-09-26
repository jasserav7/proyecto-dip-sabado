import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, ListGroup } from 'react-bootstrap';
import { CasosAPI, descargarBlob } from '../api';
import { ETIQUETA_TIPO_ACTUACION } from '../constantes';
import ActuacionForm from './ActuacionForm';
import ConfirmModal from './ConfirmModal';
import EvidenciaForm from './EvidenciaForm';

const ESTADOS = ['Abierto', 'En seguimiento', 'Remitido', 'Cerrado'];

export default function CasoDetalle({ idCaso, sesion, onCambio }) {
  const [data, setData] = useState(null);
  const [remisiones, setRemisiones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const esStaffCompleto = ['Coordinador', 'Administrador'].includes(sesion.rol);
  const puedeCargarEvidencia = ['Docente', 'Coordinador', 'Administrador'].includes(sesion.rol);

  const cargar = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const detalle = await CasosAPI.get(idCaso);
      setData(detalle);
      if (esStaffCompleto || sesion.rol === 'Docente') {
        setRemisiones(await CasosAPI.listarRemisiones(idCaso));
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err?.response?.data?.error || err.message });
      setData(null);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (idCaso) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCaso]);

  const pedirConfirmacion = (opciones) => setConfirmacion({ ...opciones, show: true });
  const cancelarConfirmacion = () => setConfirmacion((c) => c && { ...c, show: false });
  const ejecutarConfirmacion = async () => {
    setProcesando(true);
    try {
      await confirmacion.accion();
    } finally {
      setProcesando(false);
      cancelarConfirmacion();
    }
  };

  const mostrarError = (err) => setMensaje({ tipo: 'error', texto: err?.response?.data?.error || err.message });

  const cambiarEstado = async (estado) => {
    try {
      await CasosAPI.cambiarEstado(idCaso, estado);
      await cargar();
      onCambio?.();
    } catch (err) {
      mostrarError(err);
    }
  };

  const agregarActuacion = async (datos) => {
    setMensaje(null);
    try {
      await CasosAPI.agregarActuacion(idCaso, datos);
      await cargar();
      onCambio?.();
      return true;
    } catch (err) {
      mostrarError(err);
      return false;
    }
  };

  const cargarEvidencia = async (datos) => {
    setMensaje(null);
    try {
      await CasosAPI.cargarEvidencia(idCaso, datos);
      await cargar();
      setMensaje({ tipo: 'ok', texto: 'Evidencia cargada correctamente' });
      return true;
    } catch (err) {
      mostrarError(err);
      return false;
    }
  };

  const eliminarActuacion = (a) => {
    const etiqueta = (ETIQUETA_TIPO_ACTUACION[a.tipo] || a.tipo).toLowerCase();
    pedirConfirmacion({
      titulo: `Eliminar ${etiqueta}`,
      mensaje: `¿Eliminar esta ${etiqueta} de forma permanente? Esta acción no se puede deshacer.`,
      textoConfirmar: 'Eliminar',
      variante: 'danger',
      accion: async () => {
        setMensaje(null);
        try {
          await CasosAPI.eliminarActuacion(idCaso, a.id);
          await cargar();
        } catch (err) {
          mostrarError(err);
        }
      }
    });
  };

  const descargarEvidencia = async (idEvidencia, nombre) => {
    const resp = await CasosAPI.descargarEvidencia(idCaso, idEvidencia);
    descargarBlob(resp.data, nombre);
  };

  const exportarCsv = async () => {
    const resp = await CasosAPI.exportarCsv(idCaso);
    descargarBlob(resp.data, `caso-${idCaso}.csv`);
  };

  const exportarPdf = async () => {
    const resp = await CasosAPI.exportarPdf(idCaso);
    descargarBlob(resp.data, `expediente-caso-${idCaso}.pdf`);
  };

  const generarRemision = () => {
    pedirConfirmacion({
      titulo: 'Generar remisión',
      mensaje: 'Está a punto de generar una remisión formal a Orientación Escolar. ¿Confirmar?',
      textoConfirmar: 'Generar remisión',
      variante: 'primary',
      accion: async () => {
        setMensaje(null);
        try {
          const r = await CasosAPI.generarRemision(idCaso);
          setMensaje({ tipo: 'ok', texto: `Remisión ${r.numero} generada` });
          await cargar();
          onCambio?.();
        } catch (err) {
          mostrarError(err);
        }
      }
    });
  };

  const descargarRemision = async (idRemision, numero) => {
    const resp = await CasosAPI.descargarRemision(idCaso, idRemision);
    descargarBlob(resp.data, `${numero}.pdf`);
  };

  if (cargando) return <Card><Card.Body>Cargando expediente...</Card.Body></Card>;
  if (!data) {
    return (
      <Card>
        <Card.Body className={mensaje ? 'text-danger' : ''}>{mensaje?.texto || 'Seleccione un caso'}</Card.Body>
      </Card>
    );
  }

  const { caso, actuaciones, evidencias } = data;

  return (
    <>
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <h2 className="h5 mb-0">Caso #{caso.id} — {caso.estudiante_nombre} {caso.estudiante_apellido}</h2>
            <div className="d-flex align-items-center gap-2">
              <span className={`badge tipo-${caso.clasificacion}`}>Tipo {caso.clasificacion}</span>
            </div>
          </div>

          {caso.clasificacion === 'III' && (
            <Alert variant="warning" className="py-2 small">
              Situación tipo III: active de inmediato las actuaciones previstas en la Ruta de Atención Integral
              para la Convivencia Escolar. Este registro no la reemplaza ni debe retrasarla.
            </Alert>
          )}

          <p className="mb-2"><strong>Fecha del hecho:</strong> {caso.fecha_hecho}</p>
          <p className="mb-2"><strong>Lugar:</strong> {caso.lugar}</p>
          <p className="mb-2"><strong>Descripción:</strong> {caso.descripcion}</p>
          <p className="mb-3">
            <strong>Estado actual:</strong>{' '}
            <span className={`badge estado-${caso.estado.replace(' ', '-')}`}>{caso.estado}</span>
          </p>

          {esStaffCompleto && (
            <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
              <Form.Group controlId="detalle-estado">
                <Form.Label className="fw-semibold small">Cambiar estado</Form.Label>
                <Form.Select value={caso.estado} onChange={(e) => cambiarEstado(e.target.value)}>
                  {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                </Form.Select>
              </Form.Group>
              <Button onClick={generarRemision}>Generar remisión a Orientación Escolar</Button>
            </div>
          )}

          {mensaje && (
            <Alert variant={mensaje.tipo === 'error' ? 'danger' : 'success'} className="py-2 small">
              {mensaje.texto}
            </Alert>
          )}

          <h3 className="h6 mt-4">Actuaciones y compromisos</h3>
          <ListGroup className="small">
            {actuaciones.map((a) => (
              <ListGroup.Item key={a.id}>
                <strong>[{ETIQUETA_TIPO_ACTUACION[a.tipo] || a.tipo}]</strong> {a.descripcion} — <em>{a.responsable}</em>
                {' '}— <span className={`badge estado-${a.estado}`}>{a.estado}</span>
                {a.fecha_compromiso && <span> — compromiso: {a.fecha_compromiso}</span>}
                {esStaffCompleto && (
                  <div className="mt-2">
                    <Button variant="outline-danger" size="sm" onClick={() => eliminarActuacion(a)}>Eliminar</Button>
                  </div>
                )}
              </ListGroup.Item>
            ))}
            {!actuaciones.length && <ListGroup.Item>Sin actuaciones registradas.</ListGroup.Item>}
          </ListGroup>

          {esStaffCompleto && <ActuacionForm onEnviar={agregarActuacion} />}

          {puedeCargarEvidencia && (
            <>
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4 mb-2">
                <h3 className="h6 mb-0">Evidencias</h3>
                {esStaffCompleto && (
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-secondary" onClick={exportarCsv}>Descargar CSV</Button>
                    <Button size="sm" onClick={exportarPdf}>Descargar PDF</Button>
                  </div>
                )}
              </div>
              <ListGroup className="small">
                {evidencias.map((ev) => (
                  <ListGroup.Item key={ev.id}>
                    {ev.nombre_original} — <span className={`badge nivel-${ev.nivel_acceso}`}>{ev.nivel_acceso}</span>
                    {' '}
                    <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => descargarEvidencia(ev.id, ev.nombre_original)}>
                      Descargar
                    </Button>
                  </ListGroup.Item>
                ))}
                {!evidencias.length && <ListGroup.Item>Sin evidencias cargadas.</ListGroup.Item>}
              </ListGroup>

              <EvidenciaForm onEnviar={cargarEvidencia} />
            </>
          )}

          {(esStaffCompleto || sesion.rol === 'Docente') && (
            <>
              <h3 className="h6 mt-4">Remisiones generadas</h3>
              <ListGroup className="small">
                {remisiones.map((r) => (
                  <ListGroup.Item key={r.id}>
                    {r.numero} — {r.fecha_generacion}
                    {' '}
                    <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => descargarRemision(r.id, r.numero)}>
                      Descargar PDF
                    </Button>
                  </ListGroup.Item>
                ))}
                {!remisiones.length && <ListGroup.Item>No se han generado remisiones para este caso.</ListGroup.Item>}
              </ListGroup>
            </>
          )}
        </Card.Body>
      </Card>

      <ConfirmModal
        show={!!confirmacion?.show}
        titulo={confirmacion?.titulo}
        mensaje={confirmacion?.mensaje}
        textoConfirmar={confirmacion?.textoConfirmar}
        variante={confirmacion?.variante}
        procesando={procesando}
        onConfirmar={ejecutarConfirmacion}
        onCancelar={cancelarConfirmacion}
      />
    </>
  );
}
