// ============================================
// Detalle de cotización — vista completa, historial (timeline) y edición backoffice.
// ------------------------------------------------------------
// Ruta: /cotizacion/:id (protegida; TODOS los roles — la visibilidad real la
// imponen las Security Rules / queries).
//
// - Lee en tiempo real el doc `cotizaciones/{id}` (onSnapshot) y su subcolección
//   `historial_estados` (ordenada por timestamp ascendente).
// - Acciones de transición según rol (mismo modal de nota que la Bandeja) vía el
//   componente compartido AccionesCotizacion → transicionarCotizacion (atómica).
// - Edición de contenido por backoffice/superadmin (sin cambiar estado):
//   reutiliza la cascada del Cotizador y guarda con actualizarContenidoCotizacion
//   (updateDoc sin tocar `estado`/`ultimoEvento` → cae en edicionContenido()).
// ============================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useQueryTiempoReal } from '../hooks/useQueryTiempoReal';
import {
  actualizarContenidoCotizacion,
  pagoPorDefecto,
  normalizarPago,
  validarPago,
  resumirEdicionContenido,
  resumirPago,
} from '../services/cotizaciones';
import { getConfig, cargarCatalogoBusqueda, productosDeCatalogo } from '../services/catalogo';
import {
  ajustarCantidad,
  calcularLinea,
  calcularTotales,
  construirProductoCotizacion,
  formatearColones,
} from '../services/calculo';
import { generarPDFCotizacion } from '../services/pdf';
import { lineaDesdeItem, reconstruirLineas, recolectarCondiciones } from '../components/lineasCotizacion';
import BuscadorProductos from '../components/BuscadorProductos';
import TablaProductosCotizacion from '../components/TablaProductosCotizacion';
import TipoCambioLectura from '../components/TipoCambioLectura';
import AccionesCotizacion from '../components/AccionesCotizacion';
import FormularioPago from '../components/FormularioPago';
import { ESTADO_LABEL, ESTADOS, ROLES, ROL_LABEL } from '../constants/dominio';

// Estados en los que el backoffice puede editar el contenido (además, las Rules
// permiten edicionContenido() en cualquier estado sin cambiar `estado`).
const ESTADOS_EDITABLES = [ESTADOS.GENERADA, ESTADOS.EN_REVISION_BACKOFFICE];
const ROLES_EDICION = [ROLES.BACKOFFICE, ROLES.SUPERADMIN];

const ICON = {
  atras: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  editar: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  mas: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};

function fmtFechaHora(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
}

function fmtImpresiones(p) {
  return [p.impresion1, p.impresion2]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' / ') || '—';
}

const alertaError = (mensaje) => (
  <div className="alerta-error" role="alert">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
    <span>{mensaje}</span>
  </div>
);

