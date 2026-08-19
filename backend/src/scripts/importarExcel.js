// Importa los ~805 ítems reales de "Archivo bodega internacional.xlsx" (hoja "Pedernales listado general")
// a materiales + recepciones + lotes. Idempotente: agrupa filas en recepciones por
// (proveedor + n_guia + fecha + oc + contrato + pm), reutiliza materiales ya existentes (mismo
// criterio de deduplicación que la ruta POST /recepciones), y salta filas ya importadas
// (detectadas por no tener ningún lote con ese mismo origen aún — ver comentario en `yaImportado`).
require('dotenv').config();
const XLSX = require('xlsx');
const { sql, withTransaction, pool } = require('../database/db');
const { generarCodigoLote } = require('../services/qr');

const RUTA_EXCEL = process.argv[2] || 'C:\\AJILAO\\Archivo bodega internacional.xlsx';
const HOJA = 'Pedernales listado general';

function limpio(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function numero(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Excel guarda fechas como número de serie (días desde 1899-12-30). Convierte a 'YYYY-MM-DD'.
function fechaExcel(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

async function obtenerOCrearProveedor(tsql, nombre) {
  if (!nombre) return null;
  const limpioNombre = nombre.trim().toUpperCase();
  const existe = (await tsql('SELECT id FROM proveedores WHERE nombre = ?', [limpioNombre])).rows[0];
  if (existe) return existe.id;
  return (await tsql('INSERT INTO proveedores (nombre) VALUES (?) RETURNING id', [limpioNombre])).rows[0].id;
}

async function obtenerOCrearMaterial(tsql, item) {
  const desc = (item.descripcion || 'SIN DESCRIPCION').trim().toUpperCase();
  const d1 = (item.diametro_1 || '').trim().toUpperCase();
  const d2 = (item.diametro_2 || '').trim().toUpperCase();
  const un = (item.unidad || 'C/U').trim().toUpperCase();
  const existe = (await tsql(
    'SELECT id FROM materiales WHERE descripcion = ? AND diametro_1 = ? AND diametro_2 = ? AND unidad = ?',
    [desc, d1, d2, un]
  )).rows[0];
  if (existe) return existe.id;
  return (await tsql(
    `INSERT INTO materiales (descripcion, especialidad, diametro_1, diametro_2, unidad, peso_unidad_kg)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [desc, item.especialidad ? item.especialidad.trim().toUpperCase() : null, d1 || null, d2 || null, un, item.peso_unidad_kg || null]
  )).rows[0].id;
}

async function obtenerOCrearRecepcion(tsql, cache, cab) {
  const clave = [cab.orden_compra, cab.contrato, cab.n_guia, cab.fecha_recepcion, cab.proveedor].join('|');
  if (cache.has(clave)) return cache.get(clave);

  const proveedorId = await obtenerOCrearProveedor(tsql, cab.proveedor);
  const r = await tsql(
    `INSERT INTO recepciones (orden_compra, contrato, pm, proveedor_id, n_guia, fecha_recepcion, observaciones)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [cab.orden_compra, cab.contrato, cab.pm, proveedorId, cab.n_guia, cab.fecha_recepcion || '2026-01-01', 'Importado desde Excel "Archivo bodega internacional.xlsx"']
  );
  const id = r.rows[0].id;
  cache.set(clave, id);
  return id;
}

async function importar() {
  const wb = XLSX.readFile(RUTA_EXCEL);
  const hoja = wb.Sheets[HOJA];
  if (!hoja) throw new Error(`No se encontró la hoja "${HOJA}". Hojas disponibles: ${wb.SheetNames.join(', ')}`);

  // range: A4 son los encabezados reales (fila 1 título, fila 2 vacía, fila 3 vacía) — datos desde fila 5.
  const filas = XLSX.utils.sheet_to_json(hoja, { range: 3, defval: null });

  const yaImportado = (await sql("SELECT COUNT(*) AS total FROM recepciones WHERE observaciones LIKE 'Importado desde Excel%'")).rows[0].total > 0;
  if (yaImportado) {
    console.log('Ya existen recepciones importadas desde este Excel. Para reimportar, vaciar antes las tablas en Postgres y correr init-db de nuevo.');
    return;
  }

  const cacheRecepciones = new Map();
  let creados = 0;
  let omitidos = 0;

  await withTransaction(async (tsql) => {
    for (const fila of filas) {
      const descripcion = limpio(fila['DESCRIPCION']);
      const cantidadRecepcionada = numero(fila['CANTIDAD RECEPCIONADA ']) ?? numero(fila['CANTIDAD RECEPCIONADA']);
      if (!descripcion || !cantidadRecepcionada || cantidadRecepcionada <= 0) { omitidos++; continue; }

      const cab = {
        orden_compra: limpio(fila['ORDEN DE COMPRA']),
        contrato: limpio(fila['N°CONTRATO']),
        pm: limpio(fila['PM']),
        proveedor: limpio(fila['PROVEEDOR']),
        n_guia: limpio(fila['N° GUIA ']) ?? limpio(fila['N° GUIA']),
        fecha_recepcion: fechaExcel(fila['FECHA RECEPCION '] ?? fila['FECHA RECEPCION'])
      };
      const recepcionId = await obtenerOCrearRecepcion(tsql, cacheRecepciones, cab);

      const materialId = await obtenerOCrearMaterial(tsql, {
        descripcion,
        especialidad: limpio(fila['ESPECIALIDAD']),
        diametro_1: limpio(fila['DIAMETRO 1']),
        diametro_2: limpio(fila['DIAMETRO 2']),
        unidad: limpio(fila['UNID.']) || 'C/U',
        peso_unidad_kg: numero(fila['PESO UNIDAD KG.'])
      });

      const loteR = await tsql(
        `INSERT INTO lotes (
          codigo, recepcion_id, material_id, tag, marca_serie_modelo,
          cantidad_packing_list, cantidad_recepcionada, ncr_uso_d, protocolo_cambio_ubicacion,
          area, ubicacion_1, ubicacion_2, pallet_numero, equipo_destino
        ) VALUES ('PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [
          recepcionId, materialId,
          limpio(fila['TAG']), limpio(fila['MARCA DE GOLPE / N° SERIE / MODELO']),
          numero(fila['CANTIDAD PACKING LIST']), cantidadRecepcionada,
          limpio(fila['NCR / USO&D']), limpio(fila['PROTOCOLO CAMBIO UBICACIÓN']),
          limpio(fila['AREA']), limpio(fila['UBICACIÓN N° 1']), limpio(fila['UBICACIÓN N°2']),
          limpio(fila['PALLET N°']), limpio(fila['EQUIPO'])
        ]
      );
      const loteId = loteR.rows[0].id;
      await tsql('UPDATE lotes SET codigo = ? WHERE id = ?', [generarCodigoLote(loteId), loteId]);

      // Cantidad ya despachada según el Excel: se registra como un despacho histórico sin firma/foto
      // (no hay respaldo digital de esos despachos pasados, solo el número que el Excel ya traía).
      const despachada = numero(fila['CANTIDAD DESPACHADA']) || 0;
      if (despachada > 0) {
        await tsql(
          `INSERT INTO despachos (lote_id, cantidad, frente_destino, observaciones, fecha)
           VALUES (?, ?, ?, ?, ?)`,
          [loteId, despachada, limpio(fila['EQUIPO']), 'Despacho histórico importado desde Excel (sin firma digital, previo al sistema)', cab.fecha_recepcion || '2026-01-01']
        );
      }

      // El Excel original tiene ~30 columnas "STOCK EN BODEGA" que quedaron rotas (#VALUE!) — la única
      // cifra de stock real y confiable que queda es "CANTIDAD INVENTARIADA" (conteo físico). Cuando es
      // menor a lo recepcionado y esa diferencia no está cubierta por CANTIDAD DESPACHADA, hay consumo
      // real no registrado explícitamente: se agrega como despacho de ajuste para que el stock del
      // sistema quede igual al último conteo físico real, en vez de mostrar de más.
      const inventariada = numero(fila['CANTIDAD INVENTARIADA']);
      const fechaInventario = fechaExcel(fila['FECHA INVENTARIO']) || cab.fecha_recepcion || '2026-01-01';
      if (inventariada !== null) {
        const faltante = cantidadRecepcionada - despachada - inventariada;
        if (faltante > 0) {
          await tsql(
            `INSERT INTO despachos (lote_id, cantidad, frente_destino, observaciones, fecha)
             VALUES (?, ?, ?, ?, ?)`,
            [loteId, faltante, null, 'Ajuste histórico de importación: diferencia entre recepcionado e inventario físico del Excel, sin detalle de a qué frente se despachó', fechaInventario]
          );
        }
        const stockTrasAjuste = cantidadRecepcionada - despachada - Math.max(0, faltante);
        await tsql(
          `INSERT INTO inventarios (lote_id, cantidad_inventariada, stock_esperado, diferencia, observaciones, fecha)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [loteId, inventariada, stockTrasAjuste, inventariada - stockTrasAjuste, limpio(fila['OBSERVACIONES']) || 'Importado desde Excel (conteo físico original)', fechaInventario]
        );
      }

      creados++;
    }
  });

  console.log(`Importación completa: ${creados} lotes creados, ${omitidos} filas omitidas (sin descripción o cantidad recepcionada).`);
}

if (require.main === module) {
  importar()
    .then(() => pool.end())
    .catch((e) => {
      console.error('Error en la importación:', e.message);
      return pool.end().finally(() => process.exit(1));
    });
}

module.exports = { importar };
