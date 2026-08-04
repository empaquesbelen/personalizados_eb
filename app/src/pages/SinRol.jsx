// ============================================
// Pantalla para usuario autenticado sin rol asignado (o desactivado).
// ============================================
import { useAuth } from '../context/AuthContext';

export default function SinRol() {
  const { perfil, user, logout } = useAuth();
  return (
    <div className="estado-centrado">
      <div className="panel panel-aviso">
        <span className="aviso-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5 3.5 8v8L12 20.5 20.5 16V8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M9.5 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.3 2.1-2.3 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        </span>
        <h2>Cuenta sin acceso</h2>
        <p>
          Tu cuenta <strong>{perfil?.email || user?.email}</strong> todavía no
          tiene un rol asignado o fue desactivada.
        </p>
        <p>Contactá al administrador del sistema para que te habilite.</p>
        <button className="btn btn-ghost" onClick={logout}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 12H4m0 0 3.5-3.5M4 12l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h6A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 10 18.5V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Salir
        </button>
      </div>
    </div>
  );
}
