import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { ResumenReportes } from '../types'
import PageHeader from '../components/ui/PageHeader'
import { LayoutDashboard, Package, Boxes, PackageX, PackageMinus, Undo2, AlertTriangle, ClipboardCheck } from 'lucide-react'

export default function DashboardPage() {
  const [resumen, setResumen] = useState<ResumenReportes | null>(null)

  useEffect(() => {
    api.get('/reportes/resumen').then(r => setResumen(r.data))
  }, [])

  // "Material" acá = cada fila/ítem recepcionado (lo que la planilla original llama "material" y el
  // sistema internamente llama "lote"), NO la tabla de descripciones únicas del catálogo — esa es
  // una agrupación técnica interna que no corresponde a como se cuentan los materiales en bodega.
  const totalMaterialesReales = Number(resumen?.totalLotesActivos ?? 0) + Number(resumen?.totalLotesInactivos ?? 0)
  const tarjetas = [
    { to: '/lotes', icon: Package, label: 'Materiales', valor: resumen ? totalMaterialesReales : undefined, color: 'from-amber-600 to-orange-500' },
    { to: '/lotes', icon: Boxes, label: 'Materiales activos', valor: resumen?.totalLotesActivos, color: 'from-slate-700 to-slate-500' },
    { to: '/lotes', icon: PackageX, label: 'Materiales inactivos', valor: resumen?.totalLotesInactivos, color: 'from-gray-600 to-gray-400' },
    { to: '/inventarios', icon: ClipboardCheck, label: 'Inventarios registrados', valor: resumen?.totalInventarios, color: 'from-sky-700 to-sky-500' },
    { to: '/despachos', icon: PackageMinus, label: 'Despachos registrados', valor: resumen?.totalDespachos, color: 'from-orange-700 to-amber-600' },
    { to: '/devoluciones', icon: Undo2, label: 'Devoluciones registradas', valor: resumen?.totalDevoluciones, color: 'from-teal-700 to-teal-500' },
    { to: '/reportes/ncr', icon: AlertTriangle, label: 'NCR / Novedades abiertas', valor: resumen?.ncrAbiertos, color: 'from-red-700 to-red-500' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Bodega Internacional Pedernales — JEJ Ingeniería" icon={LayoutDashboard} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tarjetas.map(t => (
          <Link key={t.label} to={t.to} className="card hover:shadow-card-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center flex-shrink-0`}>
                <t.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-black text-gray-900 tabular-nums">{t.valor !== undefined ? fmt.num(t.valor) : '…'}</p>
                <p className="text-xs text-gray-500 font-medium">{t.label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card">
        <h3 className="mb-3">Accesos rápidos</h3>
        <div className="flex flex-wrap gap-3">
          <Link to="/recepciones/nueva" className="btn-primary">Nueva Recepción</Link>
          <Link to="/lotes" className="btn-secondary">Buscar Lote / Escanear QR</Link>
          <Link to="/inventarios" className="btn-secondary">Registrar Inventario</Link>
        </div>
      </div>
    </div>
  )
}
