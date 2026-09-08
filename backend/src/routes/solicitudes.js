const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');
const { crearDespachoEnTransaccion } = require('../services/despachoService');
const { notificarNuevaSolicitud, notificarResolucionSolicitud } = require('../services/notificaciones');
const { generarFolioSolicitud } = require('../services/qr');
const { generarValePDF } = require('../services/valePdf');

const router = express.Router();

// "Pedido" = la tabla `solicitudes` (nombre historico) — desde que un pedido puede llevar VARIOS
// materiales, ya no guarda material_id/cantidad directo, eso vive en `pedido_items` (una fila por
// material dentro del pedido). Ver migracion en database/schema.sql para el porque de este nombre.
const SELECT_PEDIDO = `
  SELECT s.*, sol.nombre AS solicitante_nombre, rev.nombre AS revisor_nombre
  FROM solicitudes s
  JOIN usuarios sol ON sol.id = s.solicitante_id
  LEFT JOIN usuarios rev ON rev.id = s.revisado_por
`;

// Texto corto para notificaciones y para el listado — "2 MTS de CABLE..." si es 1 solo material,
// o "3 materiales (CABLE..., BRIDA..., y 1 más)" si son varios.
function resumenItems(items) {
  if (items.length === 1) return `${items[0].cantidad_solicitada} ${items[0].unidad} de ${items[0].material_descripcion}`;
  const nombres = items.slice(0, 2).map(i => i.material_descripcion);
  const resto = items.length - nombres.length;
  return `${items.length} materiales (${nombres.join(', ')}${resto > 0 ? `, y ${resto} más` : ''})`;
}

async function obtenerItems(pedidoId) {
  return (await sql(
    `SELECT pi.id, pi.material_id, pi.cantidad_solicitada, pi.cantidad_aprobada,
       m.descripcion AS material_descripcion, m.especialidad, m.unidad,
       COALESCE((SELECT SUM(vs.stock_actual) FROM lotes l JOIN v_lotes_stock vs ON vs.lote_id = l.id
         WHERE l.material_id = pi.material_id AND l.estado = 'activo'), 0) AS stock_disponible_actual
     FROM pedido_items pi JOIN materiales m ON m.id = pi.material_id
     WHERE pi.pedido_id = ? ORDER BY pi.id`,
    [pedidoId]
  )).rows;
}

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
      `SELECT s.*, sol.nombre AS solicitante_nombre, rev.nombre AS revisor_nombre,
         (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = s.id) AS total_items,
         (SELECT string_agg(m.descripcion, ', ' ORDER BY pi.id)
            FROM pedido_items pi JOIN materiales m ON m.id = pi.material_id WHERE pi.pedido_id = s.id) AS materiales_resumen
       FROM solicitudes s
       JOIN usuarios sol ON sol.id = s.solicitante_id
       LEFT JOIN usuarios rev ON rev.id = s.revisado_por
       ${where} ORDER BY (s.estado = 'pendiente') DESC, s.fecha_solicitud DESC LIMIT 300`,
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

