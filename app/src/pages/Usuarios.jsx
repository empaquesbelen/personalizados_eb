// ============================================
// Gestión de usuarios (rol superadmin).
// ------------------------------------------------------------
// Ruta: /usuarios (protegida SOLO para superadmin — ver App.jsx / RutaProtegida).
//
// - Lista la colección `usuarios` en tiempo real (onSnapshot vía useQueryTiempoReal).
// - Editar: cambiar rol y activar/desactivar (soft-delete). Protección en UI para
//   que el superadmin no se auto-desactive ni se quite su propio rol.
// - Crear: alta de cuenta de Auth con el patrón de app secundaria (ver
//   services/usuarios.js) para NO cerrar la sesión del superadmin.
// La autorización REAL la imponen las Security Rules (Regla Absoluta #3).
// ============================================
import { useEffect, useMemo, useState } from 'react';
import { collection, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useQueryTiempoReal } from '../hooks/useQueryTiempoReal';
import { actualizarUsuario, crearUsuario } from '../services/usuarios';
import { ROLES, ROL_LABEL } from '../constants/dominio';

// Orden de los roles para los <select>. Las etiquetas legibles vienen de
// ROL_LABEL (constants/dominio) — misma fuente que el resto de la app.
const ROLES_ORDEN = [
  ROLES.PREVENDEDOR,
  ROLES.BACKOFFICE,
  ROLES.ADMIN,
  ROLES.DISENADOR,
  ROLES.SUPERADMIN,
];

// Mensajes en español para los códigos de error de Firebase Auth/Firestore.
const MENSAJES_ERROR = {
  'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
  'auth/invalid-email': 'El correo no es válido.',
  'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres).',
  'auth/missing-password': 'Ingresá una contraseña.',
  'auth/missing-email': 'Ingresá un correo.',
  'auth/network-request-failed': 'Sin conexión. Revisá tu internet.',
  'auth/too-many-requests': 'Demasiados intentos. Probá más tarde.',
  'auth/operation-not-allowed': 'El acceso con correo y contraseña no está habilitado en Firebase.',
  'permission-denied': 'No tenés permisos para esta operación.',
};
function mensajeError(err) {
  if (err?.code && MENSAJES_ERROR[err.code]) return MENSAJES_ERROR[err.code];
  return 'No se pudo completar la operación: ' + (err?.message || 'error desconocido');
}

