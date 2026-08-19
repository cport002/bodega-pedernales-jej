const express = require('express');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();

const SELECT_DETALLE = `
  SELECT i.*, l.codigo AS lote_codigo, l.tag, l.pallet_numero, l.ubicacion_1, l.ubicacion_2, m.descripcion AS material_descripcion, m.unidad,
    u.nombre AS usuario_nombre
  FROM inventarios i
  JOIN lotes l ON l.id = i.lote_id
  JOIN materiales m ON m.id = l.material_id
  LEFT JOIN usuarios u ON u.id = i.usuario_id
`;

// GET /api/inventarios?lote_id=&solo_diferencias=1
router.get('/', autenticar, async (req, res) => {
  try {
    const { lote_id, solo_diferencias } = req.query;
    const condiciones = [];
    const params = [];
    if (lote_id) { condiciones.push('i.lote_id = ?'); params.push(lote_id); }
    if (solo_diferencias === '1') condiciones.push('i.diferencia != 0');
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await sql(`${SELECT_DETALLE} ${where} ORDER BY i.id DESC LIMIT 300`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/inventarios — registra un conteo físico y calcula la diferencia vs. el stock del sistema
router.post('/', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { lote_id, cantidad_inventariada, observaciones } = req.body;
    if (!lote_id || cantidad_inventariada === undefined || cantidad_inventariada === null || cantidad_inventariada < 0) {
      return res.status(400).json({ error: 'Lote y una cantidad inventariada válida son requeridos' });
    }

    const lote = (await sql('SELECT id FROM lotes WHERE id = ?', [lote_id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const stock = (await sql('SELECT stock_actual FROM v_lotes_stock WHERE lote_id = ?', [lote_id])).rows[0];
    const diferencia = Number(cantidad_inventariada) - stock.stock_actual;

    const r = await sql(
      `INSERT INTO inventarios (lote_id, cantidad_inventariada, stock_esperado, diferencia, observaciones, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [lote_id, cantidad_inventariada, stock.stock_actual, diferencia, observaciones || null, req.usuario.id]
    );

    res.status(201).json({ id: r.rows[0].id, diferencia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
