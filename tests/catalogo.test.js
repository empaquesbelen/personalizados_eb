// ============================================
// Tests unitarios del módulo de Catálogo (superadmin) — services/catalogo.js
// ------------------------------------------------------------
// Sin emulador: se mockea `firebase/firestore` y `../app/src/lib/firebase`. El
// mock captura las escrituras (addDoc/updateDoc) y sirve un dataset controlable
// en getDocs para verificar el FLUJO DE PRECIOS de punta a punta: editar precio
// → invalidar caché → cargarCatalogo() relee → el cotizador vería el nuevo
// precio. "Dinero = cuidado" (Regla Absoluta #10).
// ============================================
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Estado compartido con el mock (vi.hoisted: accesible dentro de la factory).
const state = vi.hoisted(() => ({
  dataset: [], // [{ id, ...campos }] que devuelve getDocs para `catalogo`
  condicionesDataset: [], // idem para `condiciones`
  getDocsCount: 0,
  addDocCalls: [], // { col, payload }
  updateDocCalls: [], // { ref, payload }
}));

vi.mock('../app/src/lib/firebase.js', () => ({ db: { __fake_db: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ __collection: name }),
  doc: (_db, name, id) => ({ __doc: name, id }),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async (col) => {
    state.getDocsCount += 1;
    const ds = col?.__collection === 'condiciones' ? state.condicionesDataset : state.dataset;
    return {
      docs: ds.map((d) => {
        const { id, ...rest } = d;
        return { id, data: () => rest };
      }),
    };
  }),
  addDoc: vi.fn(async (col, payload) => {
    state.addDocCalls.push({ col, payload });
    return { id: 'nuevo-id-123' };
  }),
  updateDoc: vi.fn(async (ref, payload) => {
    state.updateDocCalls.push({ ref, payload });
  }),
}));

import {
  normalizarProducto,
  validarProducto,
  valoresDistintos,
  existeValor,
  crearProducto,
  actualizarProducto,
  setProductoActivo,
  cargarCatalogo,
  cargarCatalogoAdmin,
  buscarItem,
  invalidarCache,
  listarCondiciones,
  getCondicionPorId,
  crearCondicion,
  resolverCondicionProducto,
} from '../app/src/services/catalogo.js';
import { recolectarCondiciones } from '../app/src/components/lineasCotizacion.js';
import { calcularLinea, IVA_TASA } from '../app/src/services/calculo.js';

beforeEach(() => {
  state.dataset = [];
  state.condicionesDataset = [];
  state.getDocsCount = 0;
  state.addDocCalls = [];
  state.updateDocCalls = [];
  invalidarCache(); // limpia la caché en memoria entre tests
});

