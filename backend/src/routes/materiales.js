const express = require('express');
const XLSX = require('xlsx');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();

// SELECT base compartido por el listado y la exportación: agrega el stock total (suma de
// v_lotes_stock de todos los lotes de ese material) y el estado ('activo' si tiene al menos un
// lote activo, si no 'inactivo') ya que un material puede tener varios lotes.
const SELECT_BASE = `
  SELECT m.*,
    COALESCE((SELECT SUM(s.stock_actual) FROM lotes l JOIN v_lotes_stock s ON s.lote_id = l.id WHERE l.material_id = m.id), 0) AS stock_total,
    CASE WHEN EXISTS (SELECT 1 FROM lotes l WHERE l.material_id = m.id AND l.estado = 'activo') THEN 'activo' ELSE 'inactivo' END AS estado
  FROM materiales m
`;

function construirFiltros(query) {
  const { busqueda, especialidad, unidad, estado } = query;
  const condiciones = [];
  const params = [];
  if (busqueda) {
    condiciones.push('(m.descripcion LIKE ? OR m.especialidad LIKE ?)');
    params.push(`%${busqueda.toUpperCase()}%`, `%${busqueda.toUpperCase()}%`);
  }
  if (especialidad) { condiciones.push('m.especialidad = ?'); params.push(especialidad.toUpperCase()); }
  if (unidad) { condiciones.push('m.unidad = ?'); params.push(unidad.toUpperCase()); }
  if (estado === 'activo') condiciones.push("EXISTS (SELECT 1 FROM lotes l WHERE l.material_id = m.id AND l.estado = 'activo')");
  if (estado === 'inactivo') condiciones.push("NOT EXISTS (SELECT 1 FROM lotes l WHERE l.material_id = m.id AND l.estado = 'activo')");
  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

// GET /api/materiales?busqueda=&especialidad=&unidad=&estado=
router.get('/', autenticar, async (req, res) => {
  try {
    const { where, params } = construirFiltros(req.query);
    const r = await sql(`${SELECT_BASE} ${where} ORDER BY m.descripcion LIMIT 1000`, params);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/materiales/especialidades — valores distintos, para poblar el filtro
router.get('/especialidades', autenticar, async (req, res) => {
  try {
    const r = await sql("SELECT DISTINCT especialidad FROM materiales WHERE especialidad IS NOT NULL AND especialidad <> '' ORDER BY especialidad");
    res.json(r.rows.map(row => row.especialidad));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/materiales/exportar — mismos filtros que el listado, descarga un .xlsx
router.get('/exportar', autenticar, async (req, res) => {
  try {
    const { where, params } = construirFiltros(req.query);
    const r = await sql(`${SELECT_BASE} ${where} ORDER BY m.descripcion`, params);
    const filas = r.rows.map(m => ({
      Descripcion: m.descripcion,
      Especialidad: m.especialidad || '',
      'Diametro 1': m.diametro_1 || '',
      'Diametro 2': m.diametro_2 || '',
      Unidad: m.unidad,
      'Stock Total': Number(m.stock_total) || 0,
      'Peso Unit (kg)': m.peso_unidad_kg ?? '',
      Estado: m.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [{ wch: 55 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Materiales');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="materiales_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/materiales/:id
router.get('/:id', autenticar, async (req, res) => {
  try {
    const material = (await sql('SELECT * FROM materiales WHERE id = ?', [req.params.id])).rows[0];
    if (!material) return res.status(404).json({ error: 'Material no encontrado' });
    res.json(material);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/materiales
router.post('/', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { descripcion, especialidad, diametro_1, diametro_2, unidad, peso_unidad_kg } = req.body;
    if (!descripcion) return res.status(400).json({ error: 'Descripción requerida' });

    const desc = descripcion.trim().toUpperCase();
    const d1 = (diametro_1 || '').trim().toUpperCase();
    const d2 = (diametro_2 || '').trim().toUpperCase();
    const un = (unidad || 'C/U').trim().toUpperCase();

    const existe = (await sql(
      'SELECT id FROM materiales WHERE descripcion = ? AND diametro_1 = ? AND diametro_2 = ? AND unidad = ?',
      [desc, d1, d2, un]
    )).rows[0];
    if (existe) return res.json({ id: existe.id });

    const r = await sql(
      `INSERT INTO materiales (descripcion, especialidad, diametro_1, diametro_2, unidad, peso_unidad_kg)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [desc, especialidad ? especialidad.trim().toUpperCase() : null, d1 || null, d2 || null, un, peso_unidad_kg || null]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/materiales/:id
router.put('/:id', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const anterior = (await sql('SELECT * FROM materiales WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'Material no encontrado' });
    const { descripcion, especialidad, diametro_1, diametro_2, unidad, peso_unidad_kg } = req.body;
    await sql(
      `UPDATE materiales SET descripcion = ?, especialidad = ?, diametro_1 = ?, diametro_2 = ?, unidad = ?, peso_unidad_kg = ? WHERE id = ?`,
      [
        (descripcion ?? anterior.descripcion).toUpperCase(),
        especialidad !== undefined ? (especialidad ? especialidad.toUpperCase() : null) : anterior.especialidad,
        diametro_1 !== undefined ? diametro_1 : anterior.diametro_1,
        diametro_2 !== undefined ? diametro_2 : anterior.diametro_2,
        (unidad ?? anterior.unidad).toUpperCase(),
        peso_unidad_kg !== undefined ? peso_unidad_kg : anterior.peso_unidad_kg,
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
