import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Solicitud } from '../types'
import { ClipboardList } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const ESTADO_BADGE: Record<string, string> = { pendiente: 'badge-amber', aprobada: 'badge-green', rechazada: 'badge-red' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')

  useEffect(() => {
    setLoading(true)
    api.get('/solicitudes', { params: filtroEstado ? { estado: filtroEstado } : {} })
      .then(r => { setSolicitudes(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filtroEstado])

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes de Material" subtitle={`${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''}`} icon={ClipboardList} />

      <div className="card flex items-end gap-4">
        <div className="min-w-[200px]">
          <label className="label">Estado</label>
          <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">Solicitante</th>
                <th className="table-header">Material</th>
                <th className="table-header text-right">Cantidad</th>
                <th className="table-header">Frente destino</th>
                <th className="table-header">Estado</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id} className="table-row">
                  <td className="table-cell">{fmt.fechaHora(s.fecha_solicitud)}</td>
                  <td className="table-cell">{s.solicitante_nombre}</td>
                  <td className="table-cell font-medium">{s.material_descripcion}</td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(s.cantidad_solicitada)} {s.unidad}</td>
                  <td className="table-cell">{s.frente_destino || '-'}</td>
                  <td className="table-cell"><span className={ESTADO_BADGE[s.estado]}>{ESTADO_LABEL[s.estado]}</span></td>
                  <td className="table-cell text-center">
                    <Link to={`/solicitudes/${s.id}`} className="text-primary-600 font-medium text-sm">Ver</Link>
                  </td>
                </tr>
              ))}
              {solicitudes.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin solicitudes para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
