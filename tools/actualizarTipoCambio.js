// ============================================
// Actualiza config/general.tipoCambio desde la NUEVA API del BCCR (SDDE).
// El método viejo (wsindicadoreseconomicos.asmx) fue descontinuado el 30/06/2026.
// Nueva API: https://apim.bccr.fi.cr/SDDE + Bearer Token.
// Indicador 318 = "Tipo cambio venta" (el que usaba el legacy).
//
// Uso: node tools/actualizarTipoCambio.js
// El token se lee de secrets/bccrToken.txt (ignorado por git).
// Programar (diario): GitHub Action / Task Scheduler / cron.
// ============================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const TOKEN = readFileSync(new URL('../secrets/bccrToken.txt', import.meta.url), 'utf8').trim();
const BASE = 'https://apim.bccr.fi.cr/SDDE/api/Bccr.GE.SDDE.Publico.Indicadores.API';
const INDICADOR_VENTA = 318;

function fmtFecha(d) {
  // La API SDDE espera yyyy/mm/dd.
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchTipoCambioSDDE() {
  const hoy = new Date();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - 10); // rango holgado para cubrir fines de semana/feriados
  const url =
    `${BASE}/indicadoresEconomicos/${INDICADOR_VENTA}/series` +
    `?fechaInicio=${encodeURIComponent(fmtFecha(inicio))}` +
    `&fechaFin=${encodeURIComponent(fmtFecha(hoy))}&idioma=ES`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error('BCCR HTTP', res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const json = await res.json();
  const series = json?.datos?.[0]?.series || [];
  // Tomar el ÚLTIMO valor válido de la serie (fecha más reciente).
  for (let i = series.length - 1; i >= 0; i--) {
    const v = Number(series[i].valorDatoPorPeriodo);
    if (v > 0) return { valor: v, fecha: series[i].fecha };
  }
  return null;
}

const r = await fetchTipoCambioSDDE();
if (!r) {
  console.error('❌ No se obtuvo el tipo de cambio del BCCR (SDDE). No se modificó Firestore.');
  process.exit(1);
}

const key = JSON.parse(readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)));
const app = initializeApp({ credential: cert(key) });
const db = getFirestore();
await db.doc('config/general').set(
  {
    tipoCambio: r.valor,
    tipoCambioFuente: 'BCCR',
    tipoCambioFecha: r.fecha,
    tipoCambioActualizado: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
await deleteApp(app);
console.log(`✅ Tipo de cambio BCCR (venta, ${r.fecha}): ₡${r.valor} guardado en config/general.`);
