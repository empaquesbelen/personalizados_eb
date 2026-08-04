// ============================================
// CONFIGURACIÓN DEL SISTEMA
// ============================================

// Nota: El proxy CORS se configura directamente en api.js

// Configuración de caché
const CACHE_CONFIG = {
  ttl: 1 * 60 * 60 * 1000,  // 1 hora en milisegundos
  keys: {
    vendedores: 'cache_vendedores',
    productos: 'cache_productos',
    condiciones: 'cache_condiciones',
    config: 'cache_config',
    tamanos: 'cache_tamanos_',  // se agrega el producto
    opciones: 'cache_opciones_',  // se agrega producto+tamaño
    catalogoBusqueda: 'cache_catalogo_busqueda'
  }
};

// Configuración de números y formato
const LOCALE_CONFIG = {
  currency: 'CRC',
  decimalSeparator: ',',
  thousandsSeparator: '.',
  currencySymbol: '₡',
  currencyFormat: '{amount} {symbol}' // {amount} ₡123.456
};

// Configuración de tablas
const TABLE_CONFIG = {
  maxProductsPerQuote: 20,
  maxHistoryRows: 10,
  animationSpeed: 300 // ms
};

// Validaciones
const VALIDATION_CONFIG = {
  minClientNameLength: 2,
  maxClientNameLength: 100,
  minQuantity: 1,
  maxQuantity: 10000000,
  exchangeRateMin: 100,
  exchangeRateMax: 1000
};

// Mensajes del sistema
const MESSAGES = {
  success: {
    sell_created: '✓ Cotización generada correctamente',
    history_saved: '✓ Cotización guardada en el historial',
    logged_in: '¡Bienvenido! Sesión iniciada'
  },
  error: {
    api_connection: '❌ Error de conexión con el servidor. Verifica que la URL de API sea correcta.',
    api_error: '❌ Error en la solicitud API: {message}',
    missing_fields: '❌ Completa todos los campos requeridos',
    invalid_quantity: '❌ La cantidad debe ser mayor o igual a {min}',
    no_products: '❌ Agrega al menos un producto a la cotización',
    client_name_required: '❌ El nombre del cliente es requerido',
    search_error: '❌ No se encontró el producto. Verifica las opciones.',
    api_url_missing: '❌ URL de API no configurada. Contacta al administrador.',
    pdf_generation: '❌ Error al generar el PDF'
  },
  warning: {
    loading: 'Cargando datos...',
    offline: '⚠️ Modo offline: datos en caché',
    exchange_rate_invalid: '⚠️ Tipo de cambio inválido'
  },
  info: {
    exchange_rate_updated: 'Tipo de cambio actualizado: {rate}',
    conditions_loaded: 'Condiciones cargadas',
    quantity_hint: 'Cantidad mínima: {min}'
  }
};

// Tipos de impresión disponibles globalmente
const IMPRESSIONS_GLOBAL = {
  type1: [
    'Full Color 25% Área',
    'Full Color',
    '1 Color',
    '2 Colores 25% Área',
    '3 Color'
  ],
  type2: [
    '1 Cara',
    '2 Cara',
    '3 Color'
  ]
};

// Materiales disponibles
const MATERIALS_GLOBAL = [
  'Papel',
  'BOPP Perlado',
  'Cartón',
  'Papel Blanca',
  'Papel Polikraft'
];

export {
  CACHE_CONFIG,
  LOCALE_CONFIG,
  TABLE_CONFIG,
  VALIDATION_CONFIG,
  MESSAGES,
  IMPRESSIONS_GLOBAL,
  MATERIALS_GLOBAL
};
