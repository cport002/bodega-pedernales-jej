import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import type { Material } from '../types'
import toast from 'react-hot-toast'
import { ShoppingCart, ScanLine, Package, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EscanearQrModal from '../components/EscanearQrModal'

type MaterialConStock = Material & { stock_total: number }

export default function NuevaSolicitudPage() {
  const navigate = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [materiales, setMateriales] = useState<MaterialConStock[]>([])
  const [buscando, setBuscando] = useState(false)
  const [seleccionado, setSeleccionado] = useState<MaterialConStock | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ cantidad: '', frente_destino: '', observaciones: '' })

  useEffect(() => {
    if (seleccionado || !busqueda) { setMateriales([]); return }
    setBuscando(true)
    const t = setTimeout(() => {
      api.get('/materiales', { params: { busqueda } })
        .then(r => setMateriales(r.data))
        .catch(() => {})
        .finally(() => setBuscando(false))
    }, 350)
    return () => clearTimeout(t)
  }, [busqueda, seleccionado])

  const elegirMaterial = (m: MaterialConStock) => {
    setSeleccionado(m)
    setMateriales([])
    setBusqueda('')
  }

  const handleQr = async (codigo: string) => {
    setShowQr(false)
    try {
      const { data: lote } = await api.get(`/lotes/codigo/${encodeURIComponent(codigo)}`)
      const { data: material } = await api.get(`/materiales/${lote.material_id}`)
      elegirMaterial(material)
    } catch {
      toast.error('Código no encontrado')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seleccionado) { toast.error('Elige un material primero'); return }
    setGuardando(true)
    try {
      await api.post('/solicitudes', { material_id: seleccionado.id, ...form })
      toast.success('Solicitud enviada, queda pendiente de autorización')
      navigate('/mis-solicitudes')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al enviar la solicitud')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitar Material" subtitle="Pide material según el stock disponible en bodega" icon={ShoppingCart} />

      {!seleccionado ? (
        <div className="card space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="label">Buscar material por descripción o especialidad</label>
              <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="BRIDA SLIP-ON, PIPING..." autoFocus />
            </div>
            <button type="button" onClick={() => setShowQr(true)}
              className="btn-secondary flex items-center gap-2 whitespace-nowrap">
              <ScanLine className="w-4 h-4" /> Escanear QR
            </button>
          </div>

          {buscando && <p className="text-sm text-gray-400">Buscando...</p>}

          {materiales.length > 0 && (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {materiales.map(m => (
                <button key={m.id} type="button" onClick={() => elegirMaterial(m)}
                  className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{m.descripcion}</p>
                    <p className="text-xs text-gray-400">{[m.especialidad, m.diametro_1, m.diametro_2].filter(Boolean).join(' · ') || '-'}</p>
                  </div>
                  <span className="badge-blue whitespace-nowrap">{m.stock_total} {m.unidad}</span>
                </button>
              ))}
            </div>
          )}
          {!buscando && busqueda && materiales.length === 0 && (
            <p className="text-sm text-gray-400">Sin resultados para "{busqueda}"</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-amber-700 flex-shrink-0" />
              <div>
                <p className="font-semibold text-gray-800 text-sm">{seleccionado.descripcion}</p>
                <p className="text-xs text-gray-500">Stock disponible: <strong>{seleccionado.stock_total} {seleccionado.unidad}</strong></p>
              </div>
            </div>
            <button type="button" onClick={() => setSeleccionado(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="label">Cantidad solicitada * ({seleccionado.unidad})</label>
            <input type="number" min={0.01} step="0.01" className="input" required
              value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
          </div>
          <div>
            <label className="label">Frente / equipo destino</label>
            <input className="input" value={form.frente_destino} onChange={e => setForm({ ...form, frente_destino: e.target.value })} placeholder="POZO PB3..." />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setSeleccionado(null)}>Cambiar material</button>
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Enviando...' : 'Enviar Solicitud'}</button>
          </div>
        </form>
      )}

      {showQr && <EscanearQrModal onDetectado={handleQr} onClose={() => setShowQr(false)} />}
    </div>
  )
}
