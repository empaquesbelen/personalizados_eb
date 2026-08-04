// ============================================================
// Tests unitarios de la máquina de estados (dominio.js)
// ------------------------------------------------------------
// NO requieren emulador. Validan `transicionesPermitidas` y
// `puedeTransicionar` contra la matriz de docs/ARQUITECTURA.md.
// Cubren caminos válidos e INVÁLIDOS (exhaustivo), ciclos de
// retorno (admin devuelve, backoffice rechaza) y el descarte
// (GENERADA -> ANULADA).
// ============================================================

import { describe, test, expect } from 'vitest';
import {
  ROLES,
  ESTADOS,
  TRANSICIONES,
  transicionesPermitidas,
  puedeTransicionar,
  requiereNota,
} from '../app/src/constants/dominio.js';

// --- Matriz esperada segun ARQUITECTURA.md (fuente de verdad del test).
//     Se declara aqui de forma INDEPENDIENTE de TRANSICIONES para poder
//     detectar divergencias entre dominio.js y la matriz documentada.
//     { estadoOrigen: { estadoDestino: [rolesAutorizados] } }
const MATRIZ_ESPERADA = {
  [ESTADOS.GENERADA]: {
    [ESTADOS.EN_REVISION_BACKOFFICE]: [ROLES.BACKOFFICE, ROLES.SUPERADMIN],
    [ESTADOS.ANULADA]: [ROLES.BACKOFFICE, ROLES.SUPERADMIN],
  },
  [ESTADOS.EN_REVISION_BACKOFFICE]: {
    [ESTADOS.PENDIENTE_ADMIN]: [ROLES.BACKOFFICE, ROLES.SUPERADMIN],
  },
  [ESTADOS.PENDIENTE_ADMIN]: {
    [ESTADOS.PENDIENTE_DISENO]: [ROLES.ADMIN, ROLES.SUPERADMIN],
    [ESTADOS.EN_REVISION_BACKOFFICE]: [ROLES.ADMIN, ROLES.SUPERADMIN],
  },
  [ESTADOS.PENDIENTE_DISENO]: {
    [ESTADOS.EN_DISENO]: [ROLES.DISENADOR, ROLES.SUPERADMIN],
  },
  [ESTADOS.EN_DISENO]: {
    [ESTADOS.REVISION_FINAL_BACKOFFICE]: [ROLES.DISENADOR, ROLES.SUPERADMIN],
  },
  [ESTADOS.REVISION_FINAL_BACKOFFICE]: {
    [ESTADOS.COMPLETADA]: [ROLES.BACKOFFICE, ROLES.SUPERADMIN],
    [ESTADOS.EN_DISENO]: [ROLES.BACKOFFICE, ROLES.SUPERADMIN],
  },
  [ESTADOS.COMPLETADA]: {},
  [ESTADOS.ANULADA]: {},
};

const TODOS_ROLES = Object.values(ROLES); // 5 roles
const TODOS_ESTADOS = Object.values(ESTADOS); // 8 estados

// -------------------------------------------------------------------
describe('Sanidad de constantes de dominio', () => {
  test('hay 5 roles y 8 estados', () => {
    expect(TODOS_ROLES).toHaveLength(5);
    expect(TODOS_ESTADOS).toHaveLength(8);
  });

  test('todo estado del enum tiene una entrada en TRANSICIONES', () => {
    for (const estado of TODOS_ESTADOS) {
      expect(TRANSICIONES).toHaveProperty(estado);
      expect(Array.isArray(TRANSICIONES[estado])).toBe(true);
    }
  });

  test('dominio.js coincide EXACTAMENTE con la matriz de ARQUITECTURA.md', () => {
    // Reconstruye la matriz a partir de TRANSICIONES y la compara con la esperada.
    const reconstruida = {};
    for (const [origen, acciones] of Object.entries(TRANSICIONES)) {
      reconstruida[origen] = {};
      for (const t of acciones) {
        reconstruida[origen][t.a] = [...t.roles].sort();
      }
    }
    const normalizada = {};
    for (const [origen, destinos] of Object.entries(MATRIZ_ESPERADA)) {
      normalizada[origen] = {};
      for (const [destino, roles] of Object.entries(destinos)) {
        normalizada[origen][destino] = [...roles].sort();
      }
    }
    expect(reconstruida).toEqual(normalizada);
  });
});

