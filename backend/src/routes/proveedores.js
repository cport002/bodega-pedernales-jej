const express = require('express');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();

// GET /api/proveedores
router.get('/', autenticar, async (req, res) => {
  try {
    const r = await sql('SELECT * FROM proveedores ORDER BY nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/proveedores
router.post('/', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const existe = (await sql('SELECT id FROM proveedores WHERE nombre = ?', [nombre.trim().toUpperCase()])).rows[0];
    if (existe) return res.json({ id: existe.id });
    const r = await sql('INSERT INTO proveedores (nombre) VALUES (?) RETURNING id', [nombre.trim().toUpperCase()]);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
