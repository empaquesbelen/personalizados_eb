// ============================================
// Módulo de Catálogo (rol superadmin) — consultar / agregar / editar productos.
// ------------------------------------------------------------
// Ruta: /catalogo (protegida SOLO para superadmin — ver App.jsx / RutaProtegida).
// La autorización REAL la imponen las Security Rules (catalogo: write para
// admin/backoffice/superadmin). Cada campo de texto es un CampoCombo: reutiliza
// valores que ya existen (evita duplicados) o permite texto libre si es nuevo.
// Tras guardar, el servicio invalida la caché → el cotizador ve los cambios.
// ============================================
import { useEffect, useMemo, useState } from 'react';
import {
  cargarCatalogoAdmin,
  crearProducto,
  actualizarProducto,
  setProductoActivo,
  valoresDistintos,
  validarProducto,
} from '../services/catalogo';
import CampoCombo from '../components/CampoCombo';

// Campos de texto (combinación) con su ayuda para el superadmin.
const CAMPOS_TEXTO = [
  { key: 'cod', label: 'Código', ayuda: 'Código interno del producto (ej. 200). Opcional.', obligatorio: false },
  { key: 'producto', label: 'Producto', ayuda: 'Nombre del producto (ej. Vasos, Bolsa).', obligatorio: true },
  { key: 'tamano', label: 'Tamaño', ayuda: 'Medida o presentación (ej. 10 oz, 20x20 cm).', obligatorio: true },
  { key: 'impresion1', label: 'Impresión 1', ayuda: 'Primera impresión/tinta. Dejalo vacío si no aplica.', obligatorio: false },
  { key: 'impresion2', label: 'Impresión 2', ayuda: 'Segunda impresión/tinta. Dejalo vacío si no aplica.', obligatorio: false },
  { key: 'material', label: 'Material', ayuda: 'Material del producto. Dejalo vacío si no aplica.', obligatorio: false },
];

function productoVacio() {
  return {
    cod: '', producto: '', tamano: '', impresion1: '', impresion2: '', material: '',
    minimo: 1, precioSinIVA: 0, precioEnUsd: false, activo: true,
  };
}

