import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import type { Material } from '../types'
import toast from 'react-hot-toast'
import { ShoppingCart, ScanLine, Package, X, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EscanearQrModal from '../components/EscanearQrModal'

type MaterialConStock = Material & { stock_total: number }
type ItemCarrito = { material: MaterialConStock; cantidad: string }

export default function NuevaSolicitudPage() {
  const navigate = useNavigate()
  const [busqueda, setBusqueda] = useState('')
  const [materiales, setMateriales] = useState<MaterialConStock[]>([])
  const [buscando, setBuscando] = useState(false)
  const [agregando, setAgregando] = useState<MaterialConStock | null>(null)
  const [cantidadAgregar, setCantidadAgregar] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [frenteDestino, setFrenteDestino] = useState('')
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    if (agregando || !busqueda) { setMateriales([]); return }
    setBuscando(true)
    const t = setTimeout(() => {
      api.get('/materiales', { params: { busqueda, estado: 'activo' } })
        .then(r => setMateriales(r.data))
        .catch(() => {})
        .finally(() => setBuscando(false))
    }, 350)
    return () => clearTimeout(t)
  }, [busqueda, agregando])

  const elegirMaterial = (m: MaterialConStock) => {
    setAgregando(m)
    setMateriales([])
    setBusqueda('')
    setCantidadAgregar('')
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

  const agregarAlCarrito = () => {
    if (!agregando) return
    const cant = Number(cantidadAgregar)
    if (!cant || cant <= 0) { toast.error('Ingresa una cantidad mayor a cero'); return }
    if (carrito.some(i => i.material.id === agregando.id)) {
      toast.error('Ese material ya está en el pedido — quítalo primero si quieres cambiar la cantidad')
      return
    }
    setCarrito(prev => [...prev, { material: agregando, cantidad: cantidadAgregar }])
    setAgregando(null)
    toast.success(`${agregando.descripcion} agregado al pedido`)
  }

  const quitarDelCarrito = (materialId: number) => {
    setCarrito(prev => prev.filter(i => i.material.id !== materialId))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (carrito.length === 0) { toast.error('Agrega al menos un material al pedido'); return }
    setGuardando(true)
    try {
      await api.post('/solicitudes', {
        items: carrito.map(i => ({ material_id: i.material.id, cantidad: Number(i.cantidad) })),
        frente_destino: frenteDestino, observaciones,
      })
      toast.success('Pedido enviado, queda pendiente de autorización')
      navigate('/mis-solicitudes')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al enviar el pedido')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitar Material" subtitle="Agrega uno o varios materiales y envía el pedido completo" icon={ShoppingCart} />

      {!agregando ? (
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
              {materiales.map(m => {
                const yaAgregado = carrito.some(i => i.material.id === m.id)
                return (
                  <button key={m.id} type="button" disabled={yaAgregado} onClick={() => elegirMaterial(m)}
                    className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 ${yaAgregado ? 'opacity-40 cursor-not-allowed' : 'hover:bg-amber-50'}`}>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{m.descripcion}</p>
                      <p className="text-xs text-gray-400">{[m.especialidad, m.diametro_1, m.diametro_2].filter(Boolean).join(' · ') || '-'}</p>
                    </div>
                    <span className="badge-blue whitespace-nowrap">{yaAgregado ? 'Ya agregado' : `${m.stock_total} ${m.unidad}`}</span>
                  </button>
                )
              })}
            </div>
          )}
          {!buscando && busqueda && materiales.length === 0 && (
            <p className="text-sm text-gray-400">Sin resultados para "{busqueda}"</p>
          )}
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-amber-700 flex-shrink-0" />
              <div>
                <p className="font-semibold text-gray-800 text-sm">{agregando.descripcion}</p>
                <p className="text-xs text-gray-500">Stock disponible: <strong>{agregando.stock_total} {agregando.unidad}</strong></p>
              </div>
            </div>
            <button type="button" onClick={() => setAgregando(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="label">Cantidad ({agregando.unidad}) *</label>
            <input type="number" min={0.01} step="0.01" className="input" autoFocus
              value={cantidadAgregar} onChange={e => setCantidadAgregar(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarAlCarrito() } }} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setAgregando(null)}>Cancelar</button>
            <button type="button" className="btn-primary flex items-center gap-2" onClick={agregarAlCarrito}>
              <Plus className="w-4 h-4" /> Agregar al Pedido
            </button>
          </div>
        </div>
      )}

      {carrito.length > 0 && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h3>Materiales en el pedido ({carrito.length})</h3>
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            {carrito.map(i => (
              <div key={i.material.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{i.material.descripcion}</p>
                  <p className="text-xs text-gray-400">{i.cantidad} {i.material.unidad}</p>
                </div>
                <button type="button" onClick={() => quitarDelCarrito(i.material.id)}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="label">Frente / equipo destino</label>
            <input className="input" value={frenteDestino} onChange={e => setFrenteDestino(e.target.value)} placeholder="POZO PB3..." />
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Enviando...' : `Enviar Pedido (${carrito.length} material${carrito.length !== 1 ? 'es' : ''})`}</button>
          </div>
        </form>
      )}

      {showQr && <EscanearQrModal onDetectado={handleQr} onClose={() => setShowQr(false)} />}
    </div>
  )
}
