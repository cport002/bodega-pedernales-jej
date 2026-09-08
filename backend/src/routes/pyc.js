const express = require('express');
const { sql, withTransaction } = require('../database/db');
const { autenticar, autorizar } = require('../middleware/auth');
const { upload, urlArchivo } = require('../services/upload');

const router = express.Router();

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

    const reporteId = await withTransaction(async (tsql) => {
      const r = await tsql(
        `INSERT INTO pyc_reportes_diarios (empresa_id, fecha, frente_destino, observaciones_ssoma, observaciones_generales, creado_por)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [req.params.id, fecha, frente_destino || null, observaciones_ssoma || null, observaciones_generales || null, req.usuario.id]
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
    });

    res.status(201).json({ id: reporteId });
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
