import { useEffect, useState } from 'react';
import { Card, Form, Table } from 'react-bootstrap';
import { CatalogosAPI, CasosAPI } from '../api';

export default function ExpedienteFamiliar() {
  const [acudidos, setAcudidos] = useState([]);
  const [idEstudiante, setIdEstudiante] = useState('');
  const [casos, setCasos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    CatalogosAPI.misAcudidos().then((rows) => {
      setAcudidos(rows);
      if (rows.length) setIdEstudiante(String(rows[0].id));
    });
  }, []);

  useEffect(() => {
    if (!idEstudiante) return;
    setCargando(true);
    CasosAPI.porEstudiante(idEstudiante)
      .then((r) => setCasos(r.casos))
      .finally(() => setCargando(false));
  }, [idEstudiante]);

  return (
    <Card>
      <Card.Body>
        <h2 className="h5">Expediente de mis acudidos</h2>
        <p className="small text-secondary">
          Esta vista muestra la información que puede comunicarse a la familia, sin revelar
          datos reservados de terceros ni notas de seguimiento interno.
        </p>

        <Form.Group className="mb-3" controlId="familiar-estudiante">
          <Form.Label className="fw-semibold small">Estudiante</Form.Label>
          <Form.Select value={idEstudiante} onChange={(e) => setIdEstudiante(e.target.value)}>
            {acudidos.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre} {a.apellido}</option>
            ))}
          </Form.Select>
        </Form.Group>

        {cargando && <p className="small text-secondary">Cargando...</p>}

        <Table responsive size="sm" className="align-middle mb-0">
          <thead>
            <tr>
              <th>Fecha del hecho</th>
              <th>Lugar</th>
              <th>Clasificación</th>
              <th>Estado</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <tr key={c.id}>
                <td>{c.fecha_hecho}</td>
                <td>{c.lugar}</td>
                <td><span className={`badge tipo-${c.clasificacion}`}>Tipo {c.clasificacion}</span></td>
                <td><span className={`badge estado-${c.estado.replace(' ', '-')}`}>{c.estado}</span></td>
                <td>{c.descripcion}</td>
              </tr>
            ))}
            {!casos.length && !cargando && (
              <tr><td colSpan="5" className="text-center text-secondary">Sin situaciones registradas</td></tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
