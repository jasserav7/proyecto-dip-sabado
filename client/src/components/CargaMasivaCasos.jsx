import { useState } from 'react';
import { Alert, Button, Card, Form, ListGroup } from 'react-bootstrap';
import { CasosAPI } from '../api';

const COLUMNAS = 'identificacion_estudiante,fecha_hecho,lugar,descripcion,clasificacion';

/**
 * Carga masiva de casos de convivencia desde un CSV. Cada fila se valida y
 * se registra igual que el formulario individual (CasoForm): un Docente
 * solo puede cargar estudiantes de sus propios cursos. El archivo nunca se
 * guarda, solo se usa para crear los casos.
 */
export default function CargaMasivaCasos({ onCreado }) {
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    if (!archivo) {
      setError('Seleccione un archivo CSV');
      return;
    }
    setError('');
    setResultado(null);
    setCargando(true);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const res = await CasosAPI.cargaMasiva(datos);
      setResultado(res);
      if (res.creados?.length) onCreado?.();
    } catch (err) {
      setError(err?.response?.data?.error || 'No fue posible procesar el archivo');
    } finally {
      setCargando(false);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Body>
        <details>
          <summary className="h6 mb-0" style={{ cursor: 'pointer' }}>Carga masiva de casos por CSV</summary>

          <Form noValidate className="mt-3" onSubmit={enviar}>
            <p className="small text-secondary mb-2">
              El archivo debe traer esta primera fila (encabezado), separada por comas:
            </p>
            <p className="small mb-3"><code>{COLUMNAS}</code></p>

            <Form.Group className="mb-3" controlId="carga-masiva-archivo">
              <Form.Label className="fw-semibold small">Archivo CSV</Form.Label>
              <Form.Control
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
              />
            </Form.Group>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

            <Button type="submit" size="sm" disabled={cargando}>
              {cargando ? 'Procesando...' : 'Cargar CSV'}
            </Button>

            {resultado && (
              <div className="mt-3">
                <Alert variant={resultado.creados.length ? 'success' : 'warning'} className="py-2 small mb-2">
                  {resultado.creados.length} caso(s) creado(s) — {resultado.errores.length} fila(s) con error.
                </Alert>
                {resultado.errores.length > 0 && (
                  <ListGroup className="small">
                    {resultado.errores.map((e, i) => (
                      <ListGroup.Item key={i} className="text-danger">
                        Fila {e.fila}{e.identificacion ? ` (identificación ${e.identificacion})` : ''}: {e.error}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                )}
              </div>
            )}
          </Form>
        </details>
      </Card.Body>
    </Card>
  );
}
