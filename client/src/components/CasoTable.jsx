import { useEffect, useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
import { CasosAPI } from '../api';

const ESTADOS = ['Abierto', 'En seguimiento', 'Remitido', 'Cerrado'];

export default function CasoTable({ reload, onSeleccionar, seleccionadoId }) {
  const [casos, setCasos] = useState([]);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const rows = await CasosAPI.list(estadoFiltro ? { estado: estadoFiltro } : undefined);
      setCasos(rows);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, estadoFiltro]);

  const alTeclear = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSeleccionar(id);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h2 className="h5 mb-0">Casos de convivencia</h2>
          <Form.Select
            size="sm"
            className="w-auto"
            aria-label="Filtrar por estado"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </Form.Select>
        </div>

        {cargando && <p className="small text-secondary">Cargando...</p>}

        <Table responsive hover size="sm" className="tabla-seleccionable align-middle mb-0">
          <thead>
            <tr>
              <th>#</th>
              <th>Estudiante</th>
              <th>Fecha del hecho</th>
              <th>Clasificación</th>
              <th>Estado</th>
              <th>Reportado por</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr
                key={c.id}
                className={c.id === seleccionadoId ? 'table-active' : ''}
                tabIndex={0}
                onClick={() => onSeleccionar(c.id)}
                onKeyDown={(e) => alTeclear(e, c.id)}
              >
                <td>{c.id}</td>
                <td>{c.estudiante_nombre} {c.estudiante_apellido}</td>
                <td>{c.fecha_hecho}</td>
                <td><span className={`badge tipo-${c.clasificacion}`}>Tipo {c.clasificacion}</span></td>
                <td><span className={`badge estado-${c.estado.replace(' ', '-')}`}>{c.estado}</span></td>
                <td>{c.reportado_por_nombre} {c.reportado_por_apellido} ({c.reportado_por_rol})</td>
              </tr>
            ))}
            {!casos.length && !cargando && (
              <tr><td colSpan="6" className="text-center text-secondary">Sin casos registrados</td></tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
