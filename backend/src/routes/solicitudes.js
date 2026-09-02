const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { crearDespachoEnTransaccion } = require('../services/despachoService');

const router = express.Router();

const SELECT_DETALLE = `
  SELECT s.*, m.descripcion AS material_descripcion, m.especialidad, m.unidad,
    sol.nombre AS solicitante_nombre, rev.nombre AS revisor_nombre,
    COALESCE((SELECT SUM(vs.stock_actual) FROM lotes l JOIN v_lotes_stock vs ON vs.lote_id = l.id
      WHERE l.material_id = s.material_id AND l.estado = 'activo'), 0) AS stock_disponible_actual
  FROM solicitudes s
  JOIN materiales m ON m.id = s.material_id
  JOIN usuarios sol ON sol.id = s.solicitante_id
  LEFT JOIN usuarios rev ON rev.id = s.revisado_por
`;

// GET /api/solicitudes?estado=&solicitante_id=  (un solicitante siempre ve solo las suyas)
router.get('/', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const condiciones = [];
    const params = [];
    if (req.usuario.rol === 'solicitante') {
      condiciones.push('s.solicitante_id = ?');
      params.push(req.usuario.id);
    } else if (req.query.solicitante_id) {
      condiciones.push('s.solicitante_id = ?');
      params.push(req.query.solicitante_id);
    }
    if (req.query.estado) { condiciones.push('s.estado = ?'); params.push(req.query.estado); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const r = await sql(
      `${SELECT_DETALLE} ${where} ORDER BY (s.estado = 'pendiente') DESC, s.fecha_solicitud DESC LIMIT 300`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/solicitudes/pendientes/count — badge del sidebar (admin/bodeguero)
router.get('/pendientes/count', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const r = await sql("SELECT COUNT(*) AS total FROM solicitudes WHERE estado = 'pendiente'");
    res.json({ total: Number(r.rows[0].total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/solicitudes/:id — incluye lotes activos con stock del mismo material (para elegir al
// aprobar) y los despachos ya generados si fue aprobada.
router.get('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const solicitud = (await sql(`${SELECT_DETALLE} WHERE s.id = ?`, [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && solicitud.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para ver esta solicitud' });
    }
    const lotes_disponibles = (await sql(
      `SELECT l.id, l.codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero, vs.stock_actual
       FROM lotes l JOIN v_lotes_stock vs ON vs.lote_id = l.id
       WHERE l.material_id = ? AND l.estado = 'activo' AND vs.stock_actual > 0
       ORDER BY vs.stock_actual DESC`,
      [solicitud.material_id]
    )).rows;
    const despachos = (await sql(
      `SELECT d.id, d.lote_id, l.codigo AS lote_codigo, d.cantidad, d.fecha
       FROM despachos d JOIN lotes l ON l.id = d.lote_id WHERE d.solicitud_id = ?`,
      [req.params.id]
    )).rows;
    res.json({ ...solicitud, lotes_disponibles, despachos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes — crea una solicitud pendiente
router.post('/', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const { material_id, cantidad, frente_destino, observaciones } = req.body;
    const cant = Number(cantidad);
    if (!material_id || !cant || cant <= 0) return res.status(400).json({ error: 'Material y una cantidad mayor a cero son requeridos' });
    const material = (await sql('SELECT id FROM materiales WHERE id = ?', [material_id])).rows[0];
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });
    const r = await sql(
      `INSERT INTO solicitudes (material_id, cantidad_solicitada, frente_destino, observaciones, solicitante_id)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [material_id, cant, frente_destino || null, observaciones || null, req.usuario.id]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/solicitudes/:id/rechazar
router.put('/:id/rechazar', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ?', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });
    await sql(
      `UPDATE solicitudes SET estado = 'rechazada', motivo_rechazo = ?, revisado_por = ?, fecha_resolucion = NOW() WHERE id = ?`,
      [req.body.motivo || null, req.usuario.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes/:id/aprobar — multipart: firma (requerida), foto (opcional),
// asignaciones = JSON string '[{"lote_id":1,"cantidad":5}, ...]'. Crea un despacho por cada
// asignacion (misma firma) dentro de una sola transaccion.
router.post('/:id/aprobar', autenticar, autorizar('admin', 'bodeguero'), upload.fields([
  { name: 'firma', maxCount: 1 },
  { name: 'foto', maxCount: 1 }
]), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ?', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });

    let asignaciones;
    try { asignaciones = JSON.parse(req.body.asignaciones || '[]'); } catch { return res.status(400).json({ error: 'asignaciones inválidas' }); }
    if (!Array.isArray(asignaciones) || asignaciones.length === 0) return res.status(400).json({ error: 'Debes elegir al menos un lote y cantidad' });

    const firmaFile = req.files?.firma?.[0];
    if (!firmaFile) return res.status(400).json({ error: 'La firma digital de quien retira es requerida' });

    const loteIds = asignaciones.map(a => Number(a.lote_id));
    const lotesValidos = (await sql(
      `SELECT id FROM lotes WHERE id = ANY(?::int[]) AND material_id = ?`,
      [loteIds, solicitud.material_id]
    )).rows.map(r => r.id);
    if (lotesValidos.length !== new Set(loteIds).size) {
      return res.status(400).json({ error: 'Uno de los lotes elegidos no corresponde al material solicitado' });
    }

    const { retirado_por, frente_destino, observaciones } = req.body;
    const firma_url = urlArchivo(firmaFile);
    const foto_url = urlArchivo(req.files?.foto?.[0]);
    let cantidadTotal = 0;

    const despachoIds = await withTransaction(async (tsql) => {
      const ids = [];
      for (const a of asignaciones) {
        const cant = Number(a.cantidad);
        if (!cant || cant <= 0) throw Object.assign(new Error('Cantidad inválida en una de las asignaciones'), { status: 400 });
        cantidadTotal += cant;
        ids.push(await crearDespachoEnTransaccion(tsql, {
          lote_id: Number(a.lote_id), cantidad: cant,
          frente_destino: frente_destino || solicitud.frente_destino,
          retirado_por, observaciones, firma_url, foto_url,
          usuario_id: req.usuario.id, solicitud_id: solicitud.id
        }));
      }
      await tsql(
        `UPDATE solicitudes SET estado = 'aprobada', cantidad_aprobada = ?, revisado_por = ?, fecha_resolucion = NOW() WHERE id = ?`,
        [cantidadTotal, req.usuario.id, solicitud.id]
      );
      return ids;
    });

    res.json({ ok: true, despacho_ids: despachoIds });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
