// ============================================================
// Tests de Firestore Security Rules (firestore.rules)
// ------------------------------------------------------------
// REQUIEREN el emulador de Firestore. Ejecutar con:
//   npm run test:rules
//   (== firebase emulators:exec --only firestore --project
//       cotizador-personalizados "vitest run tests/firestore-rules.test.js")
//
// Si el emulador NO está activo (no hay FIRESTORE_EMULATOR_HOST),
// toda la suite se SALTA en vez de fallar, para que `npm test`
// (solo unitarios) siga verde.
// ============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  test,
  expect,
} from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { requiereNota } from '../app/src/constants/dominio.js';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const HAY_EMULADOR = Boolean(EMULATOR_HOST);

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '..', 'firestore.rules');
const PROJECT_ID = 'cotizador-personalizados';

// --- UIDs de prueba (coinciden con el id del doc en usuarios/{uid}) ---
const U = {
  prev1: 'prev1',
  prev2: 'prev2',
  back: 'back',
  admin: 'admin',
  dis: 'dis',
  super: 'super',
  inactivo: 'inactivo',
  ghost: 'ghost', // autenticado pero SIN doc en usuarios
};

const USUARIOS = {
  [U.prev1]: { nombre: 'Prev Uno', rol: 'prevendedor', activo: true },
  [U.prev2]: { nombre: 'Prev Dos', rol: 'prevendedor', activo: true },
  [U.back]: { nombre: 'Back', rol: 'backoffice', activo: true },
  [U.admin]: { nombre: 'Admin', rol: 'admin', activo: true },
  [U.dis]: { nombre: 'Diseno', rol: 'disenador', activo: true },
  [U.super]: { nombre: 'Super', rol: 'superadmin', activo: true },
  [U.inactivo]: { nombre: 'Inactivo', rol: 'backoffice', activo: false },
};

// Un doc de cotización por estado de partida (para probar transiciones).
const COT = {
  GENERADA: 'cot_generada',
  EN_REVISION_BACKOFFICE: 'cot_en_rev',
  PENDIENTE_ADMIN: 'cot_pend_admin',
  PENDIENTE_DISENO: 'cot_pend_diseno',
  EN_DISENO: 'cot_en_diseno',
  REVISION_FINAL_BACKOFFICE: 'cot_rev_final',
  COMPLETADA: 'cot_completada',
};

function cotBase(estado) {
  return {
    consecutivo: 'TST0101-01',
    estado,
    prevendedorId: U.prev1,
    cliente: { nombre: 'Cliente X' },
    productos: [],
    totales: { subtotal: 0, iva: 0, total: 0, totalUSD: 0 },
    tipoCambio: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Construye el mapa `ultimoEvento` (espejo del evento) que las reglas exigen.
// `rol` = rol REAL del uid (de USUARIOS); `timestamp` = serverTimestamp()
// para que las reglas puedan validar `== request.time`. `from` = null en create.
function eventoEspejo(uid, from, to, nota = '') {
  return {
    estadoAnterior: from,
    estadoNuevo: to,
    usuarioId: uid,
    rol: USUARIOS[uid].rol,
    nota,
    timestamp: serverTimestamp(),
  };
}

// Matriz de transiciones válidas (espejo de dominio.js / ARQUITECTURA.md).
const TRANSICIONES_VALIDAS = [
  { from: 'GENERADA', to: 'EN_REVISION_BACKOFFICE', roles: ['backoffice', 'superadmin'] },
  { from: 'GENERADA', to: 'ANULADA', roles: ['backoffice', 'superadmin'] },
  { from: 'EN_REVISION_BACKOFFICE', to: 'PENDIENTE_ADMIN', roles: ['backoffice', 'superadmin'] },
  { from: 'PENDIENTE_ADMIN', to: 'PENDIENTE_DISENO', roles: ['admin', 'superadmin'] },
  { from: 'PENDIENTE_ADMIN', to: 'EN_REVISION_BACKOFFICE', roles: ['admin', 'superadmin'] },
  { from: 'PENDIENTE_DISENO', to: 'EN_DISENO', roles: ['disenador', 'superadmin'] },
  { from: 'EN_DISENO', to: 'REVISION_FINAL_BACKOFFICE', roles: ['disenador', 'superadmin'] },
  { from: 'REVISION_FINAL_BACKOFFICE', to: 'COMPLETADA', roles: ['backoffice', 'superadmin'] },
  { from: 'REVISION_FINAL_BACKOFFICE', to: 'EN_DISENO', roles: ['backoffice', 'superadmin'] },
];

// Transiciones que NO existen en la matriz (deben fallar incluso para superadmin).
const TRANSICIONES_INVALIDAS = [
  { from: 'GENERADA', to: 'PENDIENTE_ADMIN' },      // se salta revisión
  { from: 'GENERADA', to: 'COMPLETADA' },           // salto total
  { from: 'GENERADA', to: 'PENDIENTE_DISENO' },
  { from: 'EN_REVISION_BACKOFFICE', to: 'PENDIENTE_DISENO' },
  { from: 'EN_REVISION_BACKOFFICE', to: 'COMPLETADA' },
  { from: 'PENDIENTE_ADMIN', to: 'COMPLETADA' },
  { from: 'PENDIENTE_ADMIN', to: 'EN_DISENO' },
  { from: 'PENDIENTE_DISENO', to: 'COMPLETADA' },
  { from: 'PENDIENTE_DISENO', to: 'REVISION_FINAL_BACKOFFICE' },
  { from: 'EN_DISENO', to: 'COMPLETADA' },
  { from: 'REVISION_FINAL_BACKOFFICE', to: 'ANULADA' },
];

const TODOS_ROLES_UID = [U.prev1, U.back, U.admin, U.dis, U.super];

let testEnv;

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // usuarios
    for (const [uid, data] of Object.entries(USUARIOS)) {
      await setDoc(doc(db, 'usuarios', uid), data);
    }
    // cotizaciones (una por estado)
    for (const [estado, id] of Object.entries(COT)) {
      await setDoc(doc(db, 'cotizaciones', id), cotBase(estado));
    }
    // un evento de historial preexistente bajo cot_generada
    await setDoc(
      doc(db, 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1'),
      {
        estadoAnterior: null,
        estadoNuevo: 'GENERADA',
        usuarioId: U.back,
        rol: 'backoffice',
        timestamp: new Date(),
      },
    );
    // un contador de consecutivo preexistente (para probar el incremento).
    await setDoc(doc(db, 'contadores', 'STE2307'), { valor: 5, prefijo: 'STE2307' });
    // un producto de catálogo preexistente (para probar update por rol).
    await setDoc(doc(db, 'catalogo', 'prod1'), {
      producto: 'Vasos', tamano: '10 oz', minimo: 10, precioSinIVA: 100,
      precioEnUsd: false, activo: true,
    });
  });
}

