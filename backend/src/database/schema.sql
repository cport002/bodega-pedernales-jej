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
  estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','agotado')),
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

CREATE TABLE IF NOT EXISTS inventarios (
  id SERIAL PRIMARY KEY,
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  cantidad_inventariada NUMERIC NOT NULL,
  stock_esperado NUMERIC NOT NULL,
  diferencia NUMERIC NOT NULL,
  observaciones TEXT,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lotes_material ON lotes(material_id);
CREATE INDEX IF NOT EXISTS idx_lotes_recepcion ON lotes(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_despachos_lote ON despachos(lote_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_lote ON devoluciones(lote_id);
CREATE INDEX IF NOT EXISTS idx_inventarios_lote ON inventarios(lote_id);

CREATE OR REPLACE VIEW v_lotes_stock AS
SELECT
  l.id AS lote_id,
  l.cantidad_recepcionada
    - COALESCE((SELECT SUM(d.cantidad) FROM despachos d WHERE d.lote_id = l.id), 0)
    + COALESCE((SELECT SUM(dv.cantidad) FROM devoluciones dv WHERE dv.lote_id = l.id), 0)
    AS stock_actual,
  COALESCE((SELECT SUM(d.cantidad) FROM despachos d WHERE d.lote_id = l.id), 0) AS total_despachado,
  COALESCE((SELECT SUM(dv.cantidad) FROM devoluciones dv WHERE dv.lote_id = l.id), 0) AS total_devuelto
FROM lotes l;
