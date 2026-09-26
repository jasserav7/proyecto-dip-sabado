import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOADS_DIR = path.resolve('uploads', 'remisiones');
const ETIQUETA_TIPO_ACTUACION = { Actuacion: 'Actuación', Compromiso: 'Compromiso', Observacion: 'Observación' };

/**
 * Genera el PDF de remision a Orientacion Escolar.
 * Contiene unicamente hechos y motivos de atencion (nunca diagnosticos
 * clinicos que no hayan sido emitidos por un profesional competente).
 * El archivo se guarda fuera del directorio publico; solo se referencia
 * su nombre tecnico en la base de datos.
 */
export function generarRemisionPDF({ numero, caso, estudiante, actuaciones, generadoPor }) {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  const nombreTecnico = `${crypto.randomUUID()}.pdf`;
  const rutaAbsoluta = path.join(UPLOADS_DIR, nombreTecnico);

  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(rutaAbsoluta);
  doc.pipe(stream);

  doc.fontSize(16).font('Helvetica-Bold').text('Institución Educativa Distrital La Victoria', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Remisión a Orientación Escolar', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(10).font('Helvetica-Bold').text(`Número de remisión: `, { continued: true }).font('Helvetica').text(numero);
  doc.font('Helvetica-Bold').text(`Fecha de generación: `, { continued: true }).font('Helvetica').text(new Date().toLocaleString('es-CO'));
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Datos del estudiante');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Nombre: ${estudiante.nombre} ${estudiante.apellido}`);
  doc.text(`Identificación: ${estudiante.identificacion}`);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Hechos y motivo de atención');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Fecha del hecho: ${caso.fecha_hecho}`);
  doc.text(`Lugar: ${caso.lugar}`);
  doc.text(`Clasificación inicial: Tipo ${caso.clasificacion}`);
  doc.moveDown(0.5);
  doc.text('Descripción objetiva:');
  doc.text(caso.descripcion, { indent: 10 });
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Actuaciones y compromisos registrados');
  doc.font('Helvetica').fontSize(10);
  if (!actuaciones.length) {
    doc.text('No se registraron actuaciones previas.');
  } else {
    actuaciones.forEach((a, i) => {
      doc.text(`${i + 1}. [${ETIQUETA_TIPO_ACTUACION[a.tipo] || a.tipo}] ${a.descripcion} — Responsable: ${a.responsable} — Estado: ${a.estado}`);
    });
  }
  doc.moveDown(1.5);

  doc.font('Helvetica').fontSize(9).fillColor('gray').text(
    'Este documento reporta hechos y motivos de atención según el Manual de Convivencia. ' +
    'No incluye diagnósticos clínicos ni valoraciones psicológicas que no hayan sido emitidos ' +
    'por un profesional competente. No sustituye la Ruta de Atencion Integral para la Convivencia Escolar.',
    { align: 'justify' }
  );
  doc.moveDown(1);
  doc.fillColor('black').fontSize(10).text(`Generado por: ${generadoPor.nombre} ${generadoPor.apellido} (${generadoPor.rol})`);

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve({ nombreTecnico, rutaAbsoluta }));
    stream.on('error', reject);
  });
}
