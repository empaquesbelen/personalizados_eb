// ============================================================
// Tests unitarios de las 4 mejoras del backoffice (sin emulador)
// ------------------------------------------------------------
// Cubre:
//  - Mejora 3: nota OPCIONAL EN_REVISION_BACKOFFICE -> PENDIENTE_ADMIN
//    (requiereNota == false, pero la transición trae notaOpcional == true).
//  - Mejora 2: helper de resumen de edición (resumirEdicionContenido).
//  - Mejora 4: pagoPorDefecto(), resumirPago() y que crearCotizacion()
//    inicializa `pago`.
//
// NO requieren emulador. `crearCotizacion` toca Firestore, así que se mockea
// `firebase/firestore` y `../lib/firebase` para capturar el payload del batch
// sin conectarse a la nube.
// ============================================================

import { describe, test, expect, vi, beforeEach } from 'vitest';

// --- Captura compartida de las escrituras del writeBatch (hoisted p/ el mock) ---
// `docExists`/`docData` alimentan el getDoc mockeado (para transicionarCotizacion,
// que lee el doc antes de escribir). Por defecto no existe (compat. con el resto).
// `contadorValor` alimenta el mock de runTransaction (crearCotizacion lee el
// contador del consecutivo). null = el contador no existe todavía (primer
// consecutivo del día → arranca en 1).
const cap = vi.hoisted(() => ({ sets: [], commits: 0, docExists: false, docData: {}, contadorValor: null }));

// Evita inicializar Firebase real (initializeApp/getAuth/getFirestore).
vi.mock('../app/src/lib/firebase.js', () => ({ db: {}, auth: {}, default: {} }));

// Mock mínimo de firebase/firestore: sólo lo que usa cotizaciones.js.
vi.mock('firebase/firestore', () => ({
  collection: (...args) => ({ __k: 'col', args }),
  doc: (...args) => ({ __k: 'doc', id: 'nuevo-id-generado', args }),
  writeBatch: () => ({
    set: (ref, data) => { cap.sets.push({ ref, data }); },
    update: (ref, data) => { cap.sets.push({ ref, data, __update: true }); },
    commit: async () => { cap.commits += 1; },
  }),
  // Simula la transacción atómica de crearCotizacion: get del contador + writes.
  // Aplica el efecto del contador al terminar (como el commit atómico real), para
  // que dos creaciones consecutivas incrementen la secuencia.
  runTransaction: async (_db, fn) => {
    const captured = [];
    const tx = {
      get: async () => ({
        exists: () => cap.contadorValor != null,
        data: () => ({ valor: cap.contadorValor }),
      }),
      set: (ref, data) => { captured.push({ ref, data }); },
      update: (ref, data) => { captured.push({ ref, data, __update: true }); },
    };
    const r = await fn(tx);
    const contador = captured.find((s) => typeof s.data?.valor === 'number');
    if (contador) cap.contadorValor = contador.data.valor;
    cap.sets.push(...captured);
    cap.commits += 1;
    return r;
  },
  serverTimestamp: () => '__serverTimestamp__',
  getDoc: async () => ({ exists: () => cap.docExists, data: () => cap.docData }),
  query: (...a) => ({ __k: 'query', a }),
  where: (...a) => ({ __k: 'where', a }),
  orderBy: (...a) => ({ __k: 'orderBy', a }),
}));

// Import DESPUÉS de declarar los mocks (vi.mock queda hoisted igualmente).
import { ESTADOS, TRANSICIONES, requiereNota } from '../app/src/constants/dominio.js';
import {
  pagoPorDefecto,
  normalizarPago,
  validarPago,
  describirPago,
  resumirEdicionContenido,
  resumirPago,
  crearCotizacion,
  transicionarCotizacion,
} from '../app/src/services/cotizaciones.js';

// ============================================================
// MEJORA 3 — Nota OPCIONAL al enviar al admin
// ============================================================
describe('Mejora 3 · nota opcional EN_REVISION_BACKOFFICE -> PENDIENTE_ADMIN', () => {
  test('requiereNota() es false para esa transición', () => {
    expect(requiereNota(ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.PENDIENTE_ADMIN)).toBe(false);
  });

  test('la transición está marcada con notaOpcional === true (y NO requiereNota)', () => {
    const t = TRANSICIONES[ESTADOS.EN_REVISION_BACKOFFICE].find(
      (x) => x.a === ESTADOS.PENDIENTE_ADMIN,
    );
    expect(t).toBeDefined();
    expect(t.notaOpcional).toBe(true);
    expect(t.requiereNota).not.toBe(true);
  });

  test('ninguna transición combina requiereNota y notaOpcional a la vez', () => {
    for (const acciones of Object.values(TRANSICIONES)) {
      for (const t of acciones) {
        expect(t.requiereNota === true && t.notaOpcional === true).toBe(false);
      }
    }
  });

  test('notaOpcional existe SOLO en EN_REVISION_BACKOFFICE -> PENDIENTE_ADMIN', () => {
    const conOpcional = [];
    for (const [origen, acciones] of Object.entries(TRANSICIONES)) {
      for (const t of acciones) {
        if (t.notaOpcional) conOpcional.push([origen, t.a]);
      }
    }
    expect(conOpcional).toEqual([[ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.PENDIENTE_ADMIN]]);
  });

  test('las 3 transiciones con nota obligatoria siguen exigiéndola (no se rompió)', () => {
    expect(requiereNota(ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO)).toBe(true);
    expect(requiereNota(ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE)).toBe(true);
    expect(requiereNota(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO)).toBe(true);
  });
});

