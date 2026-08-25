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

// Convierte un dataURL (canvas de firma) a Blob para adjuntar en un FormData multipart.
export function dataURLtoBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)![1]
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
