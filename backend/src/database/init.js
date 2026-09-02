require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function initDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = schema.split(';').map((s) => s.trim()).filter((s) => s.length > 3);

  const client = await pool.connect();
  try {
    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (e) {
        if (!e.message.includes('already exists')) {
          console.warn('Schema warning:', e.message.slice(0, 120));
        }
      }
    }

    const hayAdmin = await client.query("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1");
    if (hayAdmin.rows.length === 0) {
      const seeds = [
        { nombre: 'Administrador Bodega', email: 'admin@bodegapedernales.local', password: 'Pedernales2026!', rol: 'admin' },
        { nombre: 'Bodeguero', email: 'bodeguero@bodegapedernales.local', password: 'Pedernales2026!', rol: 'bodeguero' },
        { nombre: 'Visor', email: 'visor@bodegapedernales.local', password: 'Pedernales2026!', rol: 'visor' },
        { nombre: 'Solicitante Terreno', email: 'solicitante@bodegapedernales.local', password: 'Pedernales2026!', rol: 'solicitante' }
      ];
      for (const u of seeds) {
        const hash = bcrypt.hashSync(u.password, 12);
        await client.query('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4)', [u.nombre, u.email, hash, u.rol]);
        console.log(`Usuario creado: ${u.email} / ${u.password} (${u.rol})`);
      }
    }

    console.log('Base de datos PostgreSQL lista');
  } finally {
    client.release();
  }
}

module.exports = { initDatabase };

if (require.main === module) {
  initDatabase().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