// GET /api/solicitudes/:id — items del pedido, cada uno con lotes_disponibles (si pendiente) o
// lotes_aprobados (si aprobada/entregada), y los despachos ya generados.
router.get('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const pedido = (await sql(`${SELECT_PEDIDO} WHERE s.id = ? AND s.eliminada = false`, [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && pedido.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para ver esta solicitud' });
    }
    const items = await obtenerItems(pedido.id);
    for (const item of items) {
      if (pedido.estado === 'pendiente') {
        item.lotes_disponibles = (await sql(
          `SELECT l.id, l.codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero, vs.stock_actual
           FROM lotes l JOIN v_lotes_stock vs ON vs.lote_id = l.id
           WHERE l.material_id = ? AND l.estado = 'activo' AND vs.stock_actual > 0
           ORDER BY vs.stock_actual DESC`,
          [item.material_id]
        )).rows;
      } else {
        item.lotes_aprobados = (await sql(
          `SELECT sla.lote_id, sla.cantidad, l.codigo AS lote_codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero
           FROM solicitud_lotes_aprobados sla JOIN lotes l ON l.id = sla.lote_id
           WHERE sla.pedido_item_id = ?`,
          [item.id]
        )).rows;
      }
    }
    const despachos = (await sql(
      `SELECT d.id, d.lote_id, d.pedido_item_id, l.codigo AS lote_codigo, d.cantidad, d.fecha,
         m.descripcion AS material_descripcion, m.unidad
       FROM despachos d JOIN lotes l ON l.id = d.lote_id
         JOIN pedido_items pi ON pi.id = d.pedido_item_id JOIN materiales m ON m.id = pi.material_id
       WHERE d.solicitud_id = ?`,
      [pedido.id]
    )).rows;
    const folio = generarFolioSolicitud(pedido.id);
    res.json({ ...pedido, folio, items, despachos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes — crea un pedido pendiente con uno o varios materiales.
// body: { items: [{material_id, cantidad}, ...], frente_destino, observaciones }
router.post('/', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const { items, frente_destino, observaciones } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Agrega al menos un material al pedido' });
    for (const it of items) {
      if (!it.material_id || !Number(it.cantidad) || Number(it.cantidad) <= 0) {
        return res.status(400).json({ error: 'Cada material necesita una cantidad mayor a cero' });
      }
    }
    const materialIds = items.map(i => Number(i.material_id));
    const materiales = (await sql(`SELECT id, descripcion FROM materiales WHERE id = ANY(?::int[])`, [materialIds])).rows;
    if (materiales.length !== new Set(materialIds).size) return res.status(404).json({ error: 'Uno de los materiales no existe' });
    const materialPorId = new Map(materiales.map(m => [m.id, m]));

    const pedidoId = await withTransaction(async (tsql) => {
      const r = await tsql(
        `INSERT INTO solicitudes (frente_destino, observaciones, solicitante_id) VALUES (?, ?, ?) RETURNING id`,
        [frente_destino || null, observaciones || null, req.usuario.id]
      );
      const id = r.rows[0].id;
      for (const it of items) {
        await tsql(
          `INSERT INTO pedido_items (pedido_id, material_id, cantidad_solicitada) VALUES (?, ?, ?)`,
          [id, Number(it.material_id), Number(it.cantidad)]
        );
      }
      return id;
    });

    const resumen = resumenItems(items.map(it => ({ cantidad_solicitada: it.cantidad, unidad: materialPorId.get(Number(it.material_id))?.unidad || '', material_descripcion: materialPorId.get(Number(it.material_id))?.descripcion || '' })));
    notificarNuevaSolicitud({ id: pedidoId }, resumen, req.usuario.nombre).catch(() => {});
    res.status(201).json({ id: pedidoId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/solicitudes/:id — editar el pedido completo mientras esta pendiente: frente/observaciones,
// y los items en si (agregar, quitar, cambiar cantidad) — "sincroniza" la lista completa que llega.
// body: { items: [{id?, material_id, cantidad}, ...], frente_destino, observaciones }
// items sin `id` son nuevos; los que ya existian y no vienen en la lista, se quitan del pedido.
router.put('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const pedido = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && pedido.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para editar esta solicitud' });
    }
    if (pedido.estado !== 'pendiente') {
      return res.status(409).json({ error: 'Solo se puede editar mientras está pendiente de revisión' });
    }
    const { items, frente_destino, observaciones } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'El pedido debe tener al menos un material' });
    for (const it of items) {
      if (!it.material_id || !Number(it.cantidad) || Number(it.cantidad) <= 0) {
        return res.status(400).json({ error: 'Cada material necesita una cantidad mayor a cero' });
      }
    }

    await withTransaction(async (tsql) => {
      const idsExistentes = items.filter(i => i.id).map(i => Number(i.id));
      if (idsExistentes.length > 0) {
        await tsql(`DELETE FROM pedido_items WHERE pedido_id = ? AND id != ALL(?::int[])`, [pedido.id, idsExistentes]);
      } else {
        await tsql(`DELETE FROM pedido_items WHERE pedido_id = ?`, [pedido.id]);
      }
      for (const it of items) {
        if (it.id) {
          await tsql(`UPDATE pedido_items SET material_id = ?, cantidad_solicitada = ? WHERE id = ? AND pedido_id = ?`,
            [Number(it.material_id), Number(it.cantidad), Number(it.id), pedido.id]);
        } else {
          await tsql(`INSERT INTO pedido_items (pedido_id, material_id, cantidad_solicitada) VALUES (?, ?, ?)`,
            [pedido.id, Number(it.material_id), Number(it.cantidad)]);
        }
      }
      await tsql(`UPDATE solicitudes SET frente_destino = ?, observaciones = ? WHERE id = ?`,
        [frente_destino || null, observaciones || null, pedido.id]);
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/solicitudes/:id — eliminacion blanda (marca eliminada, nunca borra la fila) mientras
// no este entregada. El propio solicitante puede eliminar su pedido; admin/bodeguero, cualquiera.
router.delete('/:id', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const pedido = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && pedido.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para eliminar esta solicitud' });
    }
    if (pedido.estado === 'entregada') {
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
    const pedido = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (pedido.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });
    await sql(
      `UPDATE solicitudes SET estado = 'rechazada', motivo_rechazo = ?, revisado_por = ?, fecha_resolucion = NOW() WHERE id = ?`,
      [req.body.motivo || null, req.usuario.id, req.params.id]
    );
    const items = await obtenerItems(pedido.id);
    notificarResolucionSolicitud(pedido, resumenItems(items), false, req.body.motivo).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes/:id/aprobar — body: { items: [{pedido_item_id, asignaciones:[{lote_id,cantidad}]}], frente_destino }.
// Solo decide DE DONDE va a salir cada material y genera el vale (folio + QR) — no toca stock ni
// pide firma/foto todavia, eso pasa recien al confirmar la entrega fisica (ver /:id/entregar).
router.post('/:id/aprobar', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const pedido = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (pedido.estado !== 'pendiente') return res.status(409).json({ error: 'La solicitud ya fue resuelta' });

    const { items: itemsAsignados, frente_destino } = req.body;
    if (!Array.isArray(itemsAsignados) || itemsAsignados.length === 0) return res.status(400).json({ error: 'Debes elegir al menos un lote y cantidad' });

    const itemsPedido = await obtenerItems(pedido.id);
    const itemPorId = new Map(itemsPedido.map(i => [i.id, i]));

    // Valida que cada lote elegido corresponda al material del item al que se esta asignando.
    for (const ia of itemsAsignados) {
      const item = itemPorId.get(Number(ia.pedido_item_id));
      if (!item) return res.status(400).json({ error: 'Uno de los items no pertenece a esta solicitud' });
      if (!Array.isArray(ia.asignaciones) || ia.asignaciones.length === 0) continue;
      const loteIds = ia.asignaciones.map(a => Number(a.lote_id));
      const lotesValidos = (await sql(
        `SELECT id FROM lotes WHERE id = ANY(?::int[]) AND material_id = ?`,
        [loteIds, item.material_id]
      )).rows.map(r => r.id);
      if (lotesValidos.length !== new Set(loteIds).size) {
        return res.status(400).json({ error: `Uno de los lotes elegidos no corresponde a ${item.material_descripcion}` });
      }
    }

    await withTransaction(async (tsql) => {
      for (const ia of itemsAsignados) {
        if (!Array.isArray(ia.asignaciones) || ia.asignaciones.length === 0) continue;
        let cantidadTotal = 0;
        for (const a of ia.asignaciones) {
          const cant = Number(a.cantidad);
          if (!cant || cant <= 0) throw Object.assign(new Error('Cantidad inválida en una de las asignaciones'), { status: 400 });
          cantidadTotal += cant;
          await tsql(
            `INSERT INTO solicitud_lotes_aprobados (solicitud_id, pedido_item_id, lote_id, cantidad) VALUES (?, ?, ?, ?)`,
            [pedido.id, Number(ia.pedido_item_id), Number(a.lote_id), cant]
          );
        }
        await tsql(`UPDATE pedido_items SET cantidad_aprobada = ? WHERE id = ?`, [cantidadTotal, Number(ia.pedido_item_id)]);
      }
      await tsql(
        `UPDATE solicitudes SET estado = 'aprobada', revisado_por = ?, fecha_resolucion = NOW(),
         frente_destino = COALESCE(?, frente_destino) WHERE id = ?`,
        [req.usuario.id, frente_destino || null, pedido.id]
      );
    });

    const folio = generarFolioSolicitud(pedido.id);
    notificarResolucionSolicitud(pedido, resumenItems(itemsPedido), true, null, folio).catch(() => {});
    res.json({ ok: true, folio });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// GET /api/solicitudes/:id/vale-pdf — vale imprimible con QR del folio, lista todos los materiales
// del pedido y de que lote(s) sale cada uno, para llevar a bodega.
router.get('/:id/vale-pdf', autenticar, autorizar('admin', 'bodeguero', 'solicitante'), async (req, res) => {
  try {
    const pedido = (await sql(`${SELECT_PEDIDO} WHERE s.id = ? AND s.eliminada = false`, [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (req.usuario.rol === 'solicitante' && pedido.solicitante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Sin permisos para ver esta solicitud' });
    }
    if (pedido.estado === 'pendiente' || pedido.estado === 'rechazada') {
      return res.status(409).json({ error: 'Esta solicitud todavía no tiene un vale generado' });
    }
    const items = await obtenerItems(pedido.id);
    for (const item of items) {
      item.lotes = (await sql(
        `SELECT sla.lote_id, sla.cantidad, l.codigo AS lote_codigo, l.ubicacion_1, l.ubicacion_2, l.pallet_numero
         FROM solicitud_lotes_aprobados sla JOIN lotes l ON l.id = sla.lote_id
         WHERE sla.pedido_item_id = ?`,
        [item.id]
      )).rows;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="vale_solicitud_${pedido.id}.pdf"`);
    await generarValePDF({ ...pedido, items }, res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/solicitudes/:id/entregar — multipart: firma + foto (foto opcional), UNA sola vez para
// todo el pedido aunque tenga varios materiales. Usa los lotes/cantidades ya decididos al aprobar
// (solicitud_lotes_aprobados, por item) para crear un despacho por cada (item, lote) — aca SI se
// valida y resta el stock, en el momento real del retiro.
router.post('/:id/entregar', autenticar, autorizar('admin', 'bodeguero'), upload.fields([
  { name: 'firma', maxCount: 1 },
  { name: 'foto', maxCount: 1 }
]), async (req, res) => {
  try {
    const pedido = (await sql('SELECT * FROM solicitudes WHERE id = ? AND eliminada = false', [req.params.id])).rows[0];
    if (!pedido) return res.status(404).json({ error: 'Solicitud no encontrada' });
    if (pedido.estado !== 'aprobada') return res.status(409).json({ error: 'Esta solicitud no tiene un vale pendiente de retiro' });

    const firmaFile = req.files?.firma?.[0];
    if (!firmaFile) return res.status(400).json({ error: 'La firma digital de quien retira es requerida' });

    const asignaciones = (await sql(
      `SELECT sla.pedido_item_id, sla.lote_id, sla.cantidad
       FROM solicitud_lotes_aprobados sla JOIN pedido_items pi ON pi.id = sla.pedido_item_id
       WHERE pi.pedido_id = ?`,
      [pedido.id]
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
          frente_destino: pedido.frente_destino,
          retirado_por, observaciones, firma_url, foto_url,
          usuario_id: req.usuario.id, solicitud_id: pedido.id, pedido_item_id: a.pedido_item_id
        }));
      }
      await tsql(`UPDATE solicitudes SET estado = 'entregada', fecha_entrega = NOW() WHERE id = ?`, [pedido.id]);
      return ids;
    });

    // Ciclo cerrado: la campanita ya no necesita seguir mostrando el aviso de esta solicitud.
    await sql('DELETE FROM notificaciones WHERE solicitud_id = ?', [pedido.id]);

    res.json({ ok: true, despacho_ids: despachoIds });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
