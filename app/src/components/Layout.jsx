// ============================================
// Layout base: barra superior + contenido enrutado.
// ============================================
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLES, ROL_LABEL } from '../constants/dominio';

export default function Layout() {
  const { perfil, rol, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="marca">
          <svg className="marca-logo" viewBox="0 0 24 24" fill="none" role="img" aria-label="Empaques Belén">
            <path d="M12 2.5 21 7 12 11.5 3 7Z" fill="currentColor" opacity="0.16" />
            <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M3 7l9 4.5L21 7M12 11.5v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <span className="marca-texto">
            <span className="marca-nombre">Empaques Belén</span>
            <span className="marca-sub">Control Interno</span>
          </span>
        </div>
        <div className="userbox">
          {rol === ROLES.SUPERADMIN && (
            <>
              <Link className="btn btn-ghost btn-chico" to="/catalogo">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7.5 12 4l8 3.5-8 3.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M4 7.5V16l8 3.5 8-3.5V7.5M12 11v8.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                Catálogo
              </Link>
              <Link className="btn btn-ghost btn-chico" to="/usuarios">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M3.5 19c0-2.8 2.5-4.6 5.5-4.6s5.5 1.8 5.5 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M17 9.5l1.6 1.6L21.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Usuarios
              </Link>
            </>
          )}
          <span className="user-nombre">{perfil?.nombre || perfil?.email}</span>
          <span className={`badge rol-${rol}`}>{ROL_LABEL[rol] || rol}</span>
          <button className="btn btn-ghost btn-chico" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h6A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 18.5V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Salir
          </button>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