// -------------------------------------------------------------------
describe('transicionesPermitidas: destinos correctos por estado y rol', () => {
  for (const estado of TODOS_ESTADOS) {
    for (const rol of TODOS_ROLES) {
      const destinosEsperados = Object.entries(MATRIZ_ESPERADA[estado])
        .filter(([, roles]) => roles.includes(rol))
        .map(([destino]) => destino)
        .sort();

      test(`[${estado}] rol ${rol} -> {${destinosEsperados.join(', ') || 'ninguno'}}`, () => {
        const obtenidos = transicionesPermitidas(estado, rol)
          .map((t) => t.a)
          .sort();
        expect(obtenidos).toEqual(destinosEsperados);
      });
    }
  }
});

// -------------------------------------------------------------------
describe('puedeTransicionar: TODOS los caminos válidos son permitidos', () => {
  for (const [origen, destinos] of Object.entries(MATRIZ_ESPERADA)) {
    for (const [destino, rolesAutorizados] of Object.entries(destinos)) {
      for (const rol of rolesAutorizados) {
        test(`✔ ${origen} -> ${destino} por ${rol}`, () => {
          expect(puedeTransicionar(origen, destino, rol)).toBe(true);
        });
      }
      // Roles NO autorizados para este par válido deben dar false.
      const noAutorizados = TODOS_ROLES.filter((r) => !rolesAutorizados.includes(r));
      for (const rol of noAutorizados) {
        test(`✘ ${origen} -> ${destino} por ${rol} (rol equivocado)`, () => {
          expect(puedeTransicionar(origen, destino, rol)).toBe(false);
        });
      }
    }
  }
});

// -------------------------------------------------------------------
describe('puedeTransicionar: caminos INVÁLIDOS (fuera de la matriz) siempre falsos', () => {
  // Producto cartesiano estado x estado; todo par que NO esté en la matriz
  // debe devolver false para CUALQUIER rol.
  for (const origen of TODOS_ESTADOS) {
    for (const destino of TODOS_ESTADOS) {
      const esValido = Boolean(MATRIZ_ESPERADA[origen]?.[destino]);
      if (esValido) continue;
      for (const rol of TODOS_ROLES) {
        test(`✘ ${origen} -> ${destino} por ${rol} (no existe en la matriz)`, () => {
          expect(puedeTransicionar(origen, destino, rol)).toBe(false);
        });
      }
    }
  }
});

// -------------------------------------------------------------------
describe('Estados terminales sin salida', () => {
  for (const estado of [ESTADOS.COMPLETADA, ESTADOS.ANULADA]) {
    for (const rol of TODOS_ROLES) {
      test(`${estado} no ofrece transiciones a ${rol}`, () => {
        expect(transicionesPermitidas(estado, rol)).toEqual([]);
      });
    }
    for (const destino of TODOS_ESTADOS) {
      test(`${estado} -> ${destino} imposible (superadmin)`, () => {
        expect(puedeTransicionar(estado, destino, ROLES.SUPERADMIN)).toBe(false);
      });
    }
  }
});

// -------------------------------------------------------------------
describe('Ciclos de retorno y descarte (casos nombrados)', () => {
  test('DESCARTE: GENERADA -> ANULADA lo puede hacer backoffice, no el prevendedor', () => {
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, ROLES.BACKOFFICE)).toBe(true);
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, ROLES.SUPERADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, ROLES.PREVENDEDOR)).toBe(false);
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, ROLES.ADMIN)).toBe(false);
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, ROLES.DISENADOR)).toBe(false);
  });

  test('ADMIN DEVUELVE: PENDIENTE_ADMIN -> EN_REVISION_BACKOFFICE (admin sí, backoffice no)', () => {
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE, ROLES.ADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE, ROLES.SUPERADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE, ROLES.BACKOFFICE)).toBe(false);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE, ROLES.DISENADOR)).toBe(false);
  });

  test('BACKOFFICE RECHAZA: REVISION_FINAL_BACKOFFICE -> EN_DISENO (backoffice sí, disenador no)', () => {
    expect(puedeTransicionar(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO, ROLES.BACKOFFICE)).toBe(true);
    expect(puedeTransicionar(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO, ROLES.SUPERADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO, ROLES.DISENADOR)).toBe(false);
    expect(puedeTransicionar(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO, ROLES.ADMIN)).toBe(false);
  });

  test('ADMIN APRUEBA: PENDIENTE_ADMIN -> PENDIENTE_DISENO (admin sí, disenador no)', () => {
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO, ROLES.ADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO, ROLES.DISENADOR)).toBe(false);
  });

  test('Flujo feliz completo es transitable por los roles correctos', () => {
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.EN_REVISION_BACKOFFICE, ROLES.BACKOFFICE)).toBe(true);
    expect(puedeTransicionar(ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.PENDIENTE_ADMIN, ROLES.BACKOFFICE)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO, ROLES.ADMIN)).toBe(true);
    expect(puedeTransicionar(ESTADOS.PENDIENTE_DISENO, ESTADOS.EN_DISENO, ROLES.DISENADOR)).toBe(true);
    expect(puedeTransicionar(ESTADOS.EN_DISENO, ESTADOS.REVISION_FINAL_BACKOFFICE, ROLES.DISENADOR)).toBe(true);
    expect(puedeTransicionar(ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.COMPLETADA, ROLES.BACKOFFICE)).toBe(true);
  });
});

