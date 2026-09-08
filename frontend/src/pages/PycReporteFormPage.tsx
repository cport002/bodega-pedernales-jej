import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import type { PycPersonal, PycEquipo, PycAsistencia, PycUsoEquipo, PycEstadoAsistencia } from '../types'
import { CalendarCheck2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import toast from 'react-hot-toast'

const ESTADOS: { value: PycEstadoAsistencia; label: string }[] = [
  { value: 'presente', label: 'Presente' },
  { value: 'descanso', label: 'Descanso' },
  { value: 'licencia', label: 'Licencia' },
  { value: 'permiso', label: 'Permiso' },
  { value: 'falta', label: 'Falta' },
]

export default function PycReporteFormPage() {
  const { empresaId, reporteId } = useParams()
  const navigate = useNavigate()
  const editando = !!reporteId

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [frenteDestino, setFrenteDestino] = useState('')
  const [obsSsoma, setObsSsoma] = useState('')
  const [obsGenerales, setObsGenerales] = useState('')
  const [asistencia, setAsistencia] = useState<Record<number, PycAsistencia>>({})
  const [equiposUso, setEquiposUso] = useState<Record<number, PycUsoEquipo>>({})
  const [personalRoster, setPersonalRoster] = useState<PycPersonal[]>([])
  const [equiposRoster, setEquiposRoster] = useState<PycEquipo[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const [rPersonal, rEquipos] = await Promise.all([
        api.get(`/pyc/empresas/${empresaId}/personal`),
        api.get(`/pyc/empresas/${empresaId}/equipos`),
      ])
      const personal: PycPersonal[] = rPersonal.data.filter((p: PycPersonal) => p.activo)
      const equipos: PycEquipo[] = rEquipos.data.filter((e: PycEquipo) => e.activo)
      setPersonalRoster(personal)
      setEquiposRoster(equipos)

      if (editando) {
        const r = await api.get(`/pyc/reportes/${reporteId}`)
        const rep = r.data
        setFecha(rep.fecha.slice(0, 10))
        setFrenteDestino(rep.frente_destino || '')
        setObsSsoma(rep.observaciones_ssoma || '')
        setObsGenerales(rep.observaciones_generales || '')
        const asis: Record<number, PycAsistencia> = {}
        for (const p of personal) asis[p.id] = { personal_id: p.id, estado: 'presente', hh: 12 }
        for (const a of rep.asistencia || []) asis[a.personal_id] = { personal_id: a.personal_id, estado: a.estado, hh: a.hh }
        setAsistencia(asis)
        const eq: Record<number, PycUsoEquipo> = {}
        for (const e of equipos) eq[e.id] = { equipo_id: e.id, disponible: true, hh_operativas: 0 }
        for (const u of rep.equipos || []) eq[u.equipo_id] = { equipo_id: u.equipo_id, disponible: u.disponible, hh_operativas: u.hh_operativas, observaciones: u.observaciones }
        setEquiposUso(eq)
      } else {
        const asis: Record<number, PycAsistencia> = {}
        for (const p of personal) asis[p.id] = { personal_id: p.id, estado: 'presente', hh: 12 }
        setAsistencia(asis)
        const eq: Record<number, PycUsoEquipo> = {}
        for (const e of equipos) eq[e.id] = { equipo_id: e.id, disponible: true, hh_operativas: 0 }
        setEquiposUso(eq)
      }
      setCargando(false)
    }
    cargar()
  }, [empresaId, reporteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const setEstado = (personalId: number, estado: PycEstadoAsistencia) => {
    setAsistencia(prev => ({ ...prev, [personalId]: { ...prev[personalId], estado, hh: estado === 'presente' ? (prev[personalId]?.hh || 12) : 0 } }))
  }
  const setHH = (personalId: number, hh: string) => {
    setAsistencia(prev => ({ ...prev, [personalId]: { ...prev[personalId], hh: Number(hh) || 0 } }))
  }
  const setDisponible = (equipoId: number, disponible: boolean) => {
    setEquiposUso(prev => ({ ...prev, [equipoId]: { ...prev[equipoId], disponible } }))
  }
  const setHHEquipo = (equipoId: number, hh: string) => {
    setEquiposUso(prev => ({ ...prev, [equipoId]: { ...prev[equipoId], hh_operativas: Number(hh) || 0 } }))
  }
  const setObsEquipo = (equipoId: number, observaciones: string) => {
    setEquiposUso(prev => ({ ...prev, [equipoId]: { ...prev[equipoId], observaciones } }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const body = {
      fecha,
      frente_destino: frenteDestino || null,
      observaciones_ssoma: obsSsoma || null,
      observaciones_generales: obsGenerales || null,
      asistencia: Object.values(asistencia),
      equipos: Object.values(equiposUso),
    }
    try {
      if (editando) {
        await api.put(`/pyc/reportes/${reporteId}`, body)
        toast.success('Reporte actualizado')
        navigate(`/pyc/${empresaId}/reportes/${reporteId}`)
      } else {
        const r = await api.post(`/pyc/empresas/${empresaId}/reportes`, body)
        toast.success('Reporte diario cargado')
        navigate(`/pyc/${empresaId}/reportes/${r.data.id}`)
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al guardar el reporte')
    } finally { setGuardando(false) }
  }

  if (cargando) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  const presentes = Object.values(asistencia).filter(a => a.estado === 'presente').length
  const hhTotales = Object.values(asistencia).reduce((s, a) => s + (Number(a.hh) || 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader title={editando ? 'Editar Reporte Diario' : 'Nuevo Reporte Diario'} subtitle="Dotación, equipos y observaciones del día" icon={CalendarCheck2} />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Fecha *</label>
            <input type="date" className="input" value={fecha} onChange={e => setFecha(e.target.value)} disabled={editando} required />
          </div>
          <div className="md:col-span-2">
            <label className="label">Frente / área de trabajo</label>
            <input className="input" value={frenteDestino} onChange={e => setFrenteDestino(e.target.value)} />
          </div>
        </div>

        {personalRoster.length > 0 && (
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3>Personal ({presentes} presentes de {personalRoster.length} · {hhTotales} HH)</h3>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Cargo</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header text-right w-32">HH</th>
                </tr>
              </thead>
              <tbody>
                {personalRoster.map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell font-medium">{p.nombre}</td>
                    <td className="table-cell">{p.cargo || '-'}</td>
                    <td className="table-cell">
                      <select className="input" value={asistencia[p.id]?.estado || 'presente'} onChange={e => setEstado(p.id, e.target.value as PycEstadoAsistencia)}>
                        {ESTADOS.map(es => <option key={es.value} value={es.value}>{es.label}</option>)}
                      </select>
                    </td>
                    <td className="table-cell text-right">
                      <input type="number" min={0} step="0.5" className="input text-right"
                        value={asistencia[p.id]?.hh ?? 0} onChange={e => setHH(p.id, e.target.value)}
                        disabled={asistencia[p.id]?.estado !== 'presente'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {personalRoster.length === 0 && (
          <div className="card text-center text-gray-400 py-6">
            Esta empresa todavía no tiene personal en la nómina — agrégalo en la pestaña "Personal" antes de cargar el reporte.
          </div>
        )}

        {equiposRoster.length > 0 && (
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <div className="p-4 border-b border-gray-100"><h3>Equipos y Maquinaria</h3></div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Equipo</th>
                  <th className="table-header text-center w-28">Disponible</th>
                  <th className="table-header text-right w-32">HH Operativas</th>
                  <th className="table-header">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {equiposRoster.map(eq => (
                  <tr key={eq.id} className="table-row">
                    <td className="table-cell font-medium">{eq.nombre}{eq.patente ? ` · ${eq.patente}` : ''}</td>
                    <td className="table-cell text-center">
                      <input type="checkbox" checked={equiposUso[eq.id]?.disponible ?? true} onChange={e => setDisponible(eq.id, e.target.checked)} />
                    </td>
                    <td className="table-cell text-right">
                      <input type="number" min={0} step="0.5" className="input text-right"
                        value={equiposUso[eq.id]?.hh_operativas ?? 0} onChange={e => setHHEquipo(eq.id, e.target.value)} />
                    </td>
                    <td className="table-cell">
                      <input className="input" value={equiposUso[eq.id]?.observaciones || ''} onChange={e => setObsEquipo(eq.id, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card space-y-4">
          <div>
            <label className="label">Observaciones SSOMA (seguridad, incidentes, capacitaciones)</label>
            <textarea className="input" rows={3} value={obsSsoma} onChange={e => setObsSsoma(e.target.value)} />
          </div>
          <div>
            <label className="label">Observaciones generales del día</label>
            <textarea className="input" rows={3} value={obsGenerales} onChange={e => setObsGenerales(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : editando ? 'Guardar Cambios' : 'Cargar Reporte'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
