// ============================================
// Servicio de catálogo (Firestore) — Módulo Cotizador (Fase 4)
// ------------------------------------------------------------
// Estrategia: se lee TODO el `catalogo` una sola vez (un getDocs) y se cachea
// en memoria. La cascada (producto → tamaño → impresión1 → impresión2 →
// material) se deriva del lado cliente filtrando el arreglo cacheado. Es más
// eficiente que lanzar muchas queries y refleja fielmente la lógica del legacy
// (Code.gs: getProductos/getTamanos/getOpciones/buscarProducto).
//
// `config/general` y `condiciones` también se leen una vez y se cachean.
// Reglas: `catalogo`/`config`/`condiciones` son de lectura para usuario activo.
// ============================================
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ---- Cachés en memoria (viven mientras la pestaña esté abierta) ----
let cacheCatalogo = null; // Array<itemCatalogo>
let promesaCatalogo = null; // evita cargas duplicadas concurrentes
let cacheBusqueda = null; // Array<itemCatalogo + searchableNormalized + clave>
let cacheConfig = null;
let promesaConfig = null;
let cacheCondiciones = null; // Array<{ articulo, texto }>
let promesaCondiciones = null;

// ---- Normalización (espejo de normalizeComparableText del legacy) ----
// Quita tildes, espacios y pasa a minúsculas para comparar sin ambigüedades.
function normComparable(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

// Normaliza para lookup de condiciones (mantiene espacios; espejo de normalizeLookupKey).
function normLookup(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Versión compacta (sin espacios ni símbolos) para match flexible de condiciones.
function normCompacto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const txt = (v) => String(v ?? '').trim();

/**
 * Carga (o devuelve de caché) TODO el catálogo activo.
 * @returns {Promise<Array>} items del catálogo
 */
export async function cargarCatalogo() {
  if (cacheCatalogo) return cacheCatalogo;
  if (promesaCatalogo) return promesaCatalogo;

  promesaCatalogo = (async () => {
    const snap = await getDocs(collection(db, 'catalogo'));
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      // Solo combinaciones activas y con producto+tamaño válidos.
      .filter((it) => it.activo !== false && txt(it.producto) && txt(it.tamano));
    cacheCatalogo = items;
    return items;
  })();

  try {
    return await promesaCatalogo;
  } finally {
    promesaCatalogo = null;
  }
}

/** Limpia las cachés (útil si en el futuro se edita el catálogo/config en caliente). */
export function invalidarCache() {
  cacheCatalogo = null;
  cacheBusqueda = null;
  cacheConfig = null;
  cacheCondiciones = null;
}

// ---------------------------------------------------------------------------
// Administración del catálogo (módulo del superadmin): CRUD de productos.
// Tras CADA escritura se invalida la caché para que el cotizador vea los cambios
// (precios/mínimos/combinaciones) sin recargar la app. "Dinero = cuidado"
// (Regla #10): el precio se valida > 0. Borrado = soft-delete (`activo:false`),
// que el cotizador ya respeta (Regla #7); nunca se borra físicamente.
// ---------------------------------------------------------------------------

/** Campos de texto (combinación) de un producto — orden de captura en el form. */
export const CAMPOS_COMBINACION = ['cod', 'producto', 'tamano', 'impresion1', 'impresion2', 'material'];

/**
 * Carga TODOS los productos del catálogo, INCLUIDOS los inactivos y los que no
 * tienen producto/tamaño (para poder corregirlos). Para administración; no toca
 * la caché del cotizador (que filtra activos).
 * @returns {Promise<Array>} items con { id, ...campos }
 */
export async function cargarCatalogoAdmin() {
  const snap = await getDocs(collection(db, 'catalogo'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Normaliza los datos crudos del formulario a la forma canónica del doc. */
export function normalizarProducto(datos = {}) {
  return {
    cod: txt(datos.cod),
    producto: txt(datos.producto),
    tamano: txt(datos.tamano),
    impresion1: txt(datos.impresion1),
    impresion2: txt(datos.impresion2),
    material: txt(datos.material),
    minimo: Math.max(1, Math.round(Number(datos.minimo) || 1)),
    precioSinIVA: Math.max(0, Number(datos.precioSinIVA) || 0),
    precioEnUsd: Boolean(datos.precioEnUsd),
    // Condición asignada (id del doc en `condiciones`). '' = explícitamente
    // "ninguna". Se guarda desde el módulo de Catálogo (superadmin).
    condicionId: txt(datos.condicionId),
    activo: datos.activo !== false,
  };
}

/**
 * Valida un producto. '' si es válido; si no, el motivo (en español, para la UI).
 * producto y tamaño son obligatorios (como en la importación del legacy) y el
 * precio debe ser > 0.
 */
export function validarProducto(datos = {}) {
  const p = normalizarProducto(datos);
  if (!p.producto) return 'El nombre del producto es obligatorio.';
  if (!p.tamano) return 'El tamaño es obligatorio.';
  if (!(p.minimo >= 1)) return 'La cantidad mínima debe ser al menos 1.';
  if (!(p.precioSinIVA > 0)) return 'El precio sin IVA debe ser mayor que 0.';
  return '';
}

/** Crea un producto nuevo (id automático). Invalida la caché del cotizador. */
export async function crearProducto(datos) {
  const ref = await addDoc(collection(db, 'catalogo'), normalizarProducto(datos));
  invalidarCache();
  return ref.id;
}

/** Actualiza un producto existente. Invalida la caché del cotizador. */
export async function actualizarProducto(id, datos) {
  await updateDoc(doc(db, 'catalogo', id), normalizarProducto(datos));
  invalidarCache();
}

/** Activa/desactiva un producto (soft-delete). Invalida la caché. */
export async function setProductoActivo(id, activo) {
  await updateDoc(doc(db, 'catalogo', id), { activo: Boolean(activo) });
  invalidarCache();
}

/** Valores distintos (no vacíos) de un campo, ordenados — para los combobox. */
export function valoresDistintos(items, campo) {
  const set = new Set();
  (items || []).forEach((it) => {
    const v = txt(it?.[campo]);
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/** ¿`valor` ya existe entre `opciones`? (comparación sin tildes/espacios/caso). */
export function existeValor(opciones, valor) {
  const objetivo = normComparable(valor);
  if (!objetivo) return false;
  return (opciones || []).some((o) => normComparable(o) === objetivo);
}

// ---------------------------------------------------------------------------
// Buscador de combinaciones (reemplaza la cascada) — espejo del legacy form.js
// (initializeProductSearch / runProductSearch / filtros dependientes).
// Cada documento del catálogo YA es una combinación; la selección se hace por
// buscador de texto + filtros + carrito, no por menús en cascada.
// ---------------------------------------------------------------------------

/**
 * Normaliza para búsqueda: sin tildes, minúsculas, SOLO alfanumérico.
 * Espejo exacto de `normalizeSearchText` del legacy (form.js).
 */
export function normalizarBusqueda(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clave única de selección de una combinación (espejo de `createSelectionKey`):
 * cod|producto|tamano|impresion1|impresion2|material.
 */
export function claveItem(item) {
  return [item?.cod, item?.producto, item?.tamano, item?.impresion1, item?.impresion2, item?.material]
    .map((v) => String(v ?? '').trim())
    .join('|');
}

/**
 * Carga (o devuelve de caché) TODO el catálogo para el buscador, con un texto
 * normalizado precomputado (cod+producto+tamaño+impresión1+impresión2+material)
 * y su clave de selección. Espejo de `initializeProductSearch` del legacy.
 * @returns {Promise<Array>} items con `searchableNormalized` y `clave`.
 */
export async function cargarCatalogoBusqueda() {
  if (cacheBusqueda) return cacheBusqueda;
  const items = await cargarCatalogo();
  cacheBusqueda = items.map((it) => ({
    ...it,
    searchableNormalized: normalizarBusqueda(
      `${it.cod || ''} ${it.producto || ''} ${it.tamano || ''} ${it.impresion1 || ''} ${it.impresion2 || ''} ${it.material || ''}`,
    ),
    clave: claveItem(it),
  }));
  return cacheBusqueda;
}

/** ¿El producto es "Vasos"? (para el orden personalizado del legacy). */
function esVasos(item) {
  return normalizarBusqueda(item && item.producto).includes('vaso');
}

/** Rango por temperatura para Vasos: caliente(0) → frío(1) → otro(2). */
function rangoTemperaturaVasos(item) {
  const combinado = normalizarBusqueda(
    `${item?.impresion1 || ''} ${item?.impresion2 || ''} ${item?.material || ''}`,
  );
  if (combinado.includes('caliente')) return 0;
  if (combinado.includes('frio') || combinado.includes('fria')) return 1;
  return 2;
}

/** Rango por cantidad de colores en la impresión (para Vasos). */
function rangoColores(item) {
  const combinado = `${item?.impresion1 || ''} ${item?.impresion2 || ''}`;
  const match = combinado.match(/(\d+)\s*color/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const valor = parseInt(match[1], 10);
  return Number.isNaN(valor) ? Number.MAX_SAFE_INTEGER : valor;
}

/**
 * Ordena los resultados de búsqueda con el orden personalizado para Vasos
 * (producto → tamaño → temperatura → colores → impresión1 → impresión2 →
 * material). Espejo de `sortSearchResults` del legacy.
 */
export function ordenarResultados(lista) {
  return [...lista].sort((a, b) => {
    if (!esVasos(a) || !esVasos(b)) return 0;
    const prod = String(a.producto || '').localeCompare(String(b.producto || ''), 'es');
    if (prod !== 0) return prod;
    const tam = String(a.tamano || '').localeCompare(String(b.tamano || ''), 'es', { numeric: true });
    if (tam !== 0) return tam;
    const temp = rangoTemperaturaVasos(a) - rangoTemperaturaVasos(b);
    if (temp !== 0) return temp;
    const col = rangoColores(a) - rangoColores(b);
    if (col !== 0) return col;
    const i1 = String(a.impresion1 || '').localeCompare(String(b.impresion1 || ''), 'es');
    if (i1 !== 0) return i1;
    const i2 = String(a.impresion2 || '').localeCompare(String(b.impresion2 || ''), 'es');
    if (i2 !== 0) return i2;
    return String(a.material || '').localeCompare(String(b.material || ''), 'es');
  });
}

/**
 * Filtra el catálogo por texto (substring normalizado) + filtros exactos
 * (cod por substring; producto/tamaño/material por igualdad). Espejo de
 * `runProductSearch` del legacy. NO ordena ni recorta.
 */
export function filtrarCombinaciones(catalogo, { query = '', cod = '', producto = '', tamano = '', material = '' } = {}) {
  const q = normalizarBusqueda(query);
  const codT = String(cod || '').trim();
  return (catalogo || []).filter((it) => {
    if (codT && !String(it.cod || '').includes(codT)) return false;
    if (producto && it.producto !== producto) return false;
    if (tamano && it.tamano !== tamano) return false;
    if (material && it.material !== material) return false;
    if (!q) return true;
    return it.searchableNormalized.includes(q);
  });
}

/** Lista ordenada de productos presentes en el catálogo de búsqueda. */
export function productosDeCatalogo(catalogo) {
  const set = new Set();
  (catalogo || []).forEach((it) => {
    const p = txt(it.producto);
    if (p) set.add(p);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Tamaños disponibles acotados por cod/producto/material/consulta (espejo de
 * `updateSearchSizeFilterOptions`). No considera el propio filtro de tamaño.
 */
export function tamanosSegunFiltros(catalogo, { query = '', cod = '', producto = '', material = '' } = {}) {
  const scoped = filtrarCombinaciones(catalogo, { query, cod, producto, material });
  return Array.from(new Set(scoped.map((it) => it.tamano).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es', { numeric: true }),
  );
}

/**
 * Materiales disponibles acotados por cod/producto/tamaño/consulta (espejo de
 * `updateSearchMaterialFilterOptions`). No considera el propio filtro de material.
 */
export function materialesSegunFiltros(catalogo, { query = '', cod = '', producto = '', tamano = '' } = {}) {
  const scoped = filtrarCombinaciones(catalogo, { query, cod, producto, tamano });
  return Array.from(new Set(scoped.map((it) => it.material).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}

/** Lista de productos únicos (ordenada). */
export async function getProductos() {
  const items = await cargarCatalogo();
  const set = new Set();
  items.forEach((it) => {
    const p = txt(it.producto);
    if (p) set.add(p);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Tamaños disponibles para un producto (ordenados). */
export async function getTamanos(producto) {
  if (!producto) return [];
  const items = await cargarCatalogo();
  const objetivo = normComparable(producto);
  const set = new Set();
  items.forEach((it) => {
    if (normComparable(it.producto) !== objetivo) return;
    const t = txt(it.tamano);
    if (t) set.add(t);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

/**
 * Opciones de la cascada para (producto, tamaño), con filtrado dependiente
 * opcional por impresión1 e impresión2 (espejo de getOpciones del legacy).
 *   - impresiones1: todas las de (producto, tamaño)
 *   - impresiones2: filtradas por impresion1 si se pasa
 *   - materiales:   filtrados por impresion1 e impresion2 si se pasan
 * @returns {Promise<{impresiones1:string[], impresiones2:string[], materiales:string[]}>}
 */
export async function getOpciones(producto, tamano, impresion1 = '', impresion2 = '') {
  const vacio = { impresiones1: [], impresiones2: [], materiales: [] };
  if (!producto || !tamano) return vacio;

  const items = await cargarCatalogo();
  const pObj = normComparable(producto);
  const tObj = normComparable(tamano);
  const i1Obj = impresion1 ? normComparable(impresion1) : null;
  const i2Obj = impresion2 ? normComparable(impresion2) : null;

  const imp1 = new Set();
  const imp2 = new Set();
  const mat = new Set();

  items.forEach((it) => {
    if (normComparable(it.producto) !== pObj || normComparable(it.tamano) !== tObj) return;

    const rowImp1 = txt(it.impresion1);
    const rowImp2 = txt(it.impresion2);
    const rowMat = txt(it.material);

    if (rowImp1) imp1.add(rowImp1);
    // impresion2 solo si la impresión1 coincide (o no se filtra por ella)
    if (i1Obj && normComparable(rowImp1) !== i1Obj) return;
    if (rowImp2) imp2.add(rowImp2);
    // materiales solo si impresión2 coincide (o no se filtra por ella)
    if (i2Obj && normComparable(rowImp2) !== i2Obj) return;
    if (rowMat) mat.add(rowMat);
  });

  const ord = (arr) => Array.from(arr).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  return { impresiones1: ord(imp1), impresiones2: ord(imp2), materiales: ord(mat) };
}

/**
 * Busca el documento de catálogo para una combinación exacta.
 * @returns {Promise<object|null>} item del catálogo o null si no existe.
 */
export async function buscarItem(producto, tamano, impresion1, impresion2, material) {
  if (!producto || !tamano) return null;
  const items = await cargarCatalogo();

  const pObj = normComparable(producto);
  const tObj = normComparable(tamano);
  const i1Obj = normComparable(impresion1);
  const i2Obj = normComparable(impresion2);
  const mObj = normComparable(material);

  return (
    items.find(
      (it) =>
        normComparable(it.producto) === pObj &&
        normComparable(it.tamano) === tObj &&
        normComparable(it.impresion1) === i1Obj &&
        normComparable(it.impresion2) === i2Obj &&
        normComparable(it.material) === mObj,
    ) || null
  );
}

/**
 * Convierte a Date LOCAL un valor de fecha, aceptando:
 *  - Firestore Timestamp (.toDate())
 *  - Date
 *  - "yyyy-MM-dd"  (ISO date-only, como la entrega el SDDE del BCCR)
 *  - "dd/MM/yyyy"  (formato CR / legacy)
 *  - cualquier otra cadena parseable por Date (último recurso)
 *
 * CLAVE: las fechas SOLO-fecha (sin hora) se construyen en hora **local**, no
 * UTC. `new Date("2026-07-24")` se interpreta como medianoche UTC y, en Costa
 * Rica (UTC−6), al formatear retrocede al día anterior (bug del "−1 día"). Al
 * construir con (año, mes−1, día) el Date queda anclado al día correcto local.
 * Devuelve null si no es una fecha válida.
 */
function aFecha(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  const s = String(valor).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); // ISO date-only → LOCAL
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // dd/MM/yyyy (CR / legacy) → LOCAL
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Obtiene el tipo de cambio en vivo desde el Apps Script del BCCR (empresa).
 * @param {string} url URL /exec del Web App. @returns {Promise<{valor,fecha}|null>}
 */
async function fetchTipoCambioEndpoint(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    // El Apps Script puede responder { success:false, ... } si el BCCR falla:
    // en ese caso no hay tipoCambio y caemos al valor de config (fallback).
    const valor = Number(json?.data?.tipoCambio ?? json?.tipoCambio);
    if (!valor || valor <= 0) return null;
    // La fecha llega en ISO (yyyy-MM-dd) desde el SDDE; aFecha la ancla local.
    return { valor, fecha: aFecha(json?.data?.fecha ?? json?.fecha) || new Date() };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Lee (y cachea) la configuración general (config/general).
 *
 * Tipo de cambio (NO editable en la UI): se usa `tipoCambio` si existe (valor
 * resuelto/BCCR); si no, cae en `tipoCambioManual`. También se expone la fuente
 * (`tipoCambioFuente`: "BCCR"/"manual") y la fecha si están, para mostrarlas
 * como texto de solo lectura (espejo de loadInitialData del legacy).
 * @returns {Promise<object>} con tipoCambio, tipoCambioFuente, tipoCambioFecha,
 *   tipoCambioManual, iva, nombreEmpresa, etc.
 */
export async function getConfig() {
  if (cacheConfig) return cacheConfig;
  if (promesaConfig) return promesaConfig;

  promesaConfig = (async () => {
    const snap = await getDoc(doc(db, 'config', 'general'));
    const data = snap.exists() ? snap.data() : {};
    const manual = Number(data.tipoCambioManual) || 512;
    // Efectivo: BCCR (`tipoCambio`) si viene; si no, el manual.
    let efectivo = Number(data.tipoCambio) > 0 ? Number(data.tipoCambio) : manual;
    // Fuente: la declarada; si hay `tipoCambio` explícito y no hay fuente, es BCCR.
    let fuente = data.tipoCambioFuente || (Number(data.tipoCambio) > 0 ? 'BCCR' : 'manual');
    let fecha = aFecha(data.tipoCambioFecha);

    // Si hay endpoint del BCCR (Apps Script de la empresa), traer el valor en
    // vivo y usarlo consistentemente (precios + total USD). Fallback: lo de config.
    if (data.tipoCambioEndpoint) {
      try {
        const vivo = await fetchTipoCambioEndpoint(data.tipoCambioEndpoint);
        if (vivo) {
          efectivo = vivo.valor;
          fuente = 'BCCR';
          fecha = vivo.fecha;
        }
      } catch (e) {
        console.warn('Tipo de cambio en vivo no disponible; se usa el de config:', e);
      }
    }

    // Defaults defensivos (mismos valores que el legacy) por si falta alguna clave.
    cacheConfig = {
      tipoCambio: efectivo,
      tipoCambioFuente: fuente,
      tipoCambioFecha: fecha,
      tipoCambioManual: manual,
      iva: typeof data.iva === 'number' ? data.iva : 0.13,
      nombreEmpresa: data.nombreEmpresa || 'Empaques Belén',
      telefono: data.telefono || '(506) 2438-5119 / 2438-0930',
      direccion: data.direccion || 'San Rafael, Alajuela, Costa Rica',
      cedulaJuridica: data.cedulaJuridica || '3-101-135332',
    };
    return cacheConfig;
  })();

  try {
    return await promesaConfig;
  } finally {
    promesaConfig = null;
  }
}

/** Carga (y cachea) todas las condiciones. */
async function cargarCondiciones() {
  if (cacheCondiciones) return cacheCondiciones;
  if (promesaCondiciones) return promesaCondiciones;

  promesaCondiciones = (async () => {
    const snap = await getDocs(collection(db, 'condiciones'));
    cacheCondiciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return cacheCondiciones;
  })();

  try {
    return await promesaCondiciones;
  } finally {
    promesaCondiciones = null;
  }
}

/**
 * Devuelve el texto de condiciones para un artículo, con match flexible
 * (espejo de getCondiciones de Code.gs): exacto → contiene → solapamiento de
 * tokens, prefiriendo el match más específico.
 * @returns {Promise<string>} texto de condiciones ('' si no hay).
 */
export async function getCondiciones(articulo) {
  if (!articulo) return '';
  const condiciones = await cargarCondiciones();
  const target = normLookup(articulo);
  const targetCompacto = normCompacto(articulo);

  // 1) Coincidencia exacta normalizada.
  const exacto = condiciones.find((c) => normLookup(c.articulo) === target);
  if (exacto) return exacto.texto || '';

  // 2) Coincidencia flexible (para variaciones como "Vasos 12 oz" vs "Vasos").
  let mejor = { score: 0, largo: 0, texto: '' };
  for (const c of condiciones) {
    const sujetoRaw = txt(c.articulo);
    const textoRaw = c.texto || '';
    if (!sujetoRaw || !textoRaw) continue;

    const sujeto = normLookup(sujetoRaw);
    const sujetoCompacto = normCompacto(sujetoRaw);
    if (!sujetoCompacto || !targetCompacto) continue;

    let score = 0;
    if (sujetoCompacto === targetCompacto) {
      score = 95;
    } else if (
      targetCompacto.indexOf(sujetoCompacto) !== -1 ||
      sujetoCompacto.indexOf(targetCompacto) !== -1
    ) {
      score = 80;
    } else {
      const targetTokens = target.split(/\s+/).filter(Boolean);
      const sujetoTokens = sujeto.split(/\s+/).filter(Boolean);
      const overlap = sujetoTokens.filter((t) => targetTokens.indexOf(t) !== -1).length;
      if (overlap > 0) score = 50 + Math.min(20, overlap * 10);
    }

    if (score > 0 && (score > mejor.score || (score === mejor.score && sujetoCompacto.length > mejor.largo))) {
      mejor = { score, largo: sujetoCompacto.length, texto: textoRaw };
    }
  }

  return mejor.score > 0 ? mejor.texto : '';
}

/**
 * Resuelve el "sujeto" de condiciones para un producto (espejo de
 * resolveProductConditionSubject del legacy). Los Vasos usan condiciones
 * distintas según el material (Cartón, PET, Cartón + PLA).
 */
export function resolverSujetoCondicion(producto, material) {
  const nombre = txt(producto);
  if (!nombre) return '';
  const pNorm = normCompacto(nombre);
  if (!pNorm.includes('vaso')) return nombre;

  const mNorm = normCompacto(material);
  if (mNorm.includes('carton') && mNorm.includes('pla')) return 'Vasos Carton + PLA';
  if (mNorm.includes('pet')) return 'Vasos Pet';
  if (mNorm.includes('carton')) return 'Vasos Carton';
  return nombre;
}

// ---------------------------------------------------------------------------
// Gestión y resolución de CONDICIONES (asignadas por producto en el Catálogo).
// El superadmin asigna a cada producto una condición (o ninguna) y puede crear
// nuevas, que se guardan en la colección compartida `condiciones` para reutilizar.
// ---------------------------------------------------------------------------

/** Lista todas las condiciones (para el selector del catálogo), ordenadas. */
export async function listarCondiciones() {
  const cs = await cargarCondiciones();
  return [...cs].sort((a, b) =>
    String(a.articulo || '').localeCompare(String(b.articulo || ''), 'es', { numeric: true }),
  );
}

/** Devuelve una condición por su id de documento ({id, articulo, texto}) o null. */
export async function getCondicionPorId(id) {
  if (!id) return null;
  const cs = await cargarCondiciones();
  return cs.find((c) => c.id === id) || null;
}

/**
 * Crea una condición nueva en la colección compartida `condiciones` e invalida
 * su caché. La autorización la imponen las Rules (write: admin/backoffice/
 * superadmin). @returns {Promise<string>} id del doc creado.
 */
export async function crearCondicion({ articulo, texto }) {
  const art = txt(articulo);
  const tex = String(texto || '').trim();
  if (!art) throw new Error('El nombre/artículo de la condición es obligatorio.');
  if (!tex) throw new Error('El texto de la condición es obligatorio.');
  const ref = await addDoc(collection(db, 'condiciones'), { articulo: art, texto: tex });
  cacheCondiciones = null; // recargar en la próxima lectura (incluye la nueva)
  promesaCondiciones = null;
  return ref.id;
}

/**
 * Resuelve la condición efectiva de un PRODUCTO, con esta precedencia:
 *   1. `condicion` (snapshot ya guardado en la línea de la cotización) → se usa.
 *   2. `condicionId` (asignado en el Catálogo) → esa condición de la colección.
 *   3. `condicionId === ''` (explícitamente "ninguna") → null.
 *   4. sin campo `condicionId` (producto legacy) → match heurístico por nombre.
 * @returns {Promise<{articulo,texto}|null>}
 */
export async function resolverCondicionProducto(producto) {
  if (!producto) return null;
  // (1) snapshot en la cotización.
  if (producto.condicion !== undefined) {
    const snap = producto.condicion;
    return snap && txt(snap.texto) ? { articulo: snap.articulo || '', texto: snap.texto } : null;
  }
  // (2) asignación explícita por id.
  if (producto.condicionId) {
    const c = await getCondicionPorId(producto.condicionId);
    return c && txt(c.texto) ? { articulo: c.articulo || '', texto: c.texto } : null;
  }
  // (3) explícitamente ninguna.
  if (producto.condicionId === '') return null;
  // (4) legacy: heurística por nombre/material.
  const sujeto = resolverSujetoCondicion(producto.producto, producto.material);
  const texto = await getCondiciones(sujeto);
  return txt(texto) ? { articulo: sujeto, texto } : null;
}
