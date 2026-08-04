// ============================================
// Buscador de combinaciones + carrito (reemplaza la cascada).
// ------------------------------------------------------------
// Reutilizado por el Cotizador y por el modo edición del Detalle. Replica el
// comportamiento del legacy (form.js): buscador de texto (substring normalizado)
// + filtros (cod, producto, tamaño, material) con opciones dependientes, tabla
// de resultados con checkbox por fila, mini-carrito con pills y contador, y el
// botón "Agregar seleccionados" que agrega TODAS las marcadas de una sola vez.
// La lógica de datos vive en services/catalogo.js.
// ============================================
import { useEffect, useMemo, useState } from 'react';
import {
  filtrarCombinaciones,
  ordenarResultados,
  tamanosSegunFiltros,
  materialesSegunFiltros,
} from '../services/catalogo';
import { formatearNumero } from '../services/calculo';

const LIMITE_RESULTADOS = 150;

const ICONO_LUPA = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
    <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const ICONO_CHECK = (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function subtitulo(item) {
  return [item.impresion1, item.impresion2, item.material]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' · ');
}

export default function BuscadorProductos({ catalogo, productos, clavesAgregadas, onAgregar }) {
  const [query, setQuery] = useState('');
  const [cod, setCod] = useState('');
  const [producto, setProducto] = useState('');
  const [tamano, setTamano] = useState('');
  const [material, setMaterial] = useState('');
  const [seleccion, setSeleccion] = useState({}); // clave -> item
  const [listaAbierta, setListaAbierta] = useState(true);

  const agregadas = clavesAgregadas || new Set();

  // Opciones dependientes (espejo de updateSearch*FilterOptions del legacy).
  const tamanosDisp = useMemo(
    () => tamanosSegunFiltros(catalogo, { query, cod, producto, material }),
    [catalogo, query, cod, producto, material],
  );
  const materialesDisp = useMemo(
    () => materialesSegunFiltros(catalogo, { query, cod, producto, tamano }),
    [catalogo, query, cod, producto, tamano],
  );

  // Si el tamaño/material seleccionado dejó de aplicar, se limpia (como el legacy).
  useEffect(() => {
    if (tamano && !tamanosDisp.includes(tamano)) setTamano('');
  }, [tamanosDisp, tamano]);
  useEffect(() => {
    if (material && !materialesDisp.includes(material)) setMaterial('');
  }, [materialesDisp, material]);

  const tamanoEfectivo = tamano && tamanosDisp.includes(tamano) ? tamano : '';
  const materialEfectivo = material && materialesDisp.includes(material) ? material : '';

  const resultados = useMemo(() => {
    const base = filtrarCombinaciones(catalogo, {
      query,
      cod,
      producto,
      tamano: tamanoEfectivo,
      material: materialEfectivo,
    });
    return ordenarResultados(base).slice(0, LIMITE_RESULTADOS);
  }, [catalogo, query, cod, producto, tamanoEfectivo, materialEfectivo]);

  const seleccionadas = Object.values(seleccion);
  const totalCoincidencias = useMemo(
    () =>
      filtrarCombinaciones(catalogo, {
        query,
        cod,
        producto,
        tamano: tamanoEfectivo,
        material: materialEfectivo,
      }).length,
    [catalogo, query, cod, producto, tamanoEfectivo, materialEfectivo],
  );

  function alternarSeleccion(item) {
    setSeleccion((prev) => {
      const copia = { ...prev };
      if (copia[item.clave]) delete copia[item.clave];
      else copia[item.clave] = item;
      return copia;
    });
  }

  function limpiarSeleccion() {
    setSeleccion({});
  }

  function agregarSeleccionadas() {
    if (!seleccionadas.length) return;
    onAgregar(seleccionadas);
    setSeleccion({});
  }

  const materialDeshabilitado = materialesDisp.length <= 1;

  return (
    <div className="buscador-layout">
      <div className="buscador-panel">
        <div className="buscador-controles">
          <div className="buscador-input">
            <span className="buscador-input-icono" aria-hidden="true">
              {ICONO_LUPA}
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por producto, tamaño, impresión, material o código"
              aria-label="Buscar combinaciones de producto"
              autoComplete="off"
            />
          </div>

          <div className="buscador-filtros">
            <input
              type="text"
              value={cod}
              onChange={(e) => setCod(e.target.value)}
              placeholder="Código (ej: 1254)"
              aria-label="Filtrar por código"
              autoComplete="off"
              className="buscador-filtro"
            />
            <select
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              aria-label="Filtrar por producto"
              className="buscador-filtro"
            >
              <option value="">Todos los productos</option>
              {productos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={tamanoEfectivo}
              onChange={(e) => setTamano(e.target.value)}
              aria-label="Filtrar por tamaño"
              className="buscador-filtro"
            >
              <option value="">Todos los tamaños</option>
              {tamanosDisp.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={materialEfectivo}
              onChange={(e) => setMaterial(e.target.value)}
              aria-label="Filtrar por material"
              className="buscador-filtro"
              disabled={materialDeshabilitado}
            >
              <option value="">Todos los materiales</option>
              {materialesDisp.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="buscador-conteo texto-suave">
          {totalCoincidencias === 0
            ? 'Sin coincidencias'
            : totalCoincidencias > LIMITE_RESULTADOS
              ? `Mostrando ${LIMITE_RESULTADOS} de ${formatearNumero(totalCoincidencias)} coincidencias — refiná la búsqueda`
              : `${formatearNumero(totalCoincidencias)} coincidencia${totalCoincidencias === 1 ? '' : 's'}`}
        </p>

        <div className="buscador-resultados" aria-live="polite">
          {resultados.length === 0 ? (
            <p className="tabla-vacia">No hay coincidencias con esos filtros.</p>
          ) : (
            <table className="tabla-buscador">
              <thead>
                <tr>
                  <th className="col-sel" scope="col">
                    <span className="sr-only">Seleccionar</span>
                  </th>
                  <th className="col-cod" scope="col">Cod</th>
                  <th scope="col">Coincidencia</th>
                  <th className="col-min" scope="col">Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((item) => {
                  const yaAgregada = agregadas.has(item.clave);
                  const marcada = Boolean(seleccion[item.clave]);
                  return (
                    <tr key={item.clave} className={yaAgregada ? 'fila-agregada' : ''}>
                      <td className="col-sel">
                        {yaAgregada ? (
                          <span className="pastilla-agregada" title="Ya está en la cotización">
                            {ICONO_CHECK}
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="buscador-check"
                            checked={marcada}
                            onChange={() => alternarSeleccion(item)}
                            aria-label={`Seleccionar ${item.producto} ${item.tamano}`}
                          />
                        )}
                      </td>
                      <td className="col-cod">{item.cod || '—'}</td>
                      <td>
                        <span className="resultado-titulo">
                          {item.producto} ({item.tamano})
                        </span>
                        <span className="resultado-sub">{subtitulo(item) || '—'}</span>
                      </td>
                      <td className="col-min">{formatearNumero(item.minimo || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside className="carrito-panel" aria-label="Selecciones para agregar">
        <div className="carrito-encabezado">
          <h3 className="carrito-titulo">Selección</h3>
          <button
            type="button"
            className="carrito-toggle btn btn-ghost btn-chico"
            aria-expanded={listaAbierta}
            onClick={() => setListaAbierta((v) => !v)}
          >
            {listaAbierta ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        <p className="carrito-conteo">{seleccionadas.length} seleccionados</p>

        {listaAbierta && (
          <div className="carrito-lista">
            {seleccionadas.length === 0 ? (
              <p className="tabla-vacia">
                Marcá filas en los resultados para agregarlas en lote.
              </p>
            ) : (
              seleccionadas.map((item) => (
                <div className="carrito-pill" key={item.clave}>
                  <strong>
                    {item.producto} ({item.tamano})
                  </strong>
                  <span>{subtitulo(item) || '—'}</span>
                </div>
              ))
            )}
          </div>
        )}

        <div className="carrito-acciones">
          <button
            type="button"
            className="btn btn-ghost btn-chico"
            onClick={limpiarSeleccion}
            disabled={seleccionadas.length === 0}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="btn btn-primario btn-chico"
            onClick={agregarSeleccionadas}
            disabled={seleccionadas.length === 0}
          >
            Agregar seleccionados
          </button>
        </div>
      </aside>
    </div>
  );
}
