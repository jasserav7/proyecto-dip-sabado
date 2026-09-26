import { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Form, Row } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { CatalogosAPI, CasosAPI } from '../api';

const CLASIFICACIONES = [
  { valor: 'I', etiqueta: 'Tipo I' },
  { valor: 'II', etiqueta: 'Tipo II' },
  { valor: 'III', etiqueta: 'Tipo III' }
];

const esquema = yup.object({
  id_vigencia: yup.string().required('Seleccione la vigencia'),
  id_curso: yup.string().required('Seleccione el curso'),
  id_estudiante: yup.string().required('Seleccione un estudiante'),
  fecha_hecho: yup
    .string()
    .required('Indique la fecha y hora del hecho')
    .test('no-futura', 'La fecha y hora del hecho no puede ser futura', (v) => !v || new Date(v).getTime() <= Date.now() + 5 * 60 * 1000),
  lugar: yup.string().trim().required('Indique el lugar del hecho').max(120, 'El lugar no puede superar 120 caracteres'),
  clasificacion: yup.string().oneOf(['I', 'II', 'III'], 'Seleccione la clasificación inicial').required('Seleccione la clasificación inicial'),
  descripcion: yup.string().trim().required('Describa objetivamente el hecho').max(2000, 'La descripción no puede superar 2000 caracteres')
});

const VALORES_INICIALES = {
  id_vigencia: '',
  id_curso: '',
  id_estudiante: '',
  fecha_hecho: '',
  lugar: '',
  clasificacion: 'I',
  descripcion: ''
};

export default function CasoForm({ onCreado }) {
  const { register, handleSubmit, control, setValue, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(esquema),
    defaultValues: VALORES_INICIALES
  });
  const [cursos, setCursos] = useState([]);
  const [vigencias, setVigencias] = useState([]);
  const [estudiantesCargados, setEstudiantesCargados] = useState([]);
  const [mensaje, setMensaje] = useState(null);

  const idCurso = useWatch({ control, name: 'id_curso' });
  const idVigencia = useWatch({ control, name: 'id_vigencia' });
  const clasificacion = useWatch({ control, name: 'clasificacion' });
  const estudiantes = idCurso && idVigencia ? estudiantesCargados : [];

  useEffect(() => {
    (async () => {
      const [c, v] = await Promise.all([CatalogosAPI.cursos(), CatalogosAPI.vigencias()]);
      setCursos(c);
      setVigencias(v);
      if (v.length) setValue('id_vigencia', String(v[0].id));
    })();
  }, [setValue]);

  useEffect(() => {
    if (!idCurso || !idVigencia) return undefined;
    let vigente = true;
    CatalogosAPI.estudiantesPorCurso(idCurso, idVigencia).then((filas) => {
      if (vigente) setEstudiantesCargados(filas);
    });
    return () => { vigente = false; };
  }, [idCurso, idVigencia]);

  const limpiarEstudiante = () => setValue('id_estudiante', '');

  const onSubmit = async ({ id_estudiante, fecha_hecho, lugar, clasificacion: tipo, descripcion }) => {
    setMensaje(null);
    try {
      await CasosAPI.create({ id_estudiante, fecha_hecho, lugar, clasificacion: tipo, descripcion });
      setMensaje({ tipo: 'ok', texto: 'Caso registrado correctamente' });
      reset({ ...VALORES_INICIALES, id_vigencia: idVigencia });
      onCreado?.();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err?.response?.data?.error || err.message });
    }
  };

  return (
    <Card className="mb-3">
      <Card.Body>
        <Form noValidate onSubmit={handleSubmit(onSubmit)}>
          <h2 className="h5 mb-3">Registro del hecho</h2>

          <Row>
            <Col sm={6}>
              <Form.Group className="mb-3" controlId="caso-vigencia">
                <Form.Label className="fw-semibold small">Vigencia</Form.Label>
                <Form.Select {...register('id_vigencia', { onChange: limpiarEstudiante })} isInvalid={!!errors.id_vigencia}>
                  {vigencias.map((v) => (
                    <option key={v.id} value={v.id}>{v.id}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.id_vigencia?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group className="mb-3" controlId="caso-curso">
                <Form.Label className="fw-semibold small">Curso</Form.Label>
                <Form.Select {...register('id_curso', { onChange: limpiarEstudiante })} isInvalid={!!errors.id_curso}>
                  <option value="">Seleccione...</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.grado}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.id_curso?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3" controlId="caso-estudiante">
            <Form.Label className="fw-semibold small">Estudiante</Form.Label>
            <Form.Select {...register('id_estudiante')} isInvalid={!!errors.id_estudiante}>
              <option value="">Seleccione un estudiante...</option>
              {estudiantes.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} {e.apellido} ({e.identificacion})</option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">{errors.id_estudiante?.message}</Form.Control.Feedback>
          </Form.Group>

          <Row>
            <Col sm={6}>
              <Form.Group className="mb-3" controlId="caso-fecha">
                <Form.Label className="fw-semibold small">Fecha y hora del hecho</Form.Label>
                <Form.Control type="datetime-local" {...register('fecha_hecho')} isInvalid={!!errors.fecha_hecho} />
                <Form.Control.Feedback type="invalid">{errors.fecha_hecho?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col sm={6}>
              <Form.Group className="mb-3" controlId="caso-lugar">
                <Form.Label className="fw-semibold small">Lugar</Form.Label>
                <Form.Control {...register('lugar')} isInvalid={!!errors.lugar} />
                <Form.Control.Feedback type="invalid">{errors.lugar?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3" controlId="caso-clasificacion">
            <Form.Label className="fw-semibold small">Clasificación inicial</Form.Label>
            <Form.Select {...register('clasificacion')} isInvalid={!!errors.clasificacion}>
              {CLASIFICACIONES.map((c) => (
                <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
              ))}
            </Form.Select>
            <Form.Control.Feedback type="invalid">{errors.clasificacion?.message}</Form.Control.Feedback>
          </Form.Group>

          {clasificacion === 'III' && (
            <Alert variant="warning" className="py-2 small">
              Las situaciones tipo III requieren las actuaciones inmediatas de la Ruta de Atención Integral.
              Guardar este registro no puede retrasarlas.
            </Alert>
          )}

          <Form.Group className="mb-3" controlId="caso-descripcion">
            <Form.Label className="fw-semibold small">Descripción objetiva del hecho</Form.Label>
            <Form.Control as="textarea" rows={4} {...register('descripcion')} isInvalid={!!errors.descripcion} />
            <Form.Control.Feedback type="invalid">{errors.descripcion?.message}</Form.Control.Feedback>
          </Form.Group>

          {mensaje && (
            <Alert variant={mensaje.tipo === 'error' ? 'danger' : 'success'} className="py-2 small">
              {mensaje.texto}
            </Alert>
          )}

          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Registrando...' : 'Registrar caso'}</Button>
        </Form>
      </Card.Body>
    </Card>
  );
}
