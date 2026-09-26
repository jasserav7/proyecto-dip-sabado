import { useEffect, useState } from 'react';
import { Card, Table } from 'react-bootstrap';
import { AuditoriaAPI } from '../api';

export default function AuditoriaTable() {
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    AuditoriaAPI.list().then(setRegistros).finally(() => setCargando(false));
  }, []);

  return (
    <Card>
      <Card.Body>
        <h2 className="h5">Auditoría</h2>
        {cargando && <p className="small text-secondary">Cargando...</p>}
        <Table responsive hover size="sm" className="align-middle mb-0">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Caso</th>
              <th>Acción</th>
              <th>Detalle</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha_hora}</td>
                <td>{r.id_caso ?? '—'}</td>
                <td>{r.tipo_accion}</td>
                <td>{r.detalle}</td>
                <td>{r.usuario_nombre} {r.usuario_apellido} ({r.usuario_rol})</td>
              </tr>
            ))}
            {!registros.length && !cargando && (
              <tr><td colSpan="5" className="text-center text-secondary">Sin registros de auditoría</td></tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
