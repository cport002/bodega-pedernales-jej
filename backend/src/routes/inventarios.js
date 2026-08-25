const express = require('express');
const XLSX = require('xlsx');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { uploadExcel } = require('../services/upload');

const router = express.Router();

// Columnas de la plantilla de descarga/carga — deben coincidir exactamente entre /plantilla
// (las escribe) e /importar (las lee), es el contrato entre ambos endpoints.
const COL = {
  codigo: 'CODIGO', descripcion: 'DESCRIPCION', ubicacion1: 'UBICACION 1', ubicacion2: 'UBICACION 2',
  pallet: 'PALLET N°', equipo: 'EQUIPO', stockSistema: 'STOCK SISTEMA',
  cantidad: 'CANTIDAD INVENTARIADA', observaciones: 'OBSERVACIONES'
};

function construirFiltrosPlantilla(query) {
  const { area, ubicacion, equipo, con_stock } = query;
  const condiciones = ["l.estado <> 'inactivo'"];
  const params = [];
  if (area) { condiciones.push('l.area = ?'); params.push(area.toUpperCase()); }
  if (ubicacion) {
    condiciones.push('(l.ubicacion_1 LIKE ? OR l.ubicacion_2 LIKE ?)');
    const like = `%${ubicacion.toUpperCase()}%`;
    params.push(like, like);
  }
  if (equipo) { condiciones.push('l.equipo_destino LIKE ?'); params.push(`%${equipo.toUpperCase()}%`); }
  if (con_stock === '1') condiciones.push('s.stock_actual > 0');
  return { where: `WHERE ${condiciones.join(' AND ')}`, params };
}

// Cada conteo físico (uno o cientos de lotes) es una "sesión" con fecha y responsable; las filas
// de `inventarios` que produce quedan agrupadas bajo esa sesión vía sesion_id, en vez de aparecer
// sueltas y desordenadas en un solo listado plano.
const SELECT_SESIONES = `
  SELECT s.id, s.fecha, s.etiqueta, s.observaciones, s.created_at, u.nombre AS usuario_nombre,
    COUNT(i.id) AS total_lotes,
    COUNT(i.id) FILTER (WHERE i.diferencia <> 0) AS con_diferencia
  FROM inventario_sesiones s
  LEFT JOIN usuarios u ON u.id = s.usuario_id
  LEFT JOIN inventarios i ON i.sesion_id = s.id
`;
const GROUP_SESIONES = 'GROUP BY s.id, u.nombre';

const SELECT_DETALLE = `
  SELECT i.*, l.codigo AS lote_codigo, l.tag, l.pallet_numero, l.ubicacion_1, l.ubicacion_2, m.descripcion AS material_descripcion, m.unidad,
    u.nombre AS usuario_nombre
  FROM inventarios i
  JOIN lotes l ON l.id = i.lote_id
  JOIN materiales m ON m.id = l.material_id
  LEFT JOIN usuarios u ON u.id = i.usuario_id
`;

