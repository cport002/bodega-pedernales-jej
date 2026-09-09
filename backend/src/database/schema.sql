CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('admin','bodeguero','visor')),
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS materiales (
  id SERIAL PRIMARY KEY,
  descripcion TEXT NOT NULL,
  especialidad TEXT,
  diametro_1 TEXT,
  diametro_2 TEXT,
  unidad TEXT NOT NULL DEFAULT 'C/U',
  peso_unidad_kg NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(descripcion, diametro_1, diametro_2, unidad)
);

CREATE TABLE IF NOT EXISTS recepciones (
  id SERIAL PRIMARY KEY,
  orden_compra TEXT,
  contrato TEXT,
  pm TEXT,
  proveedor_id INTEGER REFERENCES proveedores(id),
  n_guia TEXT,
  fecha_recepcion DATE NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lotes (
  id SERIAL PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  recepcion_id INTEGER NOT NULL REFERENCES recepciones(id),
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  tag TEXT,
  marca_serie_modelo TEXT,
  cantidad_packing_list NUMERIC,
  cantidad_recepcionada NUMERIC NOT NULL,
  ncr_uso_d TEXT,
  protocolo_cambio_ubicacion TEXT,
  area TEXT,
  ubicacion_1 TEXT,
  ubicacion_2 TEXT,
  pallet_numero TEXT,
  equipo_destino TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','agotado','inactivo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despachos (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  cantidad NUMERIC NOT NULL,
  frente_destino TEXT,
  retirado_por TEXT,
  observaciones TEXT,
  firma_url TEXT,
  foto_url TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  cantidad NUMERIC NOT NULL,
  motivo TEXT,
  observaciones TEXT,
  firma_url TEXT,
  foto_url TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un "conteo físico" (ya sea un solo lote desde el detalle del lote, o una carga masiva por Excel)
-- es una sesión con una fecha y un responsable. Cada lote contado en esa sesión es una fila en
-- `inventarios` (abajo) apuntando a esta sesión vía sesion_id. Así el historial se agrupa por
-- evento de conteo en vez de mostrar cientos de filas sueltas sin relación entre sí.
CREATE TABLE IF NOT EXISTS inventario_sesiones (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  etiqueta TEXT,
  observaciones TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventarios (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  sesion_id INTEGER REFERENCES inventario_sesiones(id),
  cantidad_inventariada NUMERIC NOT NULL,
  stock_esperado NUMERIC NOT NULL,
  diferencia NUMERIC NOT NULL,
  observaciones TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migracion: agrega sesion_id a instalaciones que ya tenían la tabla `inventarios` creada antes
-- de que existiera el concepto de sesión (CREATE TABLE IF NOT EXISTS no la habría agregado sola).
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS sesion_id INTEGER REFERENCES inventario_sesiones(id);
CREATE INDEX IF NOT EXISTS idx_inventarios_sesion ON inventarios(sesion_id);

-- Migracion: agrega 'inactivo' al estado de lotes (materiales en bodega que no se usan en este
-- contrato, se mantienen con su stock pero diferenciados). ALTER TABLE porque el CHECK de una
-- tabla que ya existe no se actualiza solo con CREATE TABLE IF NOT EXISTS.
ALTER TABLE lotes DROP CONSTRAINT IF EXISTS lotes_estado_check;
ALTER TABLE lotes ADD CONSTRAINT lotes_estado_check CHECK(estado IN ('activo','agotado','inactivo'));

CREATE INDEX IF NOT EXISTS idx_lotes_material ON lotes(material_id);
CREATE INDEX IF NOT EXISTS idx_lotes_recepcion ON lotes(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_despachos_lote ON despachos(lote_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_lote ON devoluciones(lote_id);
CREATE INDEX IF NOT EXISTS idx_inventarios_lote ON inventarios(lote_id);

-- Migracion: nuevo rol 'solicitante' (personal de terreno sin acceso previo al sistema, solo ve
-- stock agregado por material y crea solicitudes, no aprueba ni despacha). ALTER TABLE porque el
-- CHECK de una tabla que ya existe no se actualiza solo con CREATE TABLE IF NOT EXISTS.
-- (El re-ensanche de este CHECK con el rol 'solicitante' quedo superado mas abajo, junto con el
-- modulo P&C, que agrega 'contratista' al mismo constraint — no repetir aca con el set viejo, o en
-- cada arranque se angosta el CHECK un instante y falla contra filas 'contratista' ya existentes.)

-- Solicitudes: pedido de material GENERICO (no de un lote especifico) hecho por un solicitante de
-- terreno. Queda 'pendiente' hasta que admin/bodeguero la revisa: puede ajustar la cantidad y recien
-- al aprobar decide de que lote(s) sacarlo (ver despachos.solicitud_id abajo), o la rechaza con motivo.
CREATE TABLE IF NOT EXISTS solicitudes (
  id SERIAL PRIMARY KEY,
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  cantidad_solicitada NUMERIC NOT NULL CHECK(cantidad_solicitada > 0),
  cantidad_aprobada NUMERIC,
  frente_destino TEXT,
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobada','rechazada')),
  motivo_rechazo TEXT,
  solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
  revisado_por INTEGER REFERENCES usuarios(id),
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_resolucion TIMESTAMPTZ
);

-- Migracion: enlaza cada despacho con la solicitud que lo origino (NULL si es un despacho directo,
-- como hoy). Una sola solicitud aprobada puede generar VARIOS despachos si el bodeguero reparte la
-- cantidad entre distintos lotes/pallets del mismo material.
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS solicitud_id INTEGER REFERENCES solicitudes(id);

CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_material ON solicitudes(material_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_solicitante ON solicitudes(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_despachos_solicitud ON despachos(solicitud_id);

-- Notificaciones internas (campanita) + suscripciones push del navegador — alternativa a correo,
-- pedido explicito del usuario. Una notificacion es siempre para UN usuario puntual (no hay
-- notificaciones "para todo el rol", se crea una fila por cada admin/bodeguero a notificar).
CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK(tipo IN ('solicitud_nueva','solicitud_aprobada','solicitud_rechazada')),
  titulo TEXT NOT NULL,
  mensaje TEXT,
  solicitud_id INTEGER REFERENCES solicitudes(id),
  leida INTEGER NOT NULL DEFAULT 0,
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON notificaciones(usuario_id, leida);

-- Un usuario puede tener varias suscripciones (celular + notebook, o reinstalo la app) — por eso
-- la clave unica es el endpoint (identifica el dispositivo/navegador), no el usuario.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario ON push_subscriptions(usuario_id);

-- Migracion: separa "aprobar" (decision, puede hacerse a distancia) de "entregar" (retiro fisico
-- real en bodega). Antes ambos pasaban juntos: al aprobar ya se pedia firma/foto y se creaba el
-- despacho de inmediato. Ahora aprobar solo genera un VALE (folio + QR) con los lotes/cantidades
-- ya decididos pero SIN tocar stock todavia, recien al escanear el vale en bodega y confirmar la
-- entrega (firma+foto obligatorias ahi) se crea el despacho real, que resta el stock en ESE momento
-- y no al aprobar, asi si el stock cambio entretanto, se valida en el momento real del retiro.
ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_estado_check CHECK(estado IN ('pendiente','aprobada','rechazada','entregada'));
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS fecha_entrega TIMESTAMPTZ;

-- Lotes y cantidades decididos al aprobar (el "plan" del vale) — el despacho real recien se crea
-- al confirmar la entrega, usando esta tabla como guia.
CREATE TABLE IF NOT EXISTS solicitud_lotes_aprobados (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id),
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  cantidad NUMERIC NOT NULL CHECK(cantidad > 0)
);
CREATE INDEX IF NOT EXISTS idx_sla_solicitud ON solicitud_lotes_aprobados(solicitud_id);

-- Eliminacion "blanda": la fila nunca se borra de verdad (auditoria completa), solo se marca y se
-- oculta de los listados normales. Pedido explicito del usuario: poder eliminar una solicitud
-- (propia o cualquiera, si es admin/bodeguero) mientras no este entregada, pero sin perder el
-- registro para el historial.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS eliminada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS eliminada_por INTEGER REFERENCES usuarios(id);
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS fecha_eliminacion TIMESTAMPTZ;

-- Migracion: de "1 solicitud = 1 material" a "1 pedido = varios materiales", pedido explicito del
-- usuario (queria poder pedir mas de un material de una vez, con un solo vale). La tabla
-- `solicitudes` pasa a ser el PEDIDO (folio, frente, estado, solicitante, fechas) y ya no lleva
-- material_id/cantidad directo — eso se mueve a la tabla nueva `pedido_items`, una fila por
-- material dentro del pedido. Las columnas viejas material_id/cantidad_solicitada/cantidad_aprobada
-- de `solicitudes` NO se borran (evita tener que reescribir datos reales ya cargados) — quedan sin
-- usar por el codigo nuevo, solo sirven de respaldo historico de como era antes de este cambio.
-- Se les quita el NOT NULL porque un pedido nuevo multi-item no llena estas columnas.
ALTER TABLE solicitudes ALTER COLUMN material_id DROP NOT NULL;
ALTER TABLE solicitudes ALTER COLUMN cantidad_solicitada DROP NOT NULL;

CREATE TABLE IF NOT EXISTS pedido_items (
  id SERIAL PRIMARY KEY,
  pedido_id INTEGER NOT NULL REFERENCES solicitudes(id),
  material_id INTEGER NOT NULL REFERENCES materiales(id),
  cantidad_solicitada NUMERIC NOT NULL CHECK(cantidad_solicitada > 0),
  cantidad_aprobada NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_items_material ON pedido_items(material_id);

-- Migra hacia adelante cada solicitud vieja (1 material directo en la fila) a su item equivalente
-- en pedido_items — corre en cada arranque pero no hace nada una vez migrado (WHERE NOT EXISTS),
-- es seguro repetirlo indefinidamente.
INSERT INTO pedido_items (pedido_id, material_id, cantidad_solicitada, cantidad_aprobada)
SELECT s.id, s.material_id, s.cantidad_solicitada, s.cantidad_aprobada
FROM solicitudes s
WHERE s.material_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM pedido_items pi WHERE pi.pedido_id = s.id);

-- Lotes/cantidad decididos al aprobar CADA item del pedido (antes era por solicitud completa,
-- ahora es por item porque cada material del pedido puede salir de lotes distintos).
ALTER TABLE solicitud_lotes_aprobados ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_items(id);
CREATE INDEX IF NOT EXISTS idx_sla_item ON solicitud_lotes_aprobados(pedido_item_id);

-- Migra las asignaciones viejas (ligadas a solicitud_id, de cuando 1 solicitud = 1 item) a su
-- pedido_item equivalente — mismo criterio idempotente que arriba.
UPDATE solicitud_lotes_aprobados sla
SET pedido_item_id = (SELECT pi.id FROM pedido_items pi WHERE pi.pedido_id = sla.solicitud_id LIMIT 1)
WHERE sla.pedido_item_id IS NULL AND sla.solicitud_id IS NOT NULL;

-- Idem para despachos: antes bastaba con saber a que solicitud pertenecia (un solo material);
-- ahora hace falta saber a que item especifico del pedido pertenece cada despacho.
ALTER TABLE despachos ADD COLUMN IF NOT EXISTS pedido_item_id INTEGER REFERENCES pedido_items(id);
CREATE INDEX IF NOT EXISTS idx_despachos_item ON despachos(pedido_item_id);

UPDATE despachos d
SET pedido_item_id = (SELECT pi.id FROM pedido_items pi WHERE pi.pedido_id = d.solicitud_id LIMIT 1)
WHERE d.pedido_item_id IS NULL AND d.solicitud_id IS NOT NULL;

-- El stock ya no se calcula siempre desde la recepcion original: si el lote tiene al menos una
-- auditoria de inventario registrada, el conteo mas reciente pasa a ser la base ("verdad" fisica
-- confirmada), y solo se le suman/restan los despachos/devoluciones ocurridos DESPUES de esa fecha.
-- Si nunca se ha auditado, se mantiene el calculo original desde cantidad_recepcionada.
CREATE OR REPLACE VIEW v_lotes_stock AS
SELECT
  l.id AS lote_id,
  COALESCE(
    (SELECT i.cantidad_inventariada FROM inventarios i WHERE i.lote_id = l.id ORDER BY i.fecha DESC, i.id DESC LIMIT 1),
    l.cantidad_recepcionada
  )
    - COALESCE((SELECT SUM(d.cantidad) FROM despachos d WHERE d.lote_id = l.id
        AND d.fecha > COALESCE((SELECT i.fecha FROM inventarios i WHERE i.lote_id = l.id ORDER BY i.fecha DESC, i.id DESC LIMIT 1), '-infinity'::timestamptz)), 0)
    + COALESCE((SELECT SUM(dv.cantidad) FROM devoluciones dv WHERE dv.lote_id = l.id
        AND dv.fecha > COALESCE((SELECT i.fecha FROM inventarios i WHERE i.lote_id = l.id ORDER BY i.fecha DESC, i.id DESC LIMIT 1), '-infinity'::timestamptz)), 0)
    AS stock_actual,
  COALESCE((SELECT SUM(d.cantidad) FROM despachos d WHERE d.lote_id = l.id), 0) AS total_despachado,
  COALESCE((SELECT SUM(dv.cantidad) FROM devoluciones dv WHERE dv.lote_id = l.id), 0) AS total_devuelto
FROM lotes l;

-- ============================================================
-- Modulo P&C (Programacion y Control): seguimiento de una empresa externa
-- contratada para un servicio en terreno. El REPORTE DIARIO (dotacion,
-- equipos, observaciones) es el dato atomico que carga la empresa, y las
-- vistas semanal/mensual se calculan agregando reportes diarios ya
-- guardados, en vez de mantenerse a mano en Excel. Fase 1: empresas,
-- nomina/equipos (catalogo reutilizable dia a dia) y el reporte diario.
-- La curva de avance (linea base vs real, HH ganadas por actividad) queda
-- para una fase 2, una vez validado este primer flujo con datos reales.
-- ============================================================

CREATE TABLE IF NOT EXISTS pyc_empresas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  contrato TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nuevo rol para el representante de la empresa externa que carga sus propios
-- reportes diarios, queda amarrado a una sola empresa via pyc_empresa_id (NULL
-- para el resto de los roles, que no pertenecen a ninguna empresa externa).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK(rol IN ('admin','bodeguero','visor','solicitante','contratista'));
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pyc_empresa_id INTEGER REFERENCES pyc_empresas(id);

CREATE TABLE IF NOT EXISTS pyc_personal (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES pyc_empresas(id),
  nombre TEXT NOT NULL,
  rut TEXT,
  cargo TEXT,
  turno TEXT,
  tipo TEXT NOT NULL DEFAULT 'directo' CHECK(tipo IN ('directo','indirecto')),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pyc_personal_empresa ON pyc_personal(empresa_id);

CREATE TABLE IF NOT EXISTS pyc_equipos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES pyc_empresas(id),
  nombre TEXT NOT NULL,
  patente TEXT,
  area_trabajo TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pyc_equipos_empresa ON pyc_equipos(empresa_id);

-- Cabecera del reporte diario — un solo reporte por empresa y fecha (evita duplicados si alguien
-- reenvia el mismo dia sin querer).
CREATE TABLE IF NOT EXISTS pyc_reportes_diarios (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES pyc_empresas(id),
  fecha DATE NOT NULL,
  frente_destino TEXT,
  observaciones_ssoma TEXT,
  observaciones_generales TEXT,
  creado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_pyc_reportes_empresa_fecha ON pyc_reportes_diarios(empresa_id, fecha DESC);

CREATE TABLE IF NOT EXISTS pyc_asistencia (
  id SERIAL PRIMARY KEY,
  reporte_id INTEGER NOT NULL REFERENCES pyc_reportes_diarios(id) ON DELETE CASCADE,
  personal_id INTEGER NOT NULL REFERENCES pyc_personal(id),
  estado TEXT NOT NULL CHECK(estado IN ('presente','descanso','licencia','permiso','falta')),
  hh NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(reporte_id, personal_id)
);

CREATE TABLE IF NOT EXISTS pyc_uso_equipos (
  id SERIAL PRIMARY KEY,
  reporte_id INTEGER NOT NULL REFERENCES pyc_reportes_diarios(id) ON DELETE CASCADE,
  equipo_id INTEGER NOT NULL REFERENCES pyc_equipos(id),
  disponible BOOLEAN NOT NULL DEFAULT true,
  hh_operativas NUMERIC NOT NULL DEFAULT 0,
  observaciones TEXT,
  UNIQUE(reporte_id, equipo_id)
);

CREATE TABLE IF NOT EXISTS pyc_fotos (
  id SERIAL PRIMARY KEY,
  reporte_id INTEGER NOT NULL REFERENCES pyc_reportes_diarios(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fase 2 del modulo P&C: catalogo de actividades/EDT del programa contractual (la cantidad total
-- comprometida de cada una) y su avance diario, para poder calcular el % de avance fisico acumulado
-- por actividad. La curva de avance programado-vs-real (que necesita ademas un programa BASE por
-- semana) y el SPI quedan para una siguiente etapa, una vez validado este primer nivel.
CREATE TABLE IF NOT EXISTS pyc_actividades (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES pyc_empresas(id),
  area TEXT,
  edt TEXT,
  descripcion TEXT NOT NULL,
  unidad TEXT,
  cantidad_contractual NUMERIC,
  hh_estimadas NUMERIC,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pyc_actividades_empresa ON pyc_actividades(empresa_id);

CREATE TABLE IF NOT EXISTS pyc_avance_actividades (
  id SERIAL PRIMARY KEY,
  reporte_id INTEGER NOT NULL REFERENCES pyc_reportes_diarios(id) ON DELETE CASCADE,
  actividad_id INTEGER NOT NULL REFERENCES pyc_actividades(id),
  cantidad_real NUMERIC NOT NULL DEFAULT 0,
  hh_ganadas NUMERIC NOT NULL DEFAULT 0,
  comentario TEXT,
  UNIQUE(reporte_id, actividad_id)
);