export default function DetalleCotizacion() {
  const { id } = useParams();
  const { perfil, rol } = useAuth();

  // ---- Cotización en tiempo real (doc) ----
  const [cot, setCot] = useState(null);
  const [cargandoCot, setCargandoCot] = useState(true);
  const [errorCot, setErrorCot] = useState(null);

  useEffect(() => {
    if (!id) return undefined;
    setCargandoCot(true);
    const unsub = onSnapshot(
      doc(db, 'cotizaciones', id),
      (snap) => {
        if (snap.exists()) {
          setCot({ id: snap.id, ...snap.data() });
          setErrorCot(null);
        } else {
          setCot(null);
          setErrorCot(new Error('no-existe'));
        }
        setCargandoCot(false);
      },
      (err) => {
        console.error('Error leyendo la cotización:', err);
        setErrorCot(err);
        setCargandoCot(false);
      },
    );
    return unsub;
  }, [id]);

  // ---- Historial en tiempo real (subcolección, ascendente por timestamp) ----
  const qHist = useMemo(
    () =>
      id
        ? query(collection(db, 'cotizaciones', id, 'historial_estados'), orderBy('timestamp', 'asc'))
        : null,
    [id],
  );
  const { docs: historial, cargando: cargandoHist } = useQueryTiempoReal(qHist);

  // ---- Estado de la barra de acciones (errores/avisos) ----
  const [aviso, setAviso] = useState(null);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // ---- Condiciones (snapshot/heredadas de los productos) para mostrarlas ----
  const [condiciones, setCondiciones] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const conds = await recolectarCondiciones(cot?.productos || []);
      if (vivo) setCondiciones(conds);
    })();
    return () => {
      vivo = false;
    };
  }, [cot?.productos]);

  // ---- Estado de edición (modelo buscador + carrito, igual que el Cotizador) ----
  const [editando, setEditando] = useState(false);
  const [prepEdicion, setPrepEdicion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avisoEdicion, setAvisoEdicion] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [productosLista, setProductosLista] = useState([]);
  const [cliente, setCliente] = useState({ nombre: '', contacto: '' });
  const [lineas, setLineas] = useState([]); // [{ id, clave, item, cantidad }]

  // Tipo de cambio de la cotización: SOLO lectura (fijado al crearla). Editar
  // agregando/quitando líneas y ajustando cantidades recalcula con ESTE valor,
  // para mantener coherencia con el resto de la cotización.
  const tcEdit = Number(cot?.tipoCambio) || 0;

  const puedeEditar =
    cot && ROLES_EDICION.includes(rol) && ESTADOS_EDITABLES.includes(cot.estado);
  // Los datos de pago los gestiona backoffice/superadmin en cualquier estado
  // (no cambian el estado). Todos los roles pueden verlos.
  const puedeEditarPago = cot && ROLES_EDICION.includes(rol);

  async function iniciarEdicion() {
    if (!cot) return;
    setAvisoEdicion('');
    setEditando(true);
    setPrepEdicion(true);
    try {
      if (!catalogo.length) {
        const cat = await cargarCatalogoBusqueda();
        setCatalogo(cat);
        setProductosLista(productosDeCatalogo(cat));
      }
      setCliente({ nombre: cot.cliente?.nombre || '', contacto: cot.cliente?.contacto || '' });
      // Sembrar las líneas desde los productos guardados (reconstruye el item del
      // catálogo para poder recalcular precios; respeta la cantidad guardada).
      const reconstruidas = await reconstruirLineas(cot.productos || []);
      setLineas(reconstruidas);
    } catch (e) {
      console.error('Error preparando la edición:', e);
      setAvisoEdicion('No se pudo preparar la edición: ' + (e.message || e));
    } finally {
      setPrepEdicion(false);
    }
  }

  function cancelarEdicion() {
    setEditando(false);
    setPrepEdicion(false);
    setAvisoEdicion('');
    setLineas([]);
  }

  const clavesAgregadas = useMemo(() => new Set(lineas.map((l) => l.clave)), [lineas]);

  const agregarItems = useCallback((items) => {
    setLineas((prev) => {
      const claves = new Set(prev.map((l) => l.clave));
      const nuevas = items.filter((it) => !claves.has(it.clave)).map((it) => lineaDesdeItem(it));
      return nuevas.length ? [...prev, ...nuevas] : prev;
    });
  }, []);

  const cambiarCantidad = useCallback((id, valor) => {
    setLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, cantidad: ajustarCantidad(valor, l.item.minimo) } : l)),
    );
  }, []);

  const nudgeCantidad = useCallback((id, dir) => {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const min = Math.max(1, Math.round(Number(l.item.minimo) || 1));
        const actual = ajustarCantidad(l.cantidad, min);
        const siguiente = dir > 0 ? actual + min : Math.max(min, actual - min);
        return { ...l, cantidad: ajustarCantidad(siguiente, min) };
      }),
    );
  }, []);

  const quitarLinea = useCallback((id) => {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Precio de cada línea (sincrónico) con el tipo de cambio de la cotización.
  const lineasCalc = useMemo(
    () =>
      lineas.map((l) => {
        const calc = calcularLinea(l.item, l.cantidad, tcEdit);
        return { ...l, calc: calc.valido ? calc : null, error: calc.valido ? '' : calc.error };
      }),
    [lineas, tcEdit],
  );

  const productosValidos = useMemo(
    () => lineasCalc.filter((l) => l.calc).map((l) => construirProductoCotizacion(l.item, l.calc)),
    [lineasCalc],
  );
  const totalesEdit = useMemo(() => calcularTotales(productosValidos, tcEdit), [productosValidos, tcEdit]);

  async function guardarEdicion() {
    setAvisoEdicion('');
    if (!cliente.nombre.trim()) {
      setAvisoEdicion('El nombre del cliente es obligatorio.');
      return;
    }
    if (productosValidos.length === 0) {
      setAvisoEdicion('Agregá al menos un producto desde el buscador.');
      return;
    }
    if (lineasCalc.some((l) => !l.calc)) {
      setAvisoEdicion('Hay una línea con problema. Revisá las cantidades o quitá la línea.');
      return;
    }

    setGuardando(true);
    try {
      const clienteNuevo = { nombre: cliente.nombre.trim(), contacto: cliente.contacto.trim() };
      // Resumen de auditoría (mejor esfuerzo): compara el contenido guardado vs
      // el nuevo por clave de producto + datos de cliente.
      const resumen = resumirEdicionContenido(
        { cliente: cot.cliente, productos: cot.productos },
        { cliente: clienteNuevo, productos: productosValidos },
      );
      // Guarda SOLO contenido (cliente/productos/totales/tipoCambio) + updatedAt
      // y registra el evento de edición en historial_estados (writeBatch). NO
      // cambia `estado` ni escribe `ultimoEvento`: cae en edicionContenido().
      // El tipoCambio no se altera (se conserva el de la cotización).
      await actualizarContenidoCotizacion(
        cot.id,
        {
          cliente: clienteNuevo,
          productos: productosValidos,
          totales: totalesEdit,
          tipoCambio: tcEdit,
        },
        { usuario: { id: perfil.id, rol, nombre: perfil.nombre }, resumen },
      );
      setEditando(false);
      setLineas([]);
    } catch (e) {
      console.error('Error guardando la edición:', e);
      setAvisoEdicion('No se pudo guardar: ' + (e.message || e));
    } finally {
      setGuardando(false);
    }
  }

  async function descargarPDF() {
    if (!cot) return;
    setAviso(null);
    setGenerandoPdf(true);
    try {
      const config = await getConfig();
      const condiciones = await recolectarCondiciones(cot.productos || []);
      await generarPDFCotizacion({
        consecutivo: cot.consecutivo || '',
        config,
        // Datos del vendedor guardados en la cotización; si falta info, se degrada.
        vendedor: { nombre: cot.prevendedorNombre || 'N/D', whatsapp: '', email: '' },
        cliente: cot.cliente || {},
        productos: cot.productos || [],
        totales: cot.totales || {},
        tipoCambio: Number(cot.tipoCambio) || 0,
        condiciones,
      });
    } catch (e) {
      console.error('Error generando el PDF:', e);
      setAviso('No se pudo generar el PDF: ' + (e.message || e));
    } finally {
      setGenerandoPdf(false);
    }
  }

  // ---- Estados de carga / error ----
  if (cargandoCot) {
    return (
      <div className="panel">
        <span className="cargando-inline">
          <span className="spinner" aria-hidden="true" />
          Cargando cotización…
        </span>
      </div>
    );
  }

  if (errorCot || !cot) {
    const noExiste = String(errorCot?.message || '') === 'no-existe';
    return (
      <div className="detalle">
        <div className="detalle-barra">
          <Link to="/" className="btn btn-ghost btn-chico">
            {ICON.atras}
            Volver a la bandeja
          </Link>
        </div>
        {alertaError(
          noExiste
            ? 'Esta cotización no existe o no tenés permiso para verla.'
            : 'No se pudo cargar la cotización: ' + (errorCot?.message || 'error desconocido'),
        )}
      </div>
    );
  }

  const productos = cot.productos || [];
  const totales = cot.totales || {};

  return (
    <div className="detalle">
      {/* Barra superior: volver + PDF + editar */}
      <div className="detalle-barra">
        <Link to="/" className="btn btn-ghost btn-chico">
          {ICON.atras}
          Volver
        </Link>
        <div className="detalle-barra-acciones">
          <button
            type="button"
            className="btn btn-ghost btn-chico"
            onClick={descargarPDF}
            disabled={generandoPdf}
          >
            {ICON.pdf}
            {generandoPdf ? 'Generando…' : 'Descargar PDF'}
          </button>
          {puedeEditar && !editando && (
            <button type="button" className="btn btn-acento" onClick={iniciarEdicion}>
              {ICON.editar}
              Editar cotización
            </button>
          )}
        </div>
      </div>

      {aviso && alertaError(aviso)}

      {/* Encabezado */}
      <section className="panel detalle-encabezado">
        <div className="detalle-encabezado-top">
          <div className="detalle-titulo-grupo">
            <span className="detalle-consecutivo">{cot.consecutivo || 'Sin consecutivo'}</span>
            <span className={`chip chip--${String(cot.estado).toLowerCase()}`}>
              {ESTADO_LABEL[cot.estado] || cot.estado}
            </span>
          </div>
        </div>
        <dl className="detalle-datos">
          <div className="dato">
            <dt className="dato-etq">Fecha</dt>
            <dd className="dato-val">{fmtFechaHora(cot.createdAt)}</dd>
          </div>
          <div className="dato">
            <dt className="dato-etq">Tipo de cambio</dt>
            <dd className="dato-val">
              $1 = {formatearColones(Number(cot.tipoCambio) || 0)}
            </dd>
          </div>
          <div className="dato">
            <dt className="dato-etq">Cliente</dt>
            <dd className="dato-val">{cot.cliente?.nombre || '—'}</dd>
          </div>
          <div className="dato">
            <dt className="dato-etq">Contacto</dt>
            <dd className="dato-val">{cot.cliente?.contacto || '—'}</dd>
          </div>
          <div className="dato">
            <dt className="dato-etq">Asesor comercial</dt>
            <dd className="dato-val">{cot.prevendedorNombre || '—'}</dd>
          </div>
        </dl>

        {cot.notaActual ? (
          <div className="nota-actual">
            <span className="nota-actual-etq">Nota actual</span>
            <p>{cot.notaActual}</p>
          </div>
        ) : null}
      </section>

      {editando ? (
        // ================= MODO EDICIÓN (backoffice / superadmin) =================
        <EdicionBackoffice
          prepEdicion={prepEdicion}
          cliente={cliente}
          setCliente={setCliente}
          tipoCambioCot={tcEdit}
          catalogo={catalogo}
          productosLista={productosLista}
          clavesAgregadas={clavesAgregadas}
          lineas={lineasCalc}
          onAgregarItems={agregarItems}
          onCantidad={cambiarCantidad}
          onNudge={nudgeCantidad}
          onQuitarLinea={quitarLinea}
          totales={totalesEdit}
          avisoEdicion={avisoEdicion}
          guardando={guardando}
          onGuardar={guardarEdicion}
          onCancelar={cancelarEdicion}
        />
      ) : (
        <>
          {/* ================= SOLO LECTURA ================= */}
          <section className="panel">
            <h2 className="seccion-titulo">Productos</h2>
            <div className="tabla-wrap">
              <table className="tabla tabla-productos">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Tamaño</th>
                    <th>Impresión</th>
                    <th>Material</th>
                    <th className="col-num">Cantidad</th>
                    <th className="col-num">Precio sin IVA</th>
                    <th className="col-num">IVA</th>
                    <th className="col-num">Total con IVA</th>
                    <th className="col-num">Unit. con IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="texto-suave">Sin líneas de producto.</td>
                    </tr>
                  ) : (
                    productos.map((p, i) => (
                      <tr key={i}>
                        <td data-label="Producto">{p.producto || '—'}</td>
                        <td data-label="Tamaño">{p.tamano || '—'}</td>
                        <td data-label="Impresión">{fmtImpresiones(p)}</td>
                        <td data-label="Material">{p.material || '—'}</td>
                        <td data-label="Cantidad" className="col-num">
                          {Number(p.cantidad || 0).toLocaleString('es-CR')}
                        </td>
                        <td data-label="Precio sin IVA" className="col-num">
                          {formatearColones(p.precioSinIVA)}
                        </td>
                        <td data-label="IVA" className="col-num">{formatearColones(p.iva)}</td>
                        <td data-label="Total con IVA" className="col-num">
                          {formatearColones(p.totalConIVA)}
                        </td>
                        <td data-label="Unit. con IVA" className="col-num">
                          {formatearColones(p.precioUnitario)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totales */}
          <section className="panel totales-panel" aria-label="Totales de la cotización">
            <h2 className="seccion-titulo">Totales</h2>
            <dl className="resumen">
              <div className="resumen-fila">
                <dt>Subtotal (sin IVA)</dt>
                <dd>{formatearColones(totales.subtotal)}</dd>
              </div>
              <div className="resumen-fila">
                <dt>IVA (13%)</dt>
                <dd>{formatearColones(totales.iva)}</dd>
              </div>
              <div className="resumen-fila resumen-total">
                <dt>Total (con IVA)</dt>
                <dd>{formatearColones(totales.total)}</dd>
              </div>
              <div className="resumen-fila resumen-usd">
                <dt>Total en USD</dt>
                <dd>${(Number(totales.totalUSD) || 0).toFixed(2)}</dd>
              </div>
            </dl>
          </section>

          {/* Condiciones (heredadas de los productos; van en el PDF) */}
          {condiciones.length > 0 && (
            <section className="panel" aria-label="Condiciones">
              <h2 className="seccion-titulo">Condiciones</h2>
              <ul className="cond-lista">
                {condiciones.map((c, i) => (
                  <li key={`${c.articulo}-${i}`} className="cond-item">
                    {c.articulo && <strong className="cond-item-art">{c.articulo}</strong>}
                    <p className="cond-item-txt">{c.texto}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Datos de pago (gestionado por backoffice; visible para todos) */}
          <SeccionPago
            cot={cot}
            puedeEditar={puedeEditarPago}
            usuario={{ id: perfil?.id, rol, nombre: perfil?.nombre }}
          />

          {/* Acciones de transición según rol */}
          <section className="panel">
            <h2 className="seccion-titulo">Acciones</h2>
            <AccionesCotizacion
              cot={cot}
              perfil={perfil}
              rol={rol}
              variante="bloque"
              onError={setAviso}
              vacio={
                <p className="texto-suave">
                  No hay acciones disponibles para tu rol en el estado actual.
                </p>
              }
            />
          </section>
        </>
      )}

      {/* Línea de tiempo del historial (siempre visible) */}
      <section className="panel">
        <h2 className="seccion-titulo">Historial</h2>
        {cargandoHist ? (
          <span className="cargando-inline">
            <span className="spinner" aria-hidden="true" />
            Cargando historial…
          </span>
        ) : historial.length === 0 ? (
          <p className="texto-suave">Sin eventos registrados todavía.</p>
        ) : (
          <ol className="timeline">
            {historial.map((ev) => (
              <li className="timeline-evento" key={ev.id}>
                <span
                  className={`timeline-punto tl--${String(ev.estadoNuevo || '').toLowerCase()}`}
                  aria-hidden="true"
                />
                <div className="timeline-cuerpo">
                  <div className="timeline-transicion">
                    {ev.estadoAnterior ? (
                      <>
                        <span className={`chip chip--${String(ev.estadoAnterior).toLowerCase()}`}>
                          {ESTADO_LABEL[ev.estadoAnterior] || ev.estadoAnterior}
                        </span>
                        <span className="timeline-flecha" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none">
                            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <span className={`chip chip--${String(ev.estadoNuevo).toLowerCase()}`}>
                          {ESTADO_LABEL[ev.estadoNuevo] || ev.estadoNuevo}
                        </span>
                      </>
                    ) : (
                      <span className={`chip chip--${String(ev.estadoNuevo).toLowerCase()}`}>
                        Creada · {ESTADO_LABEL[ev.estadoNuevo] || ev.estadoNuevo}
                      </span>
                    )}
                  </div>
                  <div className="timeline-meta">
                    {ev.rol ? <span className={`badge rol-${ev.rol}`}>{ROL_LABEL[ev.rol] || ev.rol}</span> : null}
                    {ev.usuarioId === perfil?.id ? (
                      <span className="texto-suave">vos</span>
                    ) : null}
                    <span className="timeline-fecha">{fmtFechaHora(ev.timestamp)}</span>
                  </div>
                  {ev.nota ? <p className="timeline-nota">{ev.nota}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulario de edición de contenido (reutiliza el buscador + carrito + tabla
// del Cotizador). NO edición libre de campos: se agregan/quitan líneas por el
// buscador y se ajusta la cantidad con la regla de múltiplos del mínimo.
// ---------------------------------------------------------------------------
function EdicionBackoffice({
  prepEdicion,
  cliente,
  setCliente,
  tipoCambioCot,
  catalogo,
  productosLista,
  clavesAgregadas,
  lineas,
  onAgregarItems,
  onCantidad,
  onNudge,
  onQuitarLinea,
  totales,
  avisoEdicion,
  guardando,
  onGuardar,
  onCancelar,
}) {
  if (prepEdicion) {
    return (
      <div className="panel">
        <span className="cargando-inline">
          <span className="spinner" aria-hidden="true" />
          Preparando edición…
        </span>
      </div>
    );
  }

  return (
    <div className="detalle-edicion">
      <div className="nota-fase">
        Estás editando el contenido de la cotización. Guardar <strong>no cambia el estado</strong>;
        solo actualiza cliente, productos y totales. El tipo de cambio se conserva.
      </div>

      {/* Datos del cliente + tipo de cambio (solo lectura) */}
      <section className="panel">
        <h2 className="seccion-titulo">Datos del cliente</h2>
        <div className="campos-cliente">
          <label className="campo">
            <span>Nombre del cliente *</span>
            <input
              type="text"
              value={cliente.nombre}
              onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))}
              placeholder="Nombre o razón social"
              autoComplete="off"
            />
          </label>
          <label className="campo">
            <span>Contacto (opcional)</span>
            <input
              type="text"
              value={cliente.contacto}
              onChange={(e) => setCliente((c) => ({ ...c, contacto: e.target.value }))}
              placeholder="Teléfono, correo o persona"
              autoComplete="off"
            />
          </label>
          <TipoCambioLectura
            tipoCambio={tipoCambioCot}
            nota="Fijado al crear la cotización · no editable"
          />
        </div>
      </section>

      {/* Buscador de combinaciones + carrito */}
      <section className="panel">
        <h2 className="seccion-titulo">Buscar productos</h2>
        <BuscadorProductos
          catalogo={catalogo}
          productos={productosLista}
          clavesAgregadas={clavesAgregadas}
          onAgregar={onAgregarItems}
        />
      </section>

      {/* Tabla de productos agregados */}
      <section className="panel">
        <div className="seccion-header">
          <h2 className="seccion-titulo">Productos de la cotización</h2>
          <span className="bandeja-conteo">
            {lineas.length} línea{lineas.length === 1 ? '' : 's'}
          </span>
        </div>
        <TablaProductosCotizacion
          lineas={lineas}
          onCantidad={onCantidad}
          onNudge={onNudge}
          onQuitar={onQuitarLinea}
        />
      </section>

      {/* Totales + guardar/cancelar */}
      <section className="panel totales-panel" aria-label="Totales de la cotización">
        <h2 className="seccion-titulo">Totales</h2>
        <dl className="resumen">
          <div className="resumen-fila">
            <dt>Subtotal (sin IVA)</dt>
            <dd>{formatearColones(totales.subtotal)}</dd>
          </div>
          <div className="resumen-fila">
            <dt>IVA (13%)</dt>
            <dd>{formatearColones(totales.iva)}</dd>
          </div>
          <div className="resumen-fila resumen-total">
            <dt>Total (con IVA)</dt>
            <dd>{formatearColones(totales.total)}</dd>
          </div>
          <div className="resumen-fila resumen-usd">
            <dt>Total en USD</dt>
            <dd>${(Number(totales.totalUSD) || 0).toFixed(2)}</dd>
          </div>
        </dl>

        {avisoEdicion && alertaError(avisoEdicion)}

        <div className="detalle-edicion-acciones">
          <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datos de pago (Punto 4). Lo gestiona backoffice/superadmin; visible para
// todos. Guardar usa el MISMO mecanismo de edición de contenido (update de
// `pago` + evento de auditoría en historial_estados). NO cambia el estado.
// ---------------------------------------------------------------------------
const METODO_LABEL = { contado: 'Contado', credito: 'Crédito', '': 'Sin definir' };

function SiNo({ valor }) {
  return valor ? (
    <span className="pago-si">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Sí
    </span>
  ) : (
    <span className="pago-no">No</span>
  );
}

function SeccionPago({ cot, puedeEditar, usuario }) {
  const pagoActual = { ...pagoPorDefecto(), ...(cot.pago || {}) };
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState(pagoActual);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  function abrir() {
    setForm({ ...pagoPorDefecto(), ...(cot.pago || {}) });
    setAviso('');
    setEditando(true);
  }
  function cancelar() {
    setEditando(false);
    setAviso('');
  }

  async function guardar() {
    const pago = normalizarPago(form);
    // Mismo requisito que al enviar a aprobación: el método y su dato
    // obligatorio deben estar completos (no se guardan pagos a medias).
    const error = validarPago(pago);
    if (error) {
      setAviso(error);
      return;
    }
    setGuardando(true);
    setAviso('');
    try {
      await actualizarContenidoCotizacion(
        cot.id,
        { pago },
        { usuario, resumen: resumirPago(pago) },
      );
      setEditando(false);
    } catch (e) {
      console.error('Error guardando datos de pago:', e);
      setAviso('No se pudo guardar: ' + (e.message || e));
    } finally {
      setGuardando(false);
    }
  }

  const metodo = pagoActual.metodo;

  return (
    <section className="panel">
      <div className="seccion-header">
        <h2 className="seccion-titulo">Datos de pago</h2>
        {puedeEditar && !editando && (
          <button type="button" className="btn btn-ghost btn-chico" onClick={abrir}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            Editar datos de pago
          </button>
        )}
      </div>

      {!editando ? (
        // -------- Solo lectura --------
        metodo === '' ? (
          <p className="texto-suave">Aún no se definió el método de pago.</p>
        ) : (
          <dl className="detalle-datos">
            <div className="dato">
              <dt className="dato-etq">Método</dt>
              <dd className="dato-val">{METODO_LABEL[metodo]}</dd>
            </div>
            {metodo === 'contado' && (
              <div className="dato">
                <dt className="dato-etq">N° de comprobante</dt>
                <dd className="dato-val">{pagoActual.comprobante || '—'}</dd>
              </div>
            )}
            {metodo === 'credito' && (
              <div className="dato">
                <dt className="dato-etq">Cotización aprobada</dt>
                <dd className="dato-val"><SiNo valor={pagoActual.cotizacionAprobada} /></dd>
              </div>
            )}
            <div className="dato">
              <dt className="dato-etq">Muestra enviada por correo</dt>
              <dd className="dato-val"><SiNo valor={pagoActual.muestraEnviada} /></dd>
            </div>
          </dl>
        )
      ) : (
        // -------- Edición (backoffice / superadmin) --------
        <div className="pago-form">
          <FormularioPago value={form} onChange={setForm} />

          {aviso && alertaError(aviso)}

          <div className="detalle-edicion-acciones">
            <button type="button" className="btn btn-ghost" onClick={cancelar} disabled={guardando}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primario" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar datos de pago'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
