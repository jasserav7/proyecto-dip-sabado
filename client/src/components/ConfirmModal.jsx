import { Button, Modal } from 'react-bootstrap';

export default function ConfirmModal({
  show,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  variante = 'primary',
  procesando = false,
  onConfirmar,
  onCancelar
}) {
  return (
    <Modal show={show} onHide={procesando ? undefined : onCancelar} centered>
      <Modal.Header closeButton={!procesando}>
        <Modal.Title as="h5">{titulo}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{mensaje}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancelar} disabled={procesando}>Cancelar</Button>
        <Button variant={variante} onClick={onConfirmar} disabled={procesando}>
          {procesando ? 'Procesando...' : textoConfirmar}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
