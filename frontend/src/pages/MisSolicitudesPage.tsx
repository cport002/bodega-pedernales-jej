import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Solicitud } from '../types'
import { ClipboardList } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const ESTADO_BADGE: Record<string, string> = { pendiente: 'badge-amber', aprobada: 'badge-blue', entregada: 'badge-green', rechazada: 'badge-red' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Vale listo', entregada: 'Entregada', rechazada: 'Rechazada' }

export default function MisSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/solicitudes').then(r => { setSolicitudes(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader title="Mis Solicitudes" subtitle={`${solicitudes.length} pedido${solicitudes.length !== 1 ? 's' : ''} realizados`} icon={ClipboardList} />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">Materiales</th>
                <th className="table-header">Frente destino</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id} className="table-row">
                  <td className="table-cell">{fmt.fechaHora(s.fecha_solicitud)}</td>
                  <td className="table-cell font-medium">
                    <span className="badge-blue mr-2">{s.total_items ?? 1}</span>
                    <span className="text-gray-700">{s.materiales_resumen || '-'}</span>
                  </td>
                  <td className="table-cell">{s.frente_destino || '-'}</td>
                  <td className="table-cell">
                    <span className={ESTADO_BADGE[s.estado]}>{ESTADO_LABEL[s.estado]}</span>
                    {s.estado === 'rechazada' && s.motivo_rechazo && (
                      <p className="text-xs text-gray-400 mt-1">{s.motivo_rechazo}</p>
                    )}
                  </td>
                  <td className="table-cell text-center">
                    <Link to={`/solicitudes/${s.id}`} className="text-primary-600 font-medium text-sm">
                      {s.estado === 'aprobada' || s.estado === 'entregada' ? 'Ver vale' : 'Ver'}
                    </Link>
                  </td>
                </tr>
              ))}
              {solicitudes.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">
                  Todavía no has hecho ningún pedido. <Link to="/solicitar" className="text-primary-600 font-medium">Solicitar material</Link>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
