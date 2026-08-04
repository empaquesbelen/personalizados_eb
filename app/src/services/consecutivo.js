// ============================================
// Consecutivo de cotización — Módulo Cotizador (Fase 4)
// ------------------------------------------------------------
// Portado del legacy (Code.gs: buildVendorCode + generateHistorialConsecutive).
// Formato VISIBLE (el que ve el humano y sale en el PDF):
//   [3 letras del vendedor sin tildes] + [ddMM] + "-" + [secuencia]   ej. STE2307-01
//
// SEMÁNTICA ELEGIDA: contador POR-DÍA-POR-PREFIJO (vendedor+ddMM), estrictamente
// creciente dentro de cada (vendedor, día), arrancando en 01 — idéntico al
// legacy. La secuencia NO viene del tiempo: proviene de un CONTADOR ATÓMICO en
// Firestore (`contadores/{PREFIJO}`) que se reserva dentro de la MISMA
// transacción que crea la cotización (ver services/cotizaciones.crearCotizacion).
//
// ¿Por qué por-día-por-prefijo y no un contador global monótono?
//   1. Reproduce EXACTO la numeración del legacy (STE2307-01, -02) — importa
//      porque el consecutivo es el número de negocio que el cliente ve en el PDF.
//   2. Como el contador se llavea con el MISMO prefijo visible (vendedor+ddMM),
//      la cadena consecutivo resultante es GLOBALMENTE ÚNICA: dos cotizaciones
//      con igual prefijo toman valores de contador distintos (atómico); dos con
//      prefijos distintos ya difieren en el prefijo. Esto ELIMINA la colisión del
//      viejo esquema por-tiempo (mismo vendedor/segundo, o dos vendedores que
//      comparten las 3 letras el mismo segundo).
//   3. Reparte las escrituras entre muchos documentos contador (uno por
//      vendedor/día) en vez de un único doc "caliente" → mejor bajo concurrencia.
//
// Este archivo es PURO (sin Firestore): solo arma el prefijo y formatea la
// cadena. La reserva atómica del número vive en services/cotizaciones.js.
// ============================================

/** Código de 3 letras del vendedor, sin tildes ni símbolos (relleno con X). */
export function codigoVendedor(nombre) {
  const normalizado = String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return (normalizado + 'XXX').slice(0, 3);
}

/**
 * Prefijo del consecutivo (también es la CLAVE del documento contador):
 * [3 letras del vendedor] + [ddMM].  Ej. codigoVendedor("Steven") + "2307" → "STE2307".
 * @param {string} nombreVendedor
 * @param {Date} [fecha=new Date()]
 * @returns {string}
 */
export function prefijoConsecutivo(nombreVendedor, fecha = new Date()) {
  const cod = codigoVendedor(nombreVendedor);
  const dd = String(fecha.getDate()).padStart(2, '0');
  const MM = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${cod}${dd}${MM}`;
}

/**
 * Formatea el consecutivo VISIBLE a partir del prefijo y la secuencia reservada
 * por el contador atómico. Secuencia con al menos 2 dígitos (como el legacy;
 * crece a 3+ si superara 99 en un mismo vendedor/día — improbable).
 * @param {string} prefijo   p. ej. "STE2307"
 * @param {number} secuencia entero >= 1 proveniente del contador
 * @returns {string} p. ej. "STE2307-01"
 */
export function formatearConsecutivo(prefijo, secuencia) {
  const n = Math.max(1, Math.floor(Number(secuencia) || 1));
  return `${prefijo}-${String(n).padStart(2, '0')}`;
}
