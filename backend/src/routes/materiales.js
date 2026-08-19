const express = require('express');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();

// GET /api/materiales?busqueda=
router.get('/', autenticar, async (req, res) => {
  try {
    const { busqueda } = req.query;
    let query = 'SELECT * FROM materiales';
    const params = [];
    if (busqueda) {
      query += ' WHERE descripcion LIKE ? OR especialidad LIKE ?';
      params.push(`%${busqueda.toUpperCase()}%`, `%${busqueda.toUpperCase()}%`);
    }
    query += ' ORDER BY descripcion LIMIT 500';
    const r = await sql(query, params);
    res.json(r.rows);
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