// ============================================================
// MEJORA 2 — Helper de resumen de edición de contenido
// ============================================================
describe('Mejora 2 · resumirEdicionContenido()', () => {
  const CLI = { nombre: 'Cliente', contacto: '' };
  const A = { cod: 'C1', producto: 'Bolsa', tamano: '10x10', cantidad: 100 };
  const B = { cod: 'C2', producto: 'Caja', tamano: '20x20', cantidad: 50 };

  test('agregar una línea', () => {
    const r = resumirEdicionContenido(
      { cliente: CLI, productos: [A] },
      { cliente: CLI, productos: [A, B] },
    );
    expect(r).toBe('Agregó Caja (20x20)');
  });

  test('quitar una línea', () => {
    const r = resumirEdicionContenido(
      { cliente: CLI, productos: [A, B] },
      { cliente: CLI, productos: [A] },
    );
    expect(r).toBe('Quitó Caja (20x20)');
  });

  test('cambiar la cantidad de una línea', () => {
    const r = resumirEdicionContenido(
      { cliente: CLI, productos: [{ ...A, cantidad: 100 }] },
      { cliente: CLI, productos: [{ ...A, cantidad: 200 }] },
    );
    expect(r).toBe('cambió cantidad de Bolsa (10x10) de 100 a 200');
  });

  test('cambiar sólo los datos del cliente', () => {
    const r = resumirEdicionContenido(
      { cliente: { nombre: 'Antes', contacto: '' }, productos: [A] },
      { cliente: { nombre: 'Después', contacto: '' }, productos: [A] },
    );
    expect(r).toBe('cambió datos del cliente');
  });

  test('sin cambios → texto genérico', () => {
    const r = resumirEdicionContenido(
      { cliente: CLI, productos: [A] },
      { cliente: CLI, productos: [A] },
    );
    expect(r).toBe('Editó el contenido de la cotización');
  });

  test('combinado (agrega + cambia cantidad + cambia cliente) en orden estable', () => {
    const r = resumirEdicionContenido(
      { cliente: { nombre: 'Antes', contacto: '' }, productos: [{ ...A, cantidad: 100 }] },
      { cliente: { nombre: 'Después', contacto: '' }, productos: [{ ...A, cantidad: 200 }, B] },
    );
    expect(r).toBe(
      'Agregó Caja (20x20); cambió cantidad de Bolsa (10x10) de 100 a 200; cambió datos del cliente',
    );
  });
});

// ============================================================
// MEJORA 4 — Método de pago
// ============================================================
describe('Mejora 4 · pagoPorDefecto()', () => {
  test('devuelve el objeto de pago vacío esperado', () => {
    expect(pagoPorDefecto()).toEqual({
      metodo: '',
      comprobante: '',
      muestraEnviada: false,
      cotizacionAprobada: false,
    });
  });

  test('devuelve una instancia nueva en cada llamada (no comparte referencia)', () => {
    const a = pagoPorDefecto();
    const b = pagoPorDefecto();
    expect(a).not.toBe(b);
    a.metodo = 'contado';
    expect(pagoPorDefecto().metodo).toBe('');
  });
});

