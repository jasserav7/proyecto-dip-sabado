import { useEffect, useState } from 'react';
import { Card, Table } from 'react-bootstrap';
import { CasosAPI } from '../api';

export default function MiExpediente({ sesion }) {
  const [casos, setCasos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    CasosAPI.porEstudiante(sesion.id)
      .then((r) => setCasos(r.casos))
      .finally(() => setCargando(false));
  }, [sesion.id]);

  return (
    <Card>
      <Card.Body>
        <h2 className="h5">Mi expediente de convivencia</h2>
        <p className="small text-secondary">Solo puedes ver el estado general de tus situaciones registradas.</p>

        {cargando && <p className="small text-secondary">Cargando...</p>}

        <Table responsive size="sm" className="align-middle mb-0">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Clasificación</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id}>
                <td>{c.fecha_hecho}</td>
                <td><span className={`badge tipo-${c.clasificacion}`}>Tipo {c.clasificacion}</span></td>
                <td><span className={`badge estado-${c.estado.replace(' ', '-')}`}>{c.estado}</span></td>
              </tr>
            ))}
            {!casos.length && !cargando && (
              <tr><td colSpan="3" className="text-center text-secondary">No tienes situaciones registradas</td></tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
