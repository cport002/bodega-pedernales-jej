import { useState } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import type { Usuario } from '../types'
import { Eye, EyeOff, ArrowRight, CheckCircle, Truck } from 'lucide-react'

interface Props {
  onLogin: (token: string, usuario: Usuario) => void
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      onLogin(data.token, data.usuario)
      toast.success(`Bienvenido, ${data.usuario.nombre}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-gray-100">
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden items-center justify-center p-16"
        style={{ background: 'linear-gradient(160deg, #451a03 0%, #b45309 60%, #d97706 100%)' }}
      >
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -right-4 top-1/3 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute right-20 -bottom-16 w-56 h-56 rounded-full bg-white/5" />

        <div className="relative z-10 max-w-md text-white">
          <div className="mb-12">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-8">
              <Truck className="w-8 h-8 text-white" />
            </div>

            <h1 className="text-4xl font-black leading-tight mb-4">
              <span className="text-amber-200">Bodega Internacional</span><br />
              <span className="text-amber-200">Pedernales</span>
            </h1>
            <p className="text-white/70 text-lg leading-relaxed">
              JEJ Ingeniería — Recepción, ubicación, despacho e inventario sin papel.
            </p>
          </div>

          <div className="space-y-3">
            {[
              'Recepción de materiales por guía y OC',
              'Ubicación y trazabilidad por pallet con QR',
              'Despacho y devolución con firma digital',
              'Inventario físico y reportes de stock',
            ].map(f => (
              <div key={f} className="flex items-center gap-3">
                <CheckCircle size={16} className="text-amber-200 flex-shrink-0" />
                <span className="text-white/80 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 xl:w-[45%] flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-lg bg-primary-600 flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-800 font-bold text-sm">Bodega Pedernales · JEJ</p>
              <p className="text-gray-400 text-xs">Bodega Internacional</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesión</h2>
            <p className="text-gray-400 text-sm">Ingresa tus credenciales para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@dominio.com"
                autoFocus
              />
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 mt-2 py-2.5 rounded-lg
                         font-bold text-sm text-white transition-all duration-150
                         disabled:opacity-40 active:scale-[.98] shadow-sm hover:shadow-md"
              style={{ background: 'linear-gradient(135deg, #b45309, #d97706)' }}
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Ingresando…</>
                : <>Ingresar <ArrowRight size={16} /></>
              }
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-gray-100">
            <p className="text-center text-gray-400 text-xs">
              Bodega Pedernales · JEJ Ingeniería — Acceso restringido
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
