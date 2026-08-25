import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import Layout from './components/layout/Layout'
import DashboardPage from './pages/DashboardPage'
import MaterialesPage from './pages/MaterialesPage'
import RecepcionesPage from './pages/RecepcionesPage'
import NuevaRecepcionPage from './pages/NuevaRecepcionPage'
import RecepcionDetallePage from './pages/RecepcionDetallePage'
import LotesPage from './pages/LotesPage'
import LoteDetallePage from './pages/LoteDetallePage'
import DespachosPage from './pages/DespachosPage'
import DevolucionesPage from './pages/DevolucionesPage'
import InventariosPage from './pages/InventariosPage'
import InventarioSesionDetallePage from './pages/InventarioSesionDetallePage'
import NcrPage from './pages/NcrPage'
import UsuariosPage from './pages/UsuariosPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const auth = useAuth()

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        <Route path="/login" element={auth.token ? <Navigate to="/" replace /> : <LoginPage onLogin={auth.login} />} />
        <Route path="/" element={<PrivateRoute><Layout auth={auth} /></PrivateRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="materiales" element={<MaterialesPage />} />
          <Route path="recepciones" element={<RecepcionesPage />} />
          <Route path="recepciones/nueva" element={<NuevaRecepcionPage />} />
          <Route path="recepciones/:id" element={<RecepcionDetallePage />} />
          <Route path="lotes" element={<LotesPage />} />
          <Route path="lotes/:id" element={<LoteDetallePage />} />
          <Route path="despachos" element={<DespachosPage />} />
          <Route path="devoluciones" element={<DevolucionesPage />} />
          <Route path="inventarios" element={<InventariosPage />} />
          <Route path="inventarios/:id" element={<InventarioSesionDetallePage />} />
          <Route path="reportes/ncr" element={<NcrPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
