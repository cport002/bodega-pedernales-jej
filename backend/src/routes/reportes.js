const express = require('express');
const { sql } = require('../database/db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();

// GET /api/reportes/resumen — KPIs del dashboard. Todos son CONTEOS de entidades/eventos — nunca
// una suma de stock_actual entre materiales (unidades distintas: metros, kg, C/U... esa suma no
// representa nada real, no se debe mostrar).
router.get('/resumen', autenticar, async (req, res) => {
  try {
    const totalMateriales = (await sql('SELECT COUNT(*) AS total FROM materiales')).rows[0].total;
    const materialesActivos = (await sql(
      "SELECT COUNT(*) AS total FROM materiales m WHERE EXISTS (SELECT 1 FROM lotes l WHERE l.material_id = m.id AND l.estado = 'activo')"
    )).rows[0].total;
    const materialesInactivos = totalMateriales - materialesActivos;
    const totalLotesActivos = (await sql("SELECT COUNT(*) AS total FROM lotes WHERE estado = 'activo'")).rows[0].total;
    const totalInventarios = (await sql('SELECT COUNT(*) AS total FROM inventario_sesiones')).rows[0].total;
    const totalDespachos = (await sql('SELECT COUNT(*) AS total FROM despachos')).rows[0].total;
    const totalDevoluciones = (await sql('SELECT COUNT(*) AS total FROM devoluciones')).rows[0].total;
    const ncrAbiertos = (await sql(
      "SELECT COUNT(*) AS total FROM lotes WHERE ncr_uso_d IS NOT NULL AND ncr_uso_d NOT IN ('0', 'N/A', '')"
    )).rows[0].total;
    res.json({ totalMateriales, materialesActivos, materialesInactivos, totalLotesActivos, totalInventarios, totalDespachos, totalDevoluciones, ncrAbiertos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reportes/stock — stock actual por lote, con filtros
router.get('/stock', autenticar, async (req, res) => {
  try {
    const { area, especialidad } = req.query;
    const condiciones = ['s.stock_actual > 0'];
    const params = [];
    if (area) { condiciones.push('l.area = ?'); params.push(area.toUpperCase()); }
    if (especialidad) { condiciones.push('m.especialidad = ?'); params.push(especialidad.toUpperCase()); }

    const r = await sql(
      `SELECT l.id, l.codigo, l.tag, l.area, l.ubicacion_1, l.ubicacion_2, l.pallet_numero, l.equipo_destino,
         m.descripcion, m.especialidad, m.diametro_1, m.diametro_2, m.unidad,
         s.stock_actual, r2.n_guia, r2.fecha_recepcion, p.nombre AS proveedor_nombre
       FROM lotes l
       JOIN materiales m ON m.id = l.material_id
       JOIN v_lotes_stock s ON s.lote_id = l.id
       JOIN recepciones r2 ON r2.id = l.recepcion_id
       LEFT JOIN proveedores p ON p.id = r2.proveedor_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY m.especialidad, m.descripcion`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reportes/movimientos — histórico combinado de despachos/devoluciones
router.get('/movimientos', autenticar, async (req, res) => {
  try {
    const r = await sql(
      `SELECT 'despacho' AS tipo, d.id, d.lote_id, l.codigo AS lote_codigo, m.descripcion, d.cantidad,
         d.frente_destino AS detalle, u.nombre AS usuario_nombre, d.fecha
       FROM despachos d JOIN lotes l ON l.id = d.lote_id JOIN materiales m ON m.id = l.material_id
       LEFT JOIN usuarios u ON u.id = d.usuario_id
       UNION ALL
       SELECT 'devolucion' AS tipo, dv.id, dv.lote_id, l.codigo AS lote_codigo, m.descripcion, dv.cantidad,
         dv.motivo AS detalle, u.nombre AS usuario_nombre, dv.fecha
       FROM devoluciones dv JOIN lotes l ON l.id = dv.lote_id JOIN materiales m ON m.id = l.material_id
       LEFT JOIN usuarios u ON u.id = dv.usuario_id
       ORDER BY fecha DESC LIMIT 300`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/reportes/ncr — lotes con no conformidad o protocolo de cambio abierto
router.get('/ncr', autenticar, async (req, res) => {
  try {
    const r = await sql(
      `SELECT l.id, l.codigo, l.tag, l.ncr_uso_d, l.protocolo_cambio_ubicacion, m.descripcion, l.area, l.ubicacion_1
       FROM lotes l JOIN materiales m ON m.id = l.material_id
       WHERE (l.ncr_uso_d IS NOT NULL AND l.ncr_uso_d NOT IN ('0', 'N/A', ''))
          OR (l.protocolo_cambio_ubicacion IS NOT NULL AND l.protocolo_cambio_ubicacion NOT IN ('0', 'N/A', ''))
       ORDER BY l.id DESC`
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
