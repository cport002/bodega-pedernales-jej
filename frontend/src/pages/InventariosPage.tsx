import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Inventario } from '../types'
import { ClipboardCheck } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function InventariosPage() {
  const [inventarios, setInventarios] = useState<Inventario[]>([])
  const [loading, setLoading] = useState(true)
  const [soloDiferencias, setSoloDiferencias] = useState(false)

  const cargar = () => {
    setLoading(true)
    api.get('/inventarios', { params: soloDiferencias ? { solo_diferencias: '1' } : {} })
      .then(r => { setInventarios(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [soloDiferencias]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <PageHeader title="Inventarios" subtitle={`${inventarios.length} conteo(s) registrados`} icon={ClipboardCheck}
        actions={
          <label className="flex items-center gap-2 text-white text-sm font-medium">
            <input type="checkbox" checked={soloDiferencias} onChange={e => setSoloDiferencias(e.target.checked)} />
            Solo con diferencias
          </label>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">Lote</th>
                <th className="table-header">Material</th>
                <th className="table-header text-right">Contado</th>
                <th className="table-header text-right">Esperado</th>
                <th className="table-header text-right">Diferencia</th>
                <th className="table-header">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {inventarios.map(i => (
                <tr key={i.id} className="table-row">
                  <td className="table-cell">{fmt.fechaHora(i.fecha)}</td>
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
              {inventarios.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin conteos registrados todavía</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
