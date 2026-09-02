const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { generarCodigoLote } = require('../services/qr');

const router = express.Router();

async function obtenerOCrearProveedor(tsql, nombre) {
  if (!nombre) return null;
  const limpio = nombre.trim().toUpperCase();
  const existe = (await tsql('SELECT id FROM proveedores WHERE nombre = ?', [limpio])).rows[0];
  if (existe) return existe.id;
  return (await tsql('INSERT INTO proveedores (nombre) VALUES (?) RETURNING id', [limpio])).rows[0].id;
}

async function obtenerOCrearMaterial(tsql, item) {
  const desc = (item.descripcion || '').trim().toUpperCase();
  const d1 = (item.diametro_1 || '').trim().toUpperCase();
  const d2 = (item.diametro_2 || '').trim().toUpperCase();
  const un = (item.unidad || 'C/U').trim().toUpperCase();
  const existe = (await tsql(
    'SELECT id FROM materiales WHERE descripcion = ? AND diametro_1 = ? AND diametro_2 = ? AND unidad = ?',
    [desc, d1, d2, un]
  )).rows[0];
  if (existe) return existe.id;
  return (await tsql(
    `INSERT INTO materiales (descripcion, especialidad, diametro_1, diametro_2, unidad, peso_unidad_kg)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [desc, item.especialidad ? item.especialidad.trim().toUpperCase() : null, d1 || null, d2 || null, un, item.peso_unidad_kg || null]
  )).rows[0].id;
}

const SELECT_LISTA = `
  SELECT r.*, p.nombre AS proveedor_nombre, u.nombre AS usuario_nombre,
    (SELECT COUNT(*) FROM lotes l WHERE l.recepcion_id = r.id) AS total_lotes
  FROM recepciones r
  LEFT JOIN proveedores p ON p.id = r.proveedor_id
  LEFT JOIN usuarios u ON u.id = r.usuario_id
`;

// GET /api/recepciones
router.get('/', autenticar, autorizar('admin', 'bodeguero', 'visor'), async (req, res) => {
  try {
    const r = await sql(`${SELECT_LISTA} ORDER BY r.id DESC LIMIT 200`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/recepciones/:id
router.get('/:id', autenticar, autorizar('admin', 'bodeguero', 'visor'), async (req, res) => {
  try {
    const recepcion = (await sql(`${SELECT_LISTA} WHERE r.id = ?`, [req.params.id])).rows[0];
    if (!recepcion) return res.status(404).json({ error: 'Recepción no encontrada' });
    const lotes = (await sql(
      `SELECT l.*, m.descripcion, m.especialidad, m.unidad, s.stock_actual
       FROM lotes l JOIN materiales m ON m.id = l.material_id
       JOIN v_lotes_stock s ON s.lote_id = l.id
       WHERE l.recepcion_id = ? ORDER BY l.id`,
      [req.params.id]
    )).rows;
    res.json({ ...recepcion, lotes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/recepciones — crea la guía + sus ítems (lotes) en una sola transacción
router.post('/', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { orden_compra, contrato, pm, proveedor, n_guia, fecha_recepcion, observaciones, items } = req.body;
    if (!fecha_recepcion) return res.status(400).json({ error: 'Fecha de recepción requerida' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Debe incluir al menos un ítem' });

    for (const item of items) {
      if (!item.descripcion || !item.cantidad_recepcionada || item.cantidad_recepcionada <= 0) {
        return res.status(400).json({ error: 'Cada ítem requiere descripción y una cantidad recepcionada mayor a cero' });
      }
    }

    const recepcionId = await withTransaction(async (tsql) => {
      const proveedorId = await obtenerOCrearProveedor(tsql, proveedor);

      const r = await tsql(
        `INSERT INTO recepciones (orden_compra, contrato, pm, proveedor_id, n_guia, fecha_recepcion, usuario_id, observaciones)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [orden_compra || null, contrato || null, pm || null, proveedorId, n_guia || null, fecha_recepcion, req.usuario.id, observaciones || null]
      );
      const rid = r.rows[0].id;

      for (const item of items) {
        const materialId = await obtenerOCrearMaterial(tsql, item);
        const loteR = await tsql(
          `INSERT INTO lotes (
            codigo, recepcion_id, material_id, tag, marca_serie_modelo,
            cantidad_packing_list, cantidad_recepcionada, ncr_uso_d, protocolo_cambio_ubicacion,
            area, ubicacion_1, ubicacion_2, pallet_numero, equipo_destino
          ) VALUES ('PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            rid, materialId, item.tag || null, item.marca_serie_modelo || null,
            item.cantidad_packing_list ?? null, item.cantidad_recepcionada, item.ncr_uso_d || null, item.protocolo_cambio_ubicacion || null,
            item.area || null, item.ubicacion_1 || null, item.ubicacion_2 || null, item.pallet_numero || null, item.equipo_destino || null
          ]
        );
        const loteId = loteR.rows[0].id;
        await tsql('UPDATE lotes SET codigo = ? WHERE id = ?', [generarCodigoLote(loteId), loteId]);
      }

      return rid;
    });

    res.status(201).json({ id: recepcionId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
