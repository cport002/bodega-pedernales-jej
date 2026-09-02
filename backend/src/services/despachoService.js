// Logica compartida para crear un despacho dentro de una transaccion ya abierta — usada tanto por
// el despacho directo (routes/despachos.js) como por la aprobacion de una solicitud (routes/solicitudes.js),
// que puede crear varios despachos (uno por lote elegido) en una sola transaccion.
async function crearDespachoEnTransaccion(tsql, {
  lote_id, cantidad, frente_destino, retirado_por, observaciones,
  firma_url, foto_url, usuario_id, solicitud_id = null
}) {
  const lote = (await tsql('SELECT id FROM lotes WHERE id = ?', [lote_id])).rows[0];
  if (!lote) throw Object.assign(new Error(`Lote ${lote_id} no encontrado`), { status: 404 });

  const stock = (await tsql('SELECT stock_actual FROM v_lotes_stock WHERE lote_id = ?', [lote_id])).rows[0];
  if (cantidad > stock.stock_actual) {
    throw Object.assign(new Error(`Stock insuficiente en el lote ${lote_id}, disponible: ${stock.stock_actual}`), { status: 409 });
  }

  const r = await tsql(
    `INSERT INTO despachos (lote_id, cantidad, frente_destino, retirado_por, observaciones, firma_url, foto_url, usuario_id, solicitud_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [lote_id, cantidad, frente_destino || null, retirado_por || null, observaciones || null, firma_url, foto_url, usuario_id, solicitud_id]
  );
  const despachoId = r.rows[0].id;

  const restante = (await tsql('SELECT stock_actual FROM v_lotes_stock WHERE lote_id = ?', [lote_id])).rows[0].stock_actual;
  if (restante <= 0) {
    await tsql("UPDATE lotes SET estado = 'agotado' WHERE id = ?", [lote_id]);
  }
  return despachoId;
}

module.exports = { crearDespachoEnTransaccion };
