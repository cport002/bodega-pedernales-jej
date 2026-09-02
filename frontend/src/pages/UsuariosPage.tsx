import { useEffect, useState } from 'react'
import api from '../services/api'
import type { Usuario } from '../types'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { Plus, Edit2, Trash2, Users } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const FORM_VACIO = { nombre: '', email: '', password: '', rol: 'bodeguero' as Usuario['rol'], activo: true }
const ROL_LABEL: Record<string, string> = { admin: 'Administrador', bodeguero: 'Bodeguero', visor: 'Visor', solicitante: 'Solicitante' }

export default function UsuariosPage() {
  const { usuario: yo } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [form, setForm] = useState(FORM_VACIO)

  const cargar = () => { api.get('/usuarios').then(r => { setUsuarios(r.data); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { cargar() }, [])

  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setShowForm(true) }
  const abrirEditar = (u: Usuario) => {
    setEditando(u)
    setForm({ nombre: u.nombre, email: u.email, password: '', rol: u.rol, activo: u.activo === 1 })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editando) {
        const { email, ...payload } = form
        await api.put(`/usuarios/${editando.id}`, payload)
        toast.success('Usuario actualizado')
      } else {
        await api.post('/usuarios', form)
        toast.success('Usuario creado')
      }
      setShowForm(false)
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al guardar')
    }
  }

  const handleEliminar = async (u: Usuario) => {
    if (!confirm(`¿Eliminar al usuario "${u.nombre}"?`)) return
    try {
      await api.delete(`/usuarios/${u.id}`)
      toast.success('Usuario eliminado')
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        subtitle={`${usuarios.length} usuario${usuarios.length !== 1 ? 's' : ''} del sistema`}
        icon={Users}
        actions={(
          <button onClick={abrirNuevo}
            className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo Usuario
          </button>
        )}
      />

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Nombre</th>
                <th className="table-header">Email</th>
                <th className="table-header">Rol</th>
                <th className="table-header text-center">Activo</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className={`table-row ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="table-cell font-medium">{u.nombre}</td>
                  <td className="table-cell">{u.email}</td>
                  <td className="table-cell"><span className="badge-gray">{ROL_LABEL[u.rol] || u.rol}</span></td>
                  <td className="table-cell text-center">
                    <span className={u.activo ? 'badge-green' : 'badge-gray'}>{u.activo ? 'SI' : 'NO'}</span>
                  </td>
                  <td className="table-cell text-center">
                    <div className="flex gap-2 justify-center">
                      <button onClick={() => abrirEditar(u)} className="text-gray-400 hover:text-primary-600 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.id !== yo?.id && (
                        <button onClick={() => handleEliminar(u)} className="text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Sin usuarios para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="p-6 border-b border-gray-200"><h2>{editando ? 'Editar Usuario' : 'Nuevo Usuario'}</h2></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="label">Nombre *</label>
                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email} disabled={!!editando}
                  onChange={e => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Rol *</label>
                  <select className="input" value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value as any })}>
                    <option value="solicitante">Solicitante</option>
                    <option value="visor">Visor</option>
                    <option value="bodeguero">Bodeguero</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div>
                  <label className="label">{editando ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</label>
                  <input type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required={!editando} />
                </div>
              </div>
              {editando && (
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="activo" checked={form.activo} onChange={e => setForm({ ...form, activo: e.target.checked })} />
                  <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editando ? 'Guardar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
