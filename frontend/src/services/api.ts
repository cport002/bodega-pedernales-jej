import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

export const fmt = {
  num: (n: number, dec = 0) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: dec }).format(n || 0),
  // Columnas DATE (sin hora) llegan como 'YYYY-MM-DD' o, vía node-pg, como ISO con una hora
  // espuria (medianoche en la zona del servidor). Se lee el calendario directo del string en vez
  // de pasar por `new Date(...).toLocaleDateString()`, que reinterpreta esa hora en la zona del
  // navegador y puede mostrar el día anterior (ej. Chile UTC-3/4 corriendo detrás de UTC).
  fecha: (s?: string) => {
    const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '-'
  },
  fechaHora: (s?: string) => s ? new Date(s).toLocaleString('es-CL') : '-',
}

// Fuerza la descarga del archivo en vez de abrirlo en una pestaña nueva — window.open con un
// blob: URL no funciona cuando el sistema está instalado como PWA en Android (no hay pestaña de
// navegador que lo renderice), como ya se detectó y corrigió en control-activos-jej.
export function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Comprime una foto de cámara antes de subirla — celulares Android reales toman fotos de 8-15 MB
// a resolución completa, y cargar eso en memoria en el navegador para armar el multipart puede
// tirar "memoria insuficiente" en equipos con poca RAM libre. Se redibuja a un tamaño razonable
// (máx. 1600px de lado) y se reexporta como JPEG comprimido — sigue sirviendo perfecto como
// evidencia visual, pesa una fracción del original. Si el archivo ya es chico, se deja tal cual
// (createImageBitmap + canvas igual gastan memoria, no vale la pena para un archivo ya liviano).
const UMBRAL_COMPRESION_BYTES = 1.5 * 1024 * 1024
const LADO_MAXIMO = 1600
const CALIDAD_JPEG = 0.75

export async function comprimirFoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= UMBRAL_COMPRESION_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * escala)
    const h = Math.round(bitmap.height * escala)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
  } catch {
    return file // si algo falla comprimiendo, se sube el original tal cual antes que bloquear el flujo
  }
}

// Convierte un dataURL (canvas de firma) a Blob para adjuntar en un FormData multipart.
export function dataURLtoBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)![1]
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
