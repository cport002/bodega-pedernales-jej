const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { generarComprobantePDF } = require('../services/comprobantePdf');

const router = express.Router();

const SELECT_DETALLE = `
  SELECT d.*, l.codigo AS lote_codigo, l.tag, l.pallet_numero, m.descripcion AS material_descripcion, m.unidad,
    u.nombre AS usuario_nombre
  FROM devoluciones d
  JOIN lotes l ON l.id = d.lote_id
  JOIN materiales m ON m.id = l.material_id
  LEFT JOIN usuarios u ON u.id = d.usuario_id
`;

// GET /api/devoluciones?lote_id=
router.get('/', autenticar, async (req, res) => {
  try {
    const { lote_id } = req.query;
    const condiciones = lote_id ? 'WHERE d.lote_id = ?' : '';
    const params = lote_id ? [lote_id] : [];
    const r = await sql(`${SELECT_DETALLE} ${condiciones} ORDER BY d.id DESC LIMIT 200`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/devoluciones/:id/pdf
router.get('/:id/pdf', autenticar, async (req, res) => {
  try {
    const devolucion = (await sql(`${SELECT_DETALLE} WHERE d.id = ?`, [req.params.id])).rows[0];
    if (!devolucion) return res.status(404).json({ error: 'Devolución no encontrada' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="devolucion_${devolucion.id}.pdf"`);
    await generarComprobantePDF({ tipo: 'DEVOLUCIÓN', movimiento: devolucion }, res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/devoluciones — multipart: firma (requerida), foto (opcional)
router.post('/', autenticar, autorizar('admin', 'bodeguero'), upload.fields([
  { name: 'firma', maxCount: 1 },
  { name: 'foto', maxCount: 1 }
]), async (req, res) => {
  try {
    const { lote_id, cantidad, motivo, observaciones } = req.body;
    const cant = Number(cantidad);
    if (!lote_id || !cant || cant <= 0) return res.status(400).json({ error: 'Lote y una cantidad mayor a cero son requeridos' });
    const firmaFile = req.files?.firma?.[0];
    if (!firmaFile) return res.status(400).json({ error: 'La firma digital de quien devuelve es requerida' });

    const lote = (await sql('SELECT id FROM lotes WHERE id = ?', [lote_id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

    const id = await withTransaction(async (tsql) => {
      const r = await tsql(
        `INSERT INTO devoluciones (lote_id, cantidad, motivo, observaciones, firma_url, foto_url, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [lote_id, cant, motivo || null, observaciones || null, urlArchivo(firmaFile), urlArchivo(req.files?.foto?.[0]), req.usuario.id]
      );
      await tsql("UPDATE lotes SET estado = 'activo' WHERE id = ?", [lote_id]);
      return r.rows[0].id;
    });

    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
