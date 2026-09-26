import { Button, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { TAMANO_MAXIMO_EVIDENCIA, TIPOS_EVIDENCIA_PERMITIDOS } from '../constantes';

const esquema = yup.object({
  archivo: yup
    .mixed()
    .test('requerido', 'Seleccione un archivo', (lista) => lista?.length > 0)
    .test('tipo', 'Solo se admiten archivos PDF, JPG o PNG', (lista) => !lista?.length || TIPOS_EVIDENCIA_PERMITIDOS.includes(lista[0].type))
    .test('tamano', 'El archivo supera el tamaño máximo de 10 MB', (lista) => !lista?.length || lista[0].size <= TAMANO_MAXIMO_EVIDENCIA),
  nivel_acceso: yup.string().oneOf(['restringido', 'general']).required('Seleccione el nivel de acceso')
});

export default function EvidenciaForm({ onEnviar }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(esquema),
    defaultValues: { nivel_acceso: 'restringido' }
  });

  const enviar = async ({ archivo, nivel_acceso }) => {
    const datos = new FormData();
    datos.append('archivo', archivo[0]);
    datos.append('nivel_acceso', nivel_acceso);
    if (await onEnviar(datos)) reset({ nivel_acceso });
  };

  return (
    <Form noValidate className="border-top pt-3 mt-3" onSubmit={handleSubmit(enviar)}>
      <h4 className="h6">Cargar evidencia</h4>
      <Form.Group className="mb-3" controlId="evidencia-archivo">
        <Form.Label className="fw-semibold small">Archivo (PDF, JPG o PNG, máximo 10 MB)</Form.Label>
        <Form.Control
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          {...register('archivo')}
          isInvalid={!!errors.archivo}
        />
        <Form.Control.Feedback type="invalid">{errors.archivo?.message}</Form.Control.Feedback>
      </Form.Group>
      <Form.Group className="mb-3" controlId="evidencia-nivel">
        <Form.Label className="fw-semibold small">Nivel de acceso</Form.Label>
        <Form.Select {...register('nivel_acceso')} isInvalid={!!errors.nivel_acceso}>
          <option value="restringido">Restringido</option>
          <option value="general">General</option>
        </Form.Select>
        <Form.Control.Feedback type="invalid">{errors.nivel_acceso?.message}</Form.Control.Feedback>
      </Form.Group>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Cargando...' : 'Cargar'}</Button>
    </Form>
  );
}
