const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql } = require('../database/db');
const { autenticar, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const r = await sql('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email.toLowerCase().trim()]);
    const usuario = r.rows[0];
    if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/auth/me
router.get('/me', autenticar, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;
