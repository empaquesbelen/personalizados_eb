// ============================================
// Tests unitarios de DINERO/CANTIDAD — services/calculo.js (Regla Absoluta #10)
// ------------------------------------------------------------
// Cubre lo que faltaba de cobertura en el flujo del ASESOR:
//   - ajustarCantidad (múltiplo del mínimo, redondeo hacia arriba, topes)
//   - validarCantidad (mínimo, no numérico, <=0)
//   - convertirUSD (tipo de cambio inválido/0 → 0; redondeo a 2 decimales)
//   - calcularLinea en productos EN USD (conversión) y borde tc<=0 → inválido
//   - calcularTotales.totalUSD con tipoCambio inválido
// Funciones PURAS: no tocan Firestore, no requieren emulador.
// ============================================
import { describe, it, expect } from 'vitest';
import {
  ajustarCantidad,
  validarCantidad,
  convertirUSD,
  calcularLinea,
  calcularTotales,
  construirProductoCotizacion,
  MAX_CANTIDAD,
  IVA_TASA,
} from '../app/src/services/calculo.js';

// ---------------------------------------------------------------------------
describe('ajustarCantidad — múltiplo del mínimo, redondeo HACIA ARRIBA', () => {
  it('nunca baja del mínimo (0, NaN, por debajo del mínimo → mínimo)', () => {
    expect(ajustarCantidad(0, 10)).toBe(10);
    expect(ajustarCantidad('abc', 10)).toBe(10);
    expect(ajustarCantidad(5, 10)).toBe(10); // por debajo del mínimo
  });

  // COMPORTAMIENTO REAL DOCUMENTADO (quirk menor): la función aplica Math.abs()
  // al input, así que un negativo se convierte en su valor ABSOLUTO en vez de
  // caer al mínimo. No es un error de dinero (el resultado sigue siendo múltiplo
  // válido >= mínimo) y por la UI no llegan negativos, pero se deja constancia.
  it('valor negativo → se toma su valor absoluto (no se clampa al mínimo)', () => {
    expect(ajustarCantidad(-50, 10)).toBe(50);
    expect(ajustarCantidad(-11, 10)).toBe(20); // abs=11 → ceil(11/10)*10 = 20
  });

  it('redondea hacia arriba al múltiplo del mínimo (mínimo también es el paso)', () => {
    expect(ajustarCantidad(11, 10)).toBe(20);
    expect(ajustarCantidad(20, 10)).toBe(20);
    expect(ajustarCantidad(21, 10)).toBe(30);
    expect(ajustarCantidad(101, 25)).toBe(125); // ceil(101/25)=5 → 125
  });

  it('mínimo 1 acepta cualquier entero >= 1', () => {
    expect(ajustarCantidad(7, 1)).toBe(7);
    expect(ajustarCantidad(1, 1)).toBe(1);
  });

  it('mínimo inválido se normaliza a >=1 (redondeado)', () => {
    expect(ajustarCantidad(3, 0)).toBe(3);
    expect(ajustarCantidad(3, -5)).toBe(3);
    expect(ajustarCantidad(3, 2.4)).toBe(4); // min≈2 → ceil(3/2)*2 = 4
  });

  it('respeta el tope MAX_CANTIDAD (mayor múltiplo que no lo excede)', () => {
    const enorme = MAX_CANTIDAD * 100;
    const r = ajustarCantidad(enorme, 10);
    expect(r).toBeLessThanOrEqual(MAX_CANTIDAD);
    expect(r % 10).toBe(0);
  });

  it('trunca fracciones antes de escalar (10.9 con mínimo 10 → 10)', () => {
    expect(ajustarCantidad(10.9, 10)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
describe('validarCantidad', () => {
  it('rechaza no numéricos y <= 0', () => {
    expect(validarCantidad('x', 10).valido).toBe(false);
    expect(validarCantidad(0, 10).valido).toBe(false);
    expect(validarCantidad(-3, 10).valido).toBe(false);
  });

  it('rechaza por debajo del mínimo con mensaje del mínimo', () => {
    const r = validarCantidad(5, 10);
    expect(r.valido).toBe(false);
    expect(r.error).toMatch(/mínima.*10/i);
  });

  it('acepta >= mínimo y devuelve el valor floored', () => {
    expect(validarCantidad(10, 10)).toEqual({ valido: true, valor: 10 });
    expect(validarCantidad(15.8, 10)).toEqual({ valido: true, valor: 15 });
  });

  it('mínimo por defecto 1', () => {
    expect(validarCantidad(1).valido).toBe(true);
    expect(validarCantidad(0).valido).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('convertirUSD — tipo de cambio', () => {
  it('tipo de cambio inválido o 0 → 0 (nunca divide por 0)', () => {
    expect(convertirUSD(1000, 0)).toBe(0);
    expect(convertirUSD(1000, -5)).toBe(0);
    expect(convertirUSD(1000, NaN)).toBe(0);
    expect(convertirUSD(1000, undefined)).toBe(0);
  });

  it('convierte y redondea a 2 decimales', () => {
    expect(convertirUSD(1000, 500)).toBe(2);
    expect(convertirUSD(1130, 512)).toBeCloseTo(2.21, 2); // 2.207 → 2.21
    expect(convertirUSD(1, 3)).toBe(0.33); // 0.3333 → 0.33
  });
});

// ---------------------------------------------------------------------------
describe('calcularLinea — producto EN USD y bordes de tipo de cambio', () => {
  const usd = { minimo: 1, precioSinIVA: 2, precioEnUsd: true, iva: 0.13 };

  it('multiplica el precio USD por el tipo de cambio para colonizar', () => {
    const c = calcularLinea(usd, 1, 500); // $2 * 500 = ₡1000 sin IVA
    expect(c.valido).toBe(true);
    expect(c.precioBaseSinIVA).toBe(1000);
    expect(c.ivaBase).toBeCloseTo(130, 6);
    expect(c.totalBaseConIVA).toBeCloseTo(1130, 6);
  });

  it('producto en USD con tipo de cambio <= 0 → INVÁLIDO (no cotiza a ciegas)', () => {
    expect(calcularLinea(usd, 1, 0).valido).toBe(false);
    expect(calcularLinea(usd, 1, 0).error).toMatch(/tipo de cambio inválido/i);
    expect(calcularLinea(usd, 1, -3).valido).toBe(false);
  });

  it('producto en COLONES con tc=0 sigue siendo válido (no necesita conversión)', () => {
    const col = { minimo: 1, precioSinIVA: 1000, precioEnUsd: false, iva: 0.13 };
    const c = calcularLinea(col, 1, 0);
    expect(c.valido).toBe(true);
    expect(c.precioBaseSinIVA).toBe(1000);
  });

  it('item nulo → inválido', () => {
    expect(calcularLinea(null, 1, 500).valido).toBe(false);
  });

  it('cantidad por debajo del mínimo → inválido (arrastra el mínimo)', () => {
    const c = calcularLinea({ minimo: 10, precioSinIVA: 100, precioEnUsd: false }, 5, 500);
    expect(c.valido).toBe(false);
    expect(c.minimo).toBe(10);
  });

  it('escala linealmente sin IVA y con IVA (mínimo 10, pide 30)', () => {
    const item = { minimo: 10, precioSinIVA: 1000, precioEnUsd: false, iva: 0.13 };
    const c = calcularLinea(item, 30, 500);
    expect(c.totalProducto).toBeCloseTo(3000, 6); // 1000/10 * 30
    expect(c.totalProductoConIVA).toBeCloseTo(3390, 6);
    expect(c.ivaLinea).toBeCloseTo(390, 6);
    // Coherencia: total con IVA == subtotal + IVA de la línea.
    expect(c.totalProductoConIVA).toBeCloseTo(c.totalProducto + c.ivaLinea, 6);
  });
});

// ---------------------------------------------------------------------------
describe('calcularTotales — totalUSD y coherencia subtotal+iva=total', () => {
  it('totalUSD usa el tipo de cambio; 0 → 0', () => {
    const item = { minimo: 1, precioSinIVA: 1000, precioEnUsd: false, iva: 0.13 };
    const p = construirProductoCotizacion(item, calcularLinea(item, 1, 500));
    const t = calcularTotales([p], 500); // total 1130 / 500 = 2.26
    expect(t.total).toBeCloseTo(1130, 6);
    expect(t.totalUSD).toBe(2.26);
    expect(calcularTotales([p], 0).totalUSD).toBe(0);
  });

  it('subtotal + iva == total (suma de líneas)', () => {
    const a = { minimo: 1, precioSinIVA: 1000, precioEnUsd: false, iva: 0.13 };
    const b = { minimo: 1, precioSinIVA: 500, precioEnUsd: false, iva: 0.04 };
    const pa = construirProductoCotizacion(a, calcularLinea(a, 2, 500));
    const pb = construirProductoCotizacion(b, calcularLinea(b, 3, 500));
    const t = calcularTotales([pa, pb], 500);
    expect(t.subtotal + t.iva).toBeCloseTo(t.total, 6);
  });

  it('lista vacía → todo 0', () => {
    expect(calcularTotales([], 500)).toEqual({ subtotal: 0, iva: 0, total: 0, totalUSD: 0 });
    expect(calcularTotales(null, 500).total).toBe(0);
  });

  it('producto legacy sin iva → 13% general en la línea', () => {
    const item = { minimo: 1, precioSinIVA: 1000, precioEnUsd: false }; // sin iva
    const c = calcularLinea(item, 1, 500);
    expect(c.ivaTasa).toBe(IVA_TASA);
  });
});
