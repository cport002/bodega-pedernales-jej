const express = require('express');
const { sql } = require('../database/db');
const { autenticar } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY, habilitado } = require('../services/push');

const router = express.Router();

// GET /api/notificaciones?solo_no_leidas=1 — siempre filtra por el usuario logueado, cada quien
// ve solo las suyas (misma logica que /solicitudes para el rol solicitante).
router.get('/', autenticar, async (req, res) => {
  try {
    const soloNoLeidas = req.query.solo_no_leidas === '1';
    const where = soloNoLeidas ? 'AND leida = 0' : '';
    const r = await sql(
      `SELECT * FROM notificaciones WHERE usuario_id = ? ${where} ORDER BY fecha DESC LIMIT 50`,
      [req.usuario.id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/count', autenticar, async (req, res) => {
  try {
    const r = await sql('SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida = 0', [req.usuario.id]);
    res.json({ total: Number(r.rows[0].total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/leer', autenticar, async (req, res) => {
  try {
    await sql('UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuario.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/leer-todas', autenticar, async (req, res) => {
  try {
    await sql('UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND leida = 0', [req.usuario.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/notificaciones/push/public-key — el frontend la necesita para pushManager.subscribe()
router.get('/push/public-key', autenticar, (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY || null, habilitado });
});

router.post('/push/subscribe', autenticar, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Suscripción inválida' });
    await sql(
      `INSERT INTO push_subscriptions (usuario_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET usuario_id = EXCLUDED.usuario_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.usuario.id, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/push/unsubscribe', autenticar, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) await sql('DELETE FROM push_subscriptions WHERE endpoint = ? AND usuario_id = ?', [endpoint, req.usuario.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
