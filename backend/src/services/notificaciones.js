const { sql } = require('../database/db');
const { enviarPushAUsuario } = require('./push');

// Crea la notificacion en BD (campanita) y ademas intenta el push al celular/navegador — el push
// es "best effort": si falla (sin suscripcion, red caida, etc.) la notificacion en la campanita
// ya quedo guardada igual, no se pierde.
async function crearNotificacion(tsql, { usuario_id, tipo, titulo, mensaje, solicitud_id = null }) {
  await tsql(
    `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, solicitud_id) VALUES (?, ?, ?, ?, ?)`,
    [usuario_id, tipo, titulo, mensaje || null, solicitud_id]
  );
  enviarPushAUsuario(usuario_id, {
    titulo, mensaje, url: solicitud_id ? `/solicitudes/${solicitud_id}` : '/solicitudes',
  }).catch(() => {});
}

// resumenMateriales: texto corto armado por quien llama, ej. "CABLE 2/0" (1 item) o
// "3 materiales (CABLE 2/0, BRIDA..., y 1 más)" (varios) — la notificacion no necesita saber
// que un pedido puede tener varios items, solo mostrar un resumen legible.

// Avisa a todo admin/bodeguero activo cuando un solicitante crea un pedido nuevo.
async function notificarNuevaSolicitud(pedido, resumenMateriales, solicitanteNombre) {
  const destinatarios = (await sql("SELECT id FROM usuarios WHERE rol IN ('admin','bodeguero') AND activo = 1")).rows;
  const titulo = 'Nueva solicitud de material';
  const mensaje = `${solicitanteNombre} pidió ${resumenMateriales}`;
  await Promise.all(destinatarios.map(u =>
    crearNotificacion(sql, { usuario_id: u.id, tipo: 'solicitud_nueva', titulo, mensaje, solicitud_id: pedido.id })
  ));
}

// Avisa al solicitante cuando su pedido fue aprobado o rechazado.
async function notificarResolucionSolicitud(pedido, resumenMateriales, aprobada, motivoRechazo, folio) {
  const titulo = aprobada ? 'Solicitud aprobada — vale listo' : 'Solicitud rechazada';
  const mensaje = aprobada
    ? `Tu pedido de ${resumenMateriales} fue aprobado. Vale ${folio}: descárgalo y llévalo a bodega para retirar`
    : `Tu pedido de ${resumenMateriales} fue rechazado${motivoRechazo ? `: ${motivoRechazo}` : ''}`;
  await crearNotificacion(sql, {
    usuario_id: pedido.solicitante_id,
    tipo: aprobada ? 'solicitud_aprobada' : 'solicitud_rechazada',
    titulo, mensaje, solicitud_id: pedido.id,
  });
}

module.exports = { crearNotificacion, notificarNuevaSolicitud, notificarResolucionSolicitud };