function normBusqueda(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function fmtPrecio(p) {
  const n = Number(p?.precioSinIVA) || 0;
  return p?.precioEnUsd
    ? `$${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₡${n.toLocaleString('es-CR')}`;
}

function fmtImpresiones(p) {
  return [p.impresion1, p.impresion2].map((v) => String(v || '').trim()).filter(Boolean).join(' / ') || '—';
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

export default function Catalogo() {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const [texto, setTexto] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [editando, setEditando] = useState(null); // producto (con id) | productoVacio() | null

  async function recargar() {
    setCargando(true);
    setError('');
    try {
      const data = await cargarCatalogoAdmin();
      // Orden estable por producto, luego tamaño.
      data.sort(
        (a, b) =>
          String(a.producto || '').localeCompare(String(b.producto || ''), 'es', { numeric: true }) ||
          String(a.tamano || '').localeCompare(String(b.tamano || ''), 'es', { numeric: true }),
      );
      setItems(data);
    } catch (e) {
      console.error('Error cargando el catálogo:', e);
      setError('No se pudo cargar el catálogo: ' + (e.message || e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  // Opciones (valores existentes) por campo, para los combobox del formulario.
  const opcionesPorCampo = useMemo(() => {
    const o = {};
    for (const c of CAMPOS_TEXTO) o[c.key] = valoresDistintos(items, c.key);
    return o;
  }, [items]);

  const itemsFiltrados = useMemo(() => {
    const q = normBusqueda(texto);
    return items.filter((it) => {
      if (soloActivos && it.activo === false) return false;
      if (!q) return true;
      const heno = normBusqueda(
        `${it.cod || ''} ${it.producto || ''} ${it.tamano || ''} ${it.impresion1 || ''} ${it.impresion2 || ''} ${it.material || ''}`,
      );
      return heno.includes(q);
    });
  }, [items, texto, soloActivos]);

  const totalActivos = useMemo(() => items.filter((i) => i.activo !== false).length, [items]);

  async function onGuardado(mensaje) {
    setEditando(null);
    setAviso(mensaje);
    await recargar();
  }

  async function toggleActivo(it) {
    setAviso('');
    try {
      await setProductoActivo(it.id, it.activo === false);
      await recargar();
      setAviso(`«${it.producto || it.id}» ${it.activo === false ? 'reactivado' : 'desactivado'}.`);
    } catch (e) {
      console.error('Error cambiando estado del producto:', e);
      setError('No se pudo cambiar el estado: ' + (e.message || e));
    }
  }

  return (
    <div className="catalogo">
      <div className="bandeja-header">
        <div className="bandeja-titulo">
          <h1>Catálogo de productos</h1>
          {!cargando && !error && (
            <span className="bandeja-conteo">
              {totalActivos} activo{totalActivos === 1 ? '' : 's'} · {items.length} en total
            </span>
          )}
        </div>
        <button type="button" className="btn btn-acento" onClick={() => setEditando(productoVacio())}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          Agregar producto
        </button>
      </div>

      {aviso && (
        <div className="alerta-ok" role="status">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{aviso}</span>
        </div>
      )}
      {error && alertaError(error)}

      {!cargando && !error && items.length > 0 && (
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
              placeholder="Buscar por producto, código, tamaño, material…"
              aria-label="Buscar en el catálogo"
              autoComplete="off"
            />
          </div>
          <label className="pago-check">
            <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
            <span>Solo activos</span>
          </label>
        </div>
      )}

      {cargando ? (
        <div className="panel">
          <span className="cargando-inline">
            <span className="spinner" aria-hidden="true" />
            Cargando catálogo…
          </span>
        </div>
      ) : itemsFiltrados.length === 0 ? (
        <div className="panel vacio">
          <strong>{items.length === 0 ? 'El catálogo está vacío' : 'Sin resultados'}</strong>
          <span>
            {items.length === 0
              ? 'Agregá el primer producto con el botón de arriba.'
              : 'Probá con otro término o mostrá también los inactivos.'}
          </span>
        </div>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Tamaño</th>
                <th>Impresión</th>
                <th>Material</th>
                <th className="col-num">Mínimo</th>
                <th className="col-num">Precio s/IVA</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {itemsFiltrados.map((it) => (
                <tr key={it.id} className={it.activo === false ? 'fila-inactiva' : ''}>
                  <td data-label="Código">{it.cod || '—'}</td>
                  <td data-label="Producto">{it.producto || '—'}</td>
                  <td data-label="Tamaño">{it.tamano || '—'}</td>
                  <td data-label="Impresión">{fmtImpresiones(it)}</td>
                  <td data-label="Material">{it.material || '—'}</td>
                  <td data-label="Mínimo" className="col-num">{Number(it.minimo || 0).toLocaleString('es-CR')}</td>
                  <td data-label="Precio s/IVA" className="col-num">
                    {fmtPrecio(it)}
                    {it.precioEnUsd && <span className="badge-usd"> USD</span>}
                  </td>
                  <td data-label="Estado">
                    <span className={`chip ${it.activo === false ? 'chip--anulada' : 'chip--completada'}`}>
                      {it.activo === false ? 'Inactivo' : 'Activo'}
                    </span>
                  </td>
                  <td data-label="Acciones" className="col-acciones">
                    <button type="button" className="btn btn-ghost btn-chico" onClick={() => setEditando(it)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-ghost btn-chico" onClick={() => toggleActivo(it)}>
                      {it.activo === false ? 'Reactivar' : 'Desactivar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ModalProducto
          inicial={editando}
          opcionesPorCampo={opcionesPorCampo}
          onCerrar={() => setEditando(null)}
          onGuardado={onGuardado}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal para agregar / editar un producto (combobox por campo + validación).
// ---------------------------------------------------------------------------
function ModalProducto({ inicial, opcionesPorCampo, onCerrar, onGuardado }) {
  const esNuevo = !inicial.id;
  const [form, setForm] = useState({ ...productoVacio(), ...inicial });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (parche) => setForm((f) => ({ ...f, ...parche }));

  async function onSubmit(e) {
    e.preventDefault();
    const motivo = validarProducto(form);
    if (motivo) {
      setError(motivo);
      return;
    }
    setError('');
    setGuardando(true);
    try {
      if (esNuevo) {
        await crearProducto(form);
        onGuardado(`Producto «${form.producto.trim()}» creado.`);
      } else {
        await actualizarProducto(inicial.id, form);
        onGuardado(`Producto «${form.producto.trim()}» actualizado.`);
      }
    } catch (err) {
      console.error('Error guardando el producto:', err);
      setError('No se pudo guardar: ' + (err.message || err));
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !guardando && onCerrar()}>
      <form
        className="modal modal-ancho"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={esNuevo ? 'Agregar producto' : 'Editar producto'}
      >
        <h3>{esNuevo ? 'Agregar producto' : 'Editar producto'}</h3>
        <p className="modal-detalle">
          Los campos con selector muestran los valores que ya existen (para reutilizarlos);
          si escribís algo nuevo, se creará como valor nuevo.
        </p>

        {error && alertaError(error)}

        <div className="producto-grid">
          {CAMPOS_TEXTO.map((c) => (
            <CampoCombo
              key={c.key}
              label={c.label}
              ayuda={c.ayuda}
              obligatorio={c.obligatorio}
              valor={form[c.key]}
              opciones={opcionesPorCampo[c.key] || []}
              onChange={(v) => set({ [c.key]: v })}
              placeholder={c.obligatorio ? 'Obligatorio' : 'Opcional'}
            />
          ))}

          <label className="campo">
            <span>Cantidad mínima *</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.minimo}
              onChange={(e) => set({ minimo: e.target.value })}
            />
            <span className="campo-ayuda">Mínimo de unidades por pedido (se redondea al múltiplo).</span>
          </label>

          <label className="campo">
            <span>Precio sin IVA *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.precioSinIVA}
              onChange={(e) => set({ precioSinIVA: e.target.value })}
            />
            <span className="campo-ayuda">
              {form.precioEnUsd
                ? 'En dólares: se multiplica por el tipo de cambio del BCCR al cotizar.'
                : 'En colones (₡). Debe ser mayor que 0.'}
            </span>
          </label>

          <label className="pago-check producto-check">
            <input
              type="checkbox"
              checked={Boolean(form.precioEnUsd)}
              onChange={(e) => set({ precioEnUsd: e.target.checked })}
            />
            <span>El precio está en dólares (USD)</span>
          </label>

          {!esNuevo && (
            <label className="pago-check producto-check">
              <input
                type="checkbox"
                checked={form.activo !== false}
                onChange={(e) => set({ activo: e.target.checked })}
              />
              <span>Activo (visible en el cotizador)</span>
            </label>
          )}
        </div>

        <div className="modal-acciones">
          <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