describe('Mejora 4 · resumirPago()', () => {
  test('contado con comprobante y muestra enviada', () => {
    const r = resumirPago({
      metodo: 'contado',
      comprobante: '00123456',
      muestraEnviada: true,
      cotizacionAprobada: false,
    });
    expect(r).toBe(
      'Actualizó datos de pago: método Contado, comprobante 00123456, muestra enviada',
    );
  });

  test('contado sin comprobante y muestra pendiente', () => {
    const r = resumirPago({ metodo: 'contado', comprobante: '', muestraEnviada: false });
    expect(r).toBe(
      'Actualizó datos de pago: método Contado, sin N° de comprobante, muestra pendiente',
    );
  });

  test('crédito aprobado con muestra pendiente', () => {
    const r = resumirPago({ metodo: 'credito', cotizacionAprobada: true, muestraEnviada: false });
    expect(r).toBe(
      'Actualizó datos de pago: método Crédito, cotización aprobada, muestra pendiente',
    );
  });

  test('crédito sin aprobar con muestra enviada', () => {
    const r = resumirPago({ metodo: 'credito', cotizacionAprobada: false, muestraEnviada: true });
    expect(r).toBe(
      'Actualizó datos de pago: método Crédito, cotización sin aprobar, muestra enviada',
    );
  });

  test('sin método definido', () => {
    const r = resumirPago({ metodo: '' });
    expect(r).toBe('Actualizó datos de pago: sin método definido');
  });
});

describe('Mejora 4 · crearCotizacion inicializa `pago`', () => {
  beforeEach(() => {
    cap.sets.length = 0;
    cap.commits = 0;
    cap.contadorValor = null; // primer consecutivo del día
  });

  // El doc de la cotización es el `set` cuyo data trae `estado` (no el contador
  // ni el evento de historial).
  const docCotizacion = () => cap.sets.find((s) => s.data?.estado)?.data;

  test('sin pago provisto → usa pagoPorDefecto() y crea en GENERADA (atómico)', async () => {
    const { id, consecutivo } = await crearCotizacion({
      prevendedor: { id: 'u1', nombre: 'Prev', rol: 'prevendedor' },
      cliente: { nombre: 'Cli' },
      productos: [],
      totales: {},
      tipoCambio: 500,
      fecha: new Date(2026, 6, 23), // 23/07 → prefijo PRE2307
    });
    expect(id).toBe('nuevo-id-generado');
    // Consecutivo del contador atómico: prefijo PRE2307 + secuencia 01 (no del tiempo).
    expect(consecutivo).toBe('PRE2307-01');
    // 1 sola transacción (commit atómico): contador + doc + evento historial.
    expect(cap.commits).toBe(1);
    expect(cap.sets).toHaveLength(3);

    const docData = docCotizacion();
    expect(docData.consecutivo).toBe('PRE2307-01');
    expect(docData.pago).toEqual(pagoPorDefecto());
    expect(docData.estado).toBe(ESTADOS.GENERADA);
    // No cambia el rastro obligatorio: trae ultimoEvento espejo del create.
    expect(docData.ultimoEvento.estadoAnterior).toBe(null);
    expect(docData.ultimoEvento.estadoNuevo).toBe(ESTADOS.GENERADA);
    expect(docData.ultimoEvento.usuarioId).toBe('u1');
    expect(docData.ultimoEvento.rol).toBe('prevendedor');
  });

  test('con pago provisto → lo respeta tal cual', async () => {
    const pago = {
      metodo: 'contado',
      comprobante: 'A1',
      muestraEnviada: true,
      cotizacionAprobada: false,
    };
    await crearCotizacion({
      prevendedor: { id: 'u1', rol: 'prevendedor' },
      cliente: {},
      productos: [],
      totales: {},
      tipoCambio: 500,
      pago,
    });
    expect(docCotizacion().pago).toEqual(pago);
  });
});

// ============================================================
// PAGO OBLIGATORIO al enviar a aprobación
// ============================================================
describe('Pago obligatorio · la transición al admin lo exige (requierePago)', () => {
  test('EN_REVISION_BACKOFFICE -> PENDIENTE_ADMIN está marcada con requierePago', () => {
    const t = TRANSICIONES[ESTADOS.EN_REVISION_BACKOFFICE].find(
      (x) => x.a === ESTADOS.PENDIENTE_ADMIN,
    );
    expect(t).toBeDefined();
    expect(t.requierePago).toBe(true);
  });

  test('requierePago existe SOLO en esa transición (no se coló en otras)', () => {
    const con = [];
    for (const [origen, acciones] of Object.entries(TRANSICIONES)) {
      for (const t of acciones) {
        if (t.requierePago) con.push([origen, t.a]);
      }
    }
    expect(con).toEqual([[ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.PENDIENTE_ADMIN]]);
  });
});

describe('Pago obligatorio · normalizarPago()', () => {
  test('contado: conserva comprobante (trim) y descarta cotizacionAprobada', () => {
    expect(
      normalizarPago({ metodo: 'contado', comprobante: '  00123 ', muestraEnviada: true, cotizacionAprobada: true }),
    ).toEqual({ metodo: 'contado', comprobante: '00123', muestraEnviada: true, cotizacionAprobada: false });
  });

  test('credito: descarta comprobante y conserva cotizacionAprobada', () => {
    expect(
      normalizarPago({ metodo: 'credito', comprobante: 'X', muestraEnviada: false, cotizacionAprobada: true }),
    ).toEqual({ metodo: 'credito', comprobante: '', muestraEnviada: false, cotizacionAprobada: true });
  });

  test('método inválido → queda vacío y limpia todo', () => {
    expect(normalizarPago({ metodo: 'otro', comprobante: 'X', cotizacionAprobada: true })).toEqual({
      metodo: '',
      comprobante: '',
      muestraEnviada: false,
      cotizacionAprobada: false,
    });
  });
});

