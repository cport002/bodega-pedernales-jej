import { useState } from 'react'
import type { Usuario, AuthState } from '../types'

export function useAuth(): AuthState & {
  login: (token: string, usuario: Usuario) => void
  logout: () => void
  puedeOperar: boolean
  esAdmin: boolean
  esSolicitante: boolean
} {
  const [state, setState] = useState<AuthState>(() => ({
    token: localStorage.getItem('token'),
    usuario: (() => { try { return JSON.parse(localStorage.getItem('usuario') || 'null') } catch { return null } })()
  }))

  const login = (token: string, usuario: Usuario) => {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(usuario))
    setState({ token, usuario })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    setState({ token: null, usuario: null })
  }

  return {
    ...state,
    login,
    logout,
    puedeOperar: state.usuario?.rol === 'admin' || state.usuario?.rol === 'bodeguero',
    esAdmin: state.usuario?.rol === 'admin',
    esSolicitante: state.usuario?.rol === 'solicitante',
  }
}
