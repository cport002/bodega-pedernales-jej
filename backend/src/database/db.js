const { Pool, types } = require('pg');

// node-postgres devuelve NUMERIC/DECIMAL como string para no perder precisión.
// Forzamos parseo a float para que las sumas en JS funcionen (mismo criterio que los otros sistemas JEJ).
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const dbUrl = (process.env.DATABASE_URL || '').replace(/[?&]sslmode=[^&]+/, '').replace(/[?&]$/, '');
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('PostgreSQL pool error:', err));

// Convierte placeholders ? a $1, $2, $3... para mantener las queries de las rutas sin cambios.
async function sql(query, params = []) {
  let idx = 0;
  const pgQuery = query.replace(/\?/g, () => `$${++idx}`);
  return pool.query(pgQuery, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  const tsql = (query, params = []) => {
    let idx = 0;
    const pgQuery = query.replace(/\?/g, () => `$${++idx}`);
    return client.query(pgQuery, params);
  };
  try {
    await client.query('BEGIN');
    const result = await callback(tsql);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, sql, withTransaction };