describe('Pago obligatorio · validarPago()', () => {
  test('sin método → inválido', () => {
    expect(validarPago({ metodo: '' })).not.toBe('');
  });
  test('contado sin comprobante → inválido', () => {
    expect(validarPago({ metodo: 'contado', comprobante: '' })).not.toBe('');
  });
  test('contado con comprobante de solo espacios → inválido', () => {
    expect(validarPago({ metodo: 'contado', comprobante: '   ' })).not.toBe('');
  });
  test('contado con comprobante → válido', () => {
    expect(validarPago({ metodo: 'contado', comprobante: '00123' })).toBe('');
  });
  test('crédito sin aprobar → inválido', () => {
    expect(validarPago({ metodo: 'credito', cotizacionAprobada: false })).not.toBe('');
  });
  test('crédito aprobado → válido (NO exige comprobante)', () => {
    expect(validarPago({ metodo: 'credito', cotizacionAprobada: true, comprobante: '' })).toBe('');
  });
  test('la muestra enviada NO afecta la validez (es opcional en ambos)', () => {
    expect(validarPago({ metodo: 'contado', comprobante: '1', muestraEnviada: false })).toBe('');
    expect(validarPago({ metodo: 'credito', cotizacionAprobada: true, muestraEnviada: false })).toBe('');
  });
});

describe('Pago obligatorio · describirPago()', () => {
  test('contado con comprobante y muestra enviada', () => {
    expect(describirPago({ metodo: 'contado', comprobante: '00123', muestraEnviada: true })).toBe(
      'Contado · comprobante 00123 · muestra enviada',
    );
  });
  test('crédito aprobado con muestra pendiente', () => {
    expect(describirPago({ metodo: 'credito', cotizacionAprobada: true, muestraEnviada: false })).toBe(
      'Crédito · cotización aprobada · muestra pendiente',
    );
  });
  test('sin método', () => {
    expect(describirPago({ metodo: '' })).toBe('sin método definido');
  });
});

describe('Pago obligatorio · transicionarCotizacion incluye `pago` (atómico)', () => {
  beforeEach(() => {
    cap.sets.length = 0;
    cap.commits = 0;
    cap.docExists = true;
    cap.docData = { estado: ESTADOS.EN_REVISION_BACKOFFICE };
  });

  test('con pago → lo normaliza y lo mete en el MISMO update del batch', async () => {
    await transicionarCotizacion({
      cotizacionId: 'c1',
      estadoNuevo: ESTADOS.PENDIENTE_ADMIN,
      usuario: { id: 'b1', rol: 'backoffice' },
      nota: 'Pago: Contado · comprobante 00123 · muestra enviada',
      pago: { metodo: 'contado', comprobante: '  00123 ', muestraEnviada: true, cotizacionAprobada: true },
    });
    // 1 solo commit atómico: update del doc + set del evento historial.
    expect(cap.commits).toBe(1);
    const update = cap.sets.find((s) => s.__update);
    expect(update).toBeDefined();
    expect(update.data.estado).toBe(ESTADOS.PENDIENTE_ADMIN);
    // pago normalizado (comprobante con trim; cotizacionAprobada descartada en contado).
    expect(update.data.pago).toEqual({
      metodo: 'contado',
      comprobante: '00123',
      muestraEnviada: true,
      cotizacionAprobada: false,
    });
    // El evento espejo sigue siendo coherente (Regla Absoluta #2).
    expect(update.data.ultimoEvento.estadoAnterior).toBe(ESTADOS.EN_REVISION_BACKOFFICE);
    expect(update.data.ultimoEvento.estadoNuevo).toBe(ESTADOS.PENDIENTE_ADMIN);
    expect(update.data.ultimoEvento.usuarioId).toBe('b1');
    expect(update.data.ultimoEvento.rol).toBe('backoffice');
  });

  test('sin pago → NO toca la clave pago (para no pisar la existente)', async () => {
    await transicionarCotizacion({
      cotizacionId: 'c1',
      estadoNuevo: ESTADOS.PENDIENTE_ADMIN,
      usuario: { id: 'b1', rol: 'backoffice' },
      nota: 'x',
    });
    const update = cap.sets.find((s) => s.__update);
    expect('pago' in update.data).toBe(false);
  });
});
