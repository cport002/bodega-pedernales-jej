import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, PackageCheck, PackageX, PackagePlus } from 'lucide-react'
import api, { fmt } from '../services/api'
import type { Notificacion } from '../types'

const ICONO: Record<Notificacion['tipo'], any> = {
  solicitud_nueva: PackagePlus,
  solicitud_aprobada: PackageCheck,
  solicitud_rechazada: PackageX,
}
const COLOR: Record<Notificacion['tipo'], string> = {
  solicitud_nueva: 'text-blue-600 bg-blue-50',
  solicitud_aprobada: 'text-emerald-600 bg-emerald-50',
  solicitud_rechazada: 'text-red-600 bg-red-50',
}

interface Props {
  claro?: boolean // true = fondo oscuro detrás (icono blanco), false/undefined = fondo claro
}

export default function NotificacionesBell({ claro }: Props) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [items, setItems] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const cargarCount = () => api.get('/notificaciones/count').then(r => setNoLeidas(r.data.total)).catch(() => {})
  const cargarLista = () => api.get('/notificaciones').then(r => setItems(r.data)).catch(() => {})

  useEffect(() => {
    cargarCount()
    const t = setInterval(cargarCount, 45000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (abierto) cargarLista()
  }, [abierto])

  useEffect(() => {
    const onClickFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const abrirNotificacion = async (n: Notificacion) => {
    if (!n.leida) {
      await api.put(`/notificaciones/${n.id}/leer`).catch(() => {})
      setNoLeidas(c => Math.max(0, c - 1))
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: 1 } : x))
    }
    setAbierto(false)
    if (n.solicitud_id) navigate(`/solicitudes/${n.solicitud_id}`)
  }

  const marcarTodasLeidas = async () => {
    await api.put('/notificaciones/leer-todas').catch(() => {})
    setNoLeidas(0)
    setItems(prev => prev.map(x => ({ ...x, leida: 1 })))
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${claro ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-primary-600 hover:bg-gray-100'}`}>
        <Bell size={20} />
        {noLeidas > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="font-semibold text-gray-800 text-sm">Notificaciones</p>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                <Check size={13} /> Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 && (
              <p className="text-center text-sm text-gray-400 py-8">Sin notificaciones</p>
            )}
            {items.map(n => {
              const Icon = ICONO[n.tipo]
              return (
                <button key={n.id} onClick={() => abrirNotificacion(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${!n.leida ? 'bg-primary-50/40' : ''}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${COLOR[n.tipo]}`}>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm leading-tight ${!n.leida ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.titulo}</span>
                    {n.mensaje && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{n.mensaje}</span>}
                    <span className="block text-[10px] text-gray-400 mt-1">{fmt.fechaHora(n.fecha)}</span>
                  </span>
                  {!n.leida && <span className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0 mt-1.5" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
