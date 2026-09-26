import { Button, Col, Form, Row } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { ESTADOS_ACTUACION, ETIQUETA_TIPO_ACTUACION, TIPOS_ACTUACION } from '../constantes';

const esquema = yup.object({
  tipo: yup.string().oneOf(TIPOS_ACTUACION, 'Seleccione el tipo').required('Seleccione el tipo'),
  responsable: yup.string().trim().required('Indique el responsable').max(120, 'El responsable no puede superar 120 caracteres'),
  descripcion: yup.string().trim().required('Describa la actuación o el compromiso').max(2000, 'La descripción no puede superar 2000 caracteres'),
  fecha_compromiso: yup.string(),
  estado: yup.string().oneOf(ESTADOS_ACTUACION, 'Seleccione el estado').required('Seleccione el estado')
});

const VALORES_INICIALES = { tipo: 'Actuacion', responsable: '', descripcion: '', fecha_compromiso: '', estado: 'Pendiente' };

export default function ActuacionForm({ onEnviar }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(esquema),
    defaultValues: VALORES_INICIALES
  });

  const enviar = async (datos) => {
    if (await onEnviar(datos)) reset(VALORES_INICIALES);
  };

  return (
    <Form noValidate className="border-top pt-3 mt-3" onSubmit={handleSubmit(enviar)}>
      <h4 className="h6">Registrar actuación o compromiso</h4>
      <Row>
        <Col sm={6}>
          <Form.Group className="mb-3" controlId="actuacion-tipo">
            <Form.Label className="fw-semibold small">Tipo</Form.Label>
            <Form.Select {...register('tipo')} isInvalid={!!errors.tipo}>
              {TIPOS_ACTUACION.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ACTUACION[t]}</option>)}
            </Form.Select>
            <Form.Control.Feedback type="invalid">{errors.tipo?.message}</Form.Control.Feedback>
          </Form.Group>
        </Col>
        <Col sm={6}>
          <Form.Group className="mb-3" controlId="actuacion-responsable">
            <Form.Label className="fw-semibold small">Responsable</Form.Label>
            <Form.Control {...register('responsable')} isInvalid={!!errors.responsable} />
            <Form.Control.Feedback type="invalid">{errors.responsable?.message}</Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      <Form.Group className="mb-3" controlId="actuacion-descripcion">
        <Form.Label className="fw-semibold small">Descripción</Form.Label>
        <Form.Control as="textarea" rows={2} {...register('descripcion')} isInvalid={!!errors.descripcion} />
        <Form.Control.Feedback type="invalid">{errors.descripcion?.message}</Form.Control.Feedback>
      </Form.Group>
      <Row>
        <Col sm={6}>
          <Form.Group className="mb-3" controlId="actuacion-fecha">
            <Form.Label className="fw-semibold small">Fecha compromiso</Form.Label>
            <Form.Control type="date" {...register('fecha_compromiso')} isInvalid={!!errors.fecha_compromiso} />
            <Form.Control.Feedback type="invalid">{errors.fecha_compromiso?.message}</Form.Control.Feedback>
          </Form.Group>
        </Col>
        <Col sm={6}>
          <Form.Group className="mb-3" controlId="actuacion-estado">
            <Form.Label className="fw-semibold small">Estado</Form.Label>
            <Form.Select {...register('estado')} isInvalid={!!errors.estado}>
              {ESTADOS_ACTUACION.map((e) => <option key={e} value={e}>{e}</option>)}
            </Form.Select>
            <Form.Control.Feedback type="invalid">{errors.estado?.message}</Form.Control.Feedback>
          </Form.Group>
        </Col>
      </Row>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Agregando...' : 'Agregar'}</Button>
    </Form>
  );
}
