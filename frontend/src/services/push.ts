import api from './api'

// El navegador exige la applicationServerKey como Uint8Array, no como el string base64url que
// entrega el backend — hay que decodificarla a mano (no hay helper nativo para esto).
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function pushSoportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// Se llama despues del login: si el usuario ya dio permiso antes (o lo acepta ahora), suscribe
// este dispositivo. Si ya lo habia rechazado, no vuelve a preguntar (el navegador lo bloquea solo).
export async function activarNotificacionesPush(): Promise<boolean> {
  if (!pushSoportado()) return false
  try {
    const { data } = await api.get('/notificaciones/push/public-key')
    if (!data.habilitado || !data.publicKey) return false

    let permiso = Notification.permission
    if (permiso === 'default') permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    let sub = await registration.pushManager.getSubscription()
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey) as BufferSource,
      })
    }
    const json = sub.toJSON()
    await api.post('/notificaciones/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
    return true
  } catch {
    return false
  }
}
