const QRCode = require('qrcode');

// Genera el código corto único de un lote, ej. PED-000123
function generarCodigoLote(id) {
  return `PED-${String(id).padStart(6, '0')}`;
}

// PNG buffer del QR que codifica el código del lote (para imprimir en la etiqueta del pallet/ítem).
async function generarQrBuffer(codigo) {
  return QRCode.toBuffer(codigo, { errorCorrectionLevel: 'M', margin: 2, width: 300 });
}

module.exports = { generarCodigoLote, generarQrBuffer };
