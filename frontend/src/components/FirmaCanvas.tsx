import { forwardRef, useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Eraser } from 'lucide-react'

interface Props {
  sigRef: React.MutableRefObject<SignatureCanvas | null>
}

// El canvas de la firma tenia un tamaño interno fijo (400x150px) estirado por CSS con `w-full` —
// eso desalinea el trazo real del mouse/dedo respecto a donde dibuja (el navegador escala la
// coordenada del puntero según el tamaño CSS, pero SignatureCanvas dibuja en la resolución interna
// original), mas notorio mientras mas ancho el contenedor real (PC). Ahora se mide el ancho real
// del contenedor con ResizeObserver y se fija la resolución interna del canvas a ese mismo ancho,
// para que el trazo quede exacto donde se dibuja tanto en PC como en celular. Alto fijo en 180px
// (antes 150) — mas espacio para firmar con el dedo, pedido explicito del usuario.
const ALTO_FIRMA = 180

const FirmaCanvas = forwardRef<HTMLDivElement, Props>(({ sigRef }, ref) => {
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(400)

  useEffect(() => {
    if (!contenedorRef.current) return
    const medir = () => {
      const w = contenedorRef.current?.clientWidth
      if (w && w > 0) setAncho(Math.round(w))
    }
    medir()
    const observer = new ResizeObserver(medir)
    observer.observe(contenedorRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref}>
      <div ref={contenedorRef} className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
        <SignatureCanvas key={ancho} ref={sigRef} penColor="black" canvasProps={{ width: ancho, height: ALTO_FIRMA }} />
      </div>
      <button type="button" onClick={() => sigRef.current?.clear()}
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600">
        <Eraser className="w-3.5 h-3.5" /> Limpiar firma
      </button>
    </div>
  )
})
FirmaCanvas.displayName = 'FirmaCanvas'
export default FirmaCanvas
