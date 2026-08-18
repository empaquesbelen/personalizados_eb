// ============================================
// Cálculo de precios — Módulo Cotizador (Fase 4)
// ------------------------------------------------------------
// Portado de legacy: calculator.js (calculateProductPrice / totals / USD) +
// Code.gs (aplicarConversionUsd).
//
// Modelo del catálogo: `precioSinIVA` es el precio SIN IVA para la cantidad
// `minimo`. Si `precioEnUsd` es true, `precioSinIVA` viene en DÓLARES y hay que
// multiplicarlo por el tipo de cambio para pasarlo a colones.
//
// Regla Absoluta #10 (dinero = cuidado): estas fórmulas deben ser consistentes
// con el legacy; cualquier cambio se prueba.
// ============================================

export const IVA_TASA = 0.13; // Tasa GENERAL de Costa Rica (default por producto).

// Tasas de IVA vigentes en CR (fracciones), para el selector del catálogo.
// 13% general · 4% · 2% · 1% (canasta básica, p. ej. azúcar) · 0% exento.
export const TASAS_IVA_CR = [0.13, 0.04, 0.02, 0.01, 0];

/**
 * Normaliza una tasa de IVA a FRACCIÓN en [0,1] (0.13 = 13%). Si el valor no es
 * válido, cae al default general (IVA_TASA). No adivina %/fracción: espera una
 * fracción (la UI convierte el % a fracción antes de guardar).
 */
export function normalizarTasaIva(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return IVA_TASA;
  return Math.min(1, Math.round(n * 10000) / 10000);
}

/** Redondea a 2 decimales (para el total en USD, igual que convertToUSD legacy). */
export function convertirUSD(montoColones, tipoCambio) {
  if (!tipoCambio || tipoCambio <= 0) return 0;
  return Math.round((montoColones / tipoCambio) * 100) / 100;
}

/**
 * Valida que la cantidad sea numérica y >= mínimo del producto.
 * @returns {{ valido: boolean, error?: string, valor?: number }}
 */
export function validarCantidad(cantidad, minimo = 1) {
  const q = Number(cantidad);
  if (!Number.isFinite(q) || q <= 0) {
    return { valido: false, error: 'La cantidad debe ser un número mayor a 0.' };
  }
  const m = Math.max(1, Number(minimo) || 1);
  if (q < m) {
    return { valido: false, error: `La cantidad mínima para este producto es ${m}.` };
  }
  return { valido: true, valor: Math.floor(q) };
}

/**
 * Ajusta una cantidad a las reglas del producto: nunca baja del mínimo y se
 * REDONDEA HACIA ARRIBA al múltiplo del mínimo (el mínimo es también el paso).
 * Espejo exacto de `enforceRowQuantityRules` del legacy:
 *   qty = max(minimo, ceil(qty / minimo) * minimo)
 * Ej.: mínimo 10 → 10, 20, 30…
 * @param {number|string} cantidad
 * @param {number} minimo
 * @returns {number} cantidad válida (múltiplo del mínimo, ≥ mínimo).
 */
export const MAX_CANTIDAD = 10_000_000; // tope sensato: evita valores absurdos (ej. miles de millones)

export function ajustarCantidad(cantidad, minimo) {
  const min = Math.max(1, Math.round(Number(minimo) || 1));
  const q = Math.floor(Math.abs(Number(cantidad)));
  if (!Number.isFinite(q) || q <= min) return min;
  const ajustada = Math.max(min, Math.ceil(q / min) * min);
  // Tope: mayor múltiplo del mínimo que no exceda MAX_CANTIDAD.
  const topeMultiplo = Math.max(min, Math.floor(MAX_CANTIDAD / min) * min);
  return Math.min(ajustada, topeMultiplo);
}

/**
 * Calcula el precio de una línea a partir del item de catálogo, la cantidad y
 * el tipo de cambio. Devuelve los montos BASE (para la cantidad `minimo`) y los
 * montos ESCALADOS a la cantidad pedida.
 *
 * @param {object} item  Documento del catálogo ({ minimo, precioSinIVA, precioEnUsd, iva?, ... }).
 * @param {number} cantidad
 * @param {number} tipoCambio  Colones por USD (para convertir precios en dólares).
 * @param {number} [iva]  Tasa explícita (fracción). Si se omite, se usa la del
 *   producto (`item.iva`) y, en su defecto, IVA_TASA (13% general).
 * @returns {{
 *   valido: boolean, error?: string,
 *   minimo:number, precioBaseSinIVA:number, ivaBase:number, totalBaseConIVA:number,
 *   precioUnitario:number, cantidad:number, ivaTasa:number,
 *   totalProducto:number, totalProductoConIVA:number, ivaLinea:number
 * }}
 */
