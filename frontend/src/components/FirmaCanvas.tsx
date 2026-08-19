import { forwardRef } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Eraser } from 'lucide-react'

interface Props {
  sigRef: React.MutableRefObject<SignatureCanvas | null>
}

// Envuelve react-signature-canvas con el mismo patrón usado en Control de Activos JEJ:
// el padre lee sigRef.current.getTrimmedCanvas().toDataURL() al enviar el formulario.
const FirmaCanvas = forwardRef<HTMLDivElement, Props>(({ sigRef }, ref) => (
  <div ref={ref}>
    <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-gray-50">
      <SignatureCanvas ref={sigRef} penColor="black" canvasProps={{ width: 400, height: 150, className: 'w-full' }} />
    </div>
    <button type="button" onClick={() => sigRef.current?.clear()}
      className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600">
      <Eraser className="w-3.5 h-3.5" /> Limpiar firma
    </button>
  </div>
))
FirmaCanvas.displayName = 'FirmaCanvas'
export default FirmaCanvas
