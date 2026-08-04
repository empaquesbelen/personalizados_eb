// ============================================
// Módulo Cotizador (Fase 4): buscador + carrito + tabla + cálculo + PDF.
// ------------------------------------------------------------
// Modelo (igual al legacy): la selección de productos se hace por un BUSCADOR
// de combinaciones + filtros + mini-carrito + "Agregar seleccionados" (NO por
// cascada de menús). La tabla de productos agregados NO es editable salvo la
// cantidad, que respeta múltiplos del mínimo con redondeo hacia arriba. El tipo
// de cambio NO es editable: sale de config (BCCR o manual).
//
// Flujo: al "Generar cotización" se crea y guarda la cotización en estado
// GENERADA (services/cotizaciones.crearCotizacion) Y se genera el PDF. Se
// muestra el consecutivo y la confirmación.
// Roles con acceso: prevendedor + superadmin (ver App.jsx / RutaProtegida).
// ============================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getConfig, cargarCatalogoBusqueda, productosDeCatalogo } from '../services/catalogo';
import {
  ajustarCantidad,
  calcularLinea,
  calcularTotales,
  construirProductoCotizacion,
  formatearColones,
} from '../services/calculo';
import { crearCotizacion } from '../services/cotizaciones';
import { generarPDFCotizacion } from '../services/pdf';
import { lineaDesdeItem, recolectarCondiciones } from '../components/lineasCotizacion';
import BuscadorProductos from '../components/BuscadorProductos';
import TablaProductosCotizacion from '../components/TablaProductosCotizacion';
import TipoCambioLectura from '../components/TipoCambioLectura';

