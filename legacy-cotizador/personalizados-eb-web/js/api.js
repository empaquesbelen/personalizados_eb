// ============================================
// API - GOOGLE APPS SCRIPT COMMUNICATION
// ============================================

import { CACHE_CONFIG, MESSAGES } from './config.js';
import { getFromCache, saveToCache } from './utils.js';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxxgAqYM8oi-ZduEFn2KWFNnecjhnPoJ10uaEQOX34xf_RmKmKyjfY9qcWRQsbtv52j0g/exec';
const FAST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos para endpoints pesados

function getFromCacheWithMaxAge(key, maxAgeMs) {
  try {
    const cachedRaw = localStorage.getItem(key);
    if (!cachedRaw) return null;

    const parsed = JSON.parse(cachedRaw);
    if (!parsed || typeof parsed.timestamp !== 'number') return null;

    const age = Date.now() - parsed.timestamp;
    if (age > maxAgeMs) return null;

    return parsed.data;
  } catch (error) {
    console.warn('Error leyendo caché rápida:', error);
    return null;
  }
}

/**
 * Realizar solicitud HTTP a Google Apps Script
 */
async function apiRequest(path) {
  const cleanPath = path.replace(/^\/+/, ''); // Eliminar "/" del inicio
  
  let fullUrl;
  if (cleanPath.includes('?')) {
    const [pathPart, queryPart] = cleanPath.split('?');
    fullUrl = `${APPS_SCRIPT_URL}?path=${pathPart}&${queryPart}`;
  } else {
    fullUrl = `${APPS_SCRIPT_URL}?path=${cleanPath}`;
  }

  console.log('🌐 API Request:', fullUrl);

  try {
    // ✅ CRÍTICO: SIN headers para evitar CORS preflight
    const response = await fetch(fullUrl, {
      method: 'GET',
      redirect: 'follow'
      // NO incluir headers aquí
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error desconocido');
    }

    console.log('✅ API Response:', result.data);
    return result.data;

  } catch (error) {
    console.error('❌ API Error:', error);
    throw error;
  }
}

/**
 * GET /vendedores
 */
export async function getVendores() {
  const cacheKey = CACHE_CONFIG.keys.vendedores;
  const cached = getFromCache(cacheKey);

  if (cached) {
    console.log('📦 Vendedores desde caché');
    return cached;
  }

  try {
    const data = await apiRequest('vendedores');
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo vendedores:', error);
    throw new Error(MESSAGES.error.api_connection);
  }
}

/**
 * GET /productos
 */
export async function getProductos() {
  const cacheKey = CACHE_CONFIG.keys.productos;
  const cached = getFromCacheWithMaxAge(cacheKey, FAST_CACHE_TTL_MS);
  if (cached) {
    console.log('📦 Productos desde caché rápida');
    return cached;
  }

  try {
    const data = await apiRequest('productos');
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo productos:', error);
    throw new Error(MESSAGES.error.api_connection);
  }
}

/**
 * GET /tamanos
 */
export async function getTamanos(producto) {
  if (!producto) return [];

  const cacheKey = CACHE_CONFIG.keys.tamanos + producto;
  const cached = getFromCache(cacheKey);

  if (cached) {
    console.log(`📦 Tamaños de ${producto} desde caché`);
    return cached;
  }

  try {
    const encodedProducto = encodeURIComponent(producto);
    const data = await apiRequest(`tamanos?producto=${encodedProducto}`);
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo tamaños:', error);
    return [];
  }
}

/**
 * GET /opciones
 */
export async function getOpciones(producto, tamano, impresion1 = '', impresion2 = '') {
  if (!producto || !tamano) {
    return { impresiones1: [], impresiones2: [], materiales: [] };
  }

  const cacheKey = CACHE_CONFIG.keys.opciones + producto + '_' + tamano + '_' + impresion1 + '_' + impresion2;
  const cached = getFromCache(cacheKey);

  if (cached) {
    console.log(`📦 Opciones de ${producto}/${tamano} desde caché`);
    return cached;
  }

  try {
    const encodedProducto = encodeURIComponent(producto);
    const encodedTamano = encodeURIComponent(tamano);
    const encodedImpresion1 = encodeURIComponent(impresion1 || '');
    const encodedImpresion2 = encodeURIComponent(impresion2 || '');
    const data = await apiRequest(`opciones?producto=${encodedProducto}&tamano=${encodedTamano}&impresion1=${encodedImpresion1}&impresion2=${encodedImpresion2}`);
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo opciones:', error);
    return { impresiones1: [], impresiones2: [], materiales: [] };
  }
}

/**
 * GET /catalogo-busqueda
 */
export async function getCatalogoBusqueda() {
  // Versión de caché para evitar usar estructuras antiguas sin campo "cod"
  const cacheKey = `${CACHE_CONFIG.keys.catalogoBusqueda}_v2`;
  const cached = getFromCacheWithMaxAge(cacheKey, FAST_CACHE_TTL_MS);
  if (Array.isArray(cached) && cached.length > 0) {
    const hasAnyCod = cached.some(item => String(item?.cod || '').trim().length > 0);
    if (hasAnyCod) {
      console.log('📦 Catálogo de búsqueda (v2) desde caché rápida');
      return cached;
    }
  }

  try {
    const data = await apiRequest('catalogo-busqueda');
    const normalized = Array.isArray(data)
      ? data.map(item => ({
          ...item,
          cod: String(item?.cod || '').trim()
        }))
      : [];
    saveToCache(cacheKey, normalized);
    return normalized;
  } catch (error) {
    console.error('Error obteniendo catálogo de búsqueda:', error);
    return [];
  }
}

/**
 * GET /buscar-producto
 */
export async function buscarProducto(producto, tamano, impresion1, impresion2, material, cod = '') {
  try {
    const params = new URLSearchParams({
      producto: producto,
      tamano: tamano,
      impresion1: impresion1,
      impresion2: impresion2,
      material: material
    });

    if (cod) {
      params.append('cod', cod);
    }

    const data = await apiRequest(`buscar-producto?${params.toString()}`);
    return data;
  } catch (error) {
    console.error('Error buscando producto:', error);
    throw new Error(error.message || MESSAGES.error.search_error);
  }
}

/**
 * GET /buscar-productos-lote
 */
export async function buscarProductosLote(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { results: {}, requested: 0, found: 0 };
  }

  try {
    const payload = encodeURIComponent(JSON.stringify(items));
    const data = await apiRequest(`buscar-productos-lote?items=${payload}`);
    return data || { results: {}, requested: 0, found: 0 };
  } catch (error) {
    console.error('Error buscando productos en lote:', error);
    return { results: {}, requested: 0, found: 0 };
  }
}

