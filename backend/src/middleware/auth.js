const jwt = require('jsonwebtoken');
const { sql } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'bodega-pedernales-jej-secret-2026-change-in-prod';

async function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const r = await sql('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?', [payload.id]);
    const usuario = r.rows[0];
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }
    req.usuario = usuario;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function autorizar(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Sin permisos para esta operación' });
    }
    next();
  };
}

module.exports = { autenticar, autorizar, JWT_SECRET };
