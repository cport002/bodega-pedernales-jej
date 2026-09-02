export interface Usuario {
  id: number
  nombre: string
  email: string
  rol: 'admin' | 'bodeguero' | 'visor' | 'solicitante'
  activo?: number
  created_at?: string
}

export interface Notificacion {
  id: number
  tipo: 'solicitud_nueva' | 'solicitud_aprobada' | 'solicitud_rechazada'
  titulo: string
  mensaje: string | null
  solicitud_id: number | null
  leida: number
  fecha: string
}

export interface AuthState {
  usuario: Usuario | null
  token: string | null
}

export interface Material {
  id: number
  descripcion: string
  especialidad?: string | null
  diametro_1?: string | null
  diametro_2?: string | null
  unidad: string
  peso_unidad_kg?: number | null
  stock_total?: number
  estado?: 'activo' | 'inactivo'
}

export interface Proveedor {
  id: number
  nombre: string
}

export interface Recepcion {
  id: number
  orden_compra?: string | null
  contrato?: string | null
  pm?: string | null
  proveedor_id?: number | null
  proveedor_nombre?: string | null
  n_guia?: string | null
  fecha_recepcion: string
  observaciones?: string | null
  usuario_nombre?: string | null
  total_lotes?: number
  lotes?: Lote[]
}

export interface ItemRecepcion {
  descripcion: string
  especialidad?: string
  diametro_1?: string
  diametro_2?: string
  unidad?: string
  peso_unidad_kg?: number | null
  tag?: string
  marca_serie_modelo?: string
  cantidad_packing_list?: number | null
  cantidad_recepcionada: number
  ncr_uso_d?: string
  protocolo_cambio_ubicacion?: string
  area?: string
  ubicacion_1?: string
  ubicacion_2?: string
  pallet_numero?: string
  equipo_destino?: string
}

export interface Lote {
  id: number
  codigo: string
  recepcion_id: number
  material_id: number
  descripcion: string
  especialidad?: string | null
  diametro_1?: string | null
  diametro_2?: string | null
  unidad: string
  peso_unidad_kg?: number | null
  tag?: string | null
  marca_serie_modelo?: string | null
  cantidad_packing_list?: number | null
  cantidad_recepcionada: number
  ncr_uso_d?: string | null
  protocolo_cambio_ubicacion?: string | null
  area?: string | null
  ubicacion_1?: string | null
  ubicacion_2?: string | null
  pallet_numero?: string | null
  equipo_destino?: string | null
  estado: 'activo' | 'agotado'
  ultima_fecha_inventario?: string | null
  stock_actual: number
  total_despachado?: number
  total_devuelto?: number
  orden_compra?: string | null
  contrato?: string | null
  n_guia?: string | null
  fecha_recepcion?: string
  proveedor_nombre?: string | null
  movimientos?: Movimiento[]
}

export interface Movimiento {
  tipo: 'despacho' | 'devolucion' | 'inventario'
  id: number
  cantidad: number
  detalle?: string | null
  fecha: string
}

export interface Despacho {
  id: number
  lote_id: number
  lote_codigo: string
  tag?: string | null
  pallet_numero?: string | null
  material_descripcion: string
  unidad: string
  cantidad: number
  frente_destino?: string | null
  retirado_por?: string | null
  observaciones?: string | null
  firma_url?: string | null
  foto_url?: string | null
  usuario_nombre?: string | null
  fecha: string
}

export interface Devolucion {
  id: number
  lote_id: number
  lote_codigo: string
  material_descripcion: string
  unidad: string
  cantidad: number
  motivo?: string | null
  observaciones?: string | null
  usuario_nombre?: string | null
  fecha: string
}

export interface Inventario {
  id: number
  lote_id: number
  sesion_id?: number | null
  lote_codigo: string
  material_descripcion: string
  unidad: string
  ubicacion_1?: string | null
  cantidad_inventariada: number
  stock_esperado: number
  diferencia: number
  observaciones?: string | null
  usuario_nombre?: string | null
  fecha: string
}

export interface InventarioSesion {
  id: number
  fecha: string
  etiqueta?: string | null
  observaciones?: string | null
  usuario_nombre?: string | null
  created_at: string
  total_lotes: number
  con_diferencia: number
  items?: Inventario[]
}

export interface LoteDisponible {
  id: number
  codigo: string
  ubicacion_1?: string | null
  ubicacion_2?: string | null
  pallet_numero?: string | null
  stock_actual: number
}

export interface DespachoDeSolicitud {
  id: number
  lote_id: number
  lote_codigo: string
  cantidad: number
  fecha: string
}

export interface Solicitud {
  id: number
  material_id: number
  material_descripcion: string
  especialidad?: string | null
  unidad: string
  cantidad_solicitada: number
  cantidad_aprobada?: number | null
  frente_destino?: string | null
  observaciones?: string | null
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  motivo_rechazo?: string | null
  solicitante_id: number
  solicitante_nombre?: string | null
  revisado_por?: number | null
  revisor_nombre?: string | null
  fecha_solicitud: string
  fecha_resolucion?: string | null
  stock_disponible_actual?: number
  lotes_disponibles?: LoteDisponible[]
  despachos?: DespachoDeSolicitud[]
}

export interface ResumenReportes {
  totalMateriales: number
  totalLotesActivos: number
  totalLotesInactivos: number
  totalInventarios: number
  totalDespachos: number
  totalDevoluciones: number
  ncrAbiertos: number
  totalLotesInventariados: number
  totalLotesNoInventariados: number
}