// -------------------------------------------------------------------
describe('Requisito de nota (matriz: transiciones marcadas con nota obligatoria)', () => {
  const conNota = [
    [ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO], // admin aprueba
    [ESTADOS.PENDIENTE_ADMIN, ESTADOS.EN_REVISION_BACKOFFICE], // admin devuelve
    [ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.EN_DISENO], // backoffice rechaza
  ];
  for (const [origen, destino] of conNota) {
    test(`${origen} -> ${destino} exige requiereNota`, () => {
      const accion = TRANSICIONES[origen].find((t) => t.a === destino);
      expect(accion).toBeDefined();
      expect(accion.requiereNota).toBe(true);
    });
  }

  // Helper requiereNota(origen, destino): fuente única para servicio + reglas.
  test('helper requiereNota() es true SOLO para las 3 transiciones marcadas', () => {
    for (const [origen, destino] of conNota) {
      expect(requiereNota(origen, destino)).toBe(true);
    }
    // El resto de transiciones válidas NO exigen nota.
    const sinNota = [
      [ESTADOS.GENERADA, ESTADOS.EN_REVISION_BACKOFFICE],
      [ESTADOS.GENERADA, ESTADOS.ANULADA],
      [ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.PENDIENTE_ADMIN],
      [ESTADOS.PENDIENTE_DISENO, ESTADOS.EN_DISENO],
      [ESTADOS.EN_DISENO, ESTADOS.REVISION_FINAL_BACKOFFICE],
      [ESTADOS.REVISION_FINAL_BACKOFFICE, ESTADOS.COMPLETADA],
    ];
    for (const [origen, destino] of sinNota) {
      expect(requiereNota(origen, destino)).toBe(false);
    }
  });

  test('helper requiereNota() es false para pares inexistentes o desconocidos', () => {
    expect(requiereNota(ESTADOS.GENERADA, ESTADOS.COMPLETADA)).toBe(false);
    expect(requiereNota('ESTADO_FANTASMA', ESTADOS.PENDIENTE_DISENO)).toBe(false);
    expect(requiereNota(ESTADOS.PENDIENTE_ADMIN, undefined)).toBe(false);
  });
});

// -------------------------------------------------------------------
describe('Robustez ante entradas desconocidas', () => {
  test('estado inexistente -> [] y false', () => {
    expect(transicionesPermitidas('ESTADO_FANTASMA', ROLES.SUPERADMIN)).toEqual([]);
    expect(puedeTransicionar('ESTADO_FANTASMA', ESTADOS.COMPLETADA, ROLES.SUPERADMIN)).toBe(false);
  });
  test('rol inexistente no obtiene transiciones', () => {
    expect(transicionesPermitidas(ESTADOS.GENERADA, 'rol_inventado')).toEqual([]);
    expect(puedeTransicionar(ESTADOS.GENERADA, ESTADOS.ANULADA, 'rol_inventado')).toBe(false);
  });
  test('destino undefined/null nunca es permitido', () => {
    expect(puedeTransicionar(ESTADOS.GENERADA, undefined, ROLES.BACKOFFICE)).toBe(false);
    expect(puedeTransicionar(ESTADOS.GENERADA, null, ROLES.BACKOFFICE)).toBe(false);
  });
});
