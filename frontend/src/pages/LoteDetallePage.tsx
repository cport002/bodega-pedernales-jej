import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api, { fmt, dataURLtoBlob } from '../services/api'
import type { Lote } from '../types'
import type SignatureCanvas from 'react-signature-canvas'
import toast from 'react-hot-toast'
import { Package, PackageMinus, Undo2, ClipboardCheck, Printer, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import FirmaCanvas from '../components/FirmaCanvas'
import { useAuth } from '../hooks/useAuth'

type Modal = 'despacho' | 'devolucion' | 'inventario' | null

const MOVIMIENTO_LABEL: Record<string, string> = { despacho: 'Despacho', devolucion: 'Devolución', inventario: 'Inventario' }

export default function LoteDetallePage() {
  const { id } = useParams()
  const { puedeOperar } = useAuth()
  const [lote, setLote] = useState<Lote | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [guardando, setGuardando] = useState(false)

  const sigRef = useRef<SignatureCanvas | null>(null)
  const fotoRef = useRef<HTMLInputElement | null>(null)

  const [formDespacho, setFormDespacho] = useState({ cantidad: '', frente_destino: '', retirado_por: '', observaciones: '' })
  const [formDevolucion, setFormDevolucion] = useState({ cantidad: '', motivo: '', observaciones: '' })
  const [formInventario, setFormInventario] = useState({ cantidad_inventariada: '', observaciones: '' })

  const cargar = () => { api.get(`/lotes/${id}`).then(r => setLote(r.data)) }
  useEffect(() => { cargar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cerrarModal = () => {
    setModal(null)
    setFormDespacho({ cantidad: '', frente_destino: '', retirado_por: '', observaciones: '' })
    setFormDevolucion({ cantidad: '', motivo: '', observaciones: '' })
    setFormInventario({ cantidad_inventariada: '', observaciones: '' })
    if (fotoRef.current) fotoRef.current.value = ''
  }

  const enviarConFirma = async (endpoint: string, campos: Record<string, string>) => {
    if (!sigRef.current || sigRef.current.isEmpty()) { toast.error('La firma digital es requerida'); return false }
    const form = new FormData()
    Object.entries(campos).forEach(([k, v]) => { if (v) form.append(k, v) })
    form.append('lote_id', String(id))
    const firmaBlob = dataURLtoBlob(sigRef.current.getTrimmedCanvas().toDataURL('image/png'))
    form.append('firma', firmaBlob, 'firma.png')
    if (fotoRef.current?.files?.[0]) form.append('foto', fotoRef.current.files[0])
    await api.post(endpoint, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return true
  }

  const handleDespacho = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const ok = await enviarConFirma('/despachos', formDespacho)
      if (ok) { toast.success('Despacho registrado'); cerrarModal(); cargar() }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al registrar el despacho')
    } finally { setGuardando(false) }
  }

  const handleDevolucion = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const ok = await enviarConFirma('/devoluciones', formDevolucion)
      if (ok) { toast.success('Devolución registrada'); cerrarModal(); cargar() }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al registrar la devolución')
    } finally { setGuardando(false) }
  }

  const handleInventario = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const { data } = await api.post('/inventarios', { lote_id: id, ...formInventario })
      toast.success(data.diferencia === 0 ? 'Conteo confirmado, sin diferencias' : `Conteo registrado, diferencia: ${data.diferencia}`)
      cerrarModal(); cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al registrar el inventario')
    } finally { setGuardando(false) }
  }

  if (!lote) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <PageHeader title={`Lote ${lote.codigo}`} subtitle={lote.descripcion} icon={Package}
        actions={
          <a href={`/api/lotes/${lote.id}/qr`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Printer className="w-4 h-4" /> Imprimir QR
          </a>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><p className="label mb-0.5">Recepcionado</p><p className="font-medium text-gray-800">{fmt.num(lote.cantidad_recepcionada)} {lote.unidad}</p></div>
            <div><p className="label mb-0.5">Stock actual</p><p className="font-bold text-primary-700 text-lg">{fmt.num(lote.stock_actual)} {lote.unidad}</p></div>
            <div><p className="label mb-0.5">Estado</p><span className={lote.estado === 'activo' ? 'badge-green' : 'badge-gray'}>{lote.estado}</span></div>
            <div><p className="label mb-0.5">TAG</p><p className="font-medium text-gray-800">{lote.tag || '-'}</p></div>
            <div><p className="label mb-0.5">Área</p><p className="font-medium text-gray-800">{lote.area || '-'}</p></div>
            <div><p className="label mb-0.5">Ubicación</p><p className="font-medium text-gray-800">{[lote.ubicacion_1, lote.ubicacion_2].filter(Boolean).join(' / ') || '-'}</p></div>
            <div><p className="label mb-0.5">Pallet</p><p className="font-medium text-gray-800">{lote.pallet_numero || '-'}</p></div>
            <div><p className="label mb-0.5">Frente / Equipo</p><p className="font-medium text-gray-800">{lote.equipo_destino || '-'}</p></div>
            <div><p className="label mb-0.5">Proveedor / Guía</p><p className="font-medium text-gray-800">{lote.proveedor_nombre} · {lote.n_guia}</p></div>
            {lote.ncr_uso_d && lote.ncr_uso_d !== '0' && (
              <div className="col-span-full"><p className="label mb-0.5">NCR / USO&D</p><p className="font-medium text-red-700">{lote.ncr_uso_d}</p></div>
            )}
          </div>

          <div className="card p-0 overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-100"><h3>Historial de movimientos</h3></div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Tipo</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header text-right">Cantidad</th>
                  <th className="table-header">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {lote.movimientos?.map(m => (
                  <tr key={`${m.tipo}-${m.id}`} className="table-row">
                    <td className="table-cell"><span className="badge-blue">{MOVIMIENTO_LABEL[m.tipo]}</span></td>
                    <td className="table-cell">{fmt.fechaHora(m.fecha)}</td>
                    <td className="table-cell text-right tabular-nums">{fmt.num(m.cantidad)}</td>
                    <td className="table-cell text-xs">{m.detalle || '-'}</td>
                  </tr>
                ))}
                {(!lote.movimientos || lote.movimientos.length === 0) && (
                  <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-8">Sin movimientos registrados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card text-center">
            <img src={`/api/lotes/${lote.id}/qr`} alt={`QR ${lote.codigo}`} className="mx-auto w-40 h-40" />
            <p className="text-xs text-gray-400 mt-2">Código de lote: <span className="font-mono font-semibold text-gray-700">{lote.codigo}</span></p>
          </div>

          {puedeOperar && (
            <div className="card space-y-2">
              <h3 className="mb-2">Acciones</h3>
              <button onClick={() => setModal('despacho')} disabled={lote.stock_actual <= 0}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                <PackageMinus className="w-4 h-4" /> Despachar
              </button>
              <button onClick={() => setModal('devolucion')} className="w-full btn-secondary flex items-center justify-center gap-2">
                <Undo2 className="w-4 h-4" /> Registrar Devolución
              </button>
              <button onClick={() => setModal('inventario')} className="w-full btn-secondary flex items-center justify-center gap-2">
                <ClipboardCheck className="w-4 h-4" /> Registrar Inventario
              </button>
            </div>
          )}
        </div>
      </div>

      {modal === 'despacho' && (
        <ModalFirma titulo="Despachar material" onClose={cerrarModal} onSubmit={handleDespacho} guardando={guardando} sigRef={sigRef} fotoRef={fotoRef}>
          <div>
            <label className="label">Cantidad a despachar * (disponible: {fmt.num(lote.stock_actual)} {lote.unidad})</label>
            <input type="number" min={0.01} max={lote.stock_actual} step="0.01" className="input" required
              value={formDespacho.cantidad} onChange={e => setFormDespacho({ ...formDespacho, cantidad: e.target.value })} />
          </div>
          <div>
            <label className="label">Frente / equipo destino</label>
            <input className="input" value={formDespacho.frente_destino} onChange={e => setFormDespacho({ ...formDespacho, frente_destino: e.target.value })} placeholder="POZO PB3..." />
          </div>
          <div>
            <label className="label">Retirado por</label>
            <input className="input" value={formDespacho.retirado_por} onChange={e => setFormDespacho({ ...formDespacho, retirado_por: e.target.value })} />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={formDespacho.observaciones} onChange={e => setFormDespacho({ ...formDespacho, observaciones: e.target.value })} />
          </div>
        </ModalFirma>
      )}

      {modal === 'devolucion' && (
        <ModalFirma titulo="Registrar devolución" onClose={cerrarModal} onSubmit={handleDevolucion} guardando={guardando} sigRef={sigRef} fotoRef={fotoRef}>
          <div>
            <label className="label">Cantidad que vuelve a bodega *</label>
            <input type="number" min={0.01} step="0.01" className="input" required
              value={formDevolucion.cantidad} onChange={e => setFormDevolucion({ ...formDevolucion, cantidad: e.target.value })} />
          </div>
          <div>
            <label className="label">Motivo</label>
            <input className="input" value={formDevolucion.motivo} onChange={e => setFormDevolucion({ ...formDevolucion, motivo: e.target.value })} placeholder="Sobrante de terreno, no se usó..." />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={formDevolucion.observaciones} onChange={e => setFormDevolucion({ ...formDevolucion, observaciones: e.target.value })} />
          </div>
        </ModalFirma>
      )}

      {modal === 'inventario' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2>Registrar inventario físico</h2>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleInventario} className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Stock actual del sistema: <strong>{fmt.num(lote.stock_actual)} {lote.unidad}</strong></p>
              <div>
                <label className="label">Cantidad contada físicamente *</label>
                <input type="number" min={0} step="0.01" className="input" required
                  value={formInventario.cantidad_inventariada} onChange={e => setFormInventario({ ...formInventario, cantidad_inventariada: e.target.value })} />
              </div>
              <div>
                <label className="label">Observaciones</label>
                <input className="input" value={formInventario.observaciones} onChange={e => setFormInventario({ ...formInventario, observaciones: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={cerrarModal}>Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Registrar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ModalFirma({ titulo, onClose, onSubmit, guardando, sigRef, fotoRef, children }: {
  titulo: string
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  guardando: boolean
  sigRef: React.MutableRefObject<SignatureCanvas | null>
  fotoRef: React.MutableRefObject<HTMLInputElement | null>
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2>{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {children}
          <div>
            <label className="label">Foto de respaldo (opcional)</label>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="input" />
          </div>
          <div>
            <label className="label">Firma digital de quien retira/devuelve *</label>
            <FirmaCanvas sigRef={sigRef} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Confirmar'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
