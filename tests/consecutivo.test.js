// ============================================================
// Tests unitarios del CONSECUTIVO atómico (sin emulador)
// ------------------------------------------------------------
// Cubre:
//  - helpers puros: codigoVendedor / prefijoConsecutivo / formatearConsecutivo.
//  - crearCotizacion(): reserva el número dentro de UNA transacción atómica
//    (contador + doc + evento de historial en el mismo commit) y devuelve el
//    consecutivo proveniente del CONTADOR (no del tiempo).
//  - que dos "creaciones" consecutivas NO producen el mismo número.
//
// NO requiere emulador: se mockea `firebase/firestore` (incluida runTransaction)
// y `../lib/firebase`, como en tests/mejoras-backoffice.test.js.
// ============================================================

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Estado del contador simulado (compartido con el mock, hoisted).
// `valor` = último número reservado; null = el contador aún no existe.
const cap = vi.hoisted(() => ({ sets: [], commits: 0, contadorValor: null }));

vi.mock('../app/src/lib/firebase.js', () => ({ db: {}, auth: {}, default: {} }));

vi.mock('firebase/firestore', () => ({
  collection: (...args) => ({ __k: 'col', args }),
  doc: (...args) => ({ __k: 'doc', id: 'nuevo-id-generado', args }),
  serverTimestamp: () => '__serverTimestamp__',
  // Transacción atómica simulada: get del contador, luego writes. Al terminar
  // aplica el nuevo valor del contador (como el commit real), de modo que dos
  // creaciones seguidas incrementen la secuencia (01 → 02).
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
  // No usados por crearCotizacion, pero cotizaciones.js los importa arriba.
  writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  query: (...a) => ({ __k: 'query', a }),
  where: (...a) => ({ __k: 'where', a }),
  orderBy: (...a) => ({ __k: 'orderBy', a }),
}));

import {
  codigoVendedor,
  prefijoConsecutivo,
  formatearConsecutivo,
} from '../app/src/services/consecutivo.js';
import { crearCotizacion } from '../app/src/services/cotizaciones.js';
import { ESTADOS } from '../app/src/constants/dominio.js';

// ============================================================
// Helpers puros
// ============================================================
describe('codigoVendedor()', () => {
  test('toma las primeras 3 letras en mayúscula, sin tildes ni símbolos', () => {
    expect(codigoVendedor('Steven')).toBe('STE');
    expect(codigoVendedor('José Álvarez')).toBe('JOS');
    expect(codigoVendedor('Ña Ürsula')).toBe('NAU');
  });
  test('rellena con X cuando el nombre es corto o vacío', () => {
    expect(codigoVendedor('Al')).toBe('ALX');
    expect(codigoVendedor('')).toBe('XXX');
    expect(codigoVendedor(null)).toBe('XXX');
    expect(codigoVendedor('  ')).toBe('XXX');
  });
});

describe('prefijoConsecutivo()', () => {
  test('combina las 3 letras del vendedor con ddMM', () => {
    expect(prefijoConsecutivo('Steven', new Date(2026, 6, 23))).toBe('STE2307'); // 23/07
    expect(prefijoConsecutivo('Ana', new Date(2026, 0, 5))).toBe('ANA0501'); // 05/01
  });
  test('mismo vendedor y día → mismo prefijo (misma clave de contador)', () => {
    const f = new Date(2026, 11, 31, 8, 0);
    const g = new Date(2026, 11, 31, 23, 59);
    expect(prefijoConsecutivo('Marta', f)).toBe(prefijoConsecutivo('Marta', g));
  });
});

describe('formatearConsecutivo()', () => {
  test('une prefijo y secuencia con guion, mínimo 2 dígitos', () => {
    expect(formatearConsecutivo('STE2307', 1)).toBe('STE2307-01');
    expect(formatearConsecutivo('STE2307', 9)).toBe('STE2307-09');
    expect(formatearConsecutivo('STE2307', 42)).toBe('STE2307-42');
  });
  test('crece a 3+ dígitos si supera 99 (no trunca)', () => {
    expect(formatearConsecutivo('STE2307', 100)).toBe('STE2307-100');
  });
  test('secuencia inválida cae a 01 (defensivo)', () => {
    expect(formatearConsecutivo('STE2307', 0)).toBe('STE2307-01');
    expect(formatearConsecutivo('STE2307', undefined)).toBe('STE2307-01');
  });
});

