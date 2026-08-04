// ============================================================
// Apps Script — Tipo de cambio del BCCR (NUEVA API "SDDE")
// ------------------------------------------------------------
// El método viejo (wsindicadoreseconomicos.asmx) fue descontinuado el
// 30/06/2026. Esta versión usa la nueva API SDDE del BCCR, que requiere un
// Bearer Token. Indicador 318 = "Tipo cambio venta" (el que usaba el legacy).
//
// 🔐 EL TOKEN NO VIVE EN EL CÓDIGO. Se guarda en las PROPIEDADES DEL SCRIPT
//    (Configuración del proyecto → Propiedades del script → agregar
//     `BCCR_TOKEN` = tu token). Así el secreto queda solo en el servidor de
//    Google y nunca se sube al repositorio (Regla Absoluta #5).
//
// Devuelve JSON: { success, data: { tipoCambio, fuente:'BCCR', fecha } }
// Desplegar como Web App (Ejecutar como: yo · Acceso: cualquiera).
// ============================================================

const SDDE_BASE = 'https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API';
const INDICADOR_VENTA = 318; // Tipo de cambio de venta (USD → CRC)

/** Lee el token del BCCR desde las Propiedades del script (nunca del código). */
function getToken_() {
  const t = PropertiesService.getScriptProperties().getProperty('BCCR_TOKEN');
  return t ? t.trim() : '';
}

function doGet() {
  const token = getToken_();
  if (!token) {
    return json_({
      success: false,
      error: 'Falta BCCR_TOKEN en las Propiedades del script (Configuración del proyecto).',
    });
  }
  const r = fetchTipoCambioSDDE_(token);
  const payload = r
    ? { success: true, data: { tipoCambio: r.valor, fuente: 'BCCR', fecha: r.fecha } }
    : { success: false, error: 'BCCR (SDDE) no disponible en este momento' };
  return json_(payload);
}

/** Respuesta JSON (Apps Script agrega Access-Control-Allow-Origin:* al desplegar "cualquiera"). */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fmtFecha_(d) {
  // La API SDDE espera yyyy/MM/dd.
  return Utilities.formatDate(d, 'America/Costa_Rica', 'yyyy/MM/dd');
}

/**
 * Consulta la serie del indicador 318 (venta) de los últimos 10 días y devuelve
 * el último valor válido (fecha más reciente). La `fecha` viene en ISO
 * (yyyy-MM-dd) tal cual la entrega el SDDE; el cliente la interpreta como local.
 */
function fetchTipoCambioSDDE_(token) {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - 10); // rango holgado para fines de semana/feriados

  const url =
    SDDE_BASE + '/indicadoresEconomicos/' + INDICADOR_VENTA + '/series' +
    '?fechaInicio=' + encodeURIComponent(fmtFecha_(inicio)) +
    '&fechaFin=' + encodeURIComponent(fmtFecha_(hoy)) +
    '&idioma=ES';

  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return null;

    const json = JSON.parse(resp.getContentText());
    const datos = json && json.datos ? json.datos : [];
    const series = datos[0] && datos[0].series ? datos[0].series : [];

    for (let i = series.length - 1; i >= 0; i--) {
      const v = Number(series[i].valorDatoPorPeriodo);
      if (v > 0) return { valor: v, fecha: series[i].fecha };
    }
  } catch (e) {
    // cae a null
  }
  return null;
}

/**
 * Utilidad para probar desde el editor de Apps Script (Ejecutar → test_).
 * Revisá el registro (Ver → Registros) para ver el resultado o el error.
 */
function test_() {
  const token = getToken_();
  if (!token) {
    Logger.log('❌ Falta BCCR_TOKEN en las Propiedades del script.');
    return;
  }
  Logger.log(fetchTipoCambioSDDE_(token));
}
