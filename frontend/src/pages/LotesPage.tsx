import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Lote } from '../types'
import toast from 'react-hot-toast'
import { Search, ScanLine } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EscanearQrModal from '../components/EscanearQrModal'

export default function LotesPage() {
  const navigate = useNavigate()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)
  const [escaneando, setEscaneando] = useState(false)

  const cargar = () => {
    setLoading(true)
    api.get('/lotes', { params: { busqueda: busqueda || undefined, con_stock: soloConStock ? '1' : undefined } })
      .then(r => { setLotes(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const buscarPorCodigo = async (codigo: string) => {
    try {
      const { data } = await api.get(`/lotes/codigo/${encodeURIComponent(codigo)}`)
      navigate(`/lotes/${data.id}`)
    } catch {
      toast.error(`No se encontró ningún lote con el código "${codigo}"`)
    }
  }

  const handleDetectado = (codigo: string) => {
    setEscaneando(false)
    buscarPorCodigo(codigo)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Buscar Lote / Stock" subtitle="Escanea el QR del pallet o busca por código, TAG o descripción" icon={Search}
        actions={
          <button onClick={() => setEscaneando(true)} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <ScanLine className="w-4 h-4" /> Escanear QR
          </button>
        }
      />

      <form onSubmit={e => { e.preventDefault(); cargar() }} className="card flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px]">
          <label className="label">Código de lote, TAG, pallet o descripción</label>
          <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="PED-000123, BULTO 19, BRIDA..." autoFocus />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input type="checkbox" id="conStock" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
          <label htmlFor="conStock" className="text-sm text-gray-700">Solo con stock disponible</label>
        </div>
        <button type="submit" className="btn-primary flex items-center gap-2"><Search className="w-4 h-4" /> Buscar</button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Lote</th>
                <th className="table-header">Descripción</th>
                <th className="table-header">Área / Ubicación</th>
                <th className="table-header">Pallet</th>
                <th className="table-header text-right">Stock actual</th>
                <th className="table-header text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map(l => (
                <tr key={l.id} className="table-row">
                  <td className="table-cell"><Link to={`/lotes/${l.id}`} className="font-medium text-primary-600">{l.codigo}</Link></td>
                  <td className="table-cell">{l.descripcion} {l.diametro_1 ? `— ${l.diametro_1}` : ''}</td>
                  <td className="table-cell text-xs">{[l.area, l.ubicacion_1].filter(Boolean).join(' / ')}</td>
                  <td className="table-cell">{l.pallet_numero}</td>
                  <td className="table-cell text-right tabular-nums font-semibold">{fmt.num(l.stock_actual)} {l.unidad}</td>
                  <td className="table-cell text-center"><span className={l.estado === 'activo' ? 'badge-green' : 'badge-gray'}>{l.estado}</span></td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Sin lotes para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {escaneando && <EscanearQrModal onDetectado={handleDetectado} onClose={() => setEscaneando(false)} />}
    </div>
  )
}
