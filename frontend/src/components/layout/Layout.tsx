import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, Users, Truck, Boxes, PackagePlus, PackageMinus, Undo2, ClipboardCheck, LogOut, Menu, X, Search, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Usuario } from '../../types'
import toast from 'react-hot-toast'

interface Props {
  auth: {
    usuario: Usuario | null
    logout: () => void
    puedeOperar: boolean
    esAdmin: boolean
  }
}

export default function Layout({ auth }: Props) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/materiales', icon: Package, label: 'Materiales' },
    { to: '/recepciones', icon: PackagePlus, label: 'Recepciones' },
    { to: '/lotes', icon: Search, label: 'Buscar Lote / Stock' },
    { to: '/despachos', icon: PackageMinus, label: 'Despachos' },
    { to: '/devoluciones', icon: Undo2, label: 'Devoluciones' },
    { to: '/inventarios', icon: ClipboardCheck, label: 'Inventario' },
    { to: '/reportes/ncr', icon: AlertTriangle, label: 'NCR / Novedades' },
    ...(auth.esAdmin ? [{ to: '/usuarios', icon: Users, label: 'Usuarios' }] : []),
  ]

  const handleLogout = () => {
    auth.logout()
    navigate('/login')
    toast.success('Sesión cerrada')
  }

  const rolLabel: Record<string, string> = { admin: 'Administrador', bodeguero: 'Bodeguero', visor: 'Visor' }
  const inicial = auth.usuario?.nombre?.charAt(0).toUpperCase() ?? '?'

  const itemClass = ({ isActive }: { isActive: boolean }) => `
    relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold
    transition-all duration-150
    ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}
  `

  return (
    <div className="flex h-screen bg-gray-100">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-30 w-64
          flex flex-col shadow-sidebar
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ background: 'linear-gradient(180deg, #451a03 0%, #b45309 100%)' }}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight min-w-0">
            <p className="text-white font-bold text-sm tracking-wide truncate">JEJ Ingeniería</p>
            <p className="text-white/60 text-[10px] tracking-widest uppercase font-medium">Bodega Internacional Pedernales</p>
          </div>
          <button className="ml-auto lg:hidden text-white/70 hover:text-white" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, exact }) => (
            <NavLink key={to} to={to} end={exact} onClick={() => setSidebarOpen(false)} className={itemClass}>
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-amber-300 rounded-r-full" />}
                  <Icon size={18} className="flex-shrink-0" />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/10 mb-2">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary-600 font-bold text-sm flex-shrink-0">
              {inicial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate leading-tight">{auth.usuario?.nombre}</p>
              <p className="text-white/50 text-[11px]">{rolLabel[auth.usuario?.rol ?? 'visor']}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-all duration-150">
            <LogOut size={15} className="flex-shrink-0" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-primary-600 transition-colors">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Truck className="w-6 h-6 text-primary-600" />
            <span className="font-bold text-gray-800 text-sm truncate">Bodega Pedernales</span>
          </div>
        </div>

        <main className="flex-1 overflow-auto bg-gray-100 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