const ICON = {
  atras: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mas: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  ok: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function Cotizador() {
  const { perfil } = useAuth();

  const [config, setConfig] = useState(null);
  const [catalogo, setCatalogo] = useState([]);
  const [productosLista, setProductosLista] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  const [cliente, setCliente] = useState({ nombre: '', contacto: '' });
  const [lineas, setLineas] = useState([]); // [{ id, clave, item, cantidad }]

  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [resultado, setResultado] = useState(null); // { consecutivo, pdfOk }

  // Tipo de cambio: SOLO lectura, desde config (BCCR o manual).
  const tipoCambio = Number(config?.tipoCambio) || 0;

  // Carga inicial: config + catálogo de búsqueda (todo el catálogo, cacheado).
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [cfg, cat] = await Promise.all([getConfig(), cargarCatalogoBusqueda()]);
        if (!vivo) return;
        setConfig(cfg);
        setCatalogo(cat);
        setProductosLista(productosDeCatalogo(cat));
      } catch (e) {
        console.error('Error cargando catálogo/config:', e);
        if (vivo) setErrorCarga('No se pudo cargar el catálogo. Revisá tu conexión y recargá.');
      } finally {
        if (vivo) setCargandoCatalogo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Precio de cada línea (sincrónico: el item ya trae todo lo necesario).
  const lineasCalc = useMemo(
    () =>
      lineas.map((l) => {
        const calc = calcularLinea(l.item, l.cantidad, tipoCambio);
        return { ...l, calc: calc.valido ? calc : null, error: calc.valido ? '' : calc.error };
      }),
    [lineas, tipoCambio],
  );

  const productosValidos = useMemo(
    () => lineasCalc.filter((l) => l.calc).map((l) => construirProductoCotizacion(l.item, l.calc)),
    [lineasCalc],
  );
  const totales = useMemo(() => calcularTotales(productosValidos, tipoCambio), [productosValidos, tipoCambio]);

  const clavesAgregadas = useMemo(() => new Set(lineas.map((l) => l.clave)), [lineas]);

  // ---- Handlers del buscador/tabla ----
  const agregarItems = useCallback((items) => {
    setResultado(null);
    setLineas((prev) => {
      const claves = new Set(prev.map((l) => l.clave));
      const nuevas = items.filter((it) => !claves.has(it.clave)).map((it) => lineaDesdeItem(it));
      return nuevas.length ? [...prev, ...nuevas] : prev;
    });
  }, []);

  const cambiarCantidad = useCallback((id, valor) => {
    setResultado(null);
    setLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, cantidad: ajustarCantidad(valor, l.item.minimo) } : l)),
    );
  }, []);

  const nudgeCantidad = useCallback((id, dir) => {
    setResultado(null);
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
    setResultado(null);
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ---- Validación ----
  const nombreClienteOk = cliente.nombre.trim().length > 0;
  const tipoCambioOk = tipoCambio > 0;
  const hayLineasInvalidas = lineasCalc.some((l) => !l.calc);
  const puedeGenerar = nombreClienteOk && tipoCambioOk && productosValidos.length > 0 && !hayLineasInvalidas;

  async function onGenerar() {
    setAviso('');
    if (!nombreClienteOk) {
      setAviso('El nombre del cliente es obligatorio.');
      return;
    }
    if (!tipoCambioOk) {
      setAviso('El tipo de cambio de configuración no es válido. Revisá config/general.');
      return;
    }
    if (productosValidos.length === 0) {
      setAviso('Agregá al menos un producto desde el buscador.');
      return;
    }
    if (hayLineasInvalidas) {
      const err = lineasCalc.find((l) => !l.calc)?.error;
      setAviso('Hay una línea con problema: ' + (err || 'revisá las cantidades.'));
      return;
    }

    setGenerando(true);
    try {
      const clienteDatos = { nombre: cliente.nombre.trim(), contacto: cliente.contacto.trim() };

      // 1) Crear y guardar en Firestore (estado GENERADA). La creación y la
      //    RESERVA ATÓMICA del consecutivo van en la misma transacción (Regla #2
      //    + número sin colisiones). El consecutivo definitivo lo devuelve el
      //    servicio (proviene del contador atómico, no del tiempo).
      const { consecutivo } = await crearCotizacion({
        prevendedor: perfil,
        cliente: clienteDatos,
        productos: productosValidos,
        totales,
        tipoCambio,
      });

      // 2) Generar el PDF. Si esto falla, la cotización ya quedó guardada.
      let pdfOk = true;
      try {
        const condiciones = await recolectarCondiciones(productosValidos);
        await generarPDFCotizacion({
          consecutivo,
          config,
          vendedor: {
            nombre: perfil.nombre || perfil.email,
            whatsapp: perfil.whatsapp || '',
            email: perfil.email || '',
          },
          cliente: clienteDatos,
          productos: productosValidos,
          totales,
          tipoCambio,
          condiciones,
        });
      } catch (e) {
        console.error('Error generando el PDF:', e);
        pdfOk = false;
      }

      setResultado({ consecutivo, pdfOk });
    } catch (e) {
      console.error('Error generando la cotización:', e);
      setAviso('No se pudo generar la cotización: ' + (e.message || e));
    } finally {
      setGenerando(false);
    }
  }

  function nuevaCotizacion() {
    setCliente({ nombre: '', contacto: '' });
    setLineas([]);
    setResultado(null);
    setAviso('');
  }

  if (cargandoCatalogo) {
    return (
      <div className="panel">
        <span className="cargando-inline">
          <span className="spinner" aria-hidden="true" />
          Cargando catálogo…
        </span>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="alerta-error" role="alert">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
        <span>{errorCarga}</span>
      </div>
    );
  }

  return (
    <div className="cotizador">
      <div className="cotizador-top">
        <Link to="/" className="btn btn-ghost btn-chico">
          {ICON.atras}
          Bandeja
        </Link>
        <div className="bandeja-titulo">
          <h1>Nueva cotización</h1>
          <span className="bandeja-conteo">Vendedor: {perfil?.nombre || perfil?.email}</span>
        </div>
      </div>

      {resultado ? (
        <div className="panel panel-exito" role="status">
          <span className="exito-icono" aria-hidden="true">
            {ICON.ok}
          </span>
          <h2>Cotización generada</h2>
          <p className="consecutivo-num">{resultado.consecutivo}</p>
          <p className="texto-suave">
            La cotización quedó guardada en estado <strong>Generada</strong>.
            {resultado.pdfOk
              ? ' El PDF se descargó automáticamente.'
              : ' El PDF no se pudo generar; podés reintentar desde una nueva cotización.'}
          </p>
          <div className="exito-acciones">
            <button className="btn btn-primario" onClick={nuevaCotizacion}>
              {ICON.mas}
              Nueva cotización
            </button>
            <Link to="/" className="btn btn-ghost">
              Ir a la bandeja
            </Link>
          </div>
        </div>
      ) : (
        <div className="cotizador-cuerpo">
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
              <TipoCambioLectura config={config} />
            </div>
          </section>

          {/* Buscador de combinaciones + carrito */}
          <section className="panel">
            <h2 className="seccion-titulo">Buscar productos</h2>
            <BuscadorProductos
              catalogo={catalogo}
              productos={productosLista}
              clavesAgregadas={clavesAgregadas}
              onAgregar={agregarItems}
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
              lineas={lineasCalc}
              onCantidad={cambiarCantidad}
              onNudge={nudgeCantidad}
              onQuitar={quitarLinea}
            />
          </section>

          {/* Totales + generar */}
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

            <button
              className="btn btn-primario btn-block"
              onClick={onGenerar}
              disabled={generando || !puedeGenerar}
            >
              {generando ? 'Generando…' : 'Generar cotización'}
            </button>
            <p className="campo-ayuda texto-centrado">
              Al generar, se guarda la cotización (Generada) y se descarga el PDF.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
