// ============================================
// Tests del TIPO DE CAMBIO (dinero = cuidado, Regla Absoluta #10)
// ------------------------------------------------------------
// 1) Netlify Function app/netlify/functions/tipo-cambio.mjs (proxy del BCCR):
//    fetch al BCCR simulado; contrato de respuesta, errores y caché.
// 2) Cliente services/catalogo.js (getConfig / getConfigBase /
//    reintentarTipoCambio): valor en vivo vs. respaldo de config y registro del
//    MOTIVO de cada fallo (antes un 404 caía en silencio).
// 3) services/tipoCambio.js: cuándo exigir confirmación para cotizar.
// Sin red ni emulador: firebase/firestore y fetch están mockeados.
// ============================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ config: null, getDocCount: 0 }));

vi.mock('../app/src/lib/firebase.js', () => ({ db: { __fake_db: true } }));
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: name, id }),
  getDoc: vi.fn(async () => {
    state.getDocCount += 1;
    return { exists: () => state.config !== null, data: () => state.config };
  }),
  getDocs: vi.fn(async () => ({ docs: [] })),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

import tipoCambioFn from '../app/netlify/functions/tipo-cambio.mjs';
import {
  getConfig,
  getConfigBase,
  reintentarTipoCambio,
  invalidarCache,
  TIPO_CAMBIO_URL,
} from '../app/src/services/catalogo.js';
import { evaluarTipoCambio, diasHabilesDesde, formatearFechaTC } from '../app/src/services/tipoCambio.js';

// ---- Helpers ----
const jsonResponse = (cuerpo, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const serieBCCR = (series) => ({
  estado: true,
  mensaje: 'Consulta exitosa',
  datos: [{ codigoIndicador: '318', series }],
});

/** fetch que nunca contesta hasta que el AbortSignal se dispara. */
const fetchColgado = () =>
  vi.fn(
    (_url, { signal } = {}) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );

const llamarFuncion = (method = 'GET') =>
  tipoCambioFn(new Request('http://localhost/.netlify/functions/tipo-cambio', { method }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ============================================================
// 1) Netlify Function
// ============================================================
describe('Netlify Function tipo-cambio', () => {
  beforeEach(() => {
    process.env.BCCR_TOKEN = 'token-de-prueba';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    delete process.env.BCCR_TOKEN;
  });

  it('devuelve el último valor del BCCR con el contrato { success, data } y caché de CDN', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        serieBCCR([
          { fecha: '2026-10-02', valorDatoPorPeriodo: 461.5 },
          { fecha: '2026-10-05', valorDatoPorPeriodo: 462.08 },
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await llamarFuncion();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { tipoCambio: 462.08, fuente: 'BCCR', fecha: '2026-10-05' },
    });
    expect(res.headers.get('netlify-cdn-cache-control')).toContain('s-maxage=600');

    // Llama al indicador 318 (venta) con Bearer token y fechas yyyy/MM/dd.
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/indicadoresEconomicos/318/series');
    expect(decodeURIComponent(url)).toMatch(/fechaInicio=\d{4}\/\d{2}\/\d{2}&fechaFin=\d{4}\/\d{2}\/\d{2}/);
    expect(opts.headers.Authorization).toBe('Bearer token-de-prueba');
  });

  it('elige la fecha más reciente aunque la serie venga desordenada e ignora valores inválidos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          serieBCCR([
            { fecha: '2026-10-05T00:00:00', valorDatoPorPeriodo: 462.08 },
            { fecha: '2026-10-06', valorDatoPorPeriodo: 0 },
            { fecha: '2026-10-07', valorDatoPorPeriodo: null },
            { fecha: '2026-10-01', valorDatoPorPeriodo: 460 },
          ]),
        ),
      ),
    );
    const res = await llamarFuncion();
    const json = await res.json();
    expect(json.data).toEqual({ tipoCambio: 462.08, fuente: 'BCCR', fecha: '2026-10-05' });
  });

  it('sin BCCR_TOKEN → 500 explicable, sin llamar al BCCR y sin caché', async () => {
    delete process.env.BCCR_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await llamarFuncion();
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('netlify-cdn-cache-control')).toBeNull();
    expect((await res.json()).error).toMatch(/BCCR_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('BCCR con HTTP de error → 502 con el código, registrado en el log', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    const res = await llamarFuncion();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ success: false, error: 'El BCCR respondió HTTP 401' });
    expect(console.error).toHaveBeenCalled();
  });

  it('BCCR con estado:false → 502 con su mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ estado: false, mensaje: 'Indicador inválido' })));
    const res = await llamarFuncion();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Indicador inválido/);
  });

  it('serie vacía → 502 (nunca devuelve un tipo de cambio inventado)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(serieBCCR([]))));
    const res = await llamarFuncion();
    expect(res.status).toBe(502);
    expect((await res.json()).success).toBe(false);
  });

  it('BCCR que no responde → 504 a los 6 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchColgado());
    const p = llamarFuncion();
    await vi.advanceTimersByTimeAsync(6000);
    const res = await p;
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/no respondió en 6 s/);
  });

  it('error de red → 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const res = await llamarFuncion();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/No se pudo conectar/);
  });

  it('solo acepta GET', async () => {
    const res = await llamarFuncion('POST');
    expect(res.status).toBe(405);
  });
});

