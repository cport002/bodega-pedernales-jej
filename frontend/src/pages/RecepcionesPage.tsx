import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Recepcion } from '../types'
import { useAuth } from '../hooks/useAuth'
import { PackagePlus, Plus } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function RecepcionesPage() {
  const { puedeOperar } = useAuth()
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/recepciones').then(r => { setRecepciones(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recepciones"
        subtitle={`${recepciones.length} guía${recepciones.length !== 1 ? 's' : ''} de recepción registradas`}
        icon={PackagePlus}
        actions={puedeOperar ? (
          <Link to="/recepciones/nueva" className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nueva Recepción
          </Link>
        ) : undefined}
      />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">N° Guía</th>
                <th className="table-header">OC</th>
                <th className="table-header">Contrato</th>
                <th className="table-header">Proveedor</th>
                <th className="table-header text-right">Ítems</th>
                <th className="table-header">Registrado por</th>
              </tr>
            </thead>
            <tbody>
              {recepciones.map(r => (
                <tr key={r.id} className="table-row cursor-pointer">
                  <td className="table-cell"><Link to={`/recepciones/${r.id}`} className="block">{fmt.fecha(r.fecha_recepcion)}</Link></td>
                  <td className="table-cell"><Link to={`/recepciones/${r.id}`} className="block font-medium text-primary-600">{r.n_guia || '-'}</Link></td>
                  <td className="table-cell">{r.orden_compra || '-'}</td>
                  <td className="table-cell">{r.contrato || '-'}</td>
                  <td className="table-cell">{r.proveedor_nombre || '-'}</td>
                  <td className="table-cell text-right tabular-nums">{r.total_lotes}</td>
                  <td className="table-cell">{r.usuario_nombre || '-'}</td>
                </tr>
              ))}
              {recepciones.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin recepciones registradas todavía</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
