import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { fmt } from '../services/api'
import type { InventarioSesion } from '../types'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'
import { ClipboardCheck, Download, Upload } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

type ResultadoImportar = { sesion_id: number; insertados: number; conDiferencia: number; sinContar: number; noEncontrados: string[]; invalidas: string[] }

export default function InventariosPage() {
  const { puedeOperar } = useAuth()
  const [sesiones, setSesiones] = useState<InventarioSesion[]>([])
  const [loading, setLoading] = useState(true)

  const [areas, setAreas] = useState<string[]>([])
  const [filtroArea, setFiltroArea] = useState('')
  const [filtroUbicacion, setFiltroUbicacion] = useState('')
  const [filtroEquipo, setFiltroEquipo] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)
  const [descargando, setDescargando] = useState(false)

  const [fechaConteo, setFechaConteo] = useState('')
  const [etiquetaConteo, setEtiquetaConteo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportar | null>(null)

  const cargar = () => {
    setLoading(true)
    api.get('/inventarios/sesiones').then(r => { setSesiones(r.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [])
  useEffect(() => { api.get('/inventarios/areas').then(r => setAreas(r.data)).catch(() => {}) }, [])

  const descargarPlantilla = async () => {
    setDescargando(true)
    try {
      const params: Record<string, string> = {}
      if (filtroArea) params.area = filtroArea
      if (filtroUbicacion) params.ubicacion = filtroUbicacion
      if (filtroEquipo) params.equipo = filtroEquipo
      if (soloConStock) params.con_stock = '1'
      const r = await api.get('/inventarios/plantilla', { params, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `plantilla_inventario_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar la plantilla')
    } finally {
      setDescargando(false)
    }
  }

  const cargarInventario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!archivo || !fechaConteo) return
    setCargando(true)
    setResultado(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      form.append('fecha', fechaConteo)
      if (etiquetaConteo) form.append('etiqueta', etiquetaConteo)
      const r = await api.post<ResultadoImportar>('/inventarios/importar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setResultado(r.data)
      toast.success(`${r.data.insertados} lote(s) registrados (${r.data.conDiferencia} con diferencia)`)
      setArchivo(null)
      setEtiquetaConteo('')
      cargar()
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al cargar el inventario')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Inventarios" subtitle={`${sesiones.length} sesión(es) de conteo registradas`} icon={ClipboardCheck} />

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">1. Descargar plantilla para contar</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[160px]">
            <label className="label">Área</label>
            <select className="input" value={filtroArea} onChange={e => setFiltroArea(e.target.value)}>
              <option value="">Todas</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="label">Ubicación contiene</label>
            <input className="input" value={filtroUbicacion} onChange={e => setFiltroUbicacion(e.target.value)} placeholder="PATIO N°2..." />
          </div>
          <div className="min-w-[180px]">
            <label className="label">Equipo contiene</label>
            <input className="input" value={filtroEquipo} onChange={e => setFiltroEquipo(e.target.value)} placeholder="POZO PB2..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
            <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />
            Solo lotes con stock
          </label>
          <button onClick={descargarPlantilla} disabled={descargando} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            <Download className="w-4 h-4" /> {descargando ? 'Generando...' : 'Descargar plantilla'}
          </button>
        </div>
        <p className="text-xs text-gray-500">Genera un Excel con los lotes filtrados y una columna "CANTIDAD INVENTARIADA" para llenar a mano durante el conteo físico.</p>
      </div>

      {puedeOperar && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">2. Cargar plantilla completada</h2>
          <form onSubmit={cargarInventario} className="flex flex-wrap items-end gap-4">
            <div className="min-w-[160px]">
              <label className="label">Fecha del conteo *</label>
              <input type="date" className="input" value={fechaConteo} onChange={e => setFechaConteo(e.target.value)} required />
            </div>
            <div className="min-w-[200px]">
              <label className="label">Nombre de la sesión</label>
              <input className="input" value={etiquetaConteo} onChange={e => setEtiquetaConteo(e.target.value)} placeholder="Ej: Patio 2 - Mayo" />
            </div>
            <div className="min-w-[260px]">
              <label className="label">Archivo (.xlsx) *</label>
              <input type="file" accept=".xlsx" className="input" onChange={e => setArchivo(e.target.files?.[0] || null)} required />
            </div>
            <button type="submit" disabled={cargando} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
              <Upload className="w-4 h-4" /> {cargando ? 'Cargando...' : 'Cargar inventario'}
            </button>
          </form>

          {resultado && (
            <div className="text-sm bg-gray-50 rounded-xl p-4 space-y-1.5">
              <p>
                <span className="font-semibold text-green-700">{resultado.insertados}</span> lote(s) registrados — <span className="font-semibold text-amber-700">{resultado.conDiferencia}</span> con diferencia de stock, <span className="font-semibold">{resultado.sinContar}</span> fila(s) sin llenar (se ignoraron).{' '}
                <Link to={`/inventarios/${resultado.sesion_id}`} className="text-primary-600 font-medium underline">Ver detalle</Link>
              </p>
              {resultado.noEncontrados.length > 0 && (
                <p className="text-red-700">Códigos no encontrados en el sistema: {resultado.noEncontrados.join(', ')}</p>
              )}
              {resultado.invalidas.length > 0 && (
                <p className="text-red-700">Cantidad inválida en: {resultado.invalidas.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-800">Historial de sesiones de inventario</h2>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">Cargando...</div>
        ) : (
          <div className="overflow-hidden overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Sesión</th>
                  <th className="table-header">Registrado por</th>
                  <th className="table-header text-right">Lotes contados</th>
                  <th className="table-header text-right">Con diferencia</th>
                </tr>
              </thead>
              <tbody>
                {sesiones.map(s => (
                  <tr key={s.id} className="table-row">
                    <td className="table-cell">{fmt.fecha(s.fecha)}</td>
                    <td className="table-cell">
                      <Link to={`/inventarios/${s.id}`} className="font-medium text-primary-600">{s.etiqueta || `Sesión #${s.id}`}</Link>
                    </td>
                    <td className="table-cell">{s.usuario_nombre || '-'}</td>
                    <td className="table-cell text-right tabular-nums">{s.total_lotes}</td>
                    <td className="table-cell text-right tabular-nums">
                      <span className={Number(s.con_diferencia) === 0 ? 'badge-green' : 'badge-red'}>{s.con_diferencia}</span>
                    </td>
                  </tr>
                ))}
                {sesiones.length === 0 && (
                  <tr><td colSpan={5} className="table-cell text-center text-gray-400 py-8">Sin sesiones de inventario registradas todavía</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
