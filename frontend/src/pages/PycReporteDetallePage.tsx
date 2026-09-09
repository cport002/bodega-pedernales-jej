import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api, { fmt, comprimirFoto } from '../services/api'
import type { PycReporteDiario } from '../types'
import { CalendarCheck2, Pencil, Camera } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

const ESTADO_LABEL: Record<string, string> = { presente: 'Presente', descanso: 'Descanso', licencia: 'Licencia', permiso: 'Permiso', falta: 'Falta' }
const ESTADO_BADGE: Record<string, string> = { presente: 'badge-green', descanso: 'badge-gray', licencia: 'badge-red', permiso: 'badge-amber', falta: 'badge-red' }

export default function PycReporteDetallePage() {
  const { empresaId, reporteId } = useParams()
  const { puedeOperar, esContratista } = useAuth()
  const [reporte, setReporte] = useState<PycReporteDiario | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const fotoRef = useRef<HTMLInputElement | null>(null)

  const cargar = () => api.get(`/pyc/reportes/${reporteId}`).then(r => setReporte(r.data))
  useEffect(() => { cargar() }, [reporteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const subirFotos = async () => {
    const archivos = fotoRef.current?.files
    if (!archivos || archivos.length === 0) return
    setSubiendo(true)
    try {
      const form = new FormData()
      for (const f of Array.from(archivos)) form.append('fotos', await comprimirFoto(f))
      await api.post(`/pyc/reportes/${reporteId}/fotos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('Fotos agregadas')
      if (fotoRef.current) fotoRef.current.value = ''
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al subir las fotos')
    } finally { setSubiendo(false) }
  }

  if (!reporte) return <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>

  const puedeEditar = puedeOperar || esContratista
  const presentes = reporte.asistencia?.filter(a => a.estado === 'presente').length ?? 0
  const hhTotales = reporte.asistencia?.reduce((s, a) => s + (Number(a.hh) || 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title={`Reporte Diario — ${fmt.fecha(reporte.fecha)}`} subtitle={reporte.frente_destino || 'Sin frente asignado'} icon={CalendarCheck2}
        actions={puedeEditar && (
          <Link to={`/pyc/${empresaId}/reportes/${reporteId}/editar`} className="inline-flex items-center gap-2 bg-white text-amber-700 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors shadow-sm">
            <Pencil className="w-4 h-4" /> Editar
          </Link>
        )} />

      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="label mb-0.5">Cargado por</p><p className="font-medium text-gray-800">{reporte.creado_por_nombre}</p></div>
        <div><p className="label mb-0.5">Presentes</p><p className="font-medium text-gray-800">{presentes} de {reporte.asistencia?.length ?? 0}</p></div>
        <div><p className="label mb-0.5">HH del día</p><p className="font-medium text-gray-800">{fmt.num(hhTotales)}</p></div>
        <div><p className="label mb-0.5">Equipos operativos</p><p className="font-medium text-gray-800">{reporte.equipos?.filter(e => e.disponible).length ?? 0} de {reporte.equipos?.length ?? 0}</p></div>
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <div className="p-4 border-b border-gray-100"><h3>Personal</h3></div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Nombre</th>
              <th className="table-header">Cargo</th>
              <th className="table-header">Estado</th>
              <th className="table-header text-right">HH</th>
            </tr>
          </thead>
          <tbody>
            {reporte.asistencia?.map(a => (
              <tr key={a.personal_id} className="table-row">
                <td className="table-cell font-medium">{a.personal_nombre}</td>
                <td className="table-cell">{a.cargo || '-'}</td>
                <td className="table-cell"><span className={ESTADO_BADGE[a.estado]}>{ESTADO_LABEL[a.estado]}</span></td>
                <td className="table-cell text-right tabular-nums">{fmt.num(a.hh)}</td>
              </tr>
            ))}
            {(!reporte.asistencia || reporte.asistencia.length === 0) && (
              <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-6">Sin registro de personal en este reporte</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <div className="p-4 border-b border-gray-100"><h3>Equipos y Maquinaria</h3></div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="table-header">Equipo</th>
              <th className="table-header text-center">Disponible</th>
              <th className="table-header text-right">HH Operativas</th>
              <th className="table-header">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {reporte.equipos?.map(e => (
              <tr key={e.equipo_id} className="table-row">
                <td className="table-cell font-medium">{e.equipo_nombre}{e.patente ? ` · ${e.patente}` : ''}</td>
                <td className="table-cell text-center"><span className={e.disponible ? 'badge-green' : 'badge-gray'}>{e.disponible ? 'Sí' : 'No'}</span></td>
                <td className="table-cell text-right tabular-nums">{fmt.num(e.hh_operativas)}</td>
                <td className="table-cell">{e.observaciones || '-'}</td>
              </tr>
            ))}
            {(!reporte.equipos || reporte.equipos.length === 0) && (
              <tr><td colSpan={4} className="table-cell text-center text-gray-400 py-6">Sin registro de equipos en este reporte</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {reporte.actividades && reporte.actividades.length > 0 && (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <div className="p-4 border-b border-gray-100"><h3>Avance de Actividades</h3></div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-header">Actividad</th>
                <th className="table-header text-right">Avanzado ese día</th>
                <th className="table-header text-right">HH ganadas</th>
                <th className="table-header">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {reporte.actividades.map(a => (
                <tr key={a.actividad_id} className="table-row">
                  <td className="table-cell font-medium">{a.actividad_descripcion}</td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(a.cantidad_real)} {a.unidad || ''}</td>
                  <td className="table-cell text-right tabular-nums">{fmt.num(a.hh_ganadas)}</td>
                  <td className="table-cell">{a.comentario || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(reporte.observaciones_ssoma || reporte.observaciones_generales) && (
        <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
          {reporte.observaciones_ssoma && (
            <div><p className="label mb-1">Observaciones SSOMA</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{reporte.observaciones_ssoma}</p></div>
          )}
          {reporte.observaciones_generales && (
            <div><p className="label mb-1">Observaciones generales</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{reporte.observaciones_generales}</p></div>
          )}
        </div>
      )}

      <div className="card space-y-4">
        <h3>Set Fotográfico</h3>
        {reporte.fotos && reporte.fotos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {reporte.fotos.map(f => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-gray-200">
                <img src={f.url} alt="Foto del reporte" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {puedeEditar && (
          <div className="flex items-center gap-3">
            <input ref={fotoRef} type="file" accept="image/*" multiple capture="environment" className="input flex-1" />
            <button type="button" onClick={subirFotos} disabled={subiendo} className="btn-secondary flex items-center gap-2 whitespace-nowrap">
              <Camera className="w-4 h-4" /> {subiendo ? 'Subiendo...' : 'Agregar Fotos'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
