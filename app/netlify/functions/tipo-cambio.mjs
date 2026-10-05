// ============================================
// Netlify Function — Tipo de cambio del BCCR (API SDDE), del lado servidor.
// ------------------------------------------------------------
// Reemplaza al Web App de Apps Script como proxy del tipo de cambio. Medido el
// 05/10/2026: el Apps Script tardaba ~18 s de mediana, el 76% de las consultas
// superaba los 6 s del navegador (AbortError) y ~21% fallaba con 404 de Google.
// La API del BCCR directa responde en ~1 s.
//
// Ruta: /.netlify/functions/tipo-cambio — mismo origen que la app (sin CORS) y
// fuera del alcance del redirect SPA `/* → /index.html` de netlify.toml.
//
// 🔐 El token del BCCR vive SOLO en la variable de entorno `BCCR_TOKEN` de
//    Netlify (Regla Absoluta #5): nunca llega al navegador ni al repositorio.
//
// Respuesta (mismo contrato que el Apps Script anterior):
//   200 { success:true, data:{ tipoCambio, fuente:'BCCR', fecha:'yyyy-MM-dd' } }
//   5xx { success:false, error }  — sin caché; el detalle queda en el log de la función.
//
// Caché: el BCCR publica un valor por día, así que la respuesta OK se cachea
// 10 min en el CDN de Netlify (y se sirve vencida hasta 1 h mientras se
// revalida en segundo plano). Así casi todas las consultas contestan desde el
// CDN y el BCCR recibe pocas llamadas (su estándar documenta 429 por exceso).
// ============================================

const SDDE_BASE = 'https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API';
const INDICADOR_VENTA = 318; // Tipo de cambio de venta (el que usaba el legacy)
const DIAS_ATRAS = 10; // rango holgado para fines de semana/feriados
// Menor que el timeout del navegador (8 s, services/catalogo.js): la función
// siempre contesta con un error explicable antes de que el cliente aborte.
const TIMEOUT_BCCR_MS = 6000;

/** Fecha `yyyy/MM/dd` (formato del SDDE) en hora de Costa Rica; la función corre en UTC. */
function fechaCR(d) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const p = (tipo) => partes.find((x) => x.type === tipo).value;
  return `${p('year')}/${p('month')}/${p('day')}`;
}

function responder(status, cuerpo, cacheable = false) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (cacheable) {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
    headers['Netlify-CDN-Cache-Control'] = 'public, durable, s-maxage=600, stale-while-revalidate=3600';
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  return new Response(JSON.stringify(cuerpo), { status, headers });
}

/** Error: queda registrado en el log de la función (Netlify → Logs → Functions). */
function fallo(status, error, detalle = '') {
  console.error(`[tipo-cambio] ${error}`, detalle);
  return responder(status, { success: false, error });
}

export default async function tipoCambio(req) {
  if (req.method !== 'GET') return fallo(405, `Método ${req.method} no permitido`);

  const token = (process.env.BCCR_TOKEN || '').trim();
  if (!token) return fallo(500, 'Falta la variable de entorno BCCR_TOKEN en Netlify');

  const ahora = new Date();
  const inicio = new Date(ahora.getTime() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
  const url =
    `${SDDE_BASE}/indicadoresEconomicos/${INDICADOR_VENTA}/series` +
    `?fechaInicio=${encodeURIComponent(fechaCR(inicio))}` +
    `&fechaFin=${encodeURIComponent(fechaCR(ahora))}&idioma=ES`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_BCCR_MS);
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch (e) {
    return ctrl.signal.aborted
      ? fallo(504, `El BCCR no respondió en ${TIMEOUT_BCCR_MS / 1000} s`)
      : fallo(502, 'No se pudo conectar con el BCCR', e?.message || String(e));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    return fallo(502, `El BCCR respondió HTTP ${res.status}`, cuerpo.slice(0, 300));
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    return fallo(502, 'La respuesta del BCCR no es JSON válido', e?.message || String(e));
  }
  if (json?.estado === false) {
    return fallo(502, `El BCCR rechazó la consulta: ${json.mensaje || 'sin detalle'}`);
  }

  // Último valor válido por FECHA (no por posición, por si la serie viene desordenada).
  const series = Array.isArray(json?.datos?.[0]?.series) ? json.datos[0].series : [];
  let ultimo = null;
  for (const s of series) {
    const valor = Number(s?.valorDatoPorPeriodo);
    const fecha = String(s?.fecha ?? '').slice(0, 10);
    if (!Number.isFinite(valor) || valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    if (!ultimo || fecha > ultimo.fecha) ultimo = { valor, fecha };
  }
  if (!ultimo) {
    return fallo(502, 'El BCCR no devolvió valores para el rango consultado', JSON.stringify(json).slice(0, 300));
  }

  return responder(200, { success: true, data: { tipoCambio: ultimo.valor, fuente: 'BCCR', fecha: ultimo.fecha } }, true);
}