/**
 * GET /condiciones
 */
export async function getCondiciones(producto) {
  if (!producto) return '';

  const cacheKey = CACHE_CONFIG.keys.condiciones + '_' + producto;
  const cached = getFromCache(cacheKey);

  if (cached) {
    console.log(`📦 Condiciones de ${producto} desde caché`);
    return cached;
  }

  try {
    const encodedProducto = encodeURIComponent(producto);
    const data = await apiRequest(`condiciones?producto=${encodedProducto}`);
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo condiciones:', error);
    return '';
  }
}

/**
 * GET /configuracion
 */
export async function getConfiguracion() {
  const cacheKey = CACHE_CONFIG.keys.config;
  const cached = getFromCacheWithMaxAge(cacheKey, FAST_CACHE_TTL_MS);
  if (cached) {
    console.log('📦 Configuración desde caché rápida');
    return cached;
  }

  try {
    const data = await apiRequest('configuracion');
    saveToCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    throw new Error(MESSAGES.error.api_connection);
  }
}

/**
 * GET /guardar-cotizacion
 */
export async function guardarCotizacion(vendedor, cliente, productos, total, tipoCambio) {
  try {
    const params = new URLSearchParams({
      vendedor: vendedor,
      cliente: cliente,
      productos: JSON.stringify(productos || []),
      total: total || 0,
      tipoCambio: tipoCambio || 512
    });

    const data = await apiRequest(`guardar-cotizacion?${params.toString()}`);
    return data;
  } catch (error) {
    console.error('Error guardando cotización:', error);
    console.warn('⚠️ La cotización no se guardó en el historial');
    return null;
  }
}

/**
 * GET /historial
 */
export async function getHistorial(vendedor) {
  if (!vendedor) return [];

  try {
    const encodedVendedor = encodeURIComponent(vendedor);
    const data = await apiRequest(`historial?vendedor=${encodedVendedor}`);
    return data;
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    return [];
  }
}

/**
 * Verificar conexión a la API
 */
export async function checkAPIConnection() {
  try {
    await getConfiguracion();
    return true;
  } catch (error) {
    console.error('❌ API Connection check failed:', error);
    return false;
  }
}

/**
 * Forzar inicialización del Sheets
 */
export async function initializeSheets() {
  try {
    const result = await apiRequest('reset-init');
    console.log('✅ Sheets inicializado:', result);
    localStorage.clear();
    return result;
  } catch (error) {
    console.error('Error inicializando sheets:', error);
    throw new Error('❌ Error al inicializar: ' + error.message);
  }
}

/**
 * Obtener todos los datos del dashboard
 */
export async function loadDashboardData() {
  try {
    const [vendedores, productos, config] = await Promise.all([
      getVendores(),
      getProductos(),
      getConfiguracion()
    ]);

    return {
      vendedores,
      productos,
      config,
      success: true
    };
  } catch (error) {
    console.error('Error cargando datos del dashboard:', error);
    return {
      success: false,
      error: error.message
    };
  }
}