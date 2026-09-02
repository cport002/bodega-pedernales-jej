const webpush = require('web-push');
const { sql } = require('../database/db');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const habilitado = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (habilitado) {
  webpush.setVapidDetails('mailto:ing.cportilla@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Manda el push a todas las suscripciones de ese usuario (celular + notebook, etc). Si una
// suscripcion ya no es valida (410/404 — el navegador la revoco), se borra de la BD en vez de
// reintentar para siempre.
async function enviarPushAUsuario(usuarioId, payload) {
  if (!habilitado) return;
  const subs = (await sql('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE usuario_id = ?', [usuarioId])).rows;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sql('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
      }
    }
  }));
}

module.exports = { enviarPushAUsuario, habilitado, VAPID_PUBLIC_KEY };
