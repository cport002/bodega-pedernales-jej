const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { crearDespachoEnTransaccion } = require('../services/despachoService');
const { notificarNuevaSolicitud, notificarResolucionSolicitud } = require('../services/notificaciones');
const { generarFolioSolicitud } = require('../services/qr');
const { generarValePDF } = require('../services/valePdf');

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
    const condiciones = ['s.eliminada = false'];
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
    const r = await sql("SELECT COUNT(*) AS total FROM solicitudes WHERE estado = 'pendiente' AND eliminada = false");
    res.json({ total: Number(r.rows[0].total) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/solicitudes/:id — incluye lotes activos con stock del mismo material (para elegir al
// aprobar) y los despachos ya generados si fue aprobada.
router.get('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const solicitud = (await sql(`${SELECT_DETALLE} WHERE s.id = ? AND s.eliminada = false`, [req.params.id])).rows[0];
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
    const lotes_aprobados = (await sql(
      `SELECT sla.lote_id, sla.cantidad, l.codigo AS lote_codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero
       FROM solicitud_lotes_aprobados sla JOIN lotes l ON l.id = sla.lote_id
       WHERE sla.solicitud_id = ?`,
      [req.params.id]
    )).rows;
    const despachos = (await sql(
      `SELECT d.id, d.lote_id, l.codigo AS lote_codigo, d.cantidad, d.fecha
       FROM despachos d JOIN lotes l ON l.id = d.lote_id WHERE d.solicitud_id = ?`,
      [req.params.id]
    )).rows;
    const folio = generarFolioSolicitud(solicitud.id);
    res.json({ ...solicitud, folio, lotes_disponibles, lotes_aprobados, despachos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes — crea una solicitud pendiente
router.post('/', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const { material_id, cantidad, frente_destino, observaciones } = req.body;
    const cant = Number(cantidad);
    if (!material_id || !cant || cant <= 0) return res.status(400).json({ error: 'Material y una cantidad mayor a cero son requeridos' });
    const material = (await sql('SELECT id, descripcion FROM materiales WHERE id = ?', [material_id])).rows[0];
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });
    const r = await sql(
      `INSERT INTO solicitudes (material_id, cantidad_solicitada, frente_destino, observaciones, solicitante_id)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [material_id, cant, frente_destino || null, observaciones || null, req.usuario.id]
    );
    const solicitud = { id: r.rows[0].id, cantidad_solicitada: cant };
    notificarNuevaSolicitud(solicitud, material.descripcion, req.usuario.nombre).catch(() => {});
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/solicitudes/:id — editar cantidad/frente/observaciones, solo mientras esta pendiente
// (una vez aprobada ya hay un vale con lotes/cantidad decididos, editar el pedido original ya no
// tiene sentido). El propio solicitante puede editar su pedido; admin/bodeguero, cualquiera.
router.put('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && solicitud.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para editar esta solicitud' });
    }
    if (solicitud.estado !== 'pendiente') {
      return res.status(409).json({ error: 'Solo se puede editar mientras está pendiente de revisión' });
    }
    const cant = Number(req.body.cantidad);
    if (!cant || cant <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
    await sql(
      `UPDATE solicitudes SET cantidad_solicitada = ?, frente_destino = ?, observaciones = ? WHERE id = ?`,
      [cant, req.body.frente_destino || null, req.body.observaciones || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/solicitudes/:id — eliminacion blanda (marca eliminada, nunca borra la fila) mientras
// no este entregada. El propio solicitante puede eliminar su pedido; admin/bodeguero, cualquiera.
router.delete('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && solicitud.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para eliminar esta solicitud' });
    }
    if (solicitud.estado === 'entregada') {
      return res.status(409).json({ error: 'No se puede eliminar una solicitud ya entregada' });
    }
    await sql(
      `UPDATE solicitudes SET eliminada = true, eliminada_por = ?, fecha_eliminacion = NOW() WHERE id = ?`,
      [req.usuario.id, req.params.id]
    );
    await sql('DELETE FROM notificaciones WHERE solicitud_id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/solicitudes/:id/rechazar
router.put('/:id/rechazar', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });
    await sql(
      `UPDATE solicitudes SET estado = 'rechazada', motivo_rechazo = ?, revisado_por = ?, fecha_resolucion = NOW() WHERE id = ?`,
      [req.body.motivo || null, req.usuario.id, req.params.id]
    );
    const material = (await sql('SELECT descripcion FROM materiales WHERE id = ?', [solicitud.material_id])).rows[0];
    notificarResolucionSolicitud(solicitud, material?.descripcion || 'material', false, req.body.motivo).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes/:id/aprobar — body JSON: asignaciones = [{lote_id, cantidad}, ...].
// Solo decide DE DONDE va a salir el material y genera el vale (folio + QR) — no toca stock ni
// pide firma/foto todavia, eso pasa recien al confirmar la entrega fisica (ver /:id/entregar).
router.post('/:id/aprobar', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });

    const { asignaciones, frente_destino } = req.body;
    if (!Array.isArray(asignaciones) || asignaciones.length === 0) return res.status(400).json({ error: 'Debes elegir al menos un lote y cantidad' });

    const loteIds = asignaciones.map(a => Number(a.lote_id));
    const lotesValidos = (await sql(
      `SELECT id FROM lotes WHERE id = ANY(?::int[]) AND material_id = ?`,
      [loteIds, solicitud.material_id]
    )).rows.map(r => r.id);
    if (lotesValidos.length !== new Set(loteIds).size) {
      return res.status(400).json({ error: 'Uno de los lotes elegidos no corresponde al material solicitado' });
    }

    let cantidadTotal = 0;
    await withTransaction(async (tsql) => {
      for (const a of asignaciones) {
        const cant = Number(a.cantidad);
        if (!cant || cant <= 0) throw Object.assign(new Error('Cantidad inválida en una de las asignaciones'), { status: 400 });
        cantidadTotal += cant;
        await tsql(
          `INSERT INTO solicitud_lotes_aprobados (solicitud_id, lote_id, cantidad) VALUES (?, ?, ?)`,
          [solicitud.id, Number(a.lote_id), cant]
        );
      }
      await tsql(
        `UPDATE solicitudes SET estado = 'aprobada', cantidad_aprobada = ?, revisado_por = ?, fecha_resolucion = NOW(),
         frente_destino = COALESCE(?, frente_destino) WHERE id = ?`,
        [cantidadTotal, req.usuario.id, frente_destino || null, solicitud.id]
      );
    });

    const material = (await sql('SELECT descripcion FROM materiales WHERE id = ?', [solicitud.material_id])).rows[0];
    const folio = generarFolioSolicitud(solicitud.id);
    notificarResolucionSolicitud(solicitud, material?.descripcion || 'material', true, null, folio).catch(() => {});
    res.json({ ok: true, folio });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// GET /api/solicitudes/:id/vale-pdf — vale imprimible con QR del folio, para llevar a bodega.
router.get('/:id/vale-pdf', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const solicitud = (await sql(`${SELECT_DETALLE} WHERE s.id = ? AND s.eliminada = false`, [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && solicitud.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para ver esta solicitud' });
    }
    if (solicitud.estado === 'pendiente' || solicitud.estado === 'rechazada') {
      return res.status(409).json({ error: 'Esta solicitud todavía no tiene un vale generado' });
    }
    const lotes = (await sql(
      `SELECT sla.lote_id, sla.cantidad, l.codigo AS lote_codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero
       FROM solicitud_lotes_aprobados sla JOIN lotes l ON l.id = sla.lote_id
       WHERE sla.solicitud_id = ?`,
      [solicitud.id]
    )).rows;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="vale_solicitud_${solicitud.id}.pdf"`);
    await generarValePDF({ ...solicitud, lotes }, res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes/:id/entregar — multipart: firma + foto del material (ambas requeridas,
// es la confirmacion real de que el material cambio de manos). Usa los lotes/cantidades ya
// decididos al aprobar (solicitud_lotes_aprobados) para crear los despachos reales ahora —
// aca SI se valida y resta el stock, en el momento real del retiro.
router.post('/:id/entregar', autenticar, autorizar('admin', 'bodeguero'), upload.fields([
  { name: 'firma', maxCount: 1 },
  { name: 'foto', maxCount: 1 }
]), async (req, res) => {
  try {
    const solicitud = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (solicitud.estado !== 'aprobada') return res.status(409).json({ error: 'Esta solicitud no tiene un vale pendiente de retiro' });

    const firmaFile = req.files?.firma?.[0];
    if (!firmaFile) return res.status(400).json({ error: 'La firma digital de quien retira es requerida' });

    const asignaciones = (await sql(
      'SELECT lote_id, cantidad FROM solicitud_lotes_aprobados WHERE solicitud_id = ?',
      [solicitud.id]
    )).rows;
    if (asignaciones.length === 0) return res.status(409).json({ error: 'Esta solicitud no tiene lotes asignados' });

    const { retirado_por, observaciones } = req.body;
    const firma_url = urlArchivo(firmaFile);
    const foto_url = urlArchivo(req.files?.foto?.[0]);

    const despachoIds = await withTransaction(async (tsql) => {
      const ids = [];
      for (const a of asignaciones) {
        ids.push(await crearDespachoEnTransaccion(tsql, {
          lote_id: a.lote_id, cantidad: a.cantidad,
          frente_destino: solicitud.frente_destino,
          retirado_por, observaciones, firma_url, foto_url,
          usuario_id: req.usuario.id, solicitud_id: solicitud.id
        }));
      }
      await tsql(`UPDATE solicitudes SET estado = 'entregada', fecha_entrega = NOW() WHERE id = ?`, [solicitud.id]);
      return ids;
    });

    // Ciclo cerrado: la campanita ya no necesita seguir mostrando el aviso de esta solicitud
    // (ni la de "nueva solicitud" para el bodeguero, ni la de "aprobada" para el solicitante) —
    // pedido explicito del usuario, la campanita es para lo que todavia requiere atencion.
    await sql('DELETE FROM notificaciones WHERE solicitud_id = ?', [solicitud.id]);

    res.json({ ok: true, despacho_ids: despachoIds });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
