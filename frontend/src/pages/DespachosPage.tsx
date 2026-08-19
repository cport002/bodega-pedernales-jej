import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Despacho } from '../types'
import { PackageMinus, FileText } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function DespachosPage() {
  const [despachos, setDespachos] = useState<Despacho[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/despachos').then(r => { setDespachos(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const verPdf = async (id: number) => {
    const r = await api.get(`/despachos/${id}/pdf`, { responseType: 'blob' })
    window.open(URL.createObjectURL(r.data), '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Despachos" subtitle={`${despachos.length} despacho(s) registrados`} icon={PackageMinus} />

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
                <th className="table-header text-right">Cantidad</th>
                <th className="table-header">Frente destino</th>
                <th className="table-header">Registrado por</th>
                <th className="table-header text-center">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {despachos.map(d => (
                <tr key={d.id} className="table-row">
                  <td className="table-cell">{fmt.fechaHora(d.fecha)}</td>
                  <td className="table-cell"><Link to={`/lotes/${d.lote_id}`} className="font-medium text-primary-600">{d.lote_codigo}</Link></td>
                  <td className="table-cell">{d.material_descripcion}</td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(d.cantidad)} {d.unidad}</td>
                  <td className="table-cell">{d.frente_destino || '-'}</td>
                  <td className="table-cell">{d.usuario_nombre || '-'}</td>
                  <td className="table-cell text-center">
                    {d.firma_url && (
                      <button onClick={() => verPdf(d.id)} className="text-gray-400 hover:text-primary-600 inline-block">
                        <FileText className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {despachos.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin despachos registrados todavía</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
