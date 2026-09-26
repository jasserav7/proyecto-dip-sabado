import PDFDocument from 'pdfkit';
import { formatearFecha } from './formato.js';

const ETIQUETA_TIPO_ACTUACION = { Actuacion: 'Actuación', Compromiso: 'Compromiso', Observacion: 'Observación' };

/**
 * Genera en memoria (sin tocar disco) el PDF del expediente completo de un caso:
 * datos del hecho, actuaciones/compromisos y metadatos de evidencias. A diferencia
 * de la remisión formal (generarRemisionPDF.js), este documento es de uso interno
 * y sirve como respaldo/backup del expediente, por lo que se marca explícitamente
 * como tal y no reemplaza la remisión oficial a Orientación Escolar.
 */
export function generarExpedientePDF({ caso, estudiante, actuaciones, evidencias, generadoPor }) {
  const doc = new PDFDocument({ margin: 50, bufferPages: true });
  const trozos = [];
  doc.on('data', (trozo) => trozos.push(trozo));

  doc.fontSize(16).font('Helvetica-Bold').text('Institución Educativa Distrital La Victoria', { align: 'center' });
  doc.fontSize(12).font('Helvetica').text('Expediente de Convivencia Escolar', { align: 'center' });
  doc.fontSize(9).fillColor('gray')
    .text('Documento de uso interno — no reemplaza la remisión oficial a Orientación Escolar', { align: 'center' });
  doc.fillColor('black');
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(10).text('Caso N.º: ', { continued: true }).font('Helvetica').text(String(caso.id));
  doc.font('Helvetica-Bold').text('Fecha de exportación: ', { continued: true }).font('Helvetica').text(formatearFecha(new Date().toISOString()));
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Datos del estudiante');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Nombre: ${estudiante.nombre} ${estudiante.apellido}`);
  doc.text(`Identificación: ${estudiante.identificacion}`);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Registro del hecho');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Fecha del hecho: ${formatearFecha(caso.fecha_hecho)}`);
  doc.text(`Lugar: ${caso.lugar}`);
  doc.text(`Clasificación inicial: Tipo ${caso.clasificacion}`);
  doc.text(`Estado actual: ${caso.estado}`);
  doc.text(`Fecha de registro en el sistema: ${formatearFecha(caso.fecha_registro)}`);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Descripción objetiva:');
  doc.font('Helvetica').text(caso.descripcion, { indent: 10 });
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Actuaciones y compromisos');
  doc.font('Helvetica').fontSize(10);
  if (!actuaciones.length) {
    doc.fillColor('gray').text('Sin actuaciones registradas.').fillColor('black');
  } else {
    actuaciones.forEach((a, i) => {
      doc.font('Helvetica-Bold').text(`${i + 1}. [${ETIQUETA_TIPO_ACTUACION[a.tipo] || a.tipo}] `, { continued: true });
      doc.font('Helvetica').text(a.descripcion);
      doc.fontSize(9).fillColor('gray').text(
        `   Responsable: ${a.responsable}  •  Estado: ${a.estado}` +
        (a.fecha_compromiso ? `  •  Compromiso: ${formatearFecha(a.fecha_compromiso)}` : '') +
        (a.fecha_cumplimiento ? `  •  Cumplimiento: ${formatearFecha(a.fecha_cumplimiento)}` : '')
      );
      doc.fillColor('black').fontSize(10);
      doc.moveDown(0.3);
    });
  }
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(11).text('Evidencias adjuntas');
  doc.font('Helvetica').fontSize(10);
  if (!evidencias.length) {
    doc.fillColor('gray').text('Sin evidencias cargadas.').fillColor('black');
  } else {
    evidencias.forEach((ev, i) => {
      doc.text(
        `${i + 1}. ${ev.nombre_original} — ${ev.tipo_archivo || 'tipo desconocido'} — ` +
        `acceso ${ev.nivel_acceso} — cargada el ${formatearFecha(ev.fecha_carga)}`
      );
    });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('gray').text(
      'Los archivos originales se descargan por separado desde el sistema; este listado solo registra sus metadatos.'
    );
    doc.fillColor('black').fontSize(10);
  }
  doc.moveDown(1.5);

  doc.fontSize(9).fillColor('gray').text(
    'Este documento reporta hechos y motivos de atención según el Manual de Convivencia. ' +
    'No incluye diagnósticos clínicos ni valoraciones psicológicas que no hayan sido emitidos ' +
    'por un profesional competente.',
    { align: 'justify' }
  );
  doc.moveDown(1);
  doc.fillColor('black').fontSize(10).text(`Generado por: ${generadoPor.nombre} ${generadoPor.apellido} (${generadoPor.rol})`);

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });
}
