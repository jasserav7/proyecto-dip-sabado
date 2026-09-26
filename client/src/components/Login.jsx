import { useState } from 'react';
import { Alert, Button, Card, Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { AuthAPI } from '../api';

const esquema = yup.object({
  usuario: yup.string().trim().required('Escriba su usuario'),
  contrasena: yup.string().required('Escriba su contraseña')
});

export default function Login({ onLogin }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: yupResolver(esquema),
    defaultValues: { usuario: '', contrasena: '' }
  });
  const [error, setError] = useState('');

  const onSubmit = async ({ usuario, contrasena }) => {
    setError('');
    try {
      const sesion = await AuthAPI.login(usuario, contrasena);
      onLogin(sesion);
    } catch (err) {
      setError(err?.response?.data?.error || 'No fue posible iniciar sesión');
    }
  };

  return (
    <div className="login-page fondo-campus">
      <Card className="login-card shadow-lg border-0">
        <Card.Body className="p-4">
          <Form noValidate onSubmit={handleSubmit(onSubmit)}>
            <img
              className="logo-login mb-2"
              src="/logo-colegio.png"
              alt="Escudo IED La Victoria"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <h1 className="h4 text-center mb-1" style={{ color: 'var(--azul)' }}>IED La Victoria</h1>
            <h2 className="h6 fw-normal text-center text-secondary mb-4">
              Registro de Convivencia y Remisión a Orientación
            </h2>

            <Form.Group className="mb-3" controlId="login-usuario">
              <Form.Label className="fw-semibold">Usuario</Form.Label>
              <Form.Control
                {...register('usuario')}
                isInvalid={!!errors.usuario}
                autoComplete="username"
                autoFocus
              />
              <Form.Control.Feedback type="invalid">{errors.usuario?.message}</Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="login-contrasena">
              <Form.Label className="fw-semibold">Contraseña</Form.Label>
              <Form.Control
                type="password"
                {...register('contrasena')}
                isInvalid={!!errors.contrasena}
                autoComplete="current-password"
              />
              <Form.Control.Feedback type="invalid">{errors.contrasena?.message}</Form.Control.Feedback>
            </Form.Group>

            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

            <Button type="submit" className="w-100" disabled={isSubmitting}>
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </Button>

            <details className="mt-3 small text-secondary">
              <summary style={{ cursor: 'pointer' }}>Usuarios de prueba</summary>
              <ul className="mt-2 mb-2 ps-3">
                <li>Administrador: <code>admin</code></li>
                <li>Coordinador: <code>coordinador</code></li>
                <li>Docente: <code>docente1</code> / <code>docente2</code></li>
                <li>Acudiente: <code>acud001</code></li>
                <li>Estudiante: <code>est001</code> / <code>est016</code></li>
              </ul>
              <p className="mb-0">Contraseña para todos: <code>Temporal2026*</code></p>
            </details>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
