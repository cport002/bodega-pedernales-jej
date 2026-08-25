import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { InventarioSesion } from '../types'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function InventarioSesionDetallePage() {
  const { id } = useParams()
  const [sesion, setSesion] = useState<InventarioSesion | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/inventarios/sesiones/${id}`).then(r => { setSesion(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [id])

  if (loading) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
  if (!sesion) return <div className="text-center text-gray-400 py-12">Sesión de inventario no encontrada</div>

  return (
    <div className="space-y-6">
      <Link to="/inventarios" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" /> Volver a Inventarios
      </Link>

      <PageHeader
        title={sesion.etiqueta || `Sesión de inventario #${sesion.id}`}
        subtitle={`${fmt.fecha(sesion.fecha)} — registrado por ${sesion.usuario_nombre || '-'} — ${sesion.total_lotes} lote(s), ${sesion.con_diferencia} con diferencia`}
        icon={ClipboardCheck}
      />

      {sesion.observaciones && (
        <div className="card text-sm text-gray-700">{sesion.observaciones}</div>
      )}

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Lote</th>
              <th className="table-header">Material</th>
              <th className="table-header text-right">Contado</th>
              <th className="table-header text-right">Esperado</th>
              <th className="table-header text-right">Diferencia</th>
              <th className="table-header">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {(sesion.items || []).map(i => (
              <tr key={i.id} className="table-row">
                <td className="table-cell"><Link to={`/lotes/${i.lote_id}`} className="font-medium text-primary-600">{i.lote_codigo}</Link></td>
                <td className="table-cell">{i.material_descripcion}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(i.cantidad_inventariada)} {i.unidad}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(i.stock_esperado)} {i.unidad}</td>
                <td className="table-cell text-right tabular-nums">
                  <span className={i.diferencia === 0 ? 'badge-green' : 'badge-red'}>{i.diferencia > 0 ? '+' : ''}{fmt.num(i.diferencia)}</span>
                </td>
                <td className="table-cell text-xs">{i.observaciones || '-'}</td>
              </tr>
            ))}
            {(sesion.items || []).length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Sin lotes en esta sesión</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
