const QRCode = require('qrcode');

// Genera el código corto único de un lote, ej. PED-000123
function generarCodigoLote(id) {
  return `PED-${String(id).padStart(6, '0')}`;
}

// Folio corto del vale de una solicitud aprobada, ej. SOL-000042 — mismo criterio que el código
// de lote, para que sea reconocible a simple vista si no se puede leer el QR.
function generarFolioSolicitud(id) {
  return `SOL-${String(id).padStart(6, '0')}`;
}

// PNG buffer del QR que codifica el texto dado (código de lote o folio de vale, ambos son solo
// texto plano — se usa igual para imprimir en la etiqueta del pallet/ítem o en el vale de retiro).
async function generarQrBuffer(codigo) {
  return QRCode.toBuffer(codigo, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
}

module.exports = { generarCodigoLote, generarFolioSolicitud, generarQrBuffer };
