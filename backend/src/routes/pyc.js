const express = require('express');
const XLSX = require('xlsx');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo, uploadExcel } = require('../services/upload');

const router = express.Router();

// Crea la cabecera + asistencia + equipos de un reporte diario dentro de una transaccion ya abierta
// — usado tanto por la carga manual (formulario) como por la carga vía plantilla Excel, para no
// duplicar esta logica en dos lados.
async function crearReporteDiario(tsql, { empresaId, fecha, frenteDestino, observacionesSsoma, observacionesGenerales, creadoPor, asistencia, equipos }) {
  const r = await tsql(
    `INSERT INTO pyc_reportes_diarios (empresa_id, fecha, frente_destino, observaciones_ssoma, observaciones_generales, creado_por)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [empresaId, fecha, frenteDestino || null, observacionesSsoma || null, observacionesGenerales || null, creadoPor]
  );
  const id = r.rows[0].id;
  for (const a of asistencia || []) {
    if (!a.personal_id || !a.estado) continue;
    await tsql('INSERT INTO pyc_asistencia (reporte_id, personal_id, estado, hh) VALUES (?, ?, ?, ?)',
      [id, a.personal_id, a.estado, Number(a.hh) || 0]);
  }
  for (const e of equipos || []) {
    if (!e.equipo_id) continue;
    await tsql('INSERT INTO pyc_uso_equipos (reporte_id, equipo_id, disponible, hh_operativas, observaciones) VALUES (?, ?, ?, ?, ?)',
      [id, e.equipo_id, e.disponible !== false, Number(e.hh_operativas) || 0, e.observaciones || null]);
  }
  return id;
}

// Columnas de la plantilla de descarga/carga de reporte diario — deben coincidir exactamente entre
// /reportes/plantilla (las escribe) y /reportes/importar (las lee), es el contrato entre ambos.
const COL_PERSONAL = {
  id: 'ID', nombre: 'NOMBRE', rut: 'RUT', cargo: 'CARGO', turno: 'TURNO',
  estado: 'ESTADO (presente / descanso / licencia / permiso / falta)', hh: 'HH'
};
const COL_EQUIPO = {
  id: 'ID', nombre: 'EQUIPO', patente: 'PATENTE', area: 'AREA DE TRABAJO',
  disponible: 'DISPONIBLE (SI / NO)', hh: 'HH OPERATIVAS', observaciones: 'OBSERVACIONES'
};
const ESTADOS_VALIDOS = ['presente', 'descanso', 'licencia', 'permiso', 'falta'];

// Columnas de la plantilla de alta masiva de personal/equipos — sin columna ID porque es para
// CREAR (o actualizar por RUT/PATENTE si ya existen), no para referenciar filas ya cargadas.
const COL_PERSONAL_MASIVO = { nombre: 'NOMBRE', rut: 'RUT', cargo: 'CARGO', turno: 'TURNO', tipo: 'TIPO (directo / indirecto)' };
const COL_EQUIPO_MASIVO = { nombre: 'EQUIPO', patente: 'PATENTE', area: 'AREA DE TRABAJO' };

// XLSX.utils.json_to_sheet(filas) infiere las columnas a partir de las claves de `filas[0]` — si el
// array viene vacio (empresa recien creada, sin nomina/equipos todavia, el caso mas comun al usar
// esta plantilla) la hoja queda SIN encabezados. Se escribe el encabezado a mano primero para que
// siempre este presente, tenga o no filas de datos.
function hojaConEncabezado(columnas, filas) {
  const ws = XLSX.utils.aoa_to_sheet([Object.values(columnas)]);
  XLSX.utils.sheet_add_json(ws, filas, { origin: 'A2', skipHeader: true });
  return ws;
}

// Normaliza texto libre (tildes, mayusculas) para hacer el match de ESTADO mas tolerante a como
// cada persona termine escribiendo en Excel.
function normalizar(s) {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Un usuario "contratista" solo puede ver/operar la empresa a la que pertenece — el resto de los
// roles (admin/bodeguero/visor) puede ver cualquier empresa. Se usa en cada ruta que recibe un
// empresa_id (directo o via el reporte) para no depender de que el frontend respete el scoping.
function empresaPermitida(req, empresaId) {
  if (req.usuario.rol !== 'contratista') return true;
  return Number(req.usuario.pyc_empresa_id) === Number(empresaId);
}

// GET /api/pyc/empresas
router.get('/empresas', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    if (req.usuario.rol === 'contratista') {
      const r = await sql('SELECT * FROM pyc_empresas WHERE id = ?', [req.usuario.pyc_empresa_id]);
      return res.json(r.rows);
    }
    const r = await sql('SELECT * FROM pyc_empresas ORDER BY activa DESC, nombre');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/empresas
router.post('/empresas', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { nombre, contrato } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre de la empresa es requerido' });
    const r = await sql('INSERT INTO pyc_empresas (nombre, contrato) VALUES (?, ?) RETURNING id', [nombre.trim(), contrato || null]);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    if (String(e.message).includes('duplicate') || String(e.message).includes('unique')) {
      return res.status(409).json({ error: 'Ya existe una empresa con ese nombre' });
    }
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/pyc/empresas/:id
router.put('/empresas/:id', autenticar, autorizar('admin', 'bodeguero'), async (req, res) => {
  try {
    const { nombre, contrato, activa } = req.body;
    const anterior = (await sql('SELECT * FROM pyc_empresas WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'Empresa no encontrada' });
    await sql('UPDATE pyc_empresas SET nombre = ?, contrato = ?, activa = ? WHERE id = ?',
      [nombre ?? anterior.nombre, contrato ?? anterior.contrato, activa !== undefined ? activa : anterior.activa, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Personal (nomina/roster reutilizable dia a dia) ----

router.get('/empresas/:id/personal', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const r = await sql('SELECT * FROM pyc_personal WHERE empresa_id = ? ORDER BY activo DESC, nombre', [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/empresas/:id/personal', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { nombre, rut, cargo, turno, tipo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });
    const r = await sql(
      'INSERT INTO pyc_personal (empresa_id, nombre, rut, cargo, turno, tipo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [req.params.id, nombre.trim(), rut || null, cargo || null, turno || null, tipo === 'indirecto' ? 'indirecto' : 'directo']
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/personal/:id', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    const anterior = (await sql('SELECT * FROM pyc_personal WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'No encontrado' });
    if (!empresaPermitida(req, anterior.empresa_id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { nombre, rut, cargo, turno, tipo, activo } = req.body;
    await sql(
      'UPDATE pyc_personal SET nombre = ?, rut = ?, cargo = ?, turno = ?, tipo = ?, activo = ? WHERE id = ?',
      [nombre ?? anterior.nombre, rut ?? anterior.rut, cargo ?? anterior.cargo, turno ?? anterior.turno,
        tipo ?? anterior.tipo, activo !== undefined ? activo : anterior.activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pyc/empresas/:id/personal/plantilla — .xlsx con la nomina actual (si hay) para agregar
// mas filas abajo, o vacio con solo encabezados si la empresa recien parte. Al volver a subirlo,
// las filas con un RUT que ya existe en la nomina se ACTUALIZAN en vez de duplicarse.
router.get('/empresas/:id/personal/plantilla', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const personal = (await sql('SELECT * FROM pyc_personal WHERE empresa_id = ? ORDER BY tipo, nombre', [req.params.id])).rows;

    const filas = personal.map(p => ({
      [COL_PERSONAL_MASIVO.nombre]: p.nombre, [COL_PERSONAL_MASIVO.rut]: p.rut || '',
      [COL_PERSONAL_MASIVO.cargo]: p.cargo || '', [COL_PERSONAL_MASIVO.turno]: p.turno || '',
      [COL_PERSONAL_MASIVO.tipo]: p.tipo
    }));
    const ws = hojaConEncabezado(COL_PERSONAL_MASIVO, filas);
    ws['!cols'] = [{ wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personal');

    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['Cómo usar esta plantilla'],
      ['1. Agrega una fila por cada persona nueva (NOMBRE es obligatorio, el resto opcional).'],
      ['2. Si el RUT de una fila ya existe en la nómina, se actualizan sus datos en vez de crear a la persona de nuevo — sirve para corregir cargo/turno masivamente.'],
      ['3. TIPO: "directo" o "indirecto" (si se deja vacío o con otro valor, queda como "directo").'],
      ['4. No borres las filas de personas que ya están — si borras una fila, esa persona NO se elimina de la nómina (esta plantilla nunca elimina, solo crea o actualiza).'],
      ['5. Sube este archivo en P&C > Personal > Cargar desde Excel.'],
    ]);
    instrucciones['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla_personal_empresa${req.params.id}.xlsx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/empresas/:id/personal/importar — multipart: archivo (.xlsx de /personal/plantilla).
// Upsert por RUT: si el RUT ya existe en la nomina de esta empresa, actualiza esa fila; si no (o
// viene sin RUT), crea una persona nueva.
router.post('/empresas/:id/personal/importar', autenticar, autorizar('admin', 'bodeguero', 'contratista'), uploadExcel.single('archivo'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    if (!req.file) return res.status(400).json({ error: 'Archivo .xlsx requerido' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets['Personal'] || wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: null });

    const existentesPorRut = new Map(
      (await sql('SELECT id, rut FROM pyc_personal WHERE empresa_id = ? AND rut IS NOT NULL', [req.params.id])).rows
        .map(r => [String(r.rut).trim().toUpperCase(), r.id])
    );

    let creados = 0, actualizados = 0;
    const sinNombre = [];

    await withTransaction(async (tsql) => {
      for (const fila of filas) {
        const nombre = fila[COL_PERSONAL_MASIVO.nombre] ? String(fila[COL_PERSONAL_MASIVO.nombre]).trim() : '';
        if (!nombre) { if (Object.values(fila).some(v => v)) sinNombre.push(JSON.stringify(fila)); continue; }
        const rut = fila[COL_PERSONAL_MASIVO.rut] ? String(fila[COL_PERSONAL_MASIVO.rut]).trim() : null;
        const cargo = fila[COL_PERSONAL_MASIVO.cargo] ? String(fila[COL_PERSONAL_MASIVO.cargo]).trim() : null;
        const turno = fila[COL_PERSONAL_MASIVO.turno] ? String(fila[COL_PERSONAL_MASIVO.turno]).trim() : null;
        const tipo = normalizar(fila[COL_PERSONAL_MASIVO.tipo]) === 'indirecto' ? 'indirecto' : 'directo';

        const idExistente = rut ? existentesPorRut.get(rut.toUpperCase()) : null;
        if (idExistente) {
          await tsql('UPDATE pyc_personal SET nombre = ?, cargo = ?, turno = ?, tipo = ? WHERE id = ?', [nombre, cargo, turno, tipo, idExistente]);
          actualizados++;
        } else {
          await tsql('INSERT INTO pyc_personal (empresa_id, nombre, rut, cargo, turno, tipo) VALUES (?, ?, ?, ?, ?, ?)',
            [req.params.id, nombre, rut, cargo, turno, tipo]);
          creados++;
        }
      }
    });

    res.status(201).json({ creados, actualizados, sinNombre: sinNombre.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Equipos (catalogo reutilizable dia a dia) ----

router.get('/empresas/:id/equipos', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const r = await sql('SELECT * FROM pyc_equipos WHERE empresa_id = ? ORDER BY activo DESC, nombre', [req.params.id]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/empresas/:id/equipos', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { nombre, patente, area_trabajo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre/tipo de equipo es requerido' });
    const r = await sql(
      'INSERT INTO pyc_equipos (empresa_id, nombre, patente, area_trabajo) VALUES (?, ?, ?, ?) RETURNING id',
      [req.params.id, nombre.trim(), patente || null, area_trabajo || null]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/equipos/:id', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    const anterior = (await sql('SELECT * FROM pyc_equipos WHERE id = ?', [req.params.id])).rows[0];
    if (!anterior) return res.status(404).json({ error: 'No encontrado' });
    if (!empresaPermitida(req, anterior.empresa_id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { nombre, patente, area_trabajo, activo } = req.body;
    await sql(
      'UPDATE pyc_equipos SET nombre = ?, patente = ?, area_trabajo = ?, activo = ? WHERE id = ?',
      [nombre ?? anterior.nombre, patente ?? anterior.patente, area_trabajo ?? anterior.area_trabajo,
        activo !== undefined ? activo : anterior.activo, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pyc/empresas/:id/equipos/plantilla — analogo a /personal/plantilla pero para el catalogo
// de equipos/maquinaria; upsert por PATENTE al volver a subirla.
router.get('/empresas/:id/equipos/plantilla', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const equipos = (await sql('SELECT * FROM pyc_equipos WHERE empresa_id = ? ORDER BY nombre', [req.params.id])).rows;

    const filas = equipos.map(e => ({
      [COL_EQUIPO_MASIVO.nombre]: e.nombre, [COL_EQUIPO_MASIVO.patente]: e.patente || '', [COL_EQUIPO_MASIVO.area]: e.area_trabajo || ''
    }));
    const ws = hojaConEncabezado(COL_EQUIPO_MASIVO, filas);
    ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Equipos');

    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['Cómo usar esta plantilla'],
      ['1. Agrega una fila por cada equipo/maquinaria nuevo (EQUIPO es obligatorio, el resto opcional).'],
      ['2. Si la PATENTE de una fila ya existe en el catálogo, se actualizan sus datos en vez de crear el equipo de nuevo.'],
      ['3. No borres las filas de equipos que ya están — no se eliminan del catálogo aunque falten en el archivo, esta plantilla nunca elimina, solo crea o actualiza.'],
      ['4. Sube este archivo en P&C > Equipos > Cargar desde Excel.'],
    ]);
    instrucciones['!cols'] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla_equipos_empresa${req.params.id}.xlsx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/empresas/:id/equipos/importar — multipart: archivo (.xlsx de /equipos/plantilla).
router.post('/empresas/:id/equipos/importar', autenticar, autorizar('admin', 'bodeguero', 'contratista'), uploadExcel.single('archivo'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    if (!req.file) return res.status(400).json({ error: 'Archivo .xlsx requerido' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets['Equipos'] || wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { defval: null });

    const existentesPorPatente = new Map(
      (await sql('SELECT id, patente FROM pyc_equipos WHERE empresa_id = ? AND patente IS NOT NULL', [req.params.id])).rows
        .map(r => [String(r.patente).trim().toUpperCase(), r.id])
    );

    let creados = 0, actualizados = 0;
    const sinNombre = [];

    await withTransaction(async (tsql) => {
      for (const fila of filas) {
        const nombre = fila[COL_EQUIPO_MASIVO.nombre] ? String(fila[COL_EQUIPO_MASIVO.nombre]).trim() : '';
        if (!nombre) { if (Object.values(fila).some(v => v)) sinNombre.push(JSON.stringify(fila)); continue; }
        const patente = fila[COL_EQUIPO_MASIVO.patente] ? String(fila[COL_EQUIPO_MASIVO.patente]).trim() : null;
        const area = fila[COL_EQUIPO_MASIVO.area] ? String(fila[COL_EQUIPO_MASIVO.area]).trim() : null;

        const idExistente = patente ? existentesPorPatente.get(patente.toUpperCase()) : null;
        if (idExistente) {
          await tsql('UPDATE pyc_equipos SET nombre = ?, area_trabajo = ? WHERE id = ?', [nombre, area, idExistente]);
          actualizados++;
        } else {
          await tsql('INSERT INTO pyc_equipos (empresa_id, nombre, patente, area_trabajo) VALUES (?, ?, ?, ?)',
            [req.params.id, nombre, patente, area]);
          creados++;
        }
      }
    });

    res.status(201).json({ creados, actualizados, sinNombre: sinNombre.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Reportes diarios ----

// GET /api/pyc/empresas/:id/reportes?desde=&hasta=  — listado, mas reciente primero
router.get('/empresas/:id/reportes', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const condiciones = ['rd.empresa_id = ?'];
    const params = [req.params.id];
    if (req.query.desde) { condiciones.push('rd.fecha >= ?'); params.push(req.query.desde); }
    if (req.query.hasta) { condiciones.push('rd.fecha <= ?'); params.push(req.query.hasta); }
    const r = await sql(
      `SELECT rd.*, u.nombre AS creado_por_nombre,
         (SELECT COUNT(*) FROM pyc_asistencia a WHERE a.reporte_id = rd.id AND a.estado = 'presente') AS presentes,
         (SELECT COALESCE(SUM(a.hh), 0) FROM pyc_asistencia a WHERE a.reporte_id = rd.id) AS hh_totales
       FROM pyc_reportes_diarios rd
       JOIN usuarios u ON u.id = rd.creado_por
       WHERE ${condiciones.join(' AND ')}
       ORDER BY rd.fecha DESC LIMIT 200`,
      params
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pyc/reportes/:id — detalle completo (asistencia + equipos + fotos)
router.get('/reportes/:id', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    const reporte = (await sql(
      `SELECT rd.*, u.nombre AS creado_por_nombre FROM pyc_reportes_diarios rd
       JOIN usuarios u ON u.id = rd.creado_por WHERE rd.id = ?`,
      [req.params.id]
    )).rows[0];
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (!empresaPermitida(req, reporte.empresa_id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });

    const asistencia = (await sql(
      `SELECT a.*, p.nombre AS personal_nombre, p.rut, p.cargo, p.turno, p.tipo
       FROM pyc_asistencia a JOIN pyc_personal p ON p.id = a.personal_id
       WHERE a.reporte_id = ? ORDER BY p.tipo, p.nombre`,
      [req.params.id]
    )).rows;
    const equipos = (await sql(
      `SELECT ue.*, e.nombre AS equipo_nombre, e.patente, e.area_trabajo
       FROM pyc_uso_equipos ue JOIN pyc_equipos e ON e.id = ue.equipo_id
       WHERE ue.reporte_id = ? ORDER BY e.nombre`,
      [req.params.id]
    )).rows;
    const fotos = (await sql('SELECT * FROM pyc_fotos WHERE reporte_id = ? ORDER BY id', [req.params.id])).rows;

    res.json({ ...reporte, asistencia, equipos, fotos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/empresas/:id/reportes — crea el reporte diario completo de una vez.
// body: { fecha, frente_destino, observaciones_ssoma, observaciones_generales,
//         asistencia: [{personal_id, estado, hh}], equipos: [{equipo_id, disponible, hh_operativas, observaciones}] }
router.post('/empresas/:id/reportes', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { fecha, frente_destino, observaciones_ssoma, observaciones_generales, asistencia, equipos } = req.body;
    if (!fecha) return res.status(400).json({ error: 'La fecha es requerida' });

    const existe = (await sql('SELECT id FROM pyc_reportes_diarios WHERE empresa_id = ? AND fecha = ?', [req.params.id, fecha])).rows[0];
    if (existe) return res.status(409).json({ error: `Ya existe un reporte para el ${fecha}. Edítalo en vez de crear uno nuevo.` });

    const reporteId = await withTransaction((tsql) => crearReporteDiario(tsql, {
      empresaId: req.params.id, fecha, frenteDestino: frente_destino, observacionesSsoma: observaciones_ssoma,
      observacionesGenerales: observaciones_generales, creadoPor: req.usuario.id, asistencia, equipos
    }));

    res.status(201).json({ id: reporteId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pyc/empresas/:id/reportes/plantilla — descarga un .xlsx con el personal y equipos
// activos de la empresa, listos para marcar ESTADO/HH y DISPONIBLE/HH OPERATIVAS del día y volver
// a subirlo por POST /reportes/importar — para la empresa externa que ya trabaja en Excel, evita
// tener que aprender a usar el formulario del sistema o retipear su propia nomina cada dia.
router.get('/empresas/:id/reportes/plantilla', autenticar, autorizar('admin', 'bodeguero', 'visor', 'contratista'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });

    const personal = (await sql('SELECT * FROM pyc_personal WHERE empresa_id = ? AND activo = true ORDER BY tipo, nombre', [req.params.id])).rows;
    const equipos = (await sql('SELECT * FROM pyc_equipos WHERE empresa_id = ? AND activo = true ORDER BY nombre', [req.params.id])).rows;

    const filasPersonal = personal.map(p => ({
      [COL_PERSONAL.id]: p.id, [COL_PERSONAL.nombre]: p.nombre, [COL_PERSONAL.rut]: p.rut || '',
      [COL_PERSONAL.cargo]: p.cargo || '', [COL_PERSONAL.turno]: p.turno || '',
      [COL_PERSONAL.estado]: 'presente', [COL_PERSONAL.hh]: 12
    }));
    const wsPersonal = hojaConEncabezado(COL_PERSONAL, filasPersonal);
    wsPersonal['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 40 }, { wch: 8 }];

    const filasEquipos = equipos.map(e => ({
      [COL_EQUIPO.id]: e.id, [COL_EQUIPO.nombre]: e.nombre, [COL_EQUIPO.patente]: e.patente || '',
      [COL_EQUIPO.area]: e.area_trabajo || '', [COL_EQUIPO.disponible]: 'SI', [COL_EQUIPO.hh]: 0, [COL_EQUIPO.observaciones]: ''
    }));
    const wsEquipos = hojaConEncabezado(COL_EQUIPO, filasEquipos);
    wsEquipos['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 30 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsPersonal, 'Personal');
    XLSX.utils.book_append_sheet(wb, wsEquipos, 'Equipos');

    const instrucciones = XLSX.utils.aoa_to_sheet([
      ['Cómo usar esta plantilla'],
      ['1. No modificar la columna ID — es la que el sistema usa para identificar a cada persona/equipo al volver a cargar el archivo.'],
      ['2. En la hoja Personal, marcar el ESTADO real del día de cada persona y sus HH trabajadas (ya viene marcado "presente" con 12 HH por defecto, solo cambiar las excepciones).'],
      ['3. Estados válidos: presente, descanso, licencia, permiso, falta (no distingue mayúsculas/tildes).'],
      ['4. En la hoja Equipos, marcar DISPONIBLE (SI/NO) y las HH OPERATIVAS de cada equipo.'],
      ['5. No agregar ni quitar filas — si falta alguien en la nómina o un equipo en el catálogo, agrégalo antes en el sistema (pestañas Personal / Equipos) y vuelve a descargar la plantilla.'],
      ['6. Subir este mismo archivo en P&C > Cargar Reporte Diario (Excel), indicando la fecha del día.'],
    ]);
    instrucciones['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, instrucciones, 'Instrucciones');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plantilla_reporte_diario_empresa${req.params.id}.xlsx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/empresas/:id/reportes/importar — multipart: archivo (.xlsx de /reportes/plantilla
// ya llenado), fecha, frente_destino/observaciones_ssoma/observaciones_generales (opcionales).
router.post('/empresas/:id/reportes/importar', autenticar, autorizar('admin', 'bodeguero', 'contratista'), uploadExcel.single('archivo'), async (req, res) => {
  try {
    if (!empresaPermitida(req, req.params.id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });
    const { fecha, frente_destino, observaciones_ssoma, observaciones_generales } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Archivo .xlsx requerido' });
    if (!fecha) return res.status(400).json({ error: 'La fecha es requerida' });

    const existe = (await sql('SELECT id FROM pyc_reportes_diarios WHERE empresa_id = ? AND fecha = ?', [req.params.id, fecha])).rows[0];
    if (existe) return res.status(409).json({ error: `Ya existe un reporte para el ${fecha}. Edítalo en vez de crear uno nuevo.` });

    const idsPersonal = new Set((await sql('SELECT id FROM pyc_personal WHERE empresa_id = ?', [req.params.id])).rows.map(r => r.id));
    const idsEquipos = new Set((await sql('SELECT id FROM pyc_equipos WHERE empresa_id = ?', [req.params.id])).rows.map(r => r.id));

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const wsPersonal = wb.Sheets['Personal'];
    const wsEquipos = wb.Sheets['Equipos'];
    if (!wsPersonal || !wsEquipos) return res.status(400).json({ error: 'El archivo no tiene el formato esperado (hojas "Personal" y "Equipos") — descarga la plantilla desde este mismo módulo.' });

    const filasPersonal = XLSX.utils.sheet_to_json(wsPersonal, { defval: null });
    const filasEquipos = XLSX.utils.sheet_to_json(wsEquipos, { defval: null });

    const asistencia = [];
    const estadosInvalidos = [];
    const idsPersonalDesconocidos = [];
    for (const fila of filasPersonal) {
      const id = Number(fila[COL_PERSONAL.id]);
      if (!id) continue;
      if (!idsPersonal.has(id)) { idsPersonalDesconocidos.push(id); continue; }
      const estadoTexto = normalizar(fila[COL_PERSONAL.estado]);
      const estado = ESTADOS_VALIDOS.includes(estadoTexto) ? estadoTexto : (estadoTexto ? null : 'presente');
      if (!estado) { estadosInvalidos.push(`ID ${id}: "${fila[COL_PERSONAL.estado]}"`); continue; }
      const hh = estado === 'presente' ? (Number(fila[COL_PERSONAL.hh]) || 0) : 0;
      asistencia.push({ personal_id: id, estado, hh });
    }

    const equipos = [];
    const idsEquiposDesconocidos = [];
    for (const fila of filasEquipos) {
      const id = Number(fila[COL_EQUIPO.id]);
      if (!id) continue;
      if (!idsEquipos.has(id)) { idsEquiposDesconocidos.push(id); continue; }
      const disponibleTexto = normalizar(fila[COL_EQUIPO.disponible]);
      const disponible = !['no', 'n'].includes(disponibleTexto);
      equipos.push({
        equipo_id: id, disponible, hh_operativas: Number(fila[COL_EQUIPO.hh]) || 0,
        observaciones: fila[COL_EQUIPO.observaciones] ? String(fila[COL_EQUIPO.observaciones]).trim() : null
      });
    }

    if (asistencia.length === 0) return res.status(400).json({ error: 'La hoja Personal no tiene filas válidas para cargar' });

    const reporteId = await withTransaction((tsql) => crearReporteDiario(tsql, {
      empresaId: req.params.id, fecha, frenteDestino: frente_destino, observacionesSsoma: observaciones_ssoma,
      observacionesGenerales: observaciones_generales, creadoPor: req.usuario.id, asistencia, equipos
    }));

    res.status(201).json({
      id: reporteId, personalCargado: asistencia.length, equiposCargados: equipos.length,
      estadosInvalidos, idsPersonalDesconocidos, idsEquiposDesconocidos
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/pyc/reportes/:id — reemplaza cabecera + asistencia + equipos completos (mismo patron
// "sincroniza la lista completa" que ya se usa para editar un pedido de materiales).
router.put('/reportes/:id', autenticar, autorizar('admin', 'bodeguero', 'contratista'), async (req, res) => {
  try {
    const reporte = (await sql('SELECT * FROM pyc_reportes_diarios WHERE id = ?', [req.params.id])).rows[0];
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (!empresaPermitida(req, reporte.empresa_id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });

    const { frente_destino, observaciones_ssoma, observaciones_generales, asistencia, equipos } = req.body;
    await withTransaction(async (tsql) => {
      await tsql('UPDATE pyc_reportes_diarios SET frente_destino = ?, observaciones_ssoma = ?, observaciones_generales = ? WHERE id = ?',
        [frente_destino ?? reporte.frente_destino, observaciones_ssoma ?? reporte.observaciones_ssoma,
          observaciones_generales ?? reporte.observaciones_generales, req.params.id]);

      await tsql('DELETE FROM pyc_asistencia WHERE reporte_id = ?', [req.params.id]);
      for (const a of asistencia || []) {
        if (!a.personal_id || !a.estado) continue;
        await tsql('INSERT INTO pyc_asistencia (reporte_id, personal_id, estado, hh) VALUES (?, ?, ?, ?)',
          [req.params.id, a.personal_id, a.estado, Number(a.hh) || 0]);
      }

      await tsql('DELETE FROM pyc_uso_equipos WHERE reporte_id = ?', [req.params.id]);
      for (const e of equipos || []) {
        if (!e.equipo_id) continue;
        await tsql('INSERT INTO pyc_uso_equipos (reporte_id, equipo_id, disponible, hh_operativas, observaciones) VALUES (?, ?, ?, ?, ?)',
          [req.params.id, e.equipo_id, e.disponible !== false, Number(e.hh_operativas) || 0, e.observaciones || null]);
      }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pyc/reportes/:id/fotos — multipart, una o varias fotos sueltas del dia
router.post('/reportes/:id/fotos', autenticar, autorizar('admin', 'bodeguero', 'contratista'), upload.array('fotos', 10), async (req, res) => {
  try {
    const reporte = (await sql('SELECT * FROM pyc_reportes_diarios WHERE id = ?', [req.params.id])).rows[0];
    if (!reporte) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (!empresaPermitida(req, reporte.empresa_id)) return res.status(403).json({ error: 'Sin permisos para esta empresa' });

    const archivos = req.files || [];
    for (const f of archivos) {
      await sql('INSERT INTO pyc_fotos (reporte_id, url) VALUES (?, ?)', [req.params.id, urlArchivo(f)]);
    }
    res.status(201).json({ ok: true, subidas: archivos.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
