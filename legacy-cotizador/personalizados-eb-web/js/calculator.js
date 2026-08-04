// ============================================
// CÁLCULOS Y LÓGICA DE PRECIOS
// ============================================

import { VALIDATION_CONFIG } from './config.js';
import { buscarProducto, buscarProductosLote } from './api.js';

const basePriceCache = new Map();
const pendingBasePriceRequests = new Map();

function buildBasePriceKey(producto, tamano, impresion1, impresion2, material, cod = '') {
  return [cod, producto, tamano, impresion1, impresion2, material].join('|');
}

function normalizeComboItem(item) {
  return {
    cod: String(item?.cod || '').trim(),
    producto: String(item?.producto || '').trim(),
    tamano: String(item?.tamano || '').trim(),
    impresion1: String(item?.impresion1 || '').trim(),
    impresion2: String(item?.impresion2 || '').trim(),
    material: String(item?.material || '').trim()
  };
}

export async function preloadProductBasePrices(items) {
  if (!Array.isArray(items) || items.length === 0) return;

  const normalizedItems = items
    .map(normalizeComboItem)
    .filter((item) => item.producto && item.tamano);

  if (!normalizedItems.length) return;

  const pendingItems = [];
  const seen = new Set();

  normalizedItems.forEach((item) => {
    const key = buildBasePriceKey(item.producto, item.tamano, item.impresion1, item.impresion2, item.material, item.cod);
    if (seen.has(key)) return;
    seen.add(key);

    if (!basePriceCache.has(key)) {
      pendingItems.push(item);
    }
  });

  if (!pendingItems.length) return;

  const batchResult = await buscarProductosLote(pendingItems);
  const batchMap = (batchResult && batchResult.results) ? batchResult.results : {};

  pendingItems.forEach((item) => {
    const key = buildBasePriceKey(item.producto, item.tamano, item.impresion1, item.impresion2, item.material, item.cod);
    const data = batchMap[key];
    if (data && data.cod) {
      basePriceCache.set(key, data);
    }
  });
}

async function getBasePriceData(producto, tamano, impresion1, impresion2, material, cod = '') {
  const cacheKey = buildBasePriceKey(producto, tamano, impresion1, impresion2, material, cod);

  if (basePriceCache.has(cacheKey)) {
    return basePriceCache.get(cacheKey);
  }

  if (pendingBasePriceRequests.has(cacheKey)) {
    return pendingBasePriceRequests.get(cacheKey);
  }

  const requestPromise = buscarProducto(producto, tamano, impresion1, impresion2, material, cod)
    .then((data) => {
      basePriceCache.set(cacheKey, data);
      pendingBasePriceRequests.delete(cacheKey);
      return data;
    })
    .catch((error) => {
      pendingBasePriceRequests.delete(cacheKey);
      throw error;
    });

  pendingBasePriceRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

/**
 * Calcular componentes de precio

 */
export async function calculateProductPrice(producto, tamano, impresion1, impresion2, material, cantidad, cod = '') {
  // Validar cantidad
  const qtyValidation = validateQuantity(cantidad);
  if (!qtyValidation.valid) {
    throw new Error(qtyValidation.error);
  }

  try {
    // Buscar/leer desde caché los datos base de la combinación
    const productData = await getBasePriceData(producto, tamano, impresion1, impresion2, material, cod);

    if (!productData || !productData.cod) {
      throw new Error('Producto no encontrado en base de datos');
    }

    const minimo = productData.minimo || 0;
    const precioSinIVA = productData.precioSinIVA || 0;

    // Validar cantidad mínima
    if (cantidad < minimo) {
      throw new Error(`Cantidad debe ser mínimo ${minimo}`);
    }

    // Usar valores exactos que devuelve Sheets por API para evitar desfaces
    const iva = productData.iva || 0;
    const totalConIVA = productData.totalConIVA || 0;
    const precioUnitario = productData.precioUnitario || 0;

    return {
      cod: productData.cod,
      minimo: minimo,
      precioSinIVA: precioSinIVA,
      iva: iva,
      totalConIVA: totalConIVA,
      precioUnitario: precioUnitario,
      cantidadIngresada: cantidad,
      totalProducto: (precioSinIVA / minimo) * cantidad,  // price sin IVA para este producto
      totalProductoConIVA: (totalConIVA / minimo) * cantidad  // total con IVA para este producto
    };
  } catch (error) {
    console.error('Error calculando precio:', error);
    throw error;
  }
}

/**
 * Calcular totales de cotización
 */
export function calculateQuotationTotals(productos) {
  let subtotal = 0;
  let tax = 0;
  let total = 0;

  productos.forEach(item => {
    subtotal += item.precioSinIVA || 0;
    tax += item.iva || 0;
    total += item.totalConIVA || 0;
  });

  return {
    subtotal,
    tax,
    total
  };
}

/**
 * Convertir a dólares
 */
export function convertToUSD(colonesAmount, exchangeRate) {
  if (!exchangeRate || exchangeRate <= 0) return 0;
  return Math.round((colonesAmount / exchangeRate) * 100) / 100;
}

/**
 * Validar cantidad
 */
export function validateQuantity(quantity) {
  const q = parseInt(quantity);

  if (isNaN(q)) {
    return { valid: false, error: 'Cantidad debe ser numérica' };
  }

  if (q < VALIDATION_CONFIG.minQuantity) {
    return { valid: false, error: `Cantidad mínima: ${VALIDATION_CONFIG.minQuantity}` };
  }

  if (q > VALIDATION_CONFIG.maxQuantity) {
    return { valid: false, error: 'Cantidad máxima excedida' };
  }

  return { valid: true, value: q };
}

/**
 * Validar que cantidad sea >= mínimo del producto
 */
export function validateMinimumQuantity(cantidad, minimo) {
  const q = parseInt(cantidad);
  const m = parseInt(minimo);

  if (q < m) {
    return {
      valid: false,
      error: `Mínimo para este producto: ${m}`
    };
  }

  return { valid: true };
}

/**
 * Completar datos de un producto con información de BD
 */
export async function enrichProductData(producto) {
  try {
    const data = await buscarProducto(
      producto.producto,
      producto.tamano,
      producto.impresion1,
      producto.impresion2,
      producto.material,
      producto.cod || ''
    );

    return {
      ...producto,
      cod: data.cod,
      minimo: data.minimo,
      precioSinIVA: data.precioSinIVA,
      iva: data.iva,
      totalConIVA: data.totalConIVA,
      precioUnitario: data.precioUnitario
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Validar cotización completa
 */
export function validateCompleteQuotation(clientName, productos) {
  const errors = [];

  // Validar nombre del cliente
  if (!clientName || clientName.trim().length === 0) {
    errors.push('Nombre del cliente es requerido');
  }

  // Validar que hay productos
  if (!productos || productos.length === 0) {
    errors.push('Debes agregar al menos un producto');
  }

  // Validar cada producto
  productos.forEach((p, index) => {
    if (!p.producto || !p.tamano || !p.cantidad) {
      errors.push(`Fila ${index + 1}: Producto, tamaño y cantidad son requeridos`);
    }

    if (typeof p.precioSinIVA !== 'number' || typeof p.totalConIVA !== 'number') {
      errors.push(`Fila ${index + 1}: El producto debe tener precio calculado antes de generar la cotización`);
    }

    const qtyVal = validateQuantity(p.cantidad);
    if (!qtyVal.valid) {
      errors.push(`Fila ${index + 1}: ${qtyVal.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors
  };
}
