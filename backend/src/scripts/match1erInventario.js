// Dry-run: matchea cada fila de "Limpio 1er inventario.xlsx" (curada, ~560 items revisados)
// contra el lote existente usando ITEM == lote_id (confirmado 1:1 contra la BD: lotes.id 1..805
// se creó en el mismo orden que las filas ITEM 1..805 del Excel maestro de importación).
// Valida con la descripcion como chequeo de sanidad. No escribe nada en la BD.
require('dotenv').config();
const XLSX = require('xlsx');
const { sql, pool } = require('../database/db');

const RUTA_EXCEL = process.argv[2] || 'C:\\AJILAO\\Limpio 1er inventario.xlsx';

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

  const dbRows = (await sql(`
    SELECT l.id AS lote_id, l.codigo, m.descripcion, l.ubicacion_1, l.ubicacion_2, l.pallet_numero, l.equipo_destino,
           l.cantidad_recepcionada, v.stock_actual
    FROM lotes l
    JOIN materiales m ON m.id = l.material_id
    JOIN v_lotes_stock v ON v.lote_id = l.id
  `)).rows;
  const byId = new Map(dbRows.map(r => [r.lote_id, r]));

  let ok = 0, descNoCoincide = 0, itemSinLote = 0, difieren = 0, iguales = 0;
  const descNoCoincideRows = [];
  const itemSinLoteRows = [];
  const difierenRows = [];

  for (const fila of filas) {
    const item = fila['ITEM'];
    const desc = fila['DESCRIPCION'];
    const cantidad = fila['Inventario 19-05-2026'];
    if (item === null || item === undefined || desc === null) continue;

    const lote = byId.get(Number(item));
    if (!lote) {
      itemSinLote++;
      itemSinLoteRows.push({ item, desc });
      continue;
    }

    const wExcel = palabras(desc);
    const wDb = palabras(lote.descripcion);
    let comunes = 0;
    for (const w of wExcel) if (wDb.has(w)) comunes++;
    const similitud = comunes / Math.max(1, Math.min(wExcel.size, wDb.size));

    if (similitud < 0.5) {
      descNoCoincide++;
      descNoCoincideRows.push({ item, excel: desc, db: lote.descripcion, similitud: similitud.toFixed(2) });
      continue;
    }

    ok++;
    const stockActual = Number(lote.stock_actual);
    const cant = Number(cantidad);
    if (Number.isFinite(cant) && cant !== stockActual) {
      difieren++;
      difierenRows.push({ item, loteId: lote.lote_id, codigo: lote.codigo, desc: lote.descripcion, stockActual, cantidadInventario: cant });
    } else {
      iguales++;
    }
  }

  console.log(`Total filas en excel (con item+descripcion): ${ok + descNoCoincide + itemSinLote}`);
  console.log(`  Match OK (item->lote, descripcion coincide): ${ok}`);
  console.log(`    - stock ya coincide: ${iguales}`);
  console.log(`    - stock DIFIERE (requiere ajuste): ${difieren}`);
  console.log(`  ITEM sin lote correspondiente en BD: ${itemSinLote}`);
  console.log(`  Descripcion NO coincide para ese ITEM (revisar a mano): ${descNoCoincide}`);

  if (itemSinLoteRows.length) {
    console.log('\n--- ITEM SIN LOTE (primeras 20) ---');
    itemSinLoteRows.slice(0, 20).forEach(r => console.log(JSON.stringify(r)));
  }
  if (descNoCoincideRows.length) {
    console.log('\n--- DESCRIPCION NO COINCIDE (todas) ---');
    descNoCoincideRows.forEach(r => console.log(JSON.stringify(r)));
  }
  if (difierenRows.length) {
    console.log(`\n--- DIFIEREN (todas, ${difierenRows.length}) ---`);
    difierenRows.forEach(r => console.log(JSON.stringify(r)));
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
