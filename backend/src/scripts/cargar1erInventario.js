// Registra "Limpio 1er inventario.xlsx" (560 items revisados) como el primer inventario físico
// del proyecto, fecha 2026-05-19. Matchea ITEM del Excel == lote_id (confirmado 1:1 contra la BD
// por match1erInventario.js). Inserta un registro en `inventarios` por lote con fecha histórica
// 2026-05-19: v_lotes_stock usa el inventario más reciente por fecha como nueva base de stock, así
// que esto "cuadra" el stock automáticamente sin tocar despachos/devoluciones.
// Idempotente: si un lote ya tiene un inventario con esta misma marca de origen, lo salta.
require('dotenv').config();
const XLSX = require('xlsx');
const { sql, withTransaction, pool } = require('../database/db');

const RUTA_EXCEL = process.argv[2] || 'C:\\AJILAO\\Limpio 1er inventario.xlsx';
const FECHA_INVENTARIO = '2026-05-19';
const MARCA_ORIGEN = 'Primer inventario físico (19-05-2026) — cargado desde "Limpio 1er inventario.xlsx"';
const USUARIO_ID = 1; // Administrador Bodega

function norm(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}
function palabras(v) {
  return new Set(norm(v).split(/[^A-Z0-9]+/).filter(w => w.length >= 3));
}

async function main() {
  const wb = XLSX.readFile(RUTA_EXCEL);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(ws, { defval: null });

  const yaCargado = (await sql('SELECT COUNT(*) AS total FROM inventarios WHERE observaciones = ?', [MARCA_ORIGEN])).rows[0].total > 0;
  if (yaCargado) {
    console.log('Ya existen registros de este 1er inventario (misma marca de origen). No se vuelve a cargar. Si necesitas recargar, elimina antes esos registros.');
    await pool.end();
    return;
  }

  const dbRows = (await sql(`
    SELECT l.id AS lote_id, m.descripcion, v.stock_actual
    FROM lotes l
    JOIN materiales m ON m.id = l.material_id
    JOIN v_lotes_stock v ON v.lote_id = l.id
  `)).rows;
  const byId = new Map(dbRows.map(r => [r.lote_id, r]));

  let insertados = 0, saltados = 0, conDiferencia = 0;
  const erroresDescripcion = [];

  await withTransaction(async (tsql) => {
    for (const fila of filas) {
      const item = fila['ITEM'];
      const desc = fila['DESCRIPCION'];
      const cantidad = fila['Inventario 19-05-2026'];
      if (item === null || item === undefined || desc === null || cantidad === null || cantidad === undefined) {
        saltados++;
        continue;
      }

      const lote = byId.get(Number(item));
      if (!lote) { saltados++; continue; }

      const wExcel = palabras(desc);
      const wDb = palabras(lote.descripcion);
      let comunes = 0;
      for (const w of wExcel) if (wDb.has(w)) comunes++;
      const similitud = comunes / Math.max(1, Math.min(wExcel.size, wDb.size));
      if (similitud < 0.5) {
        erroresDescripcion.push({ item, excel: desc, db: lote.descripcion });
        saltados++;
        continue;
      }

      const stockActual = Number(lote.stock_actual);
      const cant = Number(cantidad);
      const diferencia = cant - stockActual;
      if (diferencia !== 0) conDiferencia++;

      await tsql(
        `INSERT INTO inventarios (lote_id, cantidad_inventariada, stock_esperado, diferencia, observaciones, usuario_id, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [lote.lote_id, cant, stockActual, diferencia, MARCA_ORIGEN, USUARIO_ID, FECHA_INVENTARIO]
      );
      insertados++;
    }
  });

  console.log(`Insertados: ${insertados} (con diferencia vs stock previo: ${conDiferencia})`);
  console.log(`Saltados: ${saltados}`);
  if (erroresDescripcion.length) {
    console.log('Descripciones que no coincidieron (no se cargaron, revisar a mano):');
    erroresDescripcion.forEach(e => console.log(JSON.stringify(e)));
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('Error:', e.message);
  await pool.end().finally(() => process.exit(1));
});
