import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt, descargarBlob } from '../services/api'
import type { Despacho } from '../types'
import { PackageMinus, FileText, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function DespachosPage() {
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (busqueda.trim()) params.busqueda = busqueda.trim()
    if (desde) params.desde = desde
    if (hasta) params.hasta = hasta
    const t = setTimeout(() => {
      api.get('/despachos', { params }).then(r => { setDespachos(r.data); setLoading(false) }).catch(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda, desde, hasta])

  const hayFiltros = busqueda || desde || hasta
  const limpiarFiltros = () => { setBusqueda(''); setDesde(''); setHasta('') }

  // Si el despacho viene de un pedido, el comprobante correcto es el CONSOLIDADO del pedido (mismo
  // folio que ve el solicitante, con todos sus materiales) — no el de esta linea individual, que
  // tiene su propio id de bodega y confunde si el pedido tenia mas de un material.
  const verPdf = async (d: Despacho) => {
    const url = d.solicitud_id ? `/solicitudes/${d.solicitud_id}/comprobante-pdf` : `/despachos/${d.id}/pdf`
    const filename = d.solicitud_id ? `comprobante_pedido_${d.solicitud_id}.pdf` : `despacho_${d.id}.pdf`
    const r = await api.get(url, { responseType: 'blob' })
    descargarBlob(r.data, filename)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Despachos" subtitle={`${despachos.length} despacho(s) registrados`} icon={PackageMinus} />

      <div className="card flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Buscar</label>
          <input className="input" placeholder="N° despacho, lote, material, frente, quien retira o registra"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="min-w-[160px]">
          <label className="label">Desde</label>
          <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="min-w-[160px]">
          <label className="label">Hasta</label>
          <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="btn-secondary flex items-center gap-1 whitespace-nowrap">
            <X className="w-4 h-4" /> Limpiar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">N° mov.</th>
                <th className="table-header">Pedido</th>
                <th className="table-header">Fecha</th>
                <th className="table-header">Lote</th>
                <th className="table-header">Material</th>
                <th className="table-header text-right">Cantidad</th>
                <th className="table-header">Frente destino</th>
                <th className="table-header">Registrado por</th>
                <th className="table-header text-center">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {despachos.map(d => (
                <tr key={d.id} className="table-row">
                  <td className="table-cell text-gray-400 tabular-nums">#{d.id}</td>
                  <td className="table-cell">
                    {d.solicitud_id
                      ? <Link to={`/solicitudes/${d.solicitud_id}`} className="font-medium text-primary-600">#{d.solicitud_id}</Link>
                      : <span className="text-gray-400">Directo</span>}
                  </td>
                  <td className="table-cell">{fmt.fechaHora(d.fecha)}</td>
                  <td className="table-cell"><Link to={`/lotes/${d.lote_id}`} className="font-medium text-primary-600">{d.lote_codigo}</Link></td>
                  <td className="table-cell">{d.material_descripcion}</td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(d.cantidad)} {d.unidad}</td>
                  <td className="table-cell">{d.frente_destino || '-'}</td>
                  <td className="table-cell">{d.usuario_nombre || '-'}</td>
                  <td className="table-cell text-center">
                    {d.firma_url && (
                      <button onClick={() => verPdf(d)} className="text-gray-400 hover:text-primary-600 inline-block">
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {despachos.length === 0 && (
                <tr><td colSpan={9} className="table-cell text-center text-gray-400 py-8">
                  {hayFiltros ? 'Ningún despacho coincide con el filtro' : 'Sin despachos registrados todavía'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