// ============================================================
// 2) Cliente: getConfig / getConfigBase / reintentarTipoCambio
// ============================================================
describe('getConfig: tipo de cambio en vivo vs. respaldo de config', () => {
  const RESPUESTA_OK = { success: true, data: { tipoCambio: 462.08, fuente: 'BCCR', fecha: '2026-10-05' } };

  beforeEach(() => {
    invalidarCache();
    state.getDocCount = 0;
    state.config = {
      tipoCambio: 454.75,
      tipoCambioFuente: 'BCCR',
      tipoCambioFecha: '2026-07-30',
      tipoCambioManual: 455.75,
      // Campo del Apps Script anterior: ya NO debe usarse.
      tipoCambioEndpoint: 'https://script.google.com/macros/s/XXX/exec',
      nombreEmpresa: 'Empaques Belén',
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('usa el valor en vivo de la Netlify Function (no el Apps Script) y lo cachea', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(RESPUESTA_OK));
    vi.stubGlobal('fetch', fetchMock);

    const cfg = await getConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(TIPO_CAMBIO_URL);
    expect(TIPO_CAMBIO_URL).toBe('/.netlify/functions/tipo-cambio');
    expect(cfg.tipoCambio).toBe(462.08);
    expect(cfg.tipoCambioFuente).toBe('BCCR');
    expect(cfg.tipoCambioOrigen).toBe('vivo');
    // Fecha anclada al día LOCAL (sin el bug del −1 día por UTC).
    expect([cfg.tipoCambioFecha.getFullYear(), cfg.tipoCambioFecha.getMonth(), cfg.tipoCambioFecha.getDate()]).toEqual([2026, 9, 5]);
    expect(cfg.nombreEmpresa).toBe('Empaques Belén');
    expect(console.warn).not.toHaveBeenCalled();

    await getConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cacheado por sesión
  });

  it('404 HTML (página de error del hosting) → respaldo de config + aviso en consola con el motivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>No se pudo abrir</html>', { status: 404, headers: { 'content-type': 'text/html' } })),
    );
    const cfg = await getConfig();
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioOrigen).toBe('config');
    expect(cfg.tipoCambioErrorVivo).toMatch(/respuesta no JSON \(HTTP 404, text\/html\)/);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn.mock.calls[0][0]).toMatch(/HTTP 404/);
    expect(console.warn.mock.calls[0][0]).toMatch(/454\.75/);
  });

  it('la función responde success:false → respaldo + motivo con el error del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: false, error: 'Falta la variable de entorno BCCR_TOKEN en Netlify' }, 500)),
    );
    const cfg = await getConfig();
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioErrorVivo).toBe('HTTP 500: Falta la variable de entorno BCCR_TOKEN en Netlify');
  });

  it('sin respuesta en 8 s → respaldo + motivo de timeout explícito', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchColgado());
    const p = getConfig();
    await vi.advanceTimersByTimeAsync(8000);
    const cfg = await p;
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioErrorVivo).toBe('sin respuesta en 8 s');
  });

  it('error de red → respaldo + motivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const cfg = await getConfig();
    expect(cfg.tipoCambioErrorVivo).toBe('error de red: Failed to fetch');
  });

  it('valor o fecha inválidos en la respuesta → respaldo (no se cotiza con basura)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: { tipoCambio: 0, fecha: '2026-10-05' } })));
    let cfg = await getConfig();
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioErrorVivo).toMatch(/valor inválido/);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: { tipoCambio: 462.08 } })));
    cfg = await getConfig();
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioErrorVivo).toMatch(/fecha inválida/);
  });

  it('un fallo NO se cachea: la siguiente llamada vuelve a consultar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 404, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(jsonResponse(RESPUESTA_OK));
    vi.stubGlobal('fetch', fetchMock);

    expect((await getConfig()).tipoCambioOrigen).toBe('config');
    expect((await getConfig()).tipoCambioOrigen).toBe('vivo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reintentarTipoCambio relee config y vuelve a consultar en vivo', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 502, headers: { 'content-type': 'text/plain' } })));
    expect((await getConfig()).tipoCambio).toBe(454.75);
    const lecturasAntes = state.getDocCount;

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(RESPUESTA_OK)));
    const cfg = await reintentarTipoCambio();
    expect(cfg.tipoCambio).toBe(462.08);
    expect(state.getDocCount).toBe(lecturasAntes + 1);
  });

  it('sin tipoCambio guardado en config → manual de respaldo (origen manual)', async () => {
    state.config = { tipoCambioManual: 455.75 };
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const cfg = await getConfig();
    expect(cfg.tipoCambio).toBe(455.75);
    expect(cfg.tipoCambioFuente).toBe('manual');
    expect(cfg.tipoCambioOrigen).toBe('manual');
  });

  it('getConfigBase (PDF del detalle) NUNCA consulta el tipo de cambio en vivo', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const cfg = await getConfigBase();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cfg.nombreEmpresa).toBe('Empaques Belén');
    expect(cfg.tipoCambio).toBe(454.75);
    expect(cfg.tipoCambioOrigen).toBe('config');
  });
});

