import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { PycEmpresa, PycPersonal, PycEquipo, PycReporteDiario } from '../types'
import { useAuth } from '../hooks/useAuth'
import { Building2, Plus, Users, Truck, CalendarDays, X, FileText } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import toast from 'react-hot-toast'

type Tab = 'reportes' | 'personal' | 'equipos'

export default function PycEmpresaDetallePage() {
  const { empresaId } = useParams()
  const { puedeOperar, esContratista } = useAuth()
  const [empresa, setEmpresa] = useState<PycEmpresa | null>(null)
  const [personal, setPersonal] = useState<PycPersonal[]>([])
  const [equipos, setEquipos] = useState<PycEquipo[]>([])
  const [reportes, setReportes] = useState<PycReporteDiario[]>([])
  const [tab, setTab] = useState<Tab>('reportes')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const cargarEmpresa = () => api.get('/pyc/empresas').then(r => setEmpresa(r.data.find((e: PycEmpresa) => String(e.id) === empresaId) || r.data[0] || null)).catch(() => {})
  const cargarPersonal = () => api.get(`/pyc/empresas/${empresaId}/personal`).then(r => setPersonal(r.data)).catch(() => {})
  const cargarEquipos = () => api.get(`/pyc/empresas/${empresaId}/equipos`).then(r => setEquipos(r.data)).catch(() => {})
  const cargarReportes = () => {
    const params: Record<string, string> = {}
    if (desde) params.desde = desde
    if (hasta) params.hasta = hasta
    api.get(`/pyc/empresas/${empresaId}/reportes`, { params }).then(r => setReportes(r.data)).catch(() => {})
  }

  useEffect(() => { cargarEmpresa(); cargarPersonal(); cargarEquipos() }, [empresaId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargarReportes() }, [empresaId, desde, hasta]) // eslint-disable-line react-hooks/exhaustive-deps

  const puedeGestionar = puedeOperar || esContratista

  return (
    <div className="space-y-6">
      <PageHeader
        title={empresa?.nombre || 'Empresa P&C'}
        subtitle={empresa?.contrato ? `Contrato ${empresa.contrato}` : 'Control diario de avance'}
        icon={Building2}
        actions={puedeGestionar && (
          <Link to={`/pyc/${empresaId}/reportes/nuevo`} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo Reporte Diario
          </Link>
        )} />

      <div className="flex gap-2 border-b border-gray-200">
        {([
          { id: 'reportes', label: 'Reportes Diarios', icon: CalendarDays },
          { id: 'personal', label: `Personal (${personal.length})`, icon: Users },
          { id: 'equipos', label: `Equipos (${equipos.length})`, icon: Truck },
        ] as { id: Tab; label: string; icon: typeof Users }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors
              ${tab === t.id ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'reportes' && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-end gap-4">
            <div className="min-w-[160px]">
              <label className="label">Desde</label>
              <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} />
            </div>
            <div className="min-w-[160px]">
              <label className="label">Hasta</label>
              <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Frente</th>
                  <th className="table-header text-right">Presentes</th>
                  <th className="table-header text-right">HH del día</th>
                  <th className="table-header">Cargado por</th>
                  <th className="table-header text-center">Ver</th>
                </tr>
              </thead>
              <tbody>
                {reportes.map(r => (
                  <tr key={r.id} className="table-row">
                    <td className="table-cell font-medium">{fmt.fecha(r.fecha)}</td>
                    <td className="table-cell">{r.frente_destino || '-'}</td>
                    <td className="table-cell text-right tabular-nums">{r.presentes ?? 0}</td>
                    <td className="table-cell text-right tabular-nums">{r.hh_totales ?? 0}</td>
                    <td className="table-cell">{r.creado_por_nombre}</td>
                    <td className="table-cell text-center">
                      <Link to={`/pyc/${empresaId}/reportes/${r.id}`} className="text-primary-600 inline-block"><FileText className="w-4 h-4" /></Link>
                    </td>
                  </tr>
                ))}
                {reportes.length === 0 && (
                  <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Sin reportes diarios para mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'personal' && (
        <PersonalTab empresaId={empresaId!} personal={personal} puedeGestionar={puedeGestionar} onCambio={cargarPersonal} />
      )}

      {tab === 'equipos' && (
        <EquiposTab empresaId={empresaId!} equipos={equipos} puedeGestionar={puedeGestionar} onCambio={cargarEquipos} />
      )}
    </div>
  )
}

const TIPO_LABEL: Record<string, string> = { directo: 'Directo', indirecto: 'Indirecto' }

function PersonalTab({ empresaId, personal, puedeGestionar, onCambio }: { empresaId: string; personal: PycPersonal[]; puedeGestionar: boolean; onCambio: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', rut: '', cargo: '', turno: '', tipo: 'directo' as 'directo' | 'indirecto' })

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/pyc/empresas/${empresaId}/personal`, form)
      toast.success('Persona agregada a la nómina')
      setForm({ nombre: '', rut: '', cargo: '', turno: '', tipo: 'directo' })
      setShowForm(false)
      onCambio()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error al agregar') }
  }

  const cambiarActivo = async (p: PycPersonal) => {
    try { await api.put(`/pyc/personal/${p.id}`, { activo: !p.activo }); onCambio() } catch { toast.error('Error al actualizar') }
  }

  return (
    <div className="space-y-4">
      {puedeGestionar && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(true)} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar Persona</button>
        </div>
      )}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Nombre</th>
              <th className="table-header">RUT</th>
              <th className="table-header">Cargo</th>
              <th className="table-header">Turno</th>
              <th className="table-header">Tipo</th>
              {puedeGestionar && <th className="table-header text-center">Activo</th>}
            </tr>
          </thead>
          <tbody>
            {personal.map(p => (
              <tr key={p.id} className={`table-row ${!p.activo ? 'opacity-50' : ''}`}>
                <td className="table-cell font-medium">{p.nombre}</td>
                <td className="table-cell">{p.rut || '-'}</td>
                <td className="table-cell">{p.cargo || '-'}</td>
                <td className="table-cell">{p.turno || '-'}</td>
                <td className="table-cell"><span className="badge-gray">{TIPO_LABEL[p.tipo]}</span></td>
                {puedeGestionar && (
                  <td className="table-cell text-center">
                    <button onClick={() => cambiarActivo(p)} className={p.activo ? 'badge-green' : 'badge-gray'}>{p.activo ? 'Sí' : 'No'}</button>
                  </td>
                )}
              </tr>
            ))}
            {personal.length === 0 && (
              <tr><td colSpan={6} className="table-cell text-center text-gray-400 py-8">Sin personal en la nómina todavía</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2>Agregar Persona</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={agregar} className="p-6 space-y-4">
              <div>
                <label className="label">Nombre completo *</label>
                <input className="input" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">RUT</label>
                  <input className="input" value={form.rut} onChange={e => setForm({ ...form, rut: e.target.value })} />
                </div>
                <div>
                  <label className="label">Turno</label>
                  <input className="input" placeholder="4x3, 14x14..." value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Cargo</label>
                  <input className="input" value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} />
                </div>
                <div>
                  <label className="label">Tipo</label>
                  <select className="input" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value as any })}>
                    <option value="directo">Directo</option>
                    <option value="indirecto">Indirecto</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EquiposTab({ empresaId, equipos, puedeGestionar, onCambio }: { empresaId: string; equipos: PycEquipo[]; puedeGestionar: boolean; onCambio: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', patente: '', area_trabajo: '' })

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post(`/pyc/empresas/${empresaId}/equipos`, form)
      toast.success('Equipo agregado')
      setForm({ nombre: '', patente: '', area_trabajo: '' })
      setShowForm(false)
      onCambio()
    } catch (err: any) { toast.error(err.response?.data?.error || 'Error al agregar') }
  }

  const cambiarActivo = async (eq: PycEquipo) => {
    try { await api.put(`/pyc/equipos/${eq.id}`, { activo: !eq.activo }); onCambio() } catch { toast.error('Error al actualizar') }
  }

  return (
    <div className="space-y-4">
      {puedeGestionar && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(true)} className="btn-secondary flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar Equipo</button>
        </div>
      )}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Equipo</th>
              <th className="table-header">Patente / N°</th>
              <th className="table-header">Área de trabajo</th>
              {puedeGestionar && <th className="table-header text-center">Activo</th>}
            </tr>
          </thead>
          <tbody>
            {equipos.map(eq => (
              <tr key={eq.id} className={`table-row ${!eq.activo ? 'opacity-50' : ''}`}>
                <td className="table-cell font-medium">{eq.nombre}</td>
                <td className="table-cell">{eq.patente || '-'}</td>
                <td className="table-cell">{eq.area_trabajo || '-'}</td>
                {puedeGestionar && (
                  <td className="table-cell text-center">
                    <button onClick={() => cambiarActivo(eq)} className={eq.activo ? 'badge-green' : 'badge-gray'}>{eq.activo ? 'Sí' : 'No'}</button>
                  </td>
                )}
              </tr>
            ))}
            {equipos.length === 0 && (
              <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-8">Sin equipos registrados todavía</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2>Agregar Equipo</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={agregar} className="p-6 space-y-4">
              <div>
                <label className="label">Equipo / Maquinaria *</label>
                <input className="input" placeholder="Camioneta Toyota, Minicargador..." value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <label className="label">Patente / N° de equipo</label>
                <input className="input" value={form.patente} onChange={e => setForm({ ...form, patente: e.target.value })} />
              </div>
              <div>
                <label className="label">Área de trabajo</label>
                <input className="input" value={form.area_trabajo} onChange={e => setForm({ ...form, area_trabajo: e.target.value })} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
