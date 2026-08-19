const express = require('express');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { generarQrBuffer } = require('../services/qr');

const router = express.Router();

const SELECT_BASE = `
  SELECT l.*, m.descripcion, m.especialidad, m.diametro_1, m.diametro_2, m.unidad, m.peso_unidad_kg,
    r.orden_compra, r.contrato, r.n_guia, r.fecha_recepcion, p.nombre AS proveedor_nombre,
    s.stock_actual, s.total_despachado, s.total_devuelto
  FROM lotes l
  JOIN materiales m ON m.id = l.material_id
  JOIN recepciones r ON r.id = l.recepcion_id
  LEFT JOIN proveedores p ON p.id = r.proveedor_id
  JOIN v_lotes_stock s ON s.lote_id = l.id
`;

// GET /api/lotes?busqueda=&con_stock=1&area=
router.get('/', autenticar, async (req, res) => {
  try {
    const { busqueda, con_stock, area } = req.query;
    const condiciones = [];
    const params = [];
    if (busqueda) {
      condiciones.push('(l.codigo LIKE ? OR l.tag LIKE ? OR m.descripcion LIKE ? OR l.pallet_numero LIKE ?)');
      const like = `%${busqueda.toUpperCase()}%`;
      params.push(like, like, like, like);
    }
    if (area) { condiciones.push('l.area = ?'); params.push(area.toUpperCase()); }
    if (con_stock === '1') condiciones.push('s.stock_actual > 0');

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await sql(`${SELECT_BASE} ${where} ORDER BY l.id DESC LIMIT 500`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/lotes/codigo/:codigo — usado al escanear el QR
router.get('/codigo/:codigo', autenticar, async (req, res) => {
  try {
    const lote = (await sql(`${SELECT_BASE} WHERE l.codigo = ?`, [req.params.codigo.toUpperCase()])).rows[0];
    if (!lote) return res.status(404).json({ error: 'No existe ningún lote con ese código' });
    res.json(lote);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/lotes/:id
router.get('/:id', autenticar, async (req, res) => {
  try {
    const lote = (await sql(`${SELECT_BASE} WHERE l.id = ?`, [req.params.id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
    const movimientos = (await sql(
      `SELECT 'despacho' AS tipo, id, cantidad, frente_destino AS detalle, fecha FROM despachos WHERE lote_id = ?
       UNION ALL
       SELECT 'devolucion' AS tipo, id, cantidad, motivo AS detalle, fecha FROM devoluciones WHERE lote_id = ?
       UNION ALL
       SELECT 'inventario' AS tipo, id, cantidad_inventariada AS cantidad, ('diferencia: ' || diferencia) AS detalle, fecha FROM inventarios WHERE lote_id = ?
       ORDER BY fecha DESC`,
      [req.params.id, req.params.id, req.params.id]
    )).rows;
    res.json({ ...lote, movimientos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/lotes/:id/qr — PNG del código QR para imprimir en la etiqueta.
// Sin autenticar a propósito: se usa directo en <img src> y en el botón "Imprimir QR" del
// navegador, y el código solo identifica un lote (sin datos sensibles) — igual que una etiqueta física.
router.get('/:id/qr', async (req, res) => {
  try {
    const lote = (await sql('SELECT codigo FROM lotes WHERE id = ?', [req.params.id])).rows[0];
    if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
    const buffer = await generarQrBuffer(lote.codigo);
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/lotes/:id — editar ubicación / NCR / protocolo tras recepcionado
router.put('/:id', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const anterior = (await sql('SELECT * FROM lotes WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'Lote no encontrado' });
    const { area, ubicacion_1, ubicacion_2, pallet_numero, equipo_destino, ncr_uso_d, protocolo_cambio_ubicacion, tag, marca_serie_modelo } = req.body;
    await sql(
      `UPDATE lotes SET area = ?, ubicacion_1 = ?, ubicacion_2 = ?, pallet_numero = ?, equipo_destino = ?,
        ncr_uso_d = ?, protocolo_cambio_ubicacion = ?, tag = ?, marca_serie_modelo = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        area ?? anterior.area, ubicacion_1 ?? anterior.ubicacion_1, ubicacion_2 ?? anterior.ubicacion_2,
        pallet_numero ?? anterior.pallet_numero, equipo_destino ?? anterior.equipo_destino,
        ncr_uso_d ?? anterior.ncr_uso_d, protocolo_cambio_ubicacion ?? anterior.protocolo_cambio_ubicacion,
        tag ?? anterior.tag, marca_serie_modelo ?? anterior.marca_serie_modelo,
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
