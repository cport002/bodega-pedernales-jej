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

// Avisa a todo admin/bodeguero activo cuando un solicitante crea un pedido nuevo.
async function notificarNuevaSolicitud(solicitud, materialDescripcion, solicitanteNombre) {
  const destinatarios = (await sql("SELECT id FROM usuarios WHERE rol IN ('admin','bodeguero') AND activo = 1")).rows;
  const titulo = 'Nueva solicitud de material';
  const mensaje = `${solicitanteNombre} pidió ${solicitud.cantidad_solicitada} de ${materialDescripcion}`;
  await Promise.all(destinatarios.map(u =>
    crearNotificacion(sql, { usuario_id: u.id, tipo: 'solicitud_nueva', titulo, mensaje, solicitud_id: solicitud.id })
  ));
}

// Avisa al solicitante cuando su pedido fue aprobado o rechazado.
async function notificarResolucionSolicitud(solicitud, materialDescripcion, aprobada, motivoRechazo) {
  const titulo = aprobada ? 'Solicitud aprobada' : 'Solicitud rechazada';
  const mensaje = aprobada
    ? `Tu pedido de ${materialDescripcion} fue aprobado y ya se generó el despacho`
    : `Tu pedido de ${materialDescripcion} fue rechazado${motivoRechazo ? `: ${motivoRechazo}` : ''}`;
  await crearNotificacion(sql, {
    usuario_id: solicitud.solicitante_id,
    tipo: aprobada ? 'solicitud_aprobada' : 'solicitud_rechazada',
    titulo, mensaje, solicitud_id: solicitud.id,
  });
}

module.exports = { crearNotificacion, notificarNuevaSolicitud, notificarResolucionSolicitud };
