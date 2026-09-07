import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Solicitud } from '../types'
import { ClipboardList, ScanLine, X } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import EscanearQrModal from '../components/EscanearQrModal'
import toast from 'react-hot-toast'

const ESTADO_BADGE: Record<string, string> = { pendiente: 'badge-amber', aprobada: 'badge-blue', entregada: 'badge-green', rechazada: 'badge-red' }
const ESTADO_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Vale listo', entregada: 'Entregada', rechazada: 'Rechazada' }

// Extrae el numero de solicitud de un folio tipo "SOL-000042" (leido por QR o escrito a mano) —
// alcanza con los digitos, no hace falta validar el prefijo exacto.
function idDesdeFolio(texto: string): number | null {
  const m = texto.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function EscanearValeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [showCamara, setShowCamara] = useState(false)
  const [folio, setFolio] = useState('')

  const irASolicitud = (texto: string) => {
    const id = idDesdeFolio(texto)
    if (!id) { toast.error('No se reconoce ese folio'); return }
    onClose()
    navigate(`/solicitudes/${id}`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-primary-600" /> Escanear Vale</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <button type="button" onClick={() => setShowCamara(true)} className="btn-primary w-full flex items-center justify-center gap-2">
            <ScanLine className="w-4 h-4" /> Escanear QR del vale
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-400"><div className="flex-1 h-px bg-gray-200" /> o si no se puede leer <div className="flex-1 h-px bg-gray-200" /></div>
          <form onSubmit={e => { e.preventDefault(); irASolicitud(folio) }} className="flex gap-2">
            <input className="input" placeholder="Folio, ej. SOL-000042" value={folio} onChange={e => setFolio(e.target.value)} />
            <button type="submit" className="btn-secondary whitespace-nowrap">Ir</button>
          </form>
        </div>
      </div>
      {showCamara && <EscanearQrModal onDetectado={irASolicitud} onClose={() => setShowCamara(false)} />}
    </div>
  )
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [showEscanear, setShowEscanear] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/solicitudes', { params: filtroEstado ? { estado: filtroEstado } : {} })
      .then(r => { setSolicitudes(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filtroEstado])

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitudes de Material" subtitle={`${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''}`} icon={ClipboardList}
        actions={
          <button onClick={() => setShowEscanear(true)} className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-primary-50 transition-colors shadow-sm">
            <ScanLine className="w-4 h-4" /> Escanear Vale
          </button>
        } />

      <div className="card flex items-end gap-4">
        <div className="min-w-[200px]">
          <label className="label">Estado</label>
          <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Vale emitido (sin retirar)</option>
            <option value="entregada">Entregadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>

      {showEscanear && <EscanearValeModal onClose={() => setShowEscanear(false)} />}

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