// ---------------------------------------------------------------------------
describe('normalizarProducto — coerciones y trims', () => {
  it('recorta textos y castea booleanos/números a la forma canónica', () => {
    const p = normalizarProducto({
      cod: '  200 ',
      producto: '  Vasos  ',
      tamano: ' 10 oz ',
      impresion1: '  1 color ',
      impresion2: '   ',
      material: '  Cartón ',
      minimo: '25',
      precioSinIVA: '1500.50',
      precioEnUsd: 'sí', // truthy → true
      activo: true,
    });
    expect(p).toEqual({
      cod: '200',
      producto: 'Vasos',
      tamano: '10 oz',
      impresion1: '1 color',
      impresion2: '',
      material: 'Cartón',
      minimo: 25,
      precioSinIVA: 1500.5,
      precioEnUsd: true,
      condicionId: '', // sin condición en la entrada → ''
      activo: true,
    });
  });

  it('mínimo se redondea y nunca baja de 1 (0, negativo o NaN → 1)', () => {
    expect(normalizarProducto({ minimo: 0 }).minimo).toBe(1);
    expect(normalizarProducto({ minimo: -5 }).minimo).toBe(1);
    expect(normalizarProducto({ minimo: 'abc' }).minimo).toBe(1);
    expect(normalizarProducto({ minimo: 10.7 }).minimo).toBe(11);
    expect(normalizarProducto({ minimo: 2.2 }).minimo).toBe(2);
  });

  it('precioSinIVA nunca es negativo (negativo/NaN → 0)', () => {
    expect(normalizarProducto({ precioSinIVA: -100 }).precioSinIVA).toBe(0);
    expect(normalizarProducto({ precioSinIVA: 'x' }).precioSinIVA).toBe(0);
    expect(normalizarProducto({ precioSinIVA: '250.75' }).precioSinIVA).toBe(250.75);
  });

  it('precioEnUsd y activo son booleanos; activo por defecto true salvo === false', () => {
    expect(normalizarProducto({}).precioEnUsd).toBe(false);
    expect(normalizarProducto({ precioEnUsd: 1 }).precioEnUsd).toBe(true);
    expect(normalizarProducto({}).activo).toBe(true);
    expect(normalizarProducto({ activo: false }).activo).toBe(false);
    expect(normalizarProducto({ activo: undefined }).activo).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('validarProducto', () => {
  const base = { producto: 'Vasos', tamano: '10 oz', minimo: 10, precioSinIVA: 100 };

  it('acepta un producto válido (string vacío = sin error)', () => {
    expect(validarProducto(base)).toBe('');
  });

  it('exige producto', () => {
    expect(validarProducto({ ...base, producto: '   ' })).toMatch(/producto es obligatorio/i);
  });

  it('exige tamaño', () => {
    expect(validarProducto({ ...base, tamano: '' })).toMatch(/tamaño es obligatorio/i);
  });

  it('exige precio > 0 (0 y negativo fallan)', () => {
    expect(validarProducto({ ...base, precioSinIVA: 0 })).toMatch(/precio sin iva.*mayor que 0/i);
    expect(validarProducto({ ...base, precioSinIVA: -1 })).toMatch(/precio sin iva.*mayor que 0/i);
  });

  it('mínimo siempre queda >=1 tras normalizar (no bloquea con 0)', () => {
    // normalizarProducto fuerza minimo>=1, por eso un 0 NO produce error de mínimo,
    // sino que pasa la validación de mínimo. Documentamos el comportamiento real.
    expect(validarProducto({ ...base, minimo: 0 })).toBe('');
  });
});

// ---------------------------------------------------------------------------
describe('valoresDistintos', () => {
  const items = [
    { producto: 'Vasos', material: 'Cartón' },
    { producto: 'Bolsa', material: '' },
    { producto: 'Vasos', material: 'PET' },
    { producto: '  ', material: 'Cartón' },
    { producto: 'Servilleta', material: '  ' },
  ];

  it('devuelve únicos, no vacíos y ordenados (es, numeric)', () => {
    expect(valoresDistintos(items, 'producto')).toEqual(['Bolsa', 'Servilleta', 'Vasos']);
    expect(valoresDistintos(items, 'material')).toEqual(['Cartón', 'PET']);
  });

  it('tolera lista nula/undefined', () => {
    expect(valoresDistintos(null, 'producto')).toEqual([]);
    expect(valoresDistintos(undefined, 'x')).toEqual([]);
  });

  it('ordena con numeric (10 oz después de 2 oz)', () => {
    const tam = [{ tamano: '10 oz' }, { tamano: '2 oz' }, { tamano: '1 oz' }];
    expect(valoresDistintos(tam, 'tamano')).toEqual(['1 oz', '2 oz', '10 oz']);
  });
});

// ---------------------------------------------------------------------------
describe('existeValor — match normalizado (sin tildes/espacios/caso)', () => {
  const opciones = ['Cartón', 'PET', 'Cartón + PLA'];

  it('coincide ignorando tildes y mayúsculas', () => {
    expect(existeValor(opciones, 'carton')).toBe(true);
    expect(existeValor(opciones, 'CARTÓN')).toBe(true);
    expect(existeValor(opciones, 'pet')).toBe(true);
  });

  it('coincide ignorando espacios internos', () => {
    expect(existeValor(opciones, 'carton+pla')).toBe(true);
    expect(existeValor(opciones, ' Cartón  +  PLA ')).toBe(true);
  });

  it('no coincide si es un valor nuevo', () => {
    expect(existeValor(opciones, 'Foam')).toBe(false);
  });

  it('valor vacío nunca existe; tolera opciones nulas', () => {
    expect(existeValor(opciones, '   ')).toBe(false);
    expect(existeValor(null, 'carton')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('crearProducto — escribe payload normalizado e invalida caché', () => {
  it('llama addDoc con el payload normalizado y devuelve el id', async () => {
    const id = await crearProducto({
      producto: '  Vasos ',
      tamano: ' 10 oz ',
      minimo: '10',
      precioSinIVA: '1200',
      precioEnUsd: false,
    });
    expect(id).toBe('nuevo-id-123');
    expect(state.addDocCalls).toHaveLength(1);
    const { col, payload } = state.addDocCalls[0];
    expect(col).toEqual({ __collection: 'catalogo' });
    expect(payload).toEqual({
      cod: '',
      producto: 'Vasos',
      tamano: '10 oz',
      impresion1: '',
      impresion2: '',
      material: '',
      minimo: 10,
      precioSinIVA: 1200,
      precioEnUsd: false,
      condicionId: '',
      activo: true,
    });
  });

  it('invalida la caché: una carga previa se re-lee tras crear', async () => {
    state.dataset = [{ id: 'a', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 }];
    await cargarCatalogo();
    await cargarCatalogo(); // segunda vez: cacheada, no relee
    expect(state.getDocsCount).toBe(1);

    await crearProducto({ producto: 'Bolsa', tamano: 'M', precioSinIVA: 50 });
    await cargarCatalogo(); // tras invalidar: relee
    expect(state.getDocsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('actualizarProducto — updateDoc normalizado + invalidación', () => {
  it('llama updateDoc con la ref correcta y el payload normalizado', async () => {
    await actualizarProducto('doc-1', {
      producto: 'Vasos',
      tamano: '10 oz',
      precioSinIVA: '999.99',
      precioEnUsd: true,
      minimo: 5,
    });
    expect(state.updateDocCalls).toHaveLength(1);
    const { ref, payload } = state.updateDocCalls[0];
    expect(ref).toEqual({ __doc: 'catalogo', id: 'doc-1' });
    expect(payload.precioSinIVA).toBe(999.99);
    expect(payload.precioEnUsd).toBe(true);
    expect(payload.minimo).toBe(5);
    expect(payload.activo).toBe(true);
  });

  it('invalida la caché tras actualizar', async () => {
    state.dataset = [{ id: 'a', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 }];
    await cargarCatalogo();
    expect(state.getDocsCount).toBe(1);
    await actualizarProducto('a', { producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 });
    await cargarCatalogo();
    expect(state.getDocsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('setProductoActivo — soft-delete/reactivar', () => {
  it('escribe solo { activo: boolean } e invalida caché', async () => {
    state.dataset = [{ id: 'a', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 }];
    await cargarCatalogo();
    expect(state.getDocsCount).toBe(1);

    await setProductoActivo('a', false);
    expect(state.updateDocCalls[0].ref).toEqual({ __doc: 'catalogo', id: 'a' });
    expect(state.updateDocCalls[0].payload).toEqual({ activo: false });

    await setProductoActivo('a', 1); // coerción a booleano
    expect(state.updateDocCalls[1].payload).toEqual({ activo: true });

    await cargarCatalogo(); // relee tras invalidar
    expect(state.getDocsCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('cargarCatalogo — cachea y filtra (activo!==false, con producto+tamaño)', () => {
  it('cachea: dos llamadas seguidas leen Firestore una sola vez', async () => {
    state.dataset = [{ id: 'a', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 }];
    await cargarCatalogo();
    await cargarCatalogo();
    expect(state.getDocsCount).toBe(1);
  });

  it('excluye inactivos y filas sin producto/tamaño', async () => {
    state.dataset = [
      { id: 'ok', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 },
      { id: 'inactivo', producto: 'Bolsa', tamano: 'M', precioSinIVA: 50, activo: false },
      { id: 'sinProd', producto: '', tamano: 'M', precioSinIVA: 50 },
      { id: 'sinTam', producto: 'Servilleta', tamano: '', precioSinIVA: 50 },
    ];
    const items = await cargarCatalogo();
    expect(items.map((i) => i.id)).toEqual(['ok']);
  });

  it('cargarCatalogoAdmin trae TODO (inactivos e incompletos incluidos)', async () => {
    state.dataset = [
      { id: 'ok', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100 },
      { id: 'inactivo', producto: 'Bolsa', tamano: 'M', precioSinIVA: 50, activo: false },
      { id: 'sinProd', producto: '', tamano: '', precioSinIVA: 50 },
    ];
    const items = await cargarCatalogoAdmin();
    expect(items.map((i) => i.id).sort()).toEqual(['inactivo', 'ok', 'sinProd']);
  });
});

// ---------------------------------------------------------------------------
// EL TEST CRÍTICO DE DINERO: cambio de precio reflejado tras invalidar caché.
// ---------------------------------------------------------------------------
describe('flujo de PRECIO de punta a punta (Regla Absoluta #10)', () => {
  it('editar precioSinIVA → invalida caché → cargarCatalogo relee el NUEVO precio', async () => {
    // 1) Catálogo inicial: Vasos a ₡100.
    state.dataset = [{ id: 'vaso1', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100, precioEnUsd: false }];
    let items = await cargarCatalogo();
    expect(items[0].precioSinIVA).toBe(100);

    // 2) El superadmin edita el precio a ₡250. actualizarProducto escribe y,
    //    en un backend real, el doc queda en 250. Simulamos ese efecto en el
    //    dataset que sirve getDocs. La CLAVE es que actualizarProducto invalida
    //    la caché para que la siguiente lectura vea el cambio.
    await actualizarProducto('vaso1', {
      producto: 'Vasos',
      tamano: '10 oz',
      precioSinIVA: 250,
      precioEnUsd: false,
    });
    // reflejamos la escritura en el "backend" mock (payload normalizado):
    state.dataset = [{ id: 'vaso1', ...state.updateDocCalls[0].payload }];

    // 3) El cotizador vuelve a leer: DEBE ver ₡250 (no el ₡100 cacheado).
    items = await cargarCatalogo();
    expect(items[0].precioSinIVA).toBe(250);
    expect(state.getDocsCount).toBe(2); // hubo relectura real
  });

  it('cambiar precioEnUsd (colones→USD) se refleja tras invalidar', async () => {
    state.dataset = [{ id: 'p', producto: 'Vasos', tamano: '10 oz', precioSinIVA: 100, precioEnUsd: false }];
    let items = await cargarCatalogo();
    expect(items[0].precioEnUsd).toBe(false);

    await actualizarProducto('p', { producto: 'Vasos', tamano: '10 oz', precioSinIVA: 2, precioEnUsd: true });
    state.dataset = [{ id: 'p', ...state.updateDocCalls[0].payload }];

    items = await cargarCatalogo();
    expect(items[0].precioEnUsd).toBe(true);
    expect(items[0].precioSinIVA).toBe(2);
  });

  it('el NUEVO precio llega hasta el cálculo del cotizador (buscarItem + calcularLinea)', async () => {
    // Catálogo: Vasos ₡100 por mínimo 10. calcularLinea con 10u = 100 + IVA.
    state.dataset = [
      { id: 'v', producto: 'Vasos', tamano: '10 oz', impresion1: '', impresion2: '', material: '',
        minimo: 10, precioSinIVA: 100, precioEnUsd: false },
    ];
    let item = await buscarItem('Vasos', '10 oz', '', '', '');
    let calc = calcularLinea(item, 10, 512);
    expect(calc.valido).toBe(true);
    expect(calc.precioBaseSinIVA).toBe(100);
    expect(calc.totalProductoConIVA).toBeCloseTo(100 * (1 + IVA_TASA), 6);

    // El superadmin sube el precio a ₡300.
    await actualizarProducto('v', {
      producto: 'Vasos', tamano: '10 oz', minimo: 10, precioSinIVA: 300, precioEnUsd: false,
    });
    state.dataset = [{ id: 'v', ...state.updateDocCalls[0].payload }];

    // El cotizador vuelve a buscar y recalcular: DEBE usar ₡300, no el ₡100 viejo.
    item = await buscarItem('Vasos', '10 oz', '', '', '');
    calc = calcularLinea(item, 10, 512);
    expect(calc.precioBaseSinIVA).toBe(300);
    expect(calc.totalProductoConIVA).toBeCloseTo(300 * (1 + IVA_TASA), 6);
  });

  it('producto en USD: calcularLinea multiplica por el tipo de cambio tras el cambio', async () => {
    state.dataset = [
      { id: 'u', producto: 'Vasos', tamano: '10 oz', impresion1: '', impresion2: '', material: '',
        minimo: 1, precioSinIVA: 2, precioEnUsd: true },
    ];
    await actualizarProducto('u', {
      producto: 'Vasos', tamano: '10 oz', minimo: 1, precioSinIVA: 3, precioEnUsd: true,
    });
    state.dataset = [{ id: 'u', ...state.updateDocCalls[0].payload }];

    const item = await buscarItem('Vasos', '10 oz', '', '', '');
    const calc = calcularLinea(item, 1, 500); // $3 * 500 = ₡1500 sin IVA
    expect(calc.precioBaseSinIVA).toBe(1500);
  });
});

// ===========================================================================
// CONDICIONES — asignación por producto + resolución para PDF/preview
// ===========================================================================
describe('normalizarProducto — condicionId', () => {
  it('conserva el condicionId asignado (trim) y por defecto es ""', () => {
    expect(normalizarProducto({ producto: 'X', tamano: 'Y', condicionId: '  abc123 ' }).condicionId).toBe('abc123');
    expect(normalizarProducto({ producto: 'X', tamano: 'Y' }).condicionId).toBe('');
  });
});

describe('condiciones · listar / getPorId / crear', () => {
  it('listarCondiciones devuelve todas, ordenadas por artículo', async () => {
    state.condicionesDataset = [
      { id: 'c2', articulo: 'Vasos', texto: 'TV' },
      { id: 'c1', articulo: 'Bolsa', texto: 'TB' },
    ];
    const cs = await listarCondiciones();
    expect(cs.map((c) => c.articulo)).toEqual(['Bolsa', 'Vasos']);
  });

  it('getCondicionPorId resuelve por id o null', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Bolsa', texto: 'TB' }];
    expect((await getCondicionPorId('c1')).texto).toBe('TB');
    expect(await getCondicionPorId('noexiste')).toBe(null);
    expect(await getCondicionPorId('')).toBe(null);
  });

  it('crearCondicion escribe {articulo,texto} en `condiciones` y devuelve id', async () => {
    const id = await crearCondicion({ articulo: '  Vasos Cartón ', texto: '  Términos… ' });
    expect(id).toBe('nuevo-id-123');
    const call = state.addDocCalls.find((c) => c.col?.__collection === 'condiciones');
    expect(call).toBeTruthy();
    expect(call.payload).toEqual({ articulo: 'Vasos Cartón', texto: 'Términos…' });
  });

  it('crearCondicion exige artículo y texto', async () => {
    await expect(crearCondicion({ articulo: '', texto: 'x' })).rejects.toThrow(/artículo/i);
    await expect(crearCondicion({ articulo: 'X', texto: '   ' })).rejects.toThrow(/texto/i);
  });
});

describe('resolverCondicionProducto — precedencia snapshot > condicionId > "" > heurística', () => {
  it('(1) snapshot con texto → usa el snapshot', async () => {
    const r = await resolverCondicionProducto({ condicion: { articulo: 'A', texto: 'TA' } });
    expect(r).toEqual({ articulo: 'A', texto: 'TA' });
  });
  it('(1b) snapshot null (explícitamente ninguna) → null', async () => {
    expect(await resolverCondicionProducto({ condicion: null })).toBe(null);
  });
  it('(1c) snapshot con texto vacío → null', async () => {
    expect(await resolverCondicionProducto({ condicion: { articulo: 'A', texto: '' } })).toBe(null);
  });
  it('(2) condicionId → resuelve de la colección', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Vasos Cartón', texto: 'TVC' }];
    expect(await resolverCondicionProducto({ condicionId: 'c1' })).toEqual({ articulo: 'Vasos Cartón', texto: 'TVC' });
  });
  it('(2b) condicionId inexistente → null', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Vasos', texto: 'T' }];
    expect(await resolverCondicionProducto({ condicionId: 'zzz' })).toBe(null);
  });
  it('(3) condicionId "" (ninguna) → null (sin heurística)', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Bolsa', texto: 'T' }];
    expect(await resolverCondicionProducto({ condicionId: '', producto: 'Bolsa' })).toBe(null);
  });
  it('(4) legacy sin campos → heurística por nombre', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Bolsa', texto: 'Cond bolsa' }];
    expect(await resolverCondicionProducto({ producto: 'Bolsa', material: '' })).toEqual({
      articulo: 'Bolsa',
      texto: 'Cond bolsa',
    });
  });
});

describe('recolectarCondiciones — únicas por artículo+texto', () => {
  it('dedup de snapshots e ignora las nulas/vacías', async () => {
    const r = await recolectarCondiciones([
      { condicion: { articulo: 'A', texto: 'TA' } },
      { condicion: { articulo: 'A', texto: 'TA' } }, // duplicada
      { condicion: { articulo: 'B', texto: 'TB' } },
      { condicion: null }, // ninguna
    ]);
    expect(r).toEqual([
      { articulo: 'A', texto: 'TA' },
      { articulo: 'B', texto: 'TB' },
    ]);
  });

  it('resuelve por condicionId cuando no hay snapshot', async () => {
    state.condicionesDataset = [{ id: 'c1', articulo: 'Vasos', texto: 'TV' }];
    const r = await recolectarCondiciones([{ condicionId: 'c1' }, { condicionId: '' }]);
    expect(r).toEqual([{ articulo: 'Vasos', texto: 'TV' }]);
  });
});