export function calcularLinea(item, cantidad, tipoCambio, iva) {
  if (!item) {
    return { valido: false, error: 'Combinación de producto no encontrada en el catálogo.' };
  }

  const minimo = Math.max(1, Math.round(Number(item.minimo) || 1));
  const val = validarCantidad(cantidad, minimo);
  if (!val.valido) {
    return { valido: false, error: val.error, minimo };
  }
  const qty = val.valor;

  const rawPrecio = Number(item.precioSinIVA) || 0;
  const tc = Number(tipoCambio) || 0;
  if (item.precioEnUsd && tc <= 0) {
    return { valido: false, error: 'Tipo de cambio inválido para un producto en dólares.', minimo };
  }

  // Tasa de IVA POR PRODUCTO: la explícita (si se pasa), o la del producto
  // (item.iva), o el default general (13%). Productos legacy sin `iva` → 13%.
  const tasa = Number.isFinite(Number(iva))
    ? normalizarTasaIva(iva)
    : Number.isFinite(Number(item.iva))
      ? normalizarTasaIva(item.iva)
      : IVA_TASA;

  // Precio SIN IVA en colones para la cantidad `minimo`.
  const precioBaseSinIVA = item.precioEnUsd ? rawPrecio * tc : rawPrecio;
  const ivaBase = precioBaseSinIVA * tasa;
  const totalBaseConIVA = precioBaseSinIVA + ivaBase;
  const precioUnitario = totalBaseConIVA / minimo; // unitario CON IVA

  // Montos escalados a la cantidad pedida.
  const totalProducto = (precioBaseSinIVA / minimo) * qty; // sin IVA, escalado
  const totalProductoConIVA = (totalBaseConIVA / minimo) * qty; // con IVA, escalado
  const ivaLinea = totalProductoConIVA - totalProducto;

  return {
    valido: true,
    minimo,
    precioBaseSinIVA,
    ivaBase,
    totalBaseConIVA,
    precioUnitario,
    cantidad: qty,
    ivaTasa: tasa,
    totalProducto,
    totalProductoConIVA,
    ivaLinea,
  };
}

/**
 * Arma el objeto "producto" que se guarda en la cotización y alimenta el PDF.
 * Los campos precioSinIVA/iva/totalConIVA son los montos de LÍNEA (escalados a
 * la cantidad), y precioUnitario es el unitario CON IVA (base). Espejo del
 * modelo de datos de ARQUITECTURA.md §4 y del legacy updateQuotationSummary.
 */
export function construirProductoCotizacion(seleccion, calc) {
  return {
    cod: seleccion.cod || '',
    producto: seleccion.producto || '',
    tamano: seleccion.tamano || '',
    impresion1: seleccion.impresion1 || '',
    impresion2: seleccion.impresion2 || '',
    material: seleccion.material || '',
    cantidad: calc.cantidad,
    minimo: calc.minimo,
    precioSinIVA: calc.totalProducto, // subtotal de la línea (sin IVA)
    iva: calc.ivaLinea, // IVA de la línea (monto)
    ivaTasa: calc.ivaTasa, // tasa de IVA aplicada (fracción) — snapshot
    totalConIVA: calc.totalProductoConIVA, // total de la línea (con IVA)
    precioUnitario: calc.precioUnitario, // unitario con IVA
  };
}

/**
 * Suma los totales de la cotización a partir de las líneas ya calculadas.
 * @param {Array} productos  objetos con { precioSinIVA, iva, totalConIVA } de línea.
 * @param {number} tipoCambio
 * @returns {{ subtotal:number, iva:number, total:number, totalUSD:number }}
 */
export function calcularTotales(productos, tipoCambio) {
  let subtotal = 0;
  let iva = 0;
  let total = 0;

  (productos || []).forEach((p) => {
    subtotal += Number(p.precioSinIVA) || 0;
    iva += Number(p.iva) || 0;
    total += Number(p.totalConIVA) || 0;
  });

  return {
    subtotal,
    iva,
    total,
    totalUSD: convertirUSD(total, tipoCambio),
  };
}

// ---- Formato de moneda en colones (formato Costa Rica) ----
export function formatearColones(monto, decimales = 2) {
  const n = Number(monto);
  if (!Number.isFinite(n)) return '₡0';
  return (
    '₡' +
    n.toLocaleString('es-CR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
  );
}

export function formatearNumero(monto, decimales = 0) {
  const n = Number(monto);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('es-CR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}
