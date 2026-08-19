const PDFDocument = require('pdfkit');

const AZUL = '#1d4ed8';
const GRIS_900 = '#1f2937';
const GRIS_600 = '#4b5563';
const GRIS_400 = '#9ca3af';

// Las URLs guardadas en BD son URLs de Cloudinary — se descargan por HTTP para embeberlas en el PDF.
async function descargarImagen(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// Genera el comprobante de despacho/devolución escribiendo directo al stream de respuesta HTTP.
async function generarComprobantePDF({ tipo, movimiento }, res) {
  const M = 56;
  const PAGE_W = 595.28;
  const CONTENT_W = PAGE_W - M * 2;

  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 70, left: M, right: M } });
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(16).fillColor(GRIS_900).text('JEJ Ingeniería — Bodega Internacional Pedernales', M, M);
  doc.font('Helvetica').fontSize(13).fillColor(AZUL).text(`Comprobante de ${tipo}`, M, doc.y + 4);
  doc.font('Helvetica').fontSize(9).fillColor(GRIS_400).text(`N° ${movimiento.id} · ${new Date(movimiento.fecha).toLocaleString('es-CL')}`, M, doc.y + 2);
  doc.moveDown(1.2);

  function fila(label, valor) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GRIS_600).text(label, M, y, { width: 160 });
    doc.font('Helvetica').fontSize(10).fillColor(GRIS_900).text(String(valor ?? '-'), M + 160, y, { width: CONTENT_W - 160 });
    doc.moveDown(0.35);
  }

  doc.font('Helvetica-Bold').fontSize(12).fillColor(GRIS_900).text('Material');
  doc.moveDown(0.3);
  fila('Lote', movimiento.lote_codigo);
  fila('Descripción', movimiento.material_descripcion);
  fila('TAG', movimiento.tag);
  fila('Pallet', movimiento.pallet_numero);
  fila('Cantidad', `${movimiento.cantidad} ${movimiento.unidad || ''}`);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(GRIS_900).text('Detalle del movimiento');
  doc.moveDown(0.3);
  if (tipo === 'DESPACHO') {
    fila('Frente de destino', movimiento.frente_destino);
    fila('Retirado por', movimiento.retirado_por);
  } else {
    fila('Motivo', movimiento.motivo);
  }
  fila('Observaciones', movimiento.observaciones);
  fila('Registrado por', movimiento.usuario_nombre);

  doc.moveDown(0.8);
  const firma = await descargarImagen(movimiento.firma_url);
  if (firma) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GRIS_900).text('Firma');
    doc.moveDown(0.2);
    try { doc.image(firma, M, doc.y, { width: 200, height: 90, fit: [200, 90] }); doc.y += 95; } catch { /* firma no válida, se omite */ }
  }

  const foto = await descargarImagen(movimiento.foto_url);
  if (foto) {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GRIS_900).text('Evidencia fotográfica');
    doc.moveDown(0.3);
    try { doc.image(foto, M, doc.y, { width: 180, height: 180, fit: [180, 180] }); doc.y += 185; } catch { /* foto no válida, se omite */ }
  }

  doc.end();
}

module.exports = { generarComprobantePDF };
