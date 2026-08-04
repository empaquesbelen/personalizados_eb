// ============================================
// Bandeja de cotizaciones (por rol) + acciones de transición
// ------------------------------------------------------------
// La bandeja se organiza en PESTAÑAS según los buckets de VISTAS_BANDEJA
// (dominio.js), para que una cotización NO desaparezca al avanzar de etapa:
//   - "Requieren acción": es el turno de este rol.
//   - "En proceso": ya la entregó a otra etapa; la ve para seguimiento.
//   - "Finalizadas": completadas / anuladas.
// Si es DEVUELTA (rechazo), vuelve sola a "Requieren acción". Además: filtro por
// estado (p. ej. diseñador entre Pendiente y Diseñando) + búsqueda/asesor/fecha.
// ============================================
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQueryTiempoReal } from '../hooks/useQueryTiempoReal';
import { queryBandeja } from '../services/cotizaciones';
import { ESTADO_LABEL, ROLES, vistasDeRol } from '../constants/dominio';
import AccionesCotizacion from '../components/AccionesCotizacion';

const TITULO_POR_ROL = {
  [ROLES.PREVENDEDOR]: 'Mis cotizaciones',
  [ROLES.BACKOFFICE]: 'Bandeja de backoffice',
  [ROLES.ADMIN]: 'Bandeja de aprobación',
  [ROLES.DISENADOR]: 'Bandeja de diseño',
  [ROLES.SUPERADMIN]: 'Todas las cotizaciones',
};

// Orden y etiqueta de las pestañas (claves = buckets de VISTAS_BANDEJA).
const TABS = [
  { key: 'accion', label: 'Requieren acción' },
  { key: 'enProceso', label: 'En proceso' },
  { key: 'finalizadas', label: 'Finalizadas' },
];

