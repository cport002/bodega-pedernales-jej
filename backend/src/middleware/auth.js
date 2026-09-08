const jwt = require('jsonwebtoken');
const { sql } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'bodega-pedernales-jej-secret-2026-change-in-prod';

// El rol 'contratista' es una empresa externa ajena a la bodega — a diferencia del resto de los
// roles, no basta con bloquear POST/PUT via autorizar() en cada ruta, porque varios GET (materiales,
// lotes, etc.) son de lectura libre para cualquier usuario autenticado (pensado para 'solicitante').
// Se bloquea aca, centralizado por prefijo de ruta, en vez de tener que tocar cada archivo de rutas.
const PREFIJOS_PERMITIDOS_CONTRATISTA = ['/api/auth', '/api/pyc', '/api/notificaciones'];

async function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const r = await sql('SELECT id, nombre, email, rol, activo, pyc_empresa_id FROM usuarios WHERE id = ?', [payload.id]);
    const usuario = r.rows[0];
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }
    if (usuario.rol === 'contratista' && !PREFIJOS_PERMITIDOS_CONTRATISTA.some(p => req.baseUrl.startsWith(p))) {
      return res.status(403).json({ error: 'Tu usuario solo tiene acceso al módulo de Programación y Control' });
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
