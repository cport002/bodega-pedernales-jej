const PDFDocument = require('pdfkit');
const { generarFolioSolicitud, generarQrBuffer } = require('./qr');

const AMBAR = '#b45309';
const GRIS_900 = '#1f2937';
const GRIS_600 = '#4b5563';
const GRIS_400 = '#9ca3af';

// Vale de retiro de un pedido aprobado — puede llevar uno o varios materiales (pedido.items), cada
// uno con su propia tabla de lote(s) de origen. El solicitante lo imprime/muestra y lo lleva a
// bodega; el bodeguero escanea el QR (o escribe el folio a mano si no puede leerlo) para llegar
// directo a la pantalla de ese pedido y confirmar la entrega física — una sola vez para todo.
async function generarValePDF(pedido, res) {
  const folio = generarFolioSolicitud(pedido.id);
  const qr = await generarQrBuffer(folio);

  const M = 56;
  const PAGE_W = 595.28;
  const CONTENT_W = PAGE_W - M * 2;

  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 70, left: M, right: M } });
  doc.pipe(res);

  const ANCHO_TITULO = CONTENT_W - 130; // deja espacio libre a la derecha para el QR
  doc.font('Helvetica-Bold').fontSize(16).fillColor(GRIS_900).text('JEJ Ingeniería — Bodega Internacional Pedernales', M, M, { width: ANCHO_TITULO });
  doc.font('Helvetica').fontSize(13).fillColor(AMBAR).text('Vale de Retiro de Material', M, doc.y + 4, { width: ANCHO_TITULO });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS_400).text(`Folio ${folio} · Aprobado ${new Date(pedido.fecha_resolucion).toLocaleString('es-CL')}`, M, doc.y + 2, { width: ANCHO_TITULO });

  doc.image(qr, PAGE_W - M - 110, M, { width: 110, height: 110 });
  doc.moveDown(2.5);

  function fila(label, valor) {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(GRIS_600).text(label, M, y, { width: 160 });
    doc.font('Helvetica').fontSize(10).fillColor(GRIS_900).text(String(valor ?? '-'), M + 160, y, { width: CONTENT_W - 160 });
    doc.moveDown(0.35);
  }

  fila('Solicitante', pedido.solicitante_nombre);
  fila('Frente / destino', pedido.frente_destino);
  fila('Aprobado por', pedido.revisor_nombre);
  fila('Cantidad de materiales', String((pedido.items || []).length));

  // Una seccion por material del pedido, cada una con su propia tabla de lote(s) de origen — para
  // que el bodeguero sepa de antemano de donde sacar cada cosa sin tener que buscarlo.
  for (const item of pedido.items || []) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(GRIS_900)
      .text(`${item.material_descripcion} — ${item.cantidad_aprobada ?? item.cantidad_solicitada} ${item.unidad || ''}`, M, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);

    const lotes = item.lotes || [];
    if (lotes.length === 0) continue;

    const colLote = M, colUbic = M + 110, colPallet = M + 280, colCant = M + 380;
    const tablaY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS_600);
    doc.text('LOTE', colLote, tablaY, { width: 100 });
    doc.text('UBICACIÓN', colUbic, tablaY, { width: 160 });
    doc.text('PALLET', colPallet, tablaY, { width: 90 });
    doc.text('CANTIDAD', colCant, tablaY, { width: CONTENT_W - (colCant - M), align: 'right' });
    doc.moveDown(0.4);
    doc.moveTo(M, doc.y).lineTo(PAGE_W - M, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9).fillColor(GRIS_900);
    for (const l of lotes) {
      const filaY = doc.y;
      doc.text(l.lote_codigo, colLote, filaY, { width: 100 });
      doc.text([l.ubicacion_1, l.ubicacion_2].filter(Boolean).join(' / ') || '-', colUbic, filaY, { width: 160 });
      doc.text(l.pallet_numero || '-', colPallet, filaY, { width: 90 });
      doc.text(`${l.cantidad} ${item.unidad || ''}`, colCant, filaY, { width: CONTENT_W - (colCant - M), align: 'right' });
      doc.moveDown(0.4);
    }
  }

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRIS_600)
    .text('Presentar este vale (impreso o en el celular) en bodega. El bodeguero escaneará el código QR — si no se puede leer, indicar el folio de arriba.', M, doc.y, { width: CONTENT_W });

  doc.end();
}

module.exports = { generarValePDF };