// GET /api/inventarios/sesiones — historial agrupado por sesión de conteo, más reciente primero
router.get('/sesiones', autenticar, async (req, res) => {
  try {
    const r = await sql(`${SELECT_SESIONES} ${GROUP_SESIONES} ORDER BY s.fecha DESC, s.id DESC LIMIT 200`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/inventarios/sesiones/:id — detalle de una sesión: cabecera + cada lote contado en ella
router.get('/sesiones/:id', autenticar, async (req, res) => {
  try {
    const sesion = (await sql(`${SELECT_SESIONES} WHERE s.id = ? ${GROUP_SESIONES}`, [req.params.id])).rows[0];
    if (!sesion) return res.status(404).json({ error: 'Sesión de inventario no encontrada' });
    const items = (await sql(`${SELECT_DETALLE} WHERE i.sesion_id = ? ORDER BY l.codigo`, [req.params.id])).rows;
    res.json({ ...sesion, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/inventarios?lote_id= — historial de conteos de un lote puntual (usado desde su ficha)
router.get('/', autenticar, async (req, res) => {
  try {
    const { lote_id } = req.query;
    const where = lote_id ? 'WHERE i.lote_id = ?' : '';
    const params = lote_id ? [lote_id] : [];
    const r = await sql(`${SELECT_DETALLE} ${where} ORDER BY i.id DESC LIMIT 300`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/inventarios — conteo manual de un solo lote (desde su ficha). Se registra igual como
// una sesión (de un solo lote) para que quede en el mismo historial que las cargas masivas.
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

    const resultado = await withTransaction(async (tsql) => {
      const s = await tsql(
        `INSERT INTO inventario_sesiones (fecha, etiqueta, usuario_id) VALUES (CURRENT_DATE, 'Conteo manual', ?) RETURNING id`,
        [req.usuario.id]
      );
      const sesionId = s.rows[0].id;
      const r = await tsql(
        `INSERT INTO inventarios (lote_id, sesion_id, cantidad_inventariada, stock_esperado, diferencia, observaciones, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [lote_id, sesionId, cantidad_inventariada, stock.stock_actual, diferencia, observaciones || null, req.usuario.id]
      );
      return { id: r.rows[0].id, sesionId };
    });

    res.status(201).json({ id: resultado.id, sesion_id: resultado.sesionId, diferencia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/inventarios/areas — valores distintos de área, para poblar el filtro de la plantilla
router.get('/areas', autenticar, async (req, res) => {
  try {
    const r = await sql("SELECT DISTINCT area FROM lotes WHERE area IS NOT NULL AND area <> '' AND area <> 'N/A' ORDER BY area");
    res.json(r.rows.map(row => row.area));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/inventarios/plantilla?area=&ubicacion=&equipo=&con_stock=1 — descarga un .xlsx con los
// lotes que calzan el filtro, listos para llenar la columna "CANTIDAD INVENTARIADA" a mano y
// volver a subirlos por POST /importar. Filtro opcional: permite generar plantillas parciales
// (por área/patio/equipo) para conteos físicos por zona, en vez de forzar siempre el listado completo.
router.get('/plantilla', autenticar, async (req, res) => {
  try {
    const { where, params } = construirFiltrosPlantilla(req.query);
    const r = await sql(
      `SELECT l.codigo, m.descripcion, l.ubicacion_1, l.ubicacion_2, l.pallet_numero, l.equipo_destino, s.stock_actual
       FROM lotes l JOIN materiales m ON m.id = l.material_id JOIN v_lotes_stock s ON s.lote_id = l.id
       ${where} ORDER BY l.area, l.ubicacion_2, l.id`,
      params
    );

    const filas = r.rows.map(l => ({
      [COL.codigo]: l.codigo,
      [COL.descripcion]: l.descripcion,
      [COL.ubicacion1]: l.ubicacion_1 || '',
      [COL.ubicacion2]: l.ubicacion_2 || '',
      [COL.pallet]: l.pallet_numero || '',
      [COL.equipo]: l.equipo_destino || '',
      [COL.stockSistema]: Number(l.stock_actual) || 0,
      [COL.cantidad]: '',
      [COL.observaciones]: ''
    }));

    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 14 }, { wch: 55 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Inventario');

    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['Cómo usar esta plantilla'],
      ['1. No modificar la columna CODIGO — es la que el sistema usa para identificar cada lote al volver a cargar el archivo.'],
      ['2. Llenar la columna CANTIDAD INVENTARIADA con el conteo físico real de cada lote.'],
      ['3. Dejar en blanco la fila de cualquier lote que todavía no se haya contado — se ignora al cargar, no se toca su stock.'],
      ['4. OBSERVACIONES es opcional (ej. NCR, hallazgo del conteo).'],
      ['5. Subir este mismo archivo en Inventarios > Cargar inventario, indicando la fecha del conteo.'],
    ]);
    instrucciones['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla_inventario_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/inventarios/importar — multipart: archivo (.xlsx de /plantilla ya llenado), fecha
// (fecha real del conteo físico, no necesariamente hoy), etiqueta (opcional, nombre de la sesión).
// Crea una sesión y registra en ella un inventario por cada fila con CANTIDAD INVENTARIADA llena;
// v_lotes_stock toma automáticamente el más reciente como nueva base de stock.
router.post('/importar', autenticar, autorizar('admin', 'bodeguero'), uploadExcel.single('archivo'), async (req, res) => {
  try {
    const { fecha, etiqueta } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Archivo .xlsx requerido' });
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Fecha del conteo requerida (YYYY-MM-DD)' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets['Plantilla Inventario'] || wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: null });

    const lotesPorCodigo = new Map(
      (await sql(`SELECT l.id AS lote_id, l.codigo, s.stock_actual FROM lotes l JOIN v_lotes_stock s ON s.lote_id = l.id`)).rows
        .map(r => [r.codigo.toUpperCase(), r])
    );

    let insertados = 0, conDiferencia = 0, sinContar = 0;
    const noEncontrados = [];
    const invalidas = [];

    const sesionId = await withTransaction(async (tsql) => {
      const s = await tsql(
        `INSERT INTO inventario_sesiones (fecha, etiqueta, usuario_id) VALUES (?, ?, ?) RETURNING id`,
        [fecha, (etiqueta && etiqueta.trim()) || 'Conteo con plantilla Excel', req.usuario.id]
      );
      const sesionId = s.rows[0].id;

      for (const fila of filas) {
        const codigo = fila[COL.codigo] ? String(fila[COL.codigo]).trim().toUpperCase() : null;
        if (!codigo) continue;
        const cantidadRaw = fila[COL.cantidad];
        if (cantidadRaw === null || cantidadRaw === undefined || cantidadRaw === '') { sinContar++; continue; }

        const cantidad = Number(cantidadRaw);
        if (!Number.isFinite(cantidad) || cantidad < 0) { invalidas.push(codigo); continue; }

        const lote = lotesPorCodigo.get(codigo);
        if (!lote) { noEncontrados.push(codigo); continue; }

        const stockActual = Number(lote.stock_actual);
        const diferencia = cantidad - stockActual;
        if (diferencia !== 0) conDiferencia++;

        await tsql(
          `INSERT INTO inventarios (lote_id, sesion_id, cantidad_inventariada, stock_esperado, diferencia, observaciones, usuario_id, fecha)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [lote.lote_id, sesionId, cantidad, stockActual, diferencia,
            (fila[COL.observaciones] ? String(fila[COL.observaciones]).trim() : null),
            req.usuario.id, fecha]
        );
        insertados++;
      }
      return sesionId;
    });

    res.json({ sesion_id: sesionId, insertados, conDiferencia, sinContar, noEncontrados, invalidas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
