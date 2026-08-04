// ============================================
// Tabla de productos de la cotización (líneas agregadas desde el buscador).
// ------------------------------------------------------------
// Los campos del producto NO son editables (vienen del buscador). SOLO la
// cantidad es editable, con botones +/- que suben/bajan de a `minimo` y con
// redondeo hacia arriba al múltiplo del mínimo (regla del legacy). El parent
// mantiene el estado y aplica `ajustarCantidad`; aquí solo se dispara.
// ============================================
import { useEffect, useState } from 'react';
import { formatearColones, formatearNumero, MAX_CANTIDAD } from '../services/calculo';

const ICONO_MENOS = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const ICONO_MAS = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const ICONO_BORRAR = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function impresiones(item) {
  return [item.impresion1, item.impresion2]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' / ') || '—';
}

// Fila con la cantidad editable (texto transitorio → commit en blur/Enter).
function FilaProducto({ linea, onCantidad, onNudge, onQuitar }) {
  const { item, cantidad, calc } = linea;
  const minimo = Math.max(1, Math.round(Number(item.minimo) || 1));
  const [texto, setTexto] = useState(String(cantidad));

  // Sincroniza el texto local cuando la cantidad cambia desde fuera (+/-, ajuste).
  useEffect(() => {
    setTexto(String(cantidad));
  }, [cantidad]);

  const comprometer = () => onCantidad(linea.id, texto);

  return (
    <tr>
      <td data-label="Producto">{item.producto || '—'}</td>
      <td data-label="Tamaño">{item.tamano || '—'}</td>
      <td data-label="Impresión">{impresiones(item)}</td>
      <td data-label="Material">{item.material || '—'}</td>
      <td data-label="Mínimo" className="col-num">{formatearNumero(minimo)}</td>
      <td data-label="Cantidad" className="col-cantidad">
        <div className="cantidad-stepper">
          <button
            type="button"
            className="cantidad-btn"
            onClick={() => onNudge(linea.id, -1)}
            disabled={cantidad <= minimo}
            aria-label="Disminuir cantidad"
          >
            {ICONO_MENOS}
          </button>
          <input
            type="number"
            className="cantidad-campo"
            inputMode="numeric"
            min={minimo}
            max={MAX_CANTIDAD}
            step={minimo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={comprometer}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                comprometer();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                onNudge(linea.id, 1);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                onNudge(linea.id, -1);
              }
            }}
            aria-label={`Cantidad (múltiplos de ${minimo})`}
          />
          <button
            type="button"
            className="cantidad-btn"
            onClick={() => onNudge(linea.id, 1)}
            aria-label="Aumentar cantidad"
          >
            {ICONO_MAS}
          </button>
        </div>
      </td>
      <td data-label="Precio sin IVA" className="col-num">
        {calc ? formatearColones(calc.totalProducto) : '—'}
      </td>
      <td data-label="IVA" className="col-num">
        {calc ? formatearColones(calc.ivaLinea) : '—'}
      </td>
      <td data-label="Total con IVA" className="col-num col-total">
        {calc ? formatearColones(calc.totalProductoConIVA) : '—'}
      </td>
      <td data-label="Unit. con IVA" className="col-num">
        {calc ? formatearColones(calc.precioUnitario) : '—'}
      </td>
      <td data-label="" className="col-quitar">
        <button
          type="button"
          className="btn btn-ghost btn-chico btn-icono"
          onClick={() => onQuitar(linea.id)}
          aria-label={`Quitar ${item.producto} ${item.tamano}`}
          title="Quitar línea"
        >
          {ICONO_BORRAR}
        </button>
      </td>
    </tr>
  );
}

export default function TablaProductosCotizacion({ lineas, onCantidad, onNudge, onQuitar }) {
  return (
    <div className="tabla-wrap">
      <table className="tabla tabla-productos tabla-cotizacion">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Tamaño</th>
            <th>Impresión</th>
            <th>Material</th>
            <th className="col-num">Mínimo</th>
            <th className="col-cantidad">Cantidad</th>
            <th className="col-num">Precio sin IVA</th>
            <th className="col-num">IVA</th>
            <th className="col-num">Total con IVA</th>
            <th className="col-num">Unit. con IVA</th>
            <th className="col-quitar"><span className="sr-only">Quitar</span></th>
          </tr>
        </thead>
        <tbody>
          {lineas.length === 0 ? (
            <tr>
              <td colSpan={11} className="texto-suave tabla-vacia-celda">
                Buscá combinaciones arriba y presioná "Agregar seleccionados".
              </td>
            </tr>
          ) : (
            lineas.map((l) => (
              <FilaProducto
                key={l.id}
                linea={l}
                onCantidad={onCantidad}
                onNudge={onNudge}
                onQuitar={onQuitar}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
