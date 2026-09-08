const express = require('express');
const bcrypt = require('bcryptjs');
const { sql } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');

const router = express.Router();
const CAMPOS_PUBLICOS = 'id, nombre, email, rol, activo, pyc_empresa_id, created_at';
const ROLES_VALIDOS = ['admin', 'bodeguero', 'visor', 'solicitante', 'contratista'];

// GET /api/usuarios
router.get('/', autenticar, autorizar('admin'), async (req, res) => {
  try {
    const r = await sql(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios ORDER BY nombre`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/usuarios
router.post('/', autenticar, autorizar('admin'), async (req, res) => {
  try {
    const { nombre, email, password, rol, pyc_empresa_id } = req.body;
    if (!nombre || !email || !password || !rol) return res.status(400).json({ error: 'Nombre, email, contraseña y rol son requeridos' });
    if (!ROLES_VALIDOS.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    if (rol === 'contratista' && !pyc_empresa_id) return res.status(400).json({ error: 'Un usuario contratista debe pertenecer a una empresa P&C' });

    const existe = (await sql('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase().trim()])).rows[0];
    if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese email' });

    const hash = bcrypt.hashSync(password, 12);
    const r = await sql(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, pyc_empresa_id) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [nombre.trim(), email.toLowerCase().trim(), hash, rol, rol === 'contratista' ? pyc_empresa_id : null]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/usuarios/:id
router.put('/:id', autenticar, autorizar('admin'), async (req, res) => {
  try {
    const anterior = (await sql('SELECT * FROM usuarios WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { nombre, rol, activo, password, pyc_empresa_id } = req.body;
    const rolFinal = rol ?? anterior.rol;
    await sql(
      'UPDATE usuarios SET nombre = ?, rol = ?, activo = ?, pyc_empresa_id = ? WHERE id = ?',
      [nombre ?? anterior.nombre, rolFinal, activo !== undefined ? (activo ? 1 : 0) : anterior.activo,
        rolFinal === 'contratista' ? (pyc_empresa_id ?? anterior.pyc_empresa_id) : null, req.params.id]
    );
    if (password) {
      await sql('UPDATE usuarios SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 12), req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/usuarios/:id
router.delete('/:id', autenticar, autorizar('admin'), async (req, res) => {
  try {
    if (Number(req.params.id) === req.usuario.id) return res.status(409).json({ error: 'No puedes eliminar tu propio usuario' });
    const anterior = (await sql('SELECT id FROM usuarios WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'Usuario no encontrado' });
    await sql('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
