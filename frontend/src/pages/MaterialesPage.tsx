import { useEffect, useState } from 'react'
import api from '../services/api'
import type { Material } from '../types'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { Plus, Edit2, Package, Search } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const FORM_VACIO = { descripcion: '', especialidad: '', diametro_1: '', diametro_2: '', unidad: 'C/U', peso_unidad_kg: '' }

export default function MaterialesPage() {
  const { puedeOperar } = useAuth()
  const [materiales, setMateriales] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Material | null>(null)
  const [form, setForm] = useState(FORM_VACIO)

  const cargar = () => {
    setLoading(true)
    api.get('/materiales', { params: busqueda ? { busqueda } : {} }).then(r => { setMateriales(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { cargar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirNuevo = () => { setEditando(null); setForm(FORM_VACIO); setShowForm(true) }
  const abrirEditar = (m: Material) => {
    setEditando(m)
    setForm({
      descripcion: m.descripcion, especialidad: m.especialidad || '', diametro_1: m.diametro_1 || '',
      diametro_2: m.diametro_2 || '', unidad: m.unidad, peso_unidad_kg: m.peso_unidad_kg ? String(m.peso_unidad_kg) : ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...form, peso_unidad_kg: form.peso_unidad_kg ? Number(form.peso_unidad_kg) : null }
      if (editando) {
        await api.put(`/materiales/${editando.id}`, payload)
        toast.success('Material actualizado')
      } else {
        await api.post('/materiales', payload)
        toast.success('Material creado')
      }
      setShowForm(false)
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al guardar')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materiales"
        subtitle={`${materiales.length} material${materiales.length !== 1 ? 'es' : ''} en el catálogo`}
        icon={Package}
        actions={puedeOperar ? (
          <button onClick={abrirNuevo} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo Material
          </button>
        ) : undefined}
      />

      <form onSubmit={e => { e.preventDefault(); cargar() }} className="card flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[240px]">
          <label className="label">Buscar por descripción o especialidad</label>
          <input className="input" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="BRIDA SLIP-ON, PIPING..." />
        </div>
        <button type="submit" className="btn-primary flex items-center gap-2"><Search className="w-4 h-4" /> Buscar</button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Descripción</th>
                <th className="table-header">Especialidad</th>
                <th className="table-header">Diámetro 1</th>
                <th className="table-header">Diámetro 2</th>
                <th className="table-header">Unidad</th>
                <th className="table-header text-right">Peso unit. (kg)</th>
                {puedeOperar && <th className="table-header text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {materiales.map(m => (
                <tr key={m.id} className="table-row">
                  <td className="table-cell font-medium">{m.descripcion}</td>
                  <td className="table-cell">{m.especialidad}</td>
                  <td className="table-cell">{m.diametro_1}</td>
                  <td className="table-cell">{m.diametro_2}</td>
                  <td className="table-cell">{m.unidad}</td>
                  <td className="table-cell text-right tabular-nums">{m.peso_unidad_kg ?? '-'}</td>
                  {puedeOperar && (
                    <td className="table-cell text-center">
                      <button onClick={() => abrirEditar(m)} className="text-gray-400 hover:text-primary-600 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {materiales.length === 0 && (
                <tr><td colSpan={7} className="table-cell text-center text-gray-400 py-8">Sin materiales para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
            <div className="p-6 border-b border-gray-200"><h2>{editando ? 'Editar Material' : 'Nuevo Material'}</h2></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="label">Descripción *</label>
                <input className="input" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Especialidad</label>
                  <input className="input" value={form.especialidad} onChange={e => setForm({ ...form, especialidad: e.target.value })} placeholder="PIPING, ELECTRICA..." />
                </div>
                <div>
                  <label className="label">Unidad</label>
                  <input className="input" value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Diámetro 1</label>
                  <input className="input" value={form.diametro_1} onChange={e => setForm({ ...form, diametro_1: e.target.value })} />
                </div>
                <div>
                  <label className="label">Diámetro 2</label>
                  <input className="input" value={form.diametro_2} onChange={e => setForm({ ...form, diametro_2: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Peso unitario (kg)</label>
                <input type="number" step="0.01" className="input" value={form.peso_unidad_kg} onChange={e => setForm({ ...form, peso_unidad_kg: e.target.value })} />
              </div>
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
