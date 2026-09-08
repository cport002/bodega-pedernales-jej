import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api, { fmt, dataURLtoBlob, descargarBlob, comprimirFoto } from '../services/api'
import type { Solicitud, Material } from '../types'
import type SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'
import { ClipboardList, FileText, X, Download, QrCode, Truck, Pencil, Trash2, AlertTriangle, Plus, Package } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import FirmaCanvas from '../components/FirmaCanvas'
import { useAuth } from '../hooks/useAuth'

const ESTADO_BADGE: Record<string, string> = { pendiente: 'badge-amber', aprobada: 'badge-blue', entregada: 'badge-green', rechazada: 'badge-red' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Vale emitido — pendiente de retiro', entregada: 'Entregada', rechazada: 'Rechazada' }

type Asignacion = { checked: boolean; cantidad: string }
type MaterialConStock = Material & { stock_total: number }
type ItemEditable = { id?: number; material_id: number; material_descripcion: string; unidad: string; cantidad: string }

export default function SolicitudDetallePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { puedeOperar, usuario } = useAuth()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  // asignaciones[pedido_item_id][lote_id] = {checked, cantidad}
  const [asignaciones, setAsignaciones] = useState<Record<number, Record<number, Asignacion>>>({})
  const [frenteDestino, setFrenteDestino] = useState('')
  const [formEntrega, setFormEntrega] = useState({ retirado_por: '', observaciones: '' })
  const [guardando, setGuardando] = useState(false)
  const [showRechazar, setShowRechazar] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [showEditar, setShowEditar] = useState(false)
  const [showEliminar, setShowEliminar] = useState(false)

  const sigRef = useRef<SignatureCanvas | null>(null)
  const fotoRef = useRef<HTMLInputElement | null>(null)

  const cargar = () => {
    api.get(`/solicitudes/${id}`).then(r => {
      setSolicitud(r.data)
      setFrenteDestino(f => f || r.data.frente_destino || '')
    })
  }
  useEffect(() => { cargar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLote = (itemId: number, loteId: number, checked: boolean) => {
    setAsignaciones(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [loteId]: { checked, cantidad: prev[itemId]?.[loteId]?.cantidad || '' } }
    }))
  }
  const setCantidadLote = (itemId: number, loteId: number, cantidad: string) => {
    setAsignaciones(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [loteId]: { checked: prev[itemId]?.[loteId]?.checked ?? true, cantidad } }
    }))
  }

  const handleAprobar = async (e: React.FormEvent) => {
    e.preventDefault()
    const items = (solicitud?.items || []).map(item => {
      const elegidos = Object.entries(asignaciones[item.id] || {})
        .filter(([, a]) => a.checked && Number(a.cantidad) > 0)
        .map(([loteId, a]) => ({ lote_id: Number(loteId), cantidad: Number(a.cantidad) }))
      return { pedido_item_id: item.id, asignaciones: elegidos }
    })
    if (items.every(i => i.asignaciones.length === 0)) { toast.error('Marca al menos un lote y una cantidad'); return }
    const sinAsignar = (solicitud?.items || []).filter(item => !items.find(i => i.pedido_item_id === item.id)?.asignaciones.length)
    if (sinAsignar.length > 0) {
      toast.error(`Falta elegir lote para: ${sinAsignar.map(i => i.material_descripcion).join(', ')}`)
      return
    }

    setGuardando(true)
    try {
      const r = await api.post(`/solicitudes/${id}/aprobar`, { items, frente_destino: frenteDestino || null })
      toast.success(`Vale ${r.data.folio} generado — el solicitante ya puede descargarlo`)
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al aprobar la solicitud')
    } finally { setGuardando(false) }
  }

  const handleRechazar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.put(`/solicitudes/${id}/rechazar`, { motivo: motivoRechazo })
      toast.success('Solicitud rechazada')
      setShowRechazar(false)
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al rechazar la solicitud')
    } finally { setGuardando(false) }
  }

  const handleEliminar = async () => {
    setGuardando(true)
    try {
      await api.delete(`/solicitudes/${id}`)
      toast.success('Solicitud eliminada')
      navigate(puedeOperar ? '/solicitudes' : '/mis-solicitudes')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar la solicitud')
      setGuardando(false)
    }
  }

  const handleEntregar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('La firma digital de quien retira es requerida'); return }

    setGuardando(true)
    try {
      const form = new FormData()
      Object.entries(formEntrega).forEach(([k, v]) => { if (v) form.append(k, v) })
      const firmaBlob = dataURLtoBlob(sigRef.current.getTrimmedCanvas().toDataURL('image/png'))
      form.append('firma', firmaBlob, 'firma.png')
      if (fotoRef.current?.files?.[0]) form.append('foto', await comprimirFoto(fotoRef.current.files[0]))
      await api.post(`/solicitudes/${id}/entregar`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Entrega confirmada')
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al confirmar la entrega')
    } finally { setGuardando(false) }
  }

  const descargarVale = async () => {
    try {
      const r = await api.get(`/solicitudes/${id}/vale-pdf`, { responseType: 'blob' })
      descargarBlob(r.data, `vale_${solicitud?.folio || id}.pdf`)
    } catch {
      toast.error('No se pudo generar el vale')
    }
  }

  const descargarComprobante = async () => {
    try {
      const r = await api.get(`/solicitudes/${id}/comprobante-pdf`, { responseType: 'blob' })
      descargarBlob(r.data, `comprobante_${solicitud?.folio || id}.pdf`)
    } catch {
      toast.error('No se pudo generar el comprobante')
    }
  }

  if (!solicitud) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  const esDueno = usuario?.id === solicitud.solicitante_id
  const puedeEditar = solicitud.estado === 'pendiente' && (puedeOperar || esDueno)
  const puedeEliminar = solicitud.estado !== 'entregada' && (puedeOperar || esDueno)
  const items = solicitud.items || []

  return (
    <div className="space-y-6">
      <PageHeader title={`Solicitud #${solicitud.id}`} subtitle={`${items.length} material${items.length !== 1 ? 'es' : ''}`} icon={ClipboardList}
        actions={
          <>
            {puedeEditar && (
              <button onClick={() => setShowEditar(true)} className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-primary-50 transition-colors shadow-sm">
                <Pencil className="w-4 h-4" /> Editar
              </button>
            )}
            {puedeEliminar && (
              <button onClick={() => setShowEliminar(true)} className="inline-flex items-center gap-2 bg-white text-red-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-red-50 transition-colors shadow-sm">
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            )}
          </>
        } />

      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="label mb-0.5">Solicitante</p><p className="font-medium text-gray-800">{solicitud.solicitante_nombre}</p></div>
        <div><p className="label mb-0.5">Fecha</p><p className="font-medium text-gray-800">{fmt.fechaHora(solicitud.fecha_solicitud)}</p></div>
        <div><p className="label mb-0.5">Frente / equipo destino</p><p className="font-medium text-gray-800">{solicitud.frente_destino || '-'}</p></div>
        <div><p className="label mb-0.5">Observaciones</p><p className="font-medium text-gray-800">{solicitud.observaciones || '-'}</p></div>
        <div>
          <p className="label mb-0.5">Estado</p>
          <span className={ESTADO_BADGE[solicitud.estado]}>{ESTADO_LABEL[solicitud.estado]}</span>
        </div>
        {solicitud.estado !== 'pendiente' && solicitud.folio && (
          <div><p className="label mb-0.5">Folio del vale</p><p className="font-mono font-bold text-gray-800">{solicitud.folio}</p></div>
        )}
        {solicitud.estado !== 'pendiente' && solicitud.estado !== 'rechazada' && (
          <div><p className="label mb-0.5">Aprobado por</p><p className="font-medium text-gray-800">{solicitud.revisor_nombre} · {fmt.fechaHora(solicitud.fecha_resolucion ?? undefined)}</p></div>
        )}
        {solicitud.estado === 'entregada' && (
          <div><p className="label mb-0.5">Entregado</p><p className="font-medium text-gray-800">{fmt.fechaHora(solicitud.fecha_entrega ?? undefined)}</p></div>
        )}
        {solicitud.estado === 'rechazada' && solicitud.motivo_rechazo && (
          <div className="col-span-full"><p className="label mb-0.5">Motivo de rechazo</p><p className="font-medium text-red-700">{solicitud.motivo_rechazo}</p></div>
        )}
      </div>

      {/* Lista simple de materiales pedidos — visible siempre como referencia */}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <div className="p-4 border-b border-gray-100"><h3>Materiales del pedido</h3></div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Material</th>
              <th className="table-header text-right">Cant. solicitada</th>
              <th className="table-header text-right">Cant. aprobada</th>
              <th className="table-header text-right">Stock disponible hoy</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="table-row">
                <td className="table-cell font-medium">{item.material_descripcion}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(item.cantidad_solicitada)} {item.unidad}</td>
                <td className="table-cell text-right tabular-nums">{item.cantidad_aprobada != null ? `${fmt.num(item.cantidad_aprobada)} ${item.unidad}` : '-'}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(item.stock_disponible_actual || 0)} {item.unidad}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {solicitud.estado === 'aprobada' && (
        <div className="card border-2 border-primary-100 bg-primary-50/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-600 flex items-center justify-center flex-shrink-0">
                <QrCode className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Vale de retiro generado</p>
                <p className="text-xs text-gray-500">Folio <strong>{solicitud.folio}</strong> — llévalo (impreso o en el celular) a bodega para retirar el material</p>
              </div>
            </div>
            <button onClick={descargarVale} className="btn-primary flex items-center gap-2 whitespace-nowrap">
              <Download className="w-4 h-4" /> Descargar / Imprimir Vale
            </button>
          </div>
        </div>
      )}

      {solicitud.estado === 'entregada' && (
        <>
          <div className="card border-2 border-green-100 bg-green-50/40">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-green-600 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Entrega confirmada</p>
                  <p className="text-xs text-gray-500">Folio <strong>{solicitud.folio}</strong> — comprobante con firma y los {items.length} material{items.length !== 1 ? 'es' : ''} entregados</p>
                </div>
              </div>
              <button onClick={descargarComprobante} className="btn-primary flex items-center gap-2 whitespace-nowrap">
                <Download className="w-4 h-4" /> Descargar Comprobante
              </button>
            </div>
          </div>

          <div className="card p-0 overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-100"><h3>Materiales entregados</h3></div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Material</th>
                  <th className="table-header">Lote</th>
                  <th className="table-header text-right">Cantidad</th>
                  <th className="table-header">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {solicitud.despachos?.map(d => (
                  <tr key={d.id} className="table-row">
                    <td className="table-cell">{d.material_descripcion}</td>
                    <td className="table-cell"><Link to={`/lotes/${d.lote_id}`} className="font-medium text-primary-600">{d.lote_codigo}</Link></td>
                    <td className="table-cell text-right tabular-nums">{fmt.num(d.cantidad)} {d.unidad}</td>
                    <td className="table-cell">{fmt.fechaHora(d.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {solicitud.estado === 'pendiente' && puedeOperar && (
        <form onSubmit={handleAprobar} className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="card space-y-3">
              <h3>{item.material_descripcion} <span className="text-gray-400 font-normal text-sm">— pedido: {fmt.num(item.cantidad_solicitada)} {item.unidad}</span></h3>
              <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="table-header w-10"></th>
                      <th className="table-header">Lote</th>
                      <th className="table-header">Ubicación</th>
                      <th className="table-header text-right">Stock lote</th>
                      <th className="table-header text-right w-40">Cantidad a sacar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.lotes_disponibles?.map(l => {
                      const a = asignaciones[item.id]?.[l.id]
                      return (
                        <tr key={l.id} className="table-row">
                          <td className="table-cell"><input type="checkbox" checked={!!a?.checked} onChange={e => toggleLote(item.id, l.id, e.target.checked)} /></td>
                          <td className="table-cell font-medium">{l.codigo}{l.pallet_numero ? ` · Pallet ${l.pallet_numero}` : ''}</td>
                          <td className="table-cell">{[l.ubicacion_1, l.ubicacion_2].filter(Boolean).join(' / ') || '-'}</td>
                          <td className="table-cell text-right tabular-nums">{fmt.num(l.stock_actual)}</td>
                          <td className="table-cell text-right">
                            <input type="number" min={0.01} max={l.stock_actual} step="0.01" className="input text-right"
                              value={a?.cantidad || ''} onChange={e => setCantidadLote(item.id, l.id, e.target.value)} />
                          </td>
                        </tr>
                      )
                    })}
                    {(!item.lotes_disponibles || item.lotes_disponibles.length === 0) && (
                      <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-6">Sin stock disponible en ningún lote de este material</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="card space-y-4">
            <p className="text-xs text-gray-400">El stock recién se descuenta al confirmar la entrega física en bodega, no ahora.</p>
            <div>
              <label className="label">Frente / equipo destino</label>
              <input className="input" value={frenteDestino} onChange={e => setFrenteDestino(e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowRechazar(true)}>Rechazar</button>
              <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Aprobar y Generar Vale'}</button>
            </div>
          </div>
        </form>
      )}

      {solicitud.estado === 'aprobada' && puedeOperar && (
        <form onSubmit={handleEntregar} className="card space-y-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary-600" />
            <h3>Confirmar Entrega Física</h3>
          </div>
          <p className="text-xs text-gray-500 -mt-2">Al confirmar se descuenta el stock de los lotes del vale y se genera un despacho por cada material.</p>

          <div className="border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Material</th>
                  <th className="table-header">Lote</th>
                  <th className="table-header">Ubicación</th>
                  <th className="table-header text-right">Cantidad a entregar</th>
                </tr>
              </thead>
              <tbody>
                {items.flatMap(item => (item.lotes_aprobados || []).map(l => (
                  <tr key={`${item.id}-${l.lote_id}`} className="table-row">
                    <td className="table-cell font-medium">{item.material_descripcion}</td>
                    <td className="table-cell">{l.lote_codigo}{l.pallet_numero ? ` · Pallet ${l.pallet_numero}` : ''}</td>
                    <td className="table-cell">{[l.ubicacion_1, l.ubicacion_2].filter(Boolean).join(' / ') || '-'}</td>
                    <td className="table-cell text-right tabular-nums font-semibold">{fmt.num(l.cantidad)} {item.unidad}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Retirado por</label>
              <input className="input" value={formEntrega.retirado_por} onChange={e => setFormEntrega({ ...formEntrega, retirado_por: e.target.value })} />
            </div>
            <div>
              <label className="label">Observaciones</label>
              <input className="input" value={formEntrega.observaciones} onChange={e => setFormEntrega({ ...formEntrega, observaciones: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Foto del material entregado (opcional)</label>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="input" />
          </div>
          <div>
            <label className="label">Firma digital de quien retira *</label>
            <FirmaCanvas sigRef={sigRef} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Confirmar Entrega'}</button>
          </div>
        </form>
      )}

      {showRechazar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2>Rechazar solicitud</h2>
              <button onClick={() => setShowRechazar(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleRechazar} className="p-6 space-y-4">
              <div>
                <label className="label">Motivo</label>
                <textarea className="input" rows={3} value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Sin stock suficiente, material no corresponde..." />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowRechazar(false)}>Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Confirmar Rechazo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditar && (
        <EditarPedidoModal
          solicitud={solicitud}
          onClose={() => setShowEditar(false)}
          onGuardado={() => { setShowEditar(false); cargar() }}
        />
      )}

      {showEliminar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-5 h-5" /> Eliminar solicitud</h2>
              <button onClick={() => setShowEliminar(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                ¿Seguro que quieres eliminar este pedido de <strong>{items.length} material{items.length !== 1 ? 'es' : ''}</strong>?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Esta acción no se puede deshacer desde el sistema — dejará de aparecer en los listados. El registro queda guardado internamente para auditoría.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowEliminar(false)}>Cancelar</button>
                <button type="button" disabled={guardando} onClick={handleEliminar}
                  className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-4 py-2 rounded-xl transition-colors disabled:opacity-60">
                  <Trash2 className="w-4 h-4" /> {guardando ? 'Eliminando...' : 'Sí, Eliminar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Modal de edición del pedido completo: permite ajustar cantidades, quitar materiales, y agregar
// materiales nuevos (mismo buscador que al crear el pedido) — todo mientras siga 'pendiente'.
function EditarPedidoModal({ solicitud, onClose, onGuardado }: { solicitud: Solicitud; onClose: () => void; onGuardado: () => void }) {
  const [items, setItems] = useState<ItemEditable[]>(
    (solicitud.items || []).map(i => ({ id: i.id, material_id: i.material_id, material_descripcion: i.material_descripcion, unidad: i.unidad, cantidad: String(i.cantidad_solicitada) }))
  )
  const [frenteDestino, setFrenteDestino] = useState(solicitud.frente_destino || '')
  const [observaciones, setObservaciones] = useState(solicitud.observaciones || '')
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<MaterialConStock[]>([])
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!busqueda) { setResultados([]); return }
    const t = setTimeout(() => {
      api.get('/materiales', { params: { busqueda, estado: 'activo' } }).then(r => setResultados(r.data)).catch(() => {})
    }, 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const agregarMaterial = (m: MaterialConStock) => {
    if (items.some(i => i.material_id === m.id)) { toast.error('Ese material ya está en el pedido'); return }
    setItems(prev => [...prev, { material_id: m.id, material_descripcion: m.descripcion, unidad: m.unidad, cantidad: '1' }])
    setBusqueda('')
    setResultados([])
  }

  const quitarItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
  const cambiarCantidad = (idx: number, cantidad: string) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad } : it))

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (items.length === 0) { toast.error('El pedido debe tener al menos un material'); return }
    for (const it of items) {
      if (!Number(it.cantidad) || Number(it.cantidad) <= 0) { toast.error(`Cantidad inválida para ${it.material_descripcion}`); return }
    }
    setGuardando(true)
    try {
      await api.put(`/solicitudes/${solicitud.id}`, {
        items: items.map(it => ({ id: it.id, material_id: it.material_id, cantidad: Number(it.cantidad) })),
        frente_destino: frenteDestino, observaciones,
      })
      toast.success('Pedido actualizado')
      onGuardado()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al editar el pedido')
    } finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2>Editar pedido</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={guardar} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            {items.map((it, idx) => (
              <div key={it.id ?? `nuevo-${idx}`} className="flex items-center gap-3 px-3 py-2.5">
                <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{it.material_descripcion}</p>
                </div>
                <input type="number" min={0.01} step="0.01" className="input w-24 text-right"
                  value={it.cantidad} onChange={e => cambiarCantidad(idx, e.target.value)} />
                <span className="text-xs text-gray-400 w-10">{it.unidad}</span>
                <button type="button" onClick={() => quitarItem(idx)} className="text-gray-400 hover:text-red-600 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {items.length === 0 && <p className="text-center text-sm text-gray-400 py-6">Sin materiales — agrega al menos uno abajo</p>}
          </div>

          <div className="relative">
            <label className="label">Agregar otro material</label>
            <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar material..." />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border border-gray-200 rounded-xl bg-white shadow-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                {resultados.map(m => (
                  <button key={m.id} type="button" onClick={() => agregarMaterial(m)}
                    className="w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-800">{m.descripcion}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Plus className="w-3 h-3" />{m.stock_total} {m.unidad}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">Frente / equipo destino</label>
            <input className="input" value={frenteDestino} onChange={e => setFrenteDestino(e.target.value)} />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Guardar Cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
