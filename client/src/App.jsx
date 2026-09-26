import { useState } from 'react';
import { Button, Card, Col, Nav, Row } from 'react-bootstrap';
import './App.css';
import Login from './components/Login';
import CasoForm from './components/CasoForm';
import CargaMasivaCasos from './components/CargaMasivaCasos';
import CasoTable from './components/CasoTable';
import CasoDetalle from './components/CasoDetalle';
import ExpedienteFamiliar from './components/ExpedienteFamiliar';
import MiExpediente from './components/MiExpediente';
import AuditoriaTable from './components/AuditoriaTable';

function useSesion() {
  const [sesion, setSesion] = useState(() => {
    const guardada = localStorage.getItem('sesion');
    return guardada ? JSON.parse(guardada) : null;
  });

  const iniciarSesion = (datos) => {
    localStorage.setItem('sesion', JSON.stringify(datos));
    setSesion(datos);
  };

  const cerrarSesion = () => {
    localStorage.removeItem('sesion');
    setSesion(null);
  };

  return { sesion, iniciarSesion, cerrarSesion };
}

function PanelStaff({ sesion }) {
  const [reload, setReload] = useState(0);
  const [idCaso, setIdCaso] = useState(null);
  const puedeRegistrar = ['Docente', 'Coordinador', 'Administrador'].includes(sesion.rol);

  const refrescar = () => setReload((r) => r + 1);

  return (
    <Row className="g-3">
      <Col lg={6}>
        {puedeRegistrar && <CasoForm onCreado={refrescar} />}
        {puedeRegistrar && <CargaMasivaCasos onCreado={refrescar} />}
        <CasoTable reload={reload} onSeleccionar={setIdCaso} seleccionadoId={idCaso} />
      </Col>
      <Col lg={6}>
        {idCaso
          ? <CasoDetalle idCaso={idCaso} sesion={sesion} onCambio={refrescar} />
          : (
            <Card>
              <Card.Body>Seleccione un caso de la tabla para ver su expediente.</Card.Body>
            </Card>
          )}
      </Col>
    </Row>
  );
}

export default function App() {
  const { sesion, iniciarSesion, cerrarSesion } = useSesion();
  const [pestana, setPestana] = useState('casos');

  if (!sesion) {
    return <Login onLogin={iniciarSesion} />;
  }

  return (
    <div className="d-flex flex-column min-vh-100 fondo-campus">
      <header className="app-header px-3 px-md-4 py-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div className="d-flex align-items-center gap-3">
            <img
              className="logo-colegio"
              src="/logo-colegio.png"
              alt="Escudo IED La Victoria"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div>
              <h1 className="h5 mb-0">Registro de Convivencia y Remisión a Orientación</h1>
              <p className="small mb-0 opacity-75">IED La Victoria</p>
            </div>
          </div>
          <div className="d-flex align-items-center gap-3 small">
            <span>{sesion.nombre} {sesion.apellido} — {sesion.rol}</span>
            <Button variant="outline-light" size="sm" onClick={cerrarSesion}>Cerrar sesión</Button>
          </div>
        </div>
      </header>

      {sesion.rol === 'Administrador' && (
        <Nav
          className="nav-underline bg-white border-bottom px-3 flex-nowrap overflow-auto"
          activeKey={pestana}
          onSelect={(clave) => setPestana(clave)}
        >
          <Nav.Item>
            <Nav.Link as="button" type="button" eventKey="casos" className="text-nowrap">Casos</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link as="button" type="button" eventKey="auditoria" className="text-nowrap">Auditoría</Nav.Link>
          </Nav.Item>
        </Nav>
      )}

      <main className="flex-grow-1 p-2 p-md-3">
        {['Docente', 'Coordinador', 'Administrador'].includes(sesion.rol) && pestana === 'casos' && (
          <PanelStaff sesion={sesion} />
        )}
        {sesion.rol === 'Administrador' && pestana === 'auditoria' && <AuditoriaTable />}
        {sesion.rol === 'Acudiente' && <ExpedienteFamiliar />}
        {sesion.rol === 'Estudiante' && <MiExpediente sesion={sesion} />}
      </main>
    </div>
  );
}
