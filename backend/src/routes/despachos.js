const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { generarComprobantePDF } = require('../services/comprobantePdf');
const { crearDespachoEnTransaccion } = require('../services/despachoService');

const router = express.Router();

const SELECT_DETALLE = `
  SELECT d.*, l.codigo AS lote_codigo, l.tag, l.pallet_numero, m.descripcion AS material_descripcion, m.unidad,
    u.nombre AS usuario_nombre
  FROM despachos d
  JOIN lotes l ON l.id = d.lote_id
  JOIN materiales m ON m.id = l.material_id
  LEFT JOIN usuarios u ON u.id = d.usuario_id
`;

// GET /api/despachos?lote_id=
router.get('/', autenticar, autorizar('admin', 'bodeguero', 'visor'), async (req, res) => {
  try {
    const { lote_id } = req.query;
    const condiciones = lote_id ? 'WHERE d.lote_id = ?' : '';
    const params = lote_id ? [lote_id] : [];
    const r = await sql(`${SELECT_DETALLE} ${condiciones} ORDER BY d.id DESC LIMIT 200`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/despachos/:id/pdf
router.get('/:id/pdf', autenticar, autorizar('admin', 'bodeguero', 'visor'), async (req, res) => {
  try {
    const despacho = (await sql(`${SELECT_DETALLE} WHERE d.id = ?`, [req.params.id])).rows[0];
    if (!despacho) return res.status(404).json({ error: 'Despacho no encontrado' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="despacho_${despacho.id}.pdf"`);
    await generarComprobantePDF({ tipo: 'DESPACHO', movimiento: despacho }, res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/despachos — multipart: firma (requerida), foto (opcional)
router.post('/', autenticar, autorizar('admin', 'bodeguero'), upload.fields([
  { name: 'firma', maxCount: 1 },
  { name: 'foto', maxCount: 1 }
]), async (req, res) => {
  try {
    const { lote_id, cantidad, frente_destino, retirado_por, observaciones } = req.body;
    const cant = Number(cantidad);
    if (!lote_id || !cant || cant <= 0) return res.status(400).json({ error: 'Lote y una cantidad mayor a cero son requeridos' });
    const firmaFile = req.files?.firma?.[0];
    if (!firmaFile) return res.status(400).json({ error: 'La firma digital de quien retira es requerida' });

    const id = await withTransaction((tsql) => crearDespachoEnTransaccion(tsql, {
      lote_id, cantidad: cant, frente_destino, retirado_por, observaciones,
      firma_url: urlArchivo(firmaFile), foto_url: urlArchivo(req.files?.foto?.[0]), usuario_id: req.usuario.id
    }));

    res.status(201).json({ id });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
