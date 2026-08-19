const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { generarComprobantePDF } = require('../services/comprobantePdf');

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
router.get('/', autenticar, async (req, res) => {
  try {
    const { lote_id } = req.query;
    const condiciones = lote_id ? 'WHERE d.lote_id = ?' : '';
    const params = lote_id ? [lote_id] : [];
    const r = await sql(`${SELECT_DETALLE} ${condiciones} ORDER BY d.id DESC LIMIT 200`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/despachos/:id/pdf
router.get('/:id/pdf', autenticar, async (req, res) => {
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

    const lote = (await sql('SELECT id FROM lotes WHERE id = ?', [lote_id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
    const stock = (await sql('SELECT stock_actual FROM v_lotes_stock WHERE lote_id = ?', [lote_id])).rows[0];
    if (cant > stock.stock_actual) {
      return res.status(409).json({ error: `Stock insuficiente en este lote, disponible: ${stock.stock_actual}` });
    }

    const id = await withTransaction(async (tsql) => {
      const r = await tsql(
        `INSERT INTO despachos (lote_id, cantidad, frente_destino, retirado_por, observaciones, firma_url, foto_url, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [lote_id, cant, frente_destino || null, retirado_por || null, observaciones || null, urlArchivo(firmaFile), urlArchivo(req.files?.foto?.[0]), req.usuario.id]
      );
      const despachoId = r.rows[0].id;

      const restante = (await tsql('SELECT stock_actual FROM v_lotes_stock WHERE lote_id = ?', [lote_id])).rows[0].stock_actual;
      if (restante <= 0) {
        await tsql("UPDATE lotes SET estado = 'agotado' WHERE id = ?", [lote_id]);
      }
      return despachoId;
    });

    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