const ICON = {
  mas: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  editar: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

function AlertaError({ children }) {
  return (
    <div className="alerta-error" role="alert">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

function AlertaExito({ children, onCerrar }) {
  return (
    <div className="alerta-exito" role="status">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
      {onCerrar && (
        <button type="button" className="alerta-cerrar" onClick={onCerrar} aria-label="Cerrar aviso">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Usuarios() {
  const { perfil } = useAuth();
  const q = useMemo(() => query(collection(db, 'usuarios')), []);
  const { docs, cargando, error } = useQueryTiempoReal(q);

  // Orden alfabético por nombre en el cliente (evita índices y exclusiones por
  // campos ausentes en documentos antiguos/bootstrap).
  const usuarios = useMemo(
    () =>
      [...docs].sort((a, b) =>
        String(a.nombre || a.email || '').localeCompare(String(b.nombre || b.email || ''), 'es'),
      ),
    [docs],
  );

  const [exito, setExito] = useState('');
  const [modalCrear, setModalCrear] = useState(false);
  const [editando, setEditando] = useState(null); // usuario en edición

  return (
    <div className="bandeja">
      <div className="bandeja-header">
        <div className="bandeja-titulo">
          <h1>Usuarios</h1>
          {!cargando && !error && (
            <span className="bandeja-conteo">
              {usuarios.length} {usuarios.length === 1 ? 'usuario' : 'usuarios'}
            </span>
          )}
        </div>
        <button className="btn btn-acento" type="button" onClick={() => setModalCrear(true)}>
          {ICON.mas}
          Nuevo usuario
        </button>
      </div>

      {exito && <AlertaExito onCerrar={() => setExito('')}>{exito}</AlertaExito>}

      {error && (
        <AlertaError>Error cargando los usuarios: {error.message}</AlertaError>
      )}

      {cargando ? (
        <div className="panel">
          <span className="cargando-inline">
            <span className="spinner" aria-hidden="true" />
            Cargando usuarios…
          </span>
        </div>
      ) : usuarios.length === 0 ? (
        <div className="panel vacio">
          <span className="vacio-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <strong>No hay usuarios todavía</strong>
          <span>Creá el primero con el botón “Nuevo usuario”.</span>
        </div>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esYoMismo = u.id === perfil?.id;
                const activo = u.activo !== false;
                return (
                  <tr key={u.id}>
                    <td data-label="Nombre">
                      {u.nombre || '—'}
                      {esYoMismo && <span className="texto-suave"> (vos)</span>}
                    </td>
                    <td data-label="Correo" className="texto-suave">{u.email || '—'}</td>
                    <td data-label="Rol">
                      <span className={`badge rol-${u.rol}`}>{ROL_LABEL[u.rol] || u.rol || '—'}</span>
                    </td>
                    <td data-label="Estado">
                      <span className={`chip ${activo ? 'chip--completada' : 'chip--anulada'}`}>
                        {activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td data-label="Acciones" className="col-acciones">
                      <div className="acciones-wrap">
                        <button
                          type="button"
                          className="btn btn-ghost btn-chico"
                          onClick={() => setEditando(u)}
                        >
                          {ICON.editar}
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalCrear && (
        <ModalCrear
          creadoPor={perfil?.id}
          onCerrar={() => setModalCrear(false)}
          onCreado={(nombre) => {
            setModalCrear(false);
            setExito(`Usuario “${nombre}” creado. Ya puede iniciar sesión.`);
          }}
        />
      )}

      {editando && (
        <ModalEditar
          usuario={editando}
          esYoMismo={editando.id === perfil?.id}
          onCerrar={() => setEditando(null)}
          onGuardado={(nombre) => {
            setEditando(null);
            setExito(`Cambios guardados para “${nombre}”.`);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: crear usuario (nombre, correo, contraseña, rol).
// ---------------------------------------------------------------------------
function ModalCrear({ creadoPor, onCerrar, onCreado }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState(ROLES.PREVENDEDOR);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEscape(onCerrar, guardando);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) return setError('El nombre es obligatorio.');
    if (!email.trim()) return setError('El correo es obligatorio.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');

    setGuardando(true);
    try {
      await crearUsuario({ nombre, email, password, rol, creadoPor });
      onCreado(nombre.trim());
    } catch (err) {
      console.error('Error creando usuario:', err);
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !guardando && onCerrar()}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Crear usuario"
      >
        <h3>Nuevo usuario</h3>
        <p className="modal-detalle">
          Se crea la cuenta de acceso y su perfil. Tu sesión actual no se cierra.
        </p>

        {error && <AlertaError>{error}</AlertaError>}

        <label className="campo">
          <span>Nombre</span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            autoComplete="off"
            autoFocus
          />
        </label>

        <label className="campo">
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@empaquesbelen.com"
            autoComplete="off"
          />
        </label>

        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
          />
          <span className="campo-ayuda">
            El usuario podrá cambiarla luego desde su propio perfil (flujo futuro).
          </span>
        </label>

        <label className="campo">
          <span>Rol</span>
          <select value={rol} onChange={(e) => setRol(e.target.value)}>
            {ROLES_ORDEN.map((r) => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
        </label>

        <div className="modal-acciones">
          <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: editar usuario (rol + activar/desactivar) con protección de sí mismo.
// ---------------------------------------------------------------------------
function ModalEditar({ usuario, esYoMismo, onCerrar, onGuardado }) {
  const [rol, setRol] = useState(usuario.rol || ROLES.PREVENDEDOR);
  const [activo, setActivo] = useState(usuario.activo !== false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEscape(onCerrar, guardando);

  const sinCambios = rol === (usuario.rol || ROLES.PREVENDEDOR) && activo === (usuario.activo !== false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    // Protección simple en UI: el superadmin no puede quitarse su propio rol
    // ni desactivarse a sí mismo (las reglas no lo impiden; esto evita el error).
    const rolFinal = esYoMismo ? usuario.rol : rol;
    const activoFinal = esYoMismo ? true : activo;

    setGuardando(true);
    try {
      await actualizarUsuario(usuario.id, { rol: rolFinal, activo: activoFinal });
      onGuardado(usuario.nombre || usuario.email || 'usuario');
    } catch (err) {
      console.error('Error actualizando usuario:', err);
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !guardando && onCerrar()}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Editar usuario"
      >
        <h3>Editar usuario</h3>
        <p className="modal-detalle">
          {usuario.nombre || 'Sin nombre'} · {usuario.email || 'sin correo'}
        </p>

        {error && <AlertaError>{error}</AlertaError>}

        {esYoMismo && (
          <p className="nota-fase">
            Esta es tu propia cuenta: no podés cambiar tu rol ni desactivarte para no perder el acceso.
          </p>
        )}

        <label className="campo">
          <span>Rol</span>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            disabled={esYoMismo || guardando}
          >
            {ROLES_ORDEN.map((r) => (
              <option key={r} value={r}>{ROL_LABEL[r]}</option>
            ))}
          </select>
        </label>

        <label className="campo">
          <span>Estado</span>
          <select
            value={activo ? 'activo' : 'inactivo'}
            onChange={(e) => setActivo(e.target.value === 'activo')}
            disabled={esYoMismo || guardando}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo (sin acceso)</option>
          </select>
          {!esYoMismo && (
            <span className="campo-ayuda">
              Desactivar es el borrado seguro: el usuario no podrá ingresar, pero su registro se conserva.
            </span>
          )}
        </label>

        <div className="modal-acciones">
          <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={guardando || sinCambios || esYoMismo}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Cierra el modal con la tecla Escape (deshabilitado mientras se guarda).
function useEscape(onCerrar, bloqueado) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !bloqueado) onCerrar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, bloqueado]);
}
