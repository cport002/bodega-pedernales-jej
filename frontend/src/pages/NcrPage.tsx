import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { AlertTriangle } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

interface ItemNcr {
  id: number
  codigo: string
  tag?: string | null
  ncr_uso_d?: string | null
  protocolo_cambio_ubicacion?: string | null
  descripcion: string
  area?: string | null
  ubicacion_1?: string | null
}

export default function NcrPage() {
  const [items, setItems] = useState<ItemNcr[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/reportes/ncr').then(r => { setItems(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="NCR / Novedades" subtitle={`${items.length} lote(s) con no conformidad o protocolo de cambio abierto`} icon={AlertTriangle} />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Lote</th>
                <th className="table-header">Descripción</th>
                <th className="table-header">Ubicación</th>
                <th className="table-header">NCR / USO&D</th>
                <th className="table-header">Protocolo cambio ubicación</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="table-row">
                  <td className="table-cell"><Link to={`/lotes/${i.id}`} className="font-medium text-primary-600">{i.codigo}</Link></td>
                  <td className="table-cell">{i.descripcion}</td>
                  <td className="table-cell text-xs">{[i.area, i.ubicacion_1].filter(Boolean).join(' / ')}</td>
                  <td className="table-cell">{i.ncr_uso_d && i.ncr_uso_d !== '0' ? <span className="badge-red">{i.ncr_uso_d}</span> : '-'}</td>
                  <td className="table-cell">{i.protocolo_cambio_ubicacion && i.protocolo_cambio_ubicacion !== '0' ? <span className="badge-amber">{i.protocolo_cambio_ubicacion}</span> : '-'}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Sin novedades registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