// ============================================================
// crearCotizacion(): reserva atómica del consecutivo
// ============================================================
describe('crearCotizacion() · reserva atómica del consecutivo', () => {
  beforeEach(() => {
    cap.sets.length = 0;
    cap.commits = 0;
    cap.contadorValor = null;
  });

  const prev = { id: 'u1', nombre: 'Steven', rol: 'prevendedor' };
  const base = {
    cliente: { nombre: 'Cli' },
    productos: [],
    totales: {},
    tipoCambio: 500,
    fecha: new Date(2026, 6, 23), // 23/07 → prefijo STE2307
  };

  test('primer consecutivo del día para el prefijo → arranca en 01 (crea el contador)', async () => {
    const { id, consecutivo } = await crearCotizacion({ prevendedor: prev, ...base });
    expect(id).toBe('nuevo-id-generado');
    expect(consecutivo).toBe('STE2307-01');

    // 1 sola transacción: contador (valor 1) + doc + evento historial.
    expect(cap.commits).toBe(1);
    expect(cap.sets).toHaveLength(3);

    const contador = cap.sets.find((s) => typeof s.data?.valor === 'number');
    expect(contador.data.valor).toBe(1);
    expect(contador.__update).toBeUndefined(); // no existía → set, no update

    const docData = cap.sets.find((s) => s.data?.estado)?.data;
    expect(docData.consecutivo).toBe('STE2307-01');
    expect(docData.estado).toBe(ESTADOS.GENERADA);
  });

  test('si el contador ya vale N, reserva N+1 y lo INCREMENTA (update)', async () => {
    cap.contadorValor = 7;
    const { consecutivo } = await crearCotizacion({ prevendedor: prev, ...base });
    expect(consecutivo).toBe('STE2307-08');
    const contador = cap.sets.find((s) => typeof s.data?.valor === 'number');
    expect(contador.data.valor).toBe(8);
    expect(contador.__update).toBe(true); // ya existía → update (+1)
  });

  test('dos creaciones consecutivas NO producen el mismo número', async () => {
    const primera = await crearCotizacion({ prevendedor: prev, ...base });
    const segunda = await crearCotizacion({ prevendedor: prev, ...base });
    expect(primera.consecutivo).toBe('STE2307-01');
    expect(segunda.consecutivo).toBe('STE2307-02');
    expect(primera.consecutivo).not.toBe(segunda.consecutivo);
  });

  test('el consecutivo NO depende de la hora (misma hora ⇒ igual da números distintos)', async () => {
    const fecha = new Date(2026, 6, 23, 10, 30, 15); // hora fija
    const a = await crearCotizacion({ prevendedor: prev, cliente: {}, productos: [], totales: {}, tipoCambio: 500, fecha });
    const b = await crearCotizacion({ prevendedor: prev, cliente: {}, productos: [], totales: {}, tipoCambio: 500, fecha });
    expect(a.consecutivo).toBe('STE2307-01');
    expect(b.consecutivo).toBe('STE2307-02'); // distinto pese a misma hora exacta
  });

  test('el evento espejo del create sigue siendo coherente (Regla #2)', async () => {
    await crearCotizacion({ prevendedor: prev, ...base });
    const docData = cap.sets.find((s) => s.data?.estado)?.data;
    expect(docData.ultimoEvento.estadoAnterior).toBe(null);
    expect(docData.ultimoEvento.estadoNuevo).toBe(ESTADOS.GENERADA);
    expect(docData.ultimoEvento.usuarioId).toBe('u1');
    expect(docData.ultimoEvento.rol).toBe('prevendedor');
  });
});