function fmtFecha(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

// Normaliza para búsqueda insensible a mayúsculas/acentos.
function normalizar(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

// Roles que ven cotizaciones de varios asesores → tiene sentido el filtro por
// asesor. El asesor solo ve las suyas; el diseñador se omite (según el flujo).
const ROLES_FILTRO_ASESOR = [ROLES.BACKOFFICE, ROLES.ADMIN, ROLES.SUPERADMIN];

export default function Bandeja() {
  const { perfil, rol } = useAuth();
  const q = useMemo(() => queryBandeja(perfil), [perfil?.rol, perfil?.id]);
  const { docs, cargando, error } = useQueryTiempoReal(q);

  const [aviso, setAviso] = useState(null);

  // Buckets de este rol y pestañas visibles (solo las no vacías para el rol).
  const buckets = useMemo(() => vistasDeRol(rol), [rol]);
  const tabs = useMemo(() => TABS.filter((t) => (buckets[t.key] || []).length > 0), [buckets]);

  const [vista, setVista] = useState('accion');
  const vistaActiva = tabs.some((t) => t.key === vista) ? vista : tabs[0]?.key || 'accion';
  const estadosBucket = useMemo(() => buckets[vistaActiva] || [], [buckets, vistaActiva]);

  // ---- Filtros (client-side, sobre los docs que ya llegan por onSnapshot) ----
  const [texto, setTexto] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [asesor, setAsesor] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const mostrarAsesor = ROLES_FILTRO_ASESOR.includes(rol);

  function cambiarVista(key) {
    setVista(key);
    setEstadoFiltro(''); // el filtro por estado depende del bucket
  }

  // Conteo por pestaña (sobre todos los docs del rol, sin filtros de texto/fecha).
  const conteos = useMemo(() => {
    const c = {};
    for (const t of tabs) {
      const estados = buckets[t.key] || [];
      c[t.key] = docs.filter((d) => estados.includes(d.estado)).length;
    }
    return c;
  }, [docs, tabs, buckets]);

  // Lista de asesores presentes en la bandeja actual.
  const asesores = useMemo(() => {
    const set = new Set();
    docs.forEach((d) => {
      const n = String(d.prevendedorNombre || '').trim();
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [docs]);

  const hayFiltros = Boolean(texto.trim() || estadoFiltro || asesor || desde || hasta);

  // Docs de la pestaña activa (por estado del bucket).
  const docsVista = useMemo(
    () => docs.filter((d) => estadosBucket.includes(d.estado)),
    [docs, estadosBucket],
  );

  const docsFiltrados = useMemo(() => {
    const q2 = normalizar(texto);
    const dDesde = desde ? new Date(`${desde}T00:00:00`) : null;
    const dHasta = hasta ? new Date(`${hasta}T23:59:59.999`) : null;
    return docsVista.filter((d) => {
      if (estadoFiltro && d.estado !== estadoFiltro) return false;
      if (asesor && String(d.prevendedorNombre || '').trim() !== asesor) return false;
      if (q2) {
        const heno = normalizar(`${d.cliente?.nombre || ''} ${d.consecutivo || ''}`);
        if (!heno.includes(q2)) return false;
      }
      if (dDesde || dHasta) {
        const f = d.createdAt?.toDate ? d.createdAt.toDate() : null;
        if (!f) return false; // sin fecha resuelta aún: no puede cumplir el rango
        if (dDesde && f < dDesde) return false;
        if (dHasta && f > dHasta) return false;
      }
      return true;
    });
  }, [docsVista, texto, estadoFiltro, asesor, desde, hasta]);

  function limpiarFiltros() {
    setTexto('');
    setEstadoFiltro('');
    setAsesor('');
    setDesde('');
    setHasta('');
  }

  const puedeCotizar = rol === ROLES.PREVENDEDOR || rol === ROLES.SUPERADMIN;
  const mostrarControles = !cargando && !error && docs.length > 0;
  const etiquetaVista = TABS.find((t) => t.key === vistaActiva)?.label || '';

  return (
    <div className="bandeja">
      <div className="bandeja-header">
        <div className="bandeja-titulo">
          <h1>{TITULO_POR_ROL[rol] || 'Cotizaciones'}</h1>
          {!cargando && !error && (
            <span className="bandeja-conteo">
              {hayFiltros
                ? `${docsFiltrados.length} de ${docsVista.length}`
                : `${docsVista.length} ${docsVista.length === 1 ? 'cotización' : 'cotizaciones'}`}
            </span>
          )}
        </div>
        {puedeCotizar && (
          <Link className="btn btn-acento" to="/cotizador">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Nueva cotización
          </Link>
        )}
      </div>

      {/* Pestañas (buckets de vista) */}
      {mostrarControles && tabs.length > 1 && (
        <div className="bandeja-tabs" role="tablist" aria-label="Vistas de la bandeja">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={vistaActiva === t.key}
              className={`bandeja-tab${vistaActiva === t.key ? ' activa' : ''}`}
              onClick={() => cambiarVista(t.key)}
            >
              {t.label}
              <span className="bandeja-tab-conteo">{conteos[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {mostrarControles && (
        <div className="filtros-bandeja" role="search">
          <div className="filtro-busqueda">
            <span className="filtro-busqueda-icono" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
                <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por cliente o consecutivo"
              aria-label="Buscar por cliente o consecutivo"
              autoComplete="off"
            />
          </div>

          {estadosBucket.length > 1 && (
            <label className="filtro-campo">
              <span className="sr-only">Filtrar por estado</span>
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                aria-label="Filtrar por estado"
                className="buscador-filtro"
              >
                <option value="">Todos los estados</option>
                {estadosBucket.map((es) => (
                  <option key={es} value={es}>
                    {ESTADO_LABEL[es] || es}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mostrarAsesor && (
            <label className="filtro-campo">
              <span className="sr-only">Filtrar por asesor</span>
              <select
                value={asesor}
                onChange={(e) => setAsesor(e.target.value)}
                aria-label="Filtrar por asesor"
                className="buscador-filtro"
              >
                <option value="">Todos los asesores</option>
                {asesores.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="filtro-campo">
            <span className="filtro-etq">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
              aria-label="Fecha desde"
              className="buscador-filtro"
            />
          </label>
          <label className="filtro-campo">
            <span className="filtro-etq">Hasta</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              aria-label="Fecha hasta"
              className="buscador-filtro"
            />
          </label>

          {hayFiltros && (
            <button type="button" className="btn btn-ghost btn-chico" onClick={limpiarFiltros}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              Limpiar
            </button>
          )}
        </div>
      )}

      {aviso && (
        <div className="alerta-error" role="alert">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <span>{aviso}</span>
        </div>
      )}
      {error && (
        <div className="alerta-error" role="alert">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
          <span>
            Error cargando la bandeja: {error.message}
            {String(error.message || '').includes('index') && ' (falta crear un índice en Firestore).'}
          </span>
        </div>
      )}

      {cargando ? (
        <div className="panel">
          <span className="cargando-inline">
            <span className="spinner" aria-hidden="true" />
            Cargando cotizaciones…
          </span>
        </div>
      ) : docs.length === 0 ? (
        <div className="panel vacio">
          <span className="vacio-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M3 7l9 4.5L21 7M12 11.5v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </span>
          <strong>No hay cotizaciones en esta bandeja</strong>
          <span>Cuando lleguen, aparecerán aquí automáticamente.</span>
        </div>
      ) : docsVista.length === 0 ? (
        <div className="panel vacio">
          <span className="vacio-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M3 7l9 4.5L21 7M12 11.5v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </span>
          <strong>No hay cotizaciones en «{etiquetaVista}»</strong>
          <span>Cambiá de pestaña para ver las demás.</span>
        </div>
      ) : docsFiltrados.length === 0 ? (
        <div className="panel vacio">
          <span className="vacio-icono" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M20 20l-3.4-3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <strong>No hay resultados con esos filtros</strong>
          <span>Probá con otros términos o limpiá los filtros.</span>
          <button type="button" className="btn btn-ghost btn-chico" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Asesor comercial</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {docsFiltrados.map((cot) => (
                <tr key={cot.id}>
                  <td data-label="Cliente">
                    <Link className="enlace-detalle" to={`/cotizacion/${cot.id}`}>
                      {cot.cliente?.nombre || 'Ver detalle'}
                    </Link>
                  </td>
                  <td data-label="Asesor comercial">{cot.prevendedorNombre || '—'}</td>
                  <td data-label="Total" className="col-total">
                    {cot.totales?.total != null
                      ? '₡' + Number(cot.totales.total).toLocaleString('es-CR')
                      : '—'}
                  </td>
                  <td data-label="Estado">
                    <span className={`chip chip--${String(cot.estado).toLowerCase()}`}>
                      {ESTADO_LABEL[cot.estado] || cot.estado}
                    </span>
                  </td>
                  <td data-label="Fecha" className="texto-suave">{fmtFecha(cot.createdAt)}</td>
                  <td data-label="Acciones" className="col-acciones">
                    <Link className="btn btn-ghost btn-chico" to={`/cotizacion/${cot.id}`}>
                      Ver detalle
                    </Link>
                    <AccionesCotizacion
                      cot={cot}
                      perfil={perfil}
                      rol={rol}
                      onError={setAviso}
                      vacio={null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
