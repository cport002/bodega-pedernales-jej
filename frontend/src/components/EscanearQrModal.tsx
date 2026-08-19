import { useEffect, useRef, useState } from 'react'
import { X, ScanLine } from 'lucide-react'

interface Props {
  onDetectado: (codigo: string) => void
  onClose: () => void
}

// Escaneo de QR por cámara usando la API nativa BarcodeDetector (disponible en Chrome/Android,
// que es el dispositivo real que va a usar el bodeguero en terreno). Si el navegador no la soporta,
// se avisa y el usuario puede seguir usando la búsqueda manual o un lector de código de barras USB
// (que funciona igual porque "escribe" el código y Enter, sin necesitar esta cámara).
export default function EscanearQrModal({ onDetectado, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [soportado, setSoportado] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!('BarcodeDetector' in window)) { setSoportado(false); return }

    let activo = true
    let stream: MediaStream | null = null
    // @ts-ignore — BarcodeDetector aún no está en los tipos estándar de TS/DOM
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(s => {
        if (!activo) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play() }
        const loop = async () => {
          if (!activo || !videoRef.current) return
          try {
            const codigos = await detector.detect(videoRef.current)
            if (codigos.length > 0) { onDetectado(codigos[0].rawValue); return }
          } catch { /* frame no válido todavía, se reintenta */ }
          requestAnimationFrame(loop)
        }
        loop()
      })
      .catch(() => setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.'))

    return () => { activo = false; stream?.getTracks().forEach(t => t.stop()) }
  }, [onDetectado])

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="flex items-center gap-2"><ScanLine className="w-5 h-5 text-primary-600" /> Escanear QR</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">
          {!soportado ? (
            <p className="text-sm text-gray-600">Tu navegador no soporta escaneo de QR por cámara. Usa la búsqueda manual, o un lector de código de barras USB (funciona igual, "escribe" el código en el buscador).</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video ref={videoRef} className="w-full aspect-square object-cover" muted playsInline />
              <div className="absolute inset-8 border-2 border-amber-400 rounded-lg pointer-events-none" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
