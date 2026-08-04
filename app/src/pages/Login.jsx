// ============================================
// Página de inicio de sesión (correo + contraseña)
// ============================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MENSAJES_ERROR = {
  'auth/invalid-email': 'El correo no es válido.',
  'auth/user-disabled': 'Este usuario está deshabilitado.',
  'auth/user-not-found': 'No existe una cuenta con ese correo.',
  'auth/wrong-password': 'Contraseña incorrecta.',
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/too-many-requests': 'Demasiados intentos fallidos. Probá más tarde.',
  'auth/network-request-failed': 'Sin conexión. Revisá tu internet.',
};

// Accesos rápidos SOLO para desarrollo (import.meta.env.DEV). Coinciden con los
// usuarios que crea tools/seedUsuariosPrueba.js. NUNCA se renderizan en el build
// de producción, así que estas credenciales de prueba no llegan al usuario final.
const PASSWORD_DEV = 'Prueba2026!';
const USUARIOS_DEV = [
  { rol: 'Asesor', email: 'prevendedor@eb.test' },
  { rol: 'Backoffice', email: 'backoffice@eb.test' },
  { rol: 'Admin', email: 'admin@eb.test' },
  { rol: 'Diseñador', email: 'disenador@eb.test' },
];

export default function Login() {
  const { user, cargando, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Si ya hay sesión, ir al inicio.
  useEffect(() => {
    if (!cargando && user) navigate('/', { replace: true });
  }, [cargando, user, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(email.trim(), password, recordar);
      navigate('/', { replace: true });
    } catch (err) {
      setError(MENSAJES_ERROR[err.code] || 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  // Acceso rápido de desarrollo: entra directo con un usuario de prueba.
  async function accesoRapido(correo) {
    setError('');
    setEmail(correo);
    setPassword(PASSWORD_DEV);
    setEnviando(true);
    try {
      await login(correo, PASSWORD_DEV, recordar);
      navigate('/', { replace: true });
    } catch (err) {
      setError(MENSAJES_ERROR[err.code] || 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <aside className="login-aside">
          <div className="marca marca--claro">
            <svg className="marca-logo" viewBox="0 0 24 24" fill="none" role="img" aria-label="Empaques Belén">
              <path d="M12 2.5 21 7 12 11.5 3 7Z" fill="currentColor" opacity="0.18" />
              <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M3 7l9 4.5L21 7M12 11.5v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <span className="marca-texto">
              <span className="marca-nombre">Empaques Belén</span>
              <span className="marca-sub">Control Interno</span>
            </span>
          </div>
          <p className="login-aside-tagline">
            Gestión y aprobación de cotizaciones, de principio a fin.
          </p>
          <p className="login-aside-pie">Sistema de uso interno</p>
        </aside>

        <form className="login-form" onSubmit={onSubmit}>
          <h1 className="login-title">Iniciar sesión</h1>
          <p className="login-sub">Ingresá con tu correo corporativo.</p>

          <label className="campo">
            <span>Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="nombre@empaquesbelen.com"
              required
            />
          </label>

          <label className="campo">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Tu contraseña"
              required
            />
          </label>

          <label
            className="texto-suave"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={recordar}
              onChange={(e) => setRecordar(e.target.checked)}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            Recordarme en este dispositivo
          </label>

          {error && (
            <div className="alerta-error" role="alert">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <circle cx="12" cy="16" r="1" fill="currentColor" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button className="btn btn-primario btn-block" type="submit" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Iniciar sesión'}
          </button>

          {import.meta.env.DEV && (
            <div className="login-dev">
              <span className="login-dev-titulo">Accesos de prueba · solo desarrollo</span>
              <div className="login-dev-grid">
                {USUARIOS_DEV.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    className="btn btn-ghost btn-chico"
                    disabled={enviando}
                    onClick={() => accesoRapido(u.email)}
                  >
                    {u.rol}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
