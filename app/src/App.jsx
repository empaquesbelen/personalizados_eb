// ============================================
// Router principal del Sistema de Control Interno EB
// ============================================
import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida';
import Layout from './components/Layout';
import Login from './pages/Login';
import Bandeja from './pages/Bandeja';
import Cotizador from './pages/Cotizador';
import DetalleCotizacion from './pages/DetalleCotizacion';
import Usuarios from './pages/Usuarios';
import Catalogo from './pages/Catalogo';
import { ROLES } from './constants/dominio';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Área autenticada */}
      <Route
        path="/"
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        <Route index element={<Bandeja />} />
        {/* Fase 4: Módulo Cotizador — crear cotización (prevendedor + superadmin). */}
        <Route
          path="cotizador"
          element={
            <RutaProtegida roles={[ROLES.PREVENDEDOR, ROLES.SUPERADMIN]}>
              <Cotizador />
            </RutaProtegida>
          }
        />
        {/* Detalle de cotización — todos los roles; la visibilidad real la
            imponen las Security Rules y las queries del onSnapshot. */}
        <Route path="cotizacion/:id" element={<DetalleCotizacion />} />
        {/* Gestión de usuarios — SOLO superadmin (además de las Security Rules). */}
        <Route
          path="usuarios"
          element={
            <RutaProtegida roles={[ROLES.SUPERADMIN]}>
              <Usuarios />
            </RutaProtegida>
          }
        />
        {/* Módulo de catálogo — SOLO superadmin (las Rules permiten write a
            admin/backoffice/superadmin; el módulo es superadmin). */}
        <Route
          path="catalogo"
          element={
            <RutaProtegida roles={[ROLES.SUPERADMIN]}>
              <Catalogo />
            </RutaProtegida>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
