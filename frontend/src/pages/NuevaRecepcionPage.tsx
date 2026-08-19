import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import type { ItemRecepcion } from '../types'
import toast from 'react-hot-toast'
import { PackagePlus, Plus, Trash2 } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

const ITEM_VACIO: ItemRecepcion = {
  descripcion: '', especialidad: '', diametro_1: '', unidad: 'C/U',
  cantidad_packing_list: null, cantidad_recepcionada: 0,
  ubicacion_1: '', pallet_numero: '', equipo_destino: ''
}

export default function NuevaRecepcionPage() {
  const navigate = useNavigate()
  const [cabecera, setCabecera] = useState({
    orden_compra: '', contrato: '', pm: '', proveedor: '', n_guia: '',
    fecha_recepcion: new Date().toISOString().slice(0, 10), observaciones: ''
  })
  const [items, setItems] = useState<ItemRecepcion[]>([{ ...ITEM_VACIO }])
  const [guardando, setGuardando] = useState(false)

  const actualizarItem = (i: number, campo: keyof ItemRecepcion, valor: any) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [campo]: valor } : it))
  }
  const agregarItem = () => setItems(prev => [...prev, { ...ITEM_VACIO }])
  const quitarItem = (i: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const itemsValidos = items.filter(it => it.descripcion.trim() && it.cantidad_recepcionada > 0)
    if (itemsValidos.length === 0) { toast.error('Agrega al menos un ítem con descripción y cantidad recepcionada'); return }

    setGuardando(true)
    try {
      const { data } = await api.post('/recepciones', { ...cabecera, items: itemsValidos })
      toast.success(`Recepción registrada con ${itemsValidos.length} ítem(s)`)
      navigate(`/recepciones/${data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al guardar la recepción')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nueva Recepción" subtitle="Registra la guía de llegada de materiales y sus ítems" icon={PackagePlus} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h3>Datos de la guía</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">N° Guía</label>
              <input className="input" value={cabecera.n_guia} onChange={e => setCabecera({ ...cabecera, n_guia: e.target.value })} />
            </div>
            <div>
              <label className="label">Fecha de recepción *</label>
              <input type="date" className="input" value={cabecera.fecha_recepcion} onChange={e => setCabecera({ ...cabecera, fecha_recepcion: e.target.value })} required />
            </div>
            <div>
              <label className="label">Proveedor</label>
              <input className="input" value={cabecera.proveedor} onChange={e => setCabecera({ ...cabecera, proveedor: e.target.value })} />
            </div>
            <div>
              <label className="label">Orden de compra</label>
              <input className="input" value={cabecera.orden_compra} onChange={e => setCabecera({ ...cabecera, orden_compra: e.target.value })} />
            </div>
            <div>
              <label className="label">N° Contrato</label>
              <input className="input" value={cabecera.contrato} onChange={e => setCabecera({ ...cabecera, contrato: e.target.value })} />
            </div>
            <div>
              <label className="label">PM</label>
              <input className="input" value={cabecera.pm} onChange={e => setCabecera({ ...cabecera, pm: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Observaciones</label>
            <input className="input" value={cabecera.observaciones} onChange={e => setCabecera({ ...cabecera, observaciones: e.target.value })} />
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="p-6 pb-0 flex items-center justify-between">
            <h3>Ítems recepcionados</h3>
            <button type="button" onClick={agregarItem} className="btn-secondary btn-sm flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Agregar ítem
            </button>
          </div>
          <div className="overflow-x-auto p-6">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr>
                  <th className="table-header">Descripción *</th>
                  <th className="table-header">Especialidad</th>
                  <th className="table-header">Diámetro</th>
                  <th className="table-header">Unidad</th>
                  <th className="table-header text-right">Cant. Packing</th>
                  <th className="table-header text-right">Cant. Recep. *</th>
                  <th className="table-header">Ubicación</th>
                  <th className="table-header">Pallet</th>
                  <th className="table-header">Frente destino</th>
                  <th className="table-header"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="p-1.5"><input className="input" value={it.descripcion} onChange={e => actualizarItem(i, 'descripcion', e.target.value)} placeholder="BRIDA SLIP-ON..." /></td>
                    <td className="p-1.5"><input className="input" value={it.especialidad} onChange={e => actualizarItem(i, 'especialidad', e.target.value)} placeholder="PIPING" /></td>
                    <td className="p-1.5"><input className="input" value={it.diametro_1} onChange={e => actualizarItem(i, 'diametro_1', e.target.value)} placeholder='10"' /></td>
                    <td className="p-1.5"><input className="input" value={it.unidad} onChange={e => actualizarItem(i, 'unidad', e.target.value)} /></td>
                    <td className="p-1.5"><input type="number" min={0} className="input text-right" value={it.cantidad_packing_list ?? ''} onChange={e => actualizarItem(i, 'cantidad_packing_list', e.target.value ? Number(e.target.value) : null)} /></td>
                    <td className="p-1.5"><input type="number" min={0} className="input text-right" value={it.cantidad_recepcionada || ''} onChange={e => actualizarItem(i, 'cantidad_recepcionada', Number(e.target.value))} required /></td>
                    <td className="p-1.5"><input className="input" value={it.ubicacion_1} onChange={e => actualizarItem(i, 'ubicacion_1', e.target.value)} /></td>
                    <td className="p-1.5"><input className="input" value={it.pallet_numero} onChange={e => actualizarItem(i, 'pallet_numero', e.target.value)} /></td>
                    <td className="p-1.5"><input className="input" value={it.equipo_destino} onChange={e => actualizarItem(i, 'equipo_destino', e.target.value)} /></td>
                    <td className="p-1.5 text-center">
                      <button type="button" onClick={() => quitarItem(i)} className="text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-6 pb-4 text-xs text-gray-400">TAG, N° serie, NCR y otros datos avanzados se pueden completar después desde el detalle de cada lote.</p>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={guardando} className="btn-primary">{guardando ? 'Guardando...' : 'Registrar Recepción'}</button>
        </div>
      </form>
    </div>
  )
}
