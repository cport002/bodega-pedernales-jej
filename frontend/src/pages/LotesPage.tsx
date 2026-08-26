import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Lote } from '../types'
import toast from 'react-hot-toast'
import { Search, ScanLine } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EscanearQrModal from '../components/EscanearQrModal'

export default function LotesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [soloConStock, setSoloConStock] = useState(searchParams.get('estado') ? false : true)
  const [filtroEstado, setFiltroEstado] = useState(searchParams.get('estado') || '')
  const [filtroInventariado, setFiltroInventariado] = useState(searchParams.get('inventariado') || '')
  const [escaneando, setEscaneando] = useState(false)

  const cargar = () => {
    setLoading(true)
    api.get('/lotes', {
      params: {
        busqueda: busqueda || undefined,
        con_stock: soloConStock ? '1' : undefined,
        estado: filtroEstado || undefined,
        inventariado: filtroInventariado || undefined,
      }
    }).then(r => { setLotes(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  // Carga inicial (respeta ?estado= si se llegó desde un link del Dashboard) y cada vez que cambian
  // los filtros de selección (estado, con stock, inventariado). La búsqueda de texto se maneja
  // aparte, con debounce.
  useEffect(() => { cargar() }, [filtroEstado, soloConStock, filtroInventariado]) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda en vivo: filtra solo mientras el usuario deja de escribir (evita una consulta por tecla)
  useEffect(() => {
    const t = setTimeout(() => cargar(), 350)
    return () => clearTimeout(t)
  }, [busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (filtroEstado) next.set('estado', filtroEstado); else next.delete('estado')
    if (filtroInventariado) next.set('inventariado', filtroInventariado); else next.delete('inventariado')
    setSearchParams(next, { replace: true })
  }, [filtroEstado, filtroInventariado]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const subtitulo = filtroEstado
    ? `${lotes.length} lote(s) ${filtroEstado === 'activo' ? 'activos' : filtroEstado === 'inactivo' ? 'inactivos' : filtroEstado}`
    : 'Escanea el QR del pallet o busca por código, TAG o descripción'

  return (
    <div className="space-y-6">
      <PageHeader title="Buscar Lote / Stock" subtitle={subtitulo} icon={Search}
        actions={
          <button onClick={() => setEscaneando(true)} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <ScanLine className="w-4 h-4" /> Escanear QR
          </button>
        }
      />

      <form onSubmit={e => e.preventDefault()} className="card flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px]">
          <label className="label">Código de lote, TAG, pallet o descripción</label>
          <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="PED-000123, BULTO 19, BRIDA..." autoFocus />
        </div>
        <div className="min-w-[160px]">
          <label className="label">Estado</label>
          <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="agotado">Agotado</option>
          </select>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Inventario</label>
          <select className="input" value={filtroInventariado} onChange={e => setFiltroInventariado(e.target.value)}>
            <option value="">Todos</option>
            <option value="1">Inventariado</option>
            <option value="0">No inventariado</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input type="checkbox" id="conStock" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
          <label htmlFor="conStock" className="text-sm text-gray-700">Solo con stock disponible</label>
        </div>
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
                <th className="table-header text-center">Inventario</th>
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
                  <td className="table-cell text-center">
                    {l.ultima_fecha_inventario
                      ? <span className="badge-green" title="Última fecha en que se contó físicamente">{fmt.fecha(l.ultima_fecha_inventario)}</span>
                      : <span className="badge-red">No inventariado</span>}
                  </td>
                </tr>
              ))}
              {lotes.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin lotes para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {escaneando && <EscanearQrModal onDetectado={handleDetectado} onClose={() => setEscaneando(false)} />}
    </div>
  )
}
