import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import type { PycEmpresa } from '../types'
import { useAuth } from '../hooks/useAuth'
import { CalendarCheck2, Plus, Building2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import toast from 'react-hot-toast'

const FORM_VACIO = { nombre: '', contrato: '' }

export default function PycEmpresasPage() {
  const { puedeOperar } = useAuth()
  const [empresas, setEmpresas] = useState<PycEmpresa[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)

  const cargar = () => { api.get('/pyc/empresas').then(r => { setEmpresas(r.data); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { cargar() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.post('/pyc/empresas', form)
      toast.success('Empresa creada')
      setShowForm(false)
      setForm(FORM_VACIO)
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al crear la empresa')
    } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="P&C - Programación y Control" subtitle="Control diario de empresas externas contratadas para un servicio en terreno" icon={CalendarCheck2}
        actions={puedeOperar && (
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nueva Empresa
          </button>
        )} />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empresas.map(emp => (
            <Link key={emp.id} to={`/pyc/${emp.id}`}
              className={`card hover:shadow-lg transition-shadow flex items-start gap-3 ${!emp.activa ? 'opacity-50' : ''}`}>
              <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-amber-700" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{emp.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{emp.contrato ? `Contrato ${emp.contrato}` : 'Sin N° de contrato'}</p>
                {!emp.activa && <span className="badge-gray mt-2 inline-block">Inactiva</span>}
              </div>
            </Link>
          ))}
          {empresas.length === 0 && (
            <div className="card text-center text-gray-400 py-8 col-span-full">
              Sin empresas registradas todavía{puedeOperar ? ' — crea la primera con el botón de arriba' : ''}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200"><h2>Nueva Empresa P&C</h2></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Nombre de la empresa *</label>
                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <label className="label">N° de contrato (opcional)</label>
                <input className="input" value={form.contrato} onChange={e => setForm({ ...form, contrato: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
