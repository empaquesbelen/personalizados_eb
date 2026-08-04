// ============================================
// Guard de rutas: exige sesión y (opcional) rol permitido.
// OJO: esto es solo UX. La autorización REAL la hacen las Security Rules
// del lado servidor (CLAUDE.md · Regla Absoluta #3).
// ============================================
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SinRol from '../pages/SinRol';

export default function RutaProtegida({ children, roles }) {
  const { user, rol, activo, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="estado-centrado">
        <span className="spinner" aria-hidden="true" />
        <span>Cargando…</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Usuario autenticado pero sin documento de rol, o desactivado.
  if (!rol || !activo) {
    return <SinRol />;
  }

  if (roles && !roles.includes(rol)) {
    return (
      <div className="estado-centrado">
        <div className="panel panel-aviso">
          <span className="aviso-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="5" y="10.5" width="14" height="9.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="15" r="1.1" fill="currentColor" />
            </svg>
          </span>
          <h2>Sin permisos</h2>
          <p>No tenés permisos para ver esta sección.</p>
        </div>
      </div>
    );
  }

  return children;
}
