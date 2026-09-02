import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api, { fmt, dataURLtoBlob } from '../services/api'
import type { Solicitud } from '../types'
import type SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'
import { ClipboardList, FileText, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import FirmaCanvas from '../components/FirmaCanvas'
import { useAuth } from '../hooks/useAuth'

const ESTADO_BADGE: Record<string, string> = { pendiente: 'badge-amber', aprobada: 'badge-green', rechazada: 'badge-red' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

type Asignacion = { checked: boolean; cantidad: string }

export default function SolicitudDetallePage() {
  const { id } = useParams()
  const { puedeOperar } = useAuth()
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [asignaciones, setAsignaciones] = useState<Record<number, Asignacion>>({})
  const [formAprobar, setFormAprobar] = useState({ retirado_por: '', frente_destino: '', observaciones: '' })
  const [guardando, setGuardando] = useState(false)
  const [showRechazar, setShowRechazar] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const sigRef = useRef<SignatureCanvas | null>(null)
  const fotoRef = useRef<HTMLInputElement | null>(null)

  const cargar = () => {
    api.get(`/solicitudes/${id}`).then(r => {
      setSolicitud(r.data)
      setFormAprobar(f => ({ ...f, frente_destino: r.data.frente_destino || '' }))
    })
  }
  useEffect(() => { cargar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLote = (loteId: number, checked: boolean) => {
    setAsignaciones(prev => ({ ...prev, [loteId]: { checked, cantidad: prev[loteId]?.cantidad || '' } }))
  }
  const setCantidadLote = (loteId: number, cantidad: string) => {
    setAsignaciones(prev => ({ ...prev, [loteId]: { checked: prev[loteId]?.checked ?? true, cantidad } }))
  }

  const handleAprobar = async (e: React.FormEvent) => {
    e.preventDefault()
    const elegidos = Object.entries(asignaciones)
      .filter(([, a]) => a.checked && Number(a.cantidad) > 0)
      .map(([loteId, a]) => ({ lote_id: Number(loteId), cantidad: Number(a.cantidad) }))
    if (elegidos.length === 0) { toast.error('Marca al menos un lote y una cantidad'); return }
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('La firma digital de quien retira es requerida'); return }

    setGuardando(true)
    try {
      const form = new FormData()
      form.append('asignaciones', JSON.stringify(elegidos))
      Object.entries(formAprobar).forEach(([k, v]) => { if (v) form.append(k, v) })
      const firmaBlob = dataURLtoBlob(sigRef.current.getTrimmedCanvas().toDataURL('image/png'))
      form.append('firma', firmaBlob, 'firma.png')
      if (fotoRef.current?.files?.[0]) form.append('foto', fotoRef.current.files[0])
      await api.post(`/solicitudes/${id}/aprobar`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Solicitud aprobada y despacho generado')
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

  const verPdf = async (despachoId: number) => {
    const r = await api.get(`/despachos/${despachoId}/pdf`, { responseType: 'blob' })
    window.open(URL.createObjectURL(r.data), '_blank')
  }

  if (!solicitud) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  const totalAsignado = Object.values(asignaciones).filter(a => a.checked).reduce((acc, a) => acc + (Number(a.cantidad) || 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader title={`Solicitud #${solicitud.id}`} subtitle={solicitud.material_descripcion} icon={ClipboardList} />

      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="label mb-0.5">Solicitante</p><p className="font-medium text-gray-800">{solicitud.solicitante_nombre}</p></div>
        <div><p className="label mb-0.5">Fecha</p><p className="font-medium text-gray-800">{fmt.fechaHora(solicitud.fecha_solicitud)}</p></div>
        <div><p className="label mb-0.5">Cantidad solicitada</p><p className="font-bold text-primary-700 text-lg">{fmt.num(solicitud.cantidad_solicitada)} {solicitud.unidad}</p></div>
        <div><p className="label mb-0.5">Stock disponible hoy</p><p className="font-medium text-gray-800">{fmt.num(solicitud.stock_disponible_actual || 0)} {solicitud.unidad}</p></div>
        <div><p className="label mb-0.5">Frente / equipo destino</p><p className="font-medium text-gray-800">{solicitud.frente_destino || '-'}</p></div>
        <div><p className="label mb-0.5">Observaciones</p><p className="font-medium text-gray-800">{solicitud.observaciones || '-'}</p></div>
        <div>
          <p className="label mb-0.5">Estado</p>
          <span className={ESTADO_BADGE[solicitud.estado]}>{ESTADO_LABEL[solicitud.estado]}</span>
        </div>
        {solicitud.estado !== 'pendiente' && (
          <div><p className="label mb-0.5">Resuelto por</p><p className="font-medium text-gray-800">{solicitud.revisor_nombre} · {fmt.fechaHora(solicitud.fecha_resolucion ?? undefined)}</p></div>
        )}
        {solicitud.estado === 'rechazada' && solicitud.motivo_rechazo && (
          <div className="col-span-full"><p className="label mb-0.5">Motivo de rechazo</p><p className="font-medium text-red-700">{solicitud.motivo_rechazo}</p></div>
        )}
      </div>

      {solicitud.estado === 'aprobada' && (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <div className="p-4 border-b border-gray-100"><h3>Despachos generados</h3></div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Lote</th>
                <th className="table-header text-right">Cantidad</th>
                <th className="table-header">Fecha</th>
                <th className="table-header text-center">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {solicitud.despachos?.map(d => (
                <tr key={d.id} className="table-row">
                  <td className="table-cell"><Link to={`/lotes/${d.lote_id}`} className="font-medium text-primary-600">{d.lote_codigo}</Link></td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(d.cantidad)} {solicitud.unidad}</td>
                  <td className="table-cell">{fmt.fechaHora(d.fecha)}</td>
                  <td className="table-cell text-center">
                    <button onClick={() => verPdf(d.id)} className="text-gray-400 hover:text-primary-600 inline-block">
                      <FileText className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {solicitud.estado === 'pendiente' && puedeOperar && (
        <form onSubmit={handleAprobar} className="card space-y-4">
          <h3>Elegir lote(s) y cantidad para despachar</h3>
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
                {solicitud.lotes_disponibles?.map(l => {
                  const a = asignaciones[l.id]
                  return (
                    <tr key={l.id} className="table-row">
                      <td className="table-cell"><input type="checkbox" checked={!!a?.checked} onChange={e => toggleLote(l.id, e.target.checked)} /></td>
                      <td className="table-cell font-medium">{l.codigo}{l.pallet_numero ? ` · Pallet ${l.pallet_numero}` : ''}</td>
                      <td className="table-cell">{[l.ubicacion_1, l.ubicacion_2].filter(Boolean).join(' / ') || '-'}</td>
                      <td className="table-cell text-right tabular-nums">{fmt.num(l.stock_actual)}</td>
                      <td className="table-cell text-right">
                        <input type="number" min={0.01} max={l.stock_actual} step="0.01" className="input text-right"
                          value={a?.cantidad || ''} onChange={e => setCantidadLote(l.id, e.target.value)} />
                      </td>
                    </tr>
                  )
                })}
                {(!solicitud.lotes_disponibles || solicitud.lotes_disponibles.length === 0) && (
                  <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-6">Sin stock disponible en ningún lote de este material</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500">Total a asignar: <strong>{fmt.num(totalAsignado)} {solicitud.unidad}</strong> (pedido: {fmt.num(solicitud.cantidad_solicitada)} {solicitud.unidad})</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Frente / equipo destino</label>
              <input className="input" value={formAprobar.frente_destino} onChange={e => setFormAprobar({ ...formAprobar, frente_destino: e.target.value })} />
            </div>
            <div>
              <label className="label">Retirado por</label>
              <input className="input" value={formAprobar.retirado_por} onChange={e => setFormAprobar({ ...formAprobar, retirado_por: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={formAprobar.observaciones} onChange={e => setFormAprobar({ ...formAprobar, observaciones: e.target.value })} />
          </div>
          <div>
            <label className="label">Foto de respaldo (opcional)</label>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="input" />
          </div>
          <div>
            <label className="label">Firma digital de quien retira *</label>
            <FirmaCanvas sigRef={sigRef} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowRechazar(true)}>Rechazar</button>
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Aprobar y Despachar'}</button>
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
    </div>
  )
}
