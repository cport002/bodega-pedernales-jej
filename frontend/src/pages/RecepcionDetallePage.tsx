import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { Recepcion } from '../types'
import { PackagePlus } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function RecepcionDetallePage() {
  const { id } = useParams()
  const [recepcion, setRecepcion] = useState<Recepcion | null>(null)

  useEffect(() => {
    api.get(`/recepciones/${id}`).then(r => setRecepcion(r.data))
  }, [id])

  if (!recepcion) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  return (
    <div className="space-y-6">
      <PageHeader title={`Recepción — Guía ${recepcion.n_guia || recepcion.id}`} subtitle={fmt.fecha(recepcion.fecha_recepcion)} icon={PackagePlus} />

      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="label mb-0.5">Proveedor</p><p className="font-medium text-gray-800">{recepcion.proveedor_nombre || '-'}</p></div>
        <div><p className="label mb-0.5">Orden de compra</p><p className="font-medium text-gray-800">{recepcion.orden_compra || '-'}</p></div>
        <div><p className="label mb-0.5">Contrato</p><p className="font-medium text-gray-800">{recepcion.contrato || '-'}</p></div>
        <div><p className="label mb-0.5">PM</p><p className="font-medium text-gray-800">{recepcion.pm || '-'}</p></div>
        {recepcion.observaciones && <div className="col-span-full"><p className="label mb-0.5">Observaciones</p><p className="font-medium text-gray-800">{recepcion.observaciones}</p></div>}
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Lote</th>
              <th className="table-header">Descripción</th>
              <th className="table-header text-right">Recepcionado</th>
              <th className="table-header text-right">Stock actual</th>
              <th className="table-header">Ubicación</th>
              <th className="table-header">Pallet</th>
              <th className="table-header text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {recepcion.lotes?.map(l => (
              <tr key={l.id} className="table-row">
                <td className="table-cell"><Link to={`/lotes/${l.id}`} className="font-medium text-primary-600">{l.codigo}</Link></td>
                <td className="table-cell">{l.descripcion}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(l.cantidad_recepcionada)} {l.unidad}</td>
                <td className="table-cell text-right tabular-nums">{fmt.num(l.stock_actual)} {l.unidad}</td>
                <td className="table-cell">{l.ubicacion_1}</td>
                <td className="table-cell">{l.pallet_numero}</td>
                <td className="table-cell text-center">
                  <span className={l.estado === 'activo' ? 'badge-green' : 'badge-gray'}>{l.estado}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