// ============================================================
// 3) Antigüedad: cuándo exigir confirmación para cotizar
// ============================================================
describe('evaluarTipoCambio', () => {
  const LUNES = new Date(2026, 9, 5); // lunes 05/10/2026

  it('el calendario de prueba es correcto (05/10/2026 es lunes)', () => {
    expect(LUNES.getDay()).toBe(1);
  });

  it('BCCR del día → no requiere confirmación', () => {
    const r = evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: new Date(2026, 9, 5) }, LUNES);
    expect(r).toEqual({ requiereConfirmacion: false, motivo: null, diasHabiles: 0 });
  });

  it('BCCR del viernes visto el lunes → 1 día hábil, no requiere confirmación', () => {
    const r = evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: new Date(2026, 9, 2) }, LUNES);
    expect(r.diasHabiles).toBe(1);
    expect(r.requiereConfirmacion).toBe(false);
  });

  it('BCCR del jueves visto el lunes → 2 días hábiles, requiere confirmación', () => {
    const r = evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: new Date(2026, 9, 1) }, LUNES);
    expect(r).toEqual({ requiereConfirmacion: true, motivo: 'desactualizado', diasHabiles: 2 });
  });

  it('el respaldo del 30/07 (caso real) requiere confirmación', () => {
    const r = evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: new Date(2026, 6, 30) }, LUNES);
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.motivo).toBe('desactualizado');
  });

  it('manual, BCCR sin fecha o config ausente → requiere confirmación (motivo manual)', () => {
    expect(evaluarTipoCambio({ tipoCambioFuente: 'manual', tipoCambioFecha: null }, LUNES).motivo).toBe('manual');
    expect(evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: null }, LUNES).requiereConfirmacion).toBe(true);
    expect(evaluarTipoCambio(null, LUNES).requiereConfirmacion).toBe(true);
    expect(evaluarTipoCambio({ tipoCambioFuente: 'BCCR', tipoCambioFecha: new Date('x') }, LUNES).motivo).toBe('manual');
  });

  it('diasHabilesDesde no cuenta sábados ni domingos', () => {
    expect(diasHabilesDesde(new Date(2026, 9, 3), LUNES)).toBe(1); // sábado → lunes
    expect(diasHabilesDesde(new Date(2026, 8, 28), LUNES)).toBe(5); // lunes anterior
  });

  it('formatearFechaTC: dd/MM/yyyy o vacío', () => {
    expect(formatearFechaTC(new Date(2026, 6, 30))).toBe('30/07/2026');
    expect(formatearFechaTC(null)).toBe('');
  });
});