function dbDe(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}
function dbAnon() {
  return testEnv.unauthenticatedContext().firestore();
}

describe.skipIf(!HAY_EMULADOR)('Firestore Security Rules', () => {
  beforeAll(async () => {
    const firestore = { rules: readFileSync(RULES_PATH, 'utf8') };
    if (EMULATOR_HOST) {
      const [host, port] = EMULATOR_HOST.split(':');
      firestore.host = host;
      firestore.port = Number(port);
    }
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed();
  });

  // ==========================================================
  // A) LECTURA por visibilidad de rol
  // ==========================================================
  describe('Lectura de cotizaciones por visibilidad', () => {
    test('prevendedor lee SU propia cotización', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.prev1), 'cotizaciones', COT.GENERADA)));
    });
    test('prevendedor NO lee la cotización de otro prevendedor', async () => {
      await assertFails(getDoc(doc(dbDe(U.prev2), 'cotizaciones', COT.GENERADA)));
    });
    test('backoffice lee cualquier cotización', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.back), 'cotizaciones', COT.GENERADA)));
    });
    test('admin lee cualquier cotización', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.admin), 'cotizaciones', COT.GENERADA)));
    });
    test('superadmin lee cualquier cotización', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.super), 'cotizaciones', COT.GENERADA)));
    });
    test('disenador lee cotización en PENDIENTE_DISENO', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.dis), 'cotizaciones', COT.PENDIENTE_DISENO)));
    });
    test('disenador lee cotización en EN_DISENO', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.dis), 'cotizaciones', COT.EN_DISENO)));
    });
    test('disenador NO lee cotización en GENERADA', async () => {
      await assertFails(getDoc(doc(dbDe(U.dis), 'cotizaciones', COT.GENERADA)));
    });
    test('disenador NO lee cotización en PENDIENTE_ADMIN', async () => {
      await assertFails(getDoc(doc(dbDe(U.dis), 'cotizaciones', COT.PENDIENTE_ADMIN)));
    });
    test('usuario inactivo NO lee', async () => {
      await assertFails(getDoc(doc(dbDe(U.inactivo), 'cotizaciones', COT.GENERADA)));
    });
    test('usuario autenticado sin doc en usuarios NO lee', async () => {
      await assertFails(getDoc(doc(dbDe(U.ghost), 'cotizaciones', COT.GENERADA)));
    });
    test('anónimo NO lee', async () => {
      await assertFails(getDoc(doc(dbAnon(), 'cotizaciones', COT.GENERADA)));
    });
  });

  // ==========================================================
  // B) CREATE de cotización
  // ==========================================================
  describe('Creación de cotizaciones', () => {
    // Incluye el evento espejo `ultimoEvento` (estadoAnterior=null) que ahora
    // exigen las reglas en el create.
    const nueva = (prevId) => ({
      ...cotBase('GENERADA'),
      prevendedorId: prevId,
      ultimoEvento: eventoEspejo(prevId, null, 'GENERADA', ''),
    });

    test('prevendedor crea su propia cotización en GENERADA', async () => {
      await assertSucceeds(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_1'), nueva(U.prev1)),
      );
    });
    test('superadmin crea cotización (prevendedorId propio) en GENERADA', async () => {
      await assertSucceeds(
        setDoc(doc(dbDe(U.super), 'cotizaciones', 'nueva_2'), nueva(U.super)),
      );
    });
    test('prevendedor NO puede crear SIN ultimoEvento', async () => {
      const { ultimoEvento, ...sinEvento } = nueva(U.prev1);
      void ultimoEvento;
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_sin_evt'), sinEvento),
      );
    });
    test('prevendedor NO puede crear con ultimoEvento.rol falso', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_rol_falso'), {
          ...nueva(U.prev1),
          ultimoEvento: { ...eventoEspejo(U.prev1, null, 'GENERADA', ''), rol: 'admin' },
        }),
      );
    });
    test('prevendedor NO puede crear con ultimoEvento.usuarioId ajeno', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_uid_ajeno'), {
          ...nueva(U.prev1),
          ultimoEvento: { ...eventoEspejo(U.prev1, null, 'GENERADA', ''), usuarioId: U.prev2 },
        }),
      );
    });
    test('prevendedor NO puede crear con ultimoEvento.estadoAnterior != null', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_estado_ant'), {
          ...nueva(U.prev1),
          ultimoEvento: eventoEspejo(U.prev1, 'GENERADA', 'GENERADA', ''),
        }),
      );
    });
    test('prevendedor NO puede crear con ultimoEvento.timestamp de cliente (no request.time)', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_ts_cliente'), {
          ...nueva(U.prev1),
          ultimoEvento: { ...eventoEspejo(U.prev1, null, 'GENERADA', ''), timestamp: new Date() },
        }),
      );
    });
    test('prevendedor NO puede crear con estado != GENERADA', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_3'), {
          ...cotBase('PENDIENTE_ADMIN'),
          prevendedorId: U.prev1,
        }),
      );
    });
    test('prevendedor NO puede crear a nombre de otro (prevendedorId ajeno)', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.prev1), 'cotizaciones', 'nueva_4'), nueva(U.prev2)),
      );
    });
    test('backoffice NO puede crear cotización', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.back), 'cotizaciones', 'nueva_5'), nueva(U.back)),
      );
    });
    test('admin NO puede crear cotización', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.admin), 'cotizaciones', 'nueva_6'), nueva(U.admin)),
      );
    });
    test('disenador NO puede crear cotización', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.dis), 'cotizaciones', 'nueva_7'), nueva(U.dis)),
      );
    });
    test('anónimo NO puede crear cotización', async () => {
      await assertFails(
        setDoc(doc(dbAnon(), 'cotizaciones', 'nueva_8'), nueva(U.prev1)),
      );
    });
  });

  // ==========================================================
  // C) UPDATE: transiciones de estado (rol correcto vs equivocado)
  // ==========================================================
  describe('Transiciones de estado (matriz)', () => {
    for (const { from, to, roles } of TRANSICIONES_VALIDAS) {
      const docId = COT[from];
      const necesitaNota = requiereNota(from, to);
      for (const uid of TODOS_ROLES_UID) {
        const autorizado = roles.includes(USUARIOS[uid].rol);
        const etiqueta = `${from} -> ${to} por ${USUARIOS[uid].rol}`;
        test(`${autorizado ? '✔' : '✘'} ${etiqueta}`, async () => {
          const op = updateDoc(doc(dbDe(uid), 'cotizaciones', docId), {
            estado: to,
            updatedAt: serverTimestamp(),
            ultimoEvento: eventoEspejo(uid, from, to, necesitaNota ? 'motivo' : ''),
          });
          if (autorizado) await assertSucceeds(op);
          else await assertFails(op);
        });
      }
    }

    test('usuario INACTIVO no puede ejecutar una transición válida de su rol', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.inactivo), 'cotizaciones', COT.GENERADA), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.inactivo, 'GENERADA', 'EN_REVISION_BACKOFFICE'),
        }),
      );
    });
  });

  describe('Transiciones FUERA de la matriz (deben fallar, incl. superadmin)', () => {
    for (const { from, to } of TRANSICIONES_INVALIDAS) {
      const docId = COT[from];
      test(`✘ ${from} -> ${to} por superadmin`, async () => {
        await assertFails(
          updateDoc(doc(dbDe(U.super), 'cotizaciones', docId), { estado: to }),
        );
      });
      test(`✘ ${from} -> ${to} por backoffice`, async () => {
        await assertFails(
          updateDoc(doc(dbDe(U.back), 'cotizaciones', docId), { estado: to }),
        );
      });
    }
  });

  // ==========================================================
  // C.2) UPDATE: evento espejo `ultimoEvento` obligatorio y coherente
  //      (Regla Absoluta #2 — rastro del cambio de estado en el doc)
  // ==========================================================
  describe('Evento espejo ultimoEvento en transiciones', () => {
    const REF = () => doc(dbDe(U.back), 'cotizaciones', COT.GENERADA);
    const base = () => eventoEspejo(U.back, 'GENERADA', 'EN_REVISION_BACKOFFICE');

    test('✔ transición CON ultimoEvento correcto pasa', async () => {
      await assertSucceeds(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: base(),
        }),
      );
    });
    test('✘ transición SIN ultimoEvento falla', async () => {
      await assertFails(
        updateDoc(REF(), { estado: 'EN_REVISION_BACKOFFICE', updatedAt: serverTimestamp() }),
      );
    });
    test('✘ ultimoEvento.usuarioId de OTRO usuario falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), usuarioId: U.admin },
        }),
      );
    });
    test('✘ ultimoEvento.rol que NO es el real del que llama falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), rol: 'admin' },
        }),
      );
    });
    test('✘ ultimoEvento.estadoAnterior incorrecto falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), estadoAnterior: 'PENDIENTE_ADMIN' },
        }),
      );
    });
    test('✘ ultimoEvento.estadoNuevo que no coincide con el estado escrito falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), estadoNuevo: 'ANULADA' },
        }),
      );
    });
    test('✘ ultimoEvento.timestamp de cliente (no request.time) falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), timestamp: new Date() },
        }),
      );
    });
    test('✘ ultimoEvento.nota no-string falla', async () => {
      await assertFails(
        updateDoc(REF(), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: { ...base(), nota: 123 },
        }),
      );
    });
  });

  // ==========================================================
  // C.2b) UPDATE: transición al admin que TAMBIÉN escribe `pago` en el mismo
  //       update (pago obligatorio al enviar a aprobación). Debe pasar bajo la
  //       rama transicionValida()+eventoEspejoUpdate(): las reglas no restringen
  //       `pago`. El pago NO otorga permiso a un rol no autorizado.
  // ==========================================================
  describe('Transición al admin con datos de pago en el mismo update', () => {
    const PAGO = { metodo: 'contado', comprobante: '00123', muestraEnviada: true, cotizacionAprobada: false };
    const trans = (uid) => ({
      estado: 'PENDIENTE_ADMIN',
      updatedAt: serverTimestamp(),
      pago: PAGO,
      ultimoEvento: eventoEspejo(uid, 'EN_REVISION_BACKOFFICE', 'PENDIENTE_ADMIN', 'Pago: Contado'),
    });

    test('✔ backoffice: transición + pago en un solo update pasa', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.back), 'cotizaciones', COT.EN_REVISION_BACKOFFICE), trans(U.back)),
      );
    });
    test('✔ superadmin: transición + pago en un solo update pasa', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.super), 'cotizaciones', COT.EN_REVISION_BACKOFFICE), trans(U.super)),
      );
    });
    test('✘ admin: NO autorizado en esta transición aunque escriba pago', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.EN_REVISION_BACKOFFICE), trans(U.admin)),
      );
    });
    test('✘ prevendedor: NO autorizado aunque escriba pago', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.prev1), 'cotizaciones', COT.EN_REVISION_BACKOFFICE), trans(U.prev1)),
      );
    });
  });

  // ==========================================================
  // C.3) UPDATE: nota obligatoria cuando la transición la requiere
  //      (admin aprueba/devuelve, backoffice rechaza diseño)
  // ==========================================================
  describe('Nota obligatoria en transiciones que la requieren', () => {
    test('✔ admin APRUEBA (PENDIENTE_ADMIN->PENDIENTE_DISENO) con nota', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.PENDIENTE_ADMIN), {
          estado: 'PENDIENTE_DISENO',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.admin, 'PENDIENTE_ADMIN', 'PENDIENTE_DISENO', 'aprobado'),
        }),
      );
    });
    test('✘ admin APRUEBA sin nota (vacía) falla', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.PENDIENTE_ADMIN), {
          estado: 'PENDIENTE_DISENO',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.admin, 'PENDIENTE_ADMIN', 'PENDIENTE_DISENO', ''),
        }),
      );
    });
    test('✔ admin DEVUELVE (PENDIENTE_ADMIN->EN_REVISION_BACKOFFICE) con nota', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.PENDIENTE_ADMIN), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.admin, 'PENDIENTE_ADMIN', 'EN_REVISION_BACKOFFICE', 'faltan datos'),
        }),
      );
    });
    test('✘ admin DEVUELVE sin nota falla', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.PENDIENTE_ADMIN), {
          estado: 'EN_REVISION_BACKOFFICE',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.admin, 'PENDIENTE_ADMIN', 'EN_REVISION_BACKOFFICE', ''),
        }),
      );
    });
    test('✔ backoffice RECHAZA diseño (REVISION_FINAL_BACKOFFICE->EN_DISENO) con nota', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.back), 'cotizaciones', COT.REVISION_FINAL_BACKOFFICE), {
          estado: 'EN_DISENO',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.back, 'REVISION_FINAL_BACKOFFICE', 'EN_DISENO', 'rehacer plano'),
        }),
      );
    });
    test('✘ backoffice RECHAZA diseño sin nota falla', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.back), 'cotizaciones', COT.REVISION_FINAL_BACKOFFICE), {
          estado: 'EN_DISENO',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.back, 'REVISION_FINAL_BACKOFFICE', 'EN_DISENO', ''),
        }),
      );
    });
    test('✔ transición que NO requiere nota pasa con nota vacía (backoffice completa)', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.back), 'cotizaciones', COT.REVISION_FINAL_BACKOFFICE), {
          estado: 'COMPLETADA',
          updatedAt: serverTimestamp(),
          ultimoEvento: eventoEspejo(U.back, 'REVISION_FINAL_BACKOFFICE', 'COMPLETADA', ''),
        }),
      );
    });
  });

  // ==========================================================
  // D) UPDATE: edición de contenido sin cambiar estado
  // ==========================================================
  describe('Edición de contenido (sin cambiar estado)', () => {
    test('backoffice edita contenido sin cambiar estado', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.back), 'cotizaciones', COT.GENERADA), {
          notaActual: 'ajuste backoffice',
        }),
      );
    });
    test('superadmin edita contenido sin cambiar estado', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.super), 'cotizaciones', COT.GENERADA), {
          notaActual: 'ajuste super',
        }),
      );
    });
    test('prevendedor (dueño) NO puede editar contenido', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.prev1), 'cotizaciones', COT.GENERADA), {
          notaActual: 'intento prevendedor',
        }),
      );
    });
    test('admin NO puede editar contenido (sin cambiar estado)', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.admin), 'cotizaciones', COT.GENERADA), {
          notaActual: 'intento admin',
        }),
      );
    });
    test('disenador NO puede editar contenido', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.dis), 'cotizaciones', COT.EN_DISENO), {
          notaActual: 'intento diseno',
        }),
      );
    });
  });

  // ==========================================================
  // E) DELETE de cotización: prohibido (soft-delete via ANULADA)
  // ==========================================================
  describe('Borrado físico de cotizaciones prohibido', () => {
    test('superadmin NO puede borrar una cotización', async () => {
      await assertFails(deleteDoc(doc(dbDe(U.super), 'cotizaciones', COT.GENERADA)));
    });
    test('backoffice NO puede borrar una cotización', async () => {
      await assertFails(deleteDoc(doc(dbDe(U.back), 'cotizaciones', COT.GENERADA)));
    });
  });

  // ==========================================================
  // F) Subcolección historial_estados (append-only)
  // ==========================================================
  describe('historial_estados (append-only)', () => {
    const nuevoEvento = (usuarioId) => ({
      estadoAnterior: 'GENERADA',
      estadoNuevo: 'EN_REVISION_BACKOFFICE',
      usuarioId,
      rol: 'backoffice',
      timestamp: new Date(),
    });

    test('backoffice AGREGA evento atribuido a sí mismo', async () => {
      await assertSucceeds(
        setDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'nuevo_ok'),
          nuevoEvento(U.back),
        ),
      );
    });
    test('NO se puede agregar evento atribuido a OTRO usuario', async () => {
      await assertFails(
        setDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'nuevo_falso'),
          nuevoEvento(U.admin),
        ),
      );
    });
    test('usuario inactivo NO puede agregar evento', async () => {
      await assertFails(
        setDoc(
          doc(dbDe(U.inactivo), 'cotizaciones', COT.GENERADA, 'historial_estados', 'nuevo_inact'),
          nuevoEvento(U.inactivo),
        ),
      );
    });
    test('NO se puede agregar evento con rol distinto al real del que llama', async () => {
      await assertFails(
        setDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'nuevo_rol_falso'),
          { ...nuevoEvento(U.back), rol: 'admin' },
        ),
      );
    });
    test('NO se puede agregar evento sin estadoNuevo', async () => {
      const { estadoNuevo, ...sinEstado } = nuevoEvento(U.back);
      void estadoNuevo;
      await assertFails(
        setDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'nuevo_sin_estado'),
          sinEstado,
        ),
      );
    });
    test('NADIE puede EDITAR un evento existente (ni superadmin)', async () => {
      await assertFails(
        updateDoc(
          doc(dbDe(U.super), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1'),
          { nota: 'manipulado' },
        ),
      );
    });
    test('NADIE puede BORRAR un evento existente (ni superadmin)', async () => {
      await assertFails(
        deleteDoc(
          doc(dbDe(U.super), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1'),
        ),
      );
    });

    // Lectura del historial
    test('backoffice LEE el historial', async () => {
      await assertSucceeds(
        getDoc(doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('admin LEE el historial', async () => {
      await assertSucceeds(
        getDoc(doc(dbDe(U.admin), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('superadmin LEE el historial', async () => {
      await assertSucceeds(
        getDoc(doc(dbDe(U.super), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('prevendedor DUEÑO de la cotización lee su historial', async () => {
      await assertSucceeds(
        getDoc(doc(dbDe(U.prev1), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('prevendedor NO dueño NO lee el historial', async () => {
      await assertFails(
        getDoc(doc(dbDe(U.prev2), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('disenador LEE el historial', async () => {
      await assertSucceeds(
        getDoc(doc(dbDe(U.dis), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
    test('anónimo NO lee el historial', async () => {
      await assertFails(
        getDoc(doc(dbAnon(), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1')),
      );
    });
  });

  // ==========================================================
  // G) usuarios: escritura solo superadmin
  // ==========================================================
  describe('Colección usuarios', () => {
    test('cada quien lee su propio doc', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.prev1), 'usuarios', U.prev1)));
    });
    test('no-superadmin NO lee el doc de otro', async () => {
      await assertFails(getDoc(doc(dbDe(U.prev1), 'usuarios', U.back)));
    });
    test('superadmin lee cualquier doc de usuario', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.super), 'usuarios', U.back)));
    });
    test('superadmin CREA un usuario', async () => {
      await assertSucceeds(
        setDoc(doc(dbDe(U.super), 'usuarios', 'nuevo_user'), {
          nombre: 'Nuevo', rol: 'prevendedor', activo: true,
        }),
      );
    });
    test('superadmin EDITA un usuario', async () => {
      await assertSucceeds(
        updateDoc(doc(dbDe(U.super), 'usuarios', U.back), { activo: false }),
      );
    });
    test('superadmin BORRA un usuario', async () => {
      await assertSucceeds(deleteDoc(doc(dbDe(U.super), 'usuarios', U.back)));
    });
    test('admin NO puede crear usuarios', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.admin), 'usuarios', 'x1'), { rol: 'admin', activo: true }),
      );
    });
    test('backoffice NO puede crear usuarios', async () => {
      await assertFails(
        setDoc(doc(dbDe(U.back), 'usuarios', 'x2'), { rol: 'backoffice', activo: true }),
      );
    });
    test('prevendedor NO puede auto-editar su rol (escalada de privilegios)', async () => {
      await assertFails(
        updateDoc(doc(dbDe(U.prev1), 'usuarios', U.prev1), { rol: 'superadmin' }),
      );
    });
  });

  // ==========================================================
  // G.2) contadores del CONSECUTIVO (reserva atómica y sin alteraciones)
  //      match /contadores/{clave}: lo leen los activos; SOLO prevendedor/
  //      superadmin lo tocan; el valor SOLO sube de a 1 (nunca baja, nunca
  //      salta, nunca se fija arbitrariamente); create arranca en 1; sin delete.
  // ==========================================================
  describe('contadores del consecutivo (integridad)', () => {
    const CONT = (uid) => doc(dbDe(uid), 'contadores', 'STE2307'); // seed: valor 5

    // ---- Lectura ----
    test('usuario activo LEE el contador (la transacción lo necesita)', async () => {
      await assertSucceeds(getDoc(CONT(U.prev1)));
    });
    test('anónimo NO lee el contador', async () => {
      await assertFails(getDoc(doc(dbAnon(), 'contadores', 'STE2307')));
    });
    test('usuario inactivo NO lee el contador', async () => {
      await assertFails(getDoc(CONT(U.inactivo)));
    });

    // ---- Incremento válido (+1) ----
    test('✔ prevendedor incrementa el contador de a 1 (5 → 6)', async () => {
      await assertSucceeds(updateDoc(CONT(U.prev1), { valor: 6 }));
    });
    test('✔ superadmin incrementa el contador de a 1 (5 → 6)', async () => {
      await assertSucceeds(updateDoc(CONT(U.super), { valor: 6 }));
    });

    // ---- Incrementos/alteraciones inválidas ----
    test('✘ NO se puede saltar el valor (5 → 10)', async () => {
      await assertFails(updateDoc(CONT(U.prev1), { valor: 10 }));
    });
    test('✘ NO se puede DECREMENTAR (5 → 4)', async () => {
      await assertFails(updateDoc(CONT(U.prev1), { valor: 4 }));
    });
    test('✘ NO se puede dejar igual (5 → 5)', async () => {
      await assertFails(updateDoc(CONT(U.prev1), { valor: 5 }));
    });
    test('✘ NO se puede poner un valor no entero (5 → 6.5)', async () => {
      await assertFails(updateDoc(CONT(U.prev1), { valor: 6.5 }));
    });

    // ---- Roles no autorizados ----
    test('✘ backoffice NO incrementa el contador', async () => {
      await assertFails(updateDoc(CONT(U.back), { valor: 6 }));
    });
    test('✘ admin NO incrementa el contador', async () => {
      await assertFails(updateDoc(CONT(U.admin), { valor: 6 }));
    });
    test('✘ disenador NO incrementa el contador', async () => {
      await assertFails(updateDoc(CONT(U.dis), { valor: 6 }));
    });
    test('✘ usuario inactivo NO incrementa el contador', async () => {
      await assertFails(updateDoc(CONT(U.inactivo), { valor: 6 }));
    });

    // ---- Creación (primer consecutivo del día para un prefijo nuevo) ----
    test('✔ prevendedor crea un contador nuevo arrancando en 1', async () => {
      await assertSucceeds(setDoc(doc(dbDe(U.prev1), 'contadores', 'NUE0101'), { valor: 1 }));
    });
    test('✔ superadmin crea un contador nuevo arrancando en 1', async () => {
      await assertSucceeds(setDoc(doc(dbDe(U.super), 'contadores', 'NUE0102'), { valor: 1 }));
    });
    test('✘ NO se puede crear un contador arrancando en un valor != 1', async () => {
      await assertFails(setDoc(doc(dbDe(U.prev1), 'contadores', 'NUE0103'), { valor: 7 }));
    });
    test('✘ backoffice NO crea contadores', async () => {
      await assertFails(setDoc(doc(dbDe(U.back), 'contadores', 'NUE0104'), { valor: 1 }));
    });

    // ---- Borrado prohibido ----
    test('✘ NADIE borra un contador (ni superadmin)', async () => {
      await assertFails(deleteDoc(doc(dbDe(U.super), 'contadores', 'STE2307')));
    });

    // ---- Reserva atómica end-to-end (contador + cotización + historial) ----
    // Replica la transacción de services/cotizaciones.crearCotizacion contra el
    // emulador para demostrar que las reglas PERMITEN la reserva atómica y que
    // dos reservas seguidas dan números DISTINTOS (sin colisión).
    async function reservarYCrear(uid, prefijo, db = dbDe(uid)) {
      return runTransaction(db, async (tx) => {
        const cRef = doc(db, 'contadores', prefijo);
        const snap = await tx.get(cRef);
        const actual = snap.exists() ? Number(snap.data().valor) || 0 : 0;
        const siguiente = actual + 1;
        const consecutivo = `${prefijo}-${String(siguiente).padStart(2, '0')}`;
        const cotRef = doc(collection(db, 'cotizaciones'));
        if (snap.exists()) tx.update(cRef, { valor: siguiente });
        else tx.set(cRef, { valor: siguiente, prefijo });
        tx.set(cotRef, {
          ...cotBase('GENERADA'),
          consecutivo,
          prevendedorId: uid,
          ultimoEvento: eventoEspejo(uid, null, 'GENERADA', ''),
        });
        tx.set(doc(collection(cotRef, 'historial_estados')), {
          estadoAnterior: null,
          estadoNuevo: 'GENERADA',
          usuarioId: uid,
          rol: USUARIOS[uid].rol,
          timestamp: serverTimestamp(),
        });
        return consecutivo;
      });
    }

    test('✔ reserva atómica: dos creaciones seguidas dan consecutivos distintos', async () => {
      const a = await reservarYCrear(U.prev1, 'RES0101'); // crea el contador en 1
      const b = await reservarYCrear(U.prev1, 'RES0101'); // +1
      expect(a).toBe('RES0101-01');
      expect(b).toBe('RES0101-02');
      expect(a).not.toBe(b);
    });

    test('✔ reserva atómica CONCURRENTE (Promise.all) no colisiona', async () => {
      const [a, b] = await Promise.all([
        reservarYCrear(U.prev1, 'CNC0101'),
        reservarYCrear(U.prev1, 'CNC0101'),
      ]);
      // Firestore serializa/reintenta las transacciones en contención: números
      // distintos garantizados (01 y 02 en algún orden).
      expect(new Set([a, b]).size).toBe(2);
      expect([a, b].sort()).toEqual(['CNC0101-01', 'CNC0101-02']);
    });
  });

  // ==========================================================
  // H) Edición de contenido AUDITADA en un writeBatch (Mejoras 2 y 4)
  //    Mecanismo de actualizarContenidoCotizacion(): un mismo batch hace
  //    (a) update del doc SIN cambiar `estado` ni `ultimoEvento` → cae en
  //        edicionContenido() de las reglas (solo backoffice/superadmin), y
  //    (b) create de un evento en historial_estados con
  //        estadoAnterior == estadoNuevo == estado actual, usuarioId propio y
  //        rol real. Todo el batch es atómico: si una escritura se deniega,
  //        el commit completo se deniega.
  // ==========================================================
  describe('Edición de contenido auditada (writeBatch: doc + historial_estados)', () => {
    // Arma el writeBatch de edición para `uid`, sobre COT.GENERADA (estado
    // actual 'GENERADA'). Permite sobreescribir `cambios` y/o `evento`.
    function batchEdicion(uid, { cambios, evento } = {}) {
      const db = dbDe(uid);
      const batch = writeBatch(db);
      const ref = doc(db, 'cotizaciones', COT.GENERADA);
      batch.update(
        ref,
        cambios ?? { cliente: { nombre: 'Editado' }, updatedAt: serverTimestamp() },
      );
      const evtRef = doc(collection(ref, 'historial_estados'));
      batch.set(
        evtRef,
        evento ?? {
          estadoAnterior: 'GENERADA',
          estadoNuevo: 'GENERADA', // sin cambio de estado
          usuarioId: uid,
          rol: USUARIOS[uid].rol,
          nota: 'Editó el contenido de la cotización',
          timestamp: serverTimestamp(),
        },
      );
      return batch;
    }

    test('✔ backoffice edita contenido + evento (estadoAnterior==estadoNuevo) → PERMITIDO', async () => {
      await assertSucceeds(batchEdicion(U.back).commit());
    });

    test('✔ backoffice actualiza `pago` + evento (Mejora 4) → PERMITIDO', async () => {
      await assertSucceeds(
        batchEdicion(U.back, {
          cambios: {
            pago: {
              metodo: 'contado',
              comprobante: '00123456',
              muestraEnviada: true,
              cotizacionAprobada: false,
            },
            updatedAt: serverTimestamp(),
          },
        }).commit(),
      );
    });

    test('✔ superadmin edita contenido + evento → PERMITIDO', async () => {
      await assertSucceeds(batchEdicion(U.super).commit());
    });

    test('✘ prevendedor (dueño) intenta la misma edición → DENEGADO', async () => {
      await assertFails(batchEdicion(U.prev1).commit());
    });

    test('✘ usuario inactivo intenta la edición → DENEGADO', async () => {
      await assertFails(batchEdicion(U.inactivo).commit());
    });

    test('✘ admin intenta editar contenido → DENEGADO', async () => {
      await assertFails(batchEdicion(U.admin).commit());
    });

    test('✘ evento con rol FALSO (no el real del que llama) → DENEGADO', async () => {
      await assertFails(
        batchEdicion(U.back, {
          evento: {
            estadoAnterior: 'GENERADA',
            estadoNuevo: 'GENERADA',
            usuarioId: U.back,
            rol: 'admin', // falso
            nota: 'x',
            timestamp: serverTimestamp(),
          },
        }).commit(),
      );
    });

    test('✘ evento con usuarioId AJENO → DENEGADO', async () => {
      await assertFails(
        batchEdicion(U.back, {
          evento: {
            estadoAnterior: 'GENERADA',
            estadoNuevo: 'GENERADA',
            usuarioId: U.prev2, // ajeno
            rol: 'backoffice',
            nota: 'x',
            timestamp: serverTimestamp(),
          },
        }).commit(),
      );
    });

    test('✘ si la edición CAMBIA el estado (sin ultimoEvento) → DENEGADO', async () => {
      // Cambiar `estado` deja de ser edicionContenido(); exigiría
      // transicionValida()+eventoEspejoUpdate() (aquí ni válida ni con espejo).
      await assertFails(
        batchEdicion(U.back, {
          cambios: { estado: 'PENDIENTE_ADMIN', updatedAt: serverTimestamp() },
        }).commit(),
      );
    });

    test('✘ update de un evento existente de historial → DENEGADO', async () => {
      await assertFails(
        updateDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1'),
          { nota: 'manipulado' },
        ),
      );
    });

    test('✘ delete de un evento existente de historial → DENEGADO', async () => {
      await assertFails(
        deleteDoc(
          doc(dbDe(U.back), 'cotizaciones', COT.GENERADA, 'historial_estados', 'ev1'),
        ),
      );
    });
  });

  // ==========================================================
  // I) CATÁLOGO — lectura por usuario activo; escritura por rol
  //    (admin/backoffice/superadmin escriben; el módulo de UI es superadmin)
  // ==========================================================
  describe('Catálogo (lectura activa / escritura admin·backoffice·superadmin)', () => {
    const nuevo = () => ({
      producto: 'Bolsa', tamano: 'M', minimo: 5, precioSinIVA: 50, precioEnUsd: false, activo: true,
    });

    test('✔ usuario activo (prevendedor) LEE el catálogo', async () => {
      await assertSucceeds(getDoc(doc(dbDe(U.prev1), 'catalogo', 'prod1')));
    });
    test('✘ anónimo NO lee el catálogo', async () => {
      await assertFails(getDoc(doc(dbAnon(), 'catalogo', 'prod1')));
    });
    test('✘ usuario inactivo NO lee el catálogo', async () => {
      await assertFails(getDoc(doc(dbDe(U.inactivo), 'catalogo', 'prod1')));
    });

    // Autorizados a escribir: superadmin, admin, backoffice.
    for (const uid of [U.super, U.admin, U.back]) {
      test(`✔ ${USUARIOS[uid].rol} crea un producto`, async () => {
        await assertSucceeds(setDoc(doc(dbDe(uid), 'catalogo', `nuevo_${uid}`), nuevo()));
      });
      test(`✔ ${USUARIOS[uid].rol} actualiza el precio de un producto`, async () => {
        await assertSucceeds(updateDoc(doc(dbDe(uid), 'catalogo', 'prod1'), { precioSinIVA: 999 }));
      });
    }
    // NO autorizados: prevendedor, diseñador, inactivo, anónimo.
    for (const uid of [U.prev1, U.dis, U.inactivo]) {
      const etq = `${USUARIOS[uid].rol}${USUARIOS[uid].activo ? '' : ' (inactivo)'}`;
      test(`✘ ${etq} NO crea un producto`, async () => {
        await assertFails(setDoc(doc(dbDe(uid), 'catalogo', `x_${uid}`), nuevo()));
      });
      test(`✘ ${etq} NO actualiza un producto`, async () => {
        await assertFails(updateDoc(doc(dbDe(uid), 'catalogo', 'prod1'), { precioSinIVA: 1 }));
      });
    }
    test('✘ anónimo NO crea un producto', async () => {
      await assertFails(setDoc(doc(dbAnon(), 'catalogo', 'anon'), nuevo()));
    });
  });
});
