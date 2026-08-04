// ============================================
// DOMINIO — fuente única de verdad de la máquina de estados
// ============================================
// Debe mantenerse en sincronía con docs/ARQUITECTURA.md (Regla Absoluta #4)
// y con las Firestore Security Rules (que hacen cumplir esto del lado servidor).

export const ROLES = {
  PREVENDEDOR: 'prevendedor',
  BACKOFFICE: 'backoffice',
  ADMIN: 'admin',
  DISENADOR: 'disenador',
  SUPERADMIN: 'superadmin',
};

// Colección de CONTADORES atómicos del consecutivo (uno por vendedor+día,
// clave = PREFIJO "STE2307"). La reserva del número es atómica con la creación
// de la cotización (ver services/cotizaciones.crearCotizacion y
// services/consecutivo.js). ESPEJO del `match /contadores/{clave}` en
// firestore.rules y de docs/ARQUITECTURA.md §4/§7. Si cambia, cambian las tres.
export const COLECCION_CONTADORES = 'contadores';

export const ESTADOS = {
  GENERADA: 'GENERADA',
  EN_REVISION_BACKOFFICE: 'EN_REVISION_BACKOFFICE',
  PENDIENTE_ADMIN: 'PENDIENTE_ADMIN',
  PENDIENTE_DISENO: 'PENDIENTE_DISENO',
  EN_DISENO: 'EN_DISENO',
  REVISION_FINAL_BACKOFFICE: 'REVISION_FINAL_BACKOFFICE',
  COMPLETADA: 'COMPLETADA',
  ANULADA: 'ANULADA',
};

// Etiquetas legibles para la UI
export const ESTADO_LABEL = {
  [ESTADOS.GENERADA]: 'Generada',
  [ESTADOS.EN_REVISION_BACKOFFICE]: 'En revisión (backoffice)',
  [ESTADOS.PENDIENTE_ADMIN]: 'Pendiente de aprobación (admin)',
  [ESTADOS.PENDIENTE_DISENO]: 'Pendiente de diseño',
  [ESTADOS.EN_DISENO]: 'En diseño',
  [ESTADOS.REVISION_FINAL_BACKOFFICE]: 'Revisión final (backoffice)',
  [ESTADOS.COMPLETADA]: 'Completada',
  [ESTADOS.ANULADA]: 'Anulada',
};

// Etiquetas legibles de los ROLES para la UI. El identificador interno del rol
// NO cambia (sigue siendo 'prevendedor' en Firestore, Auth y Security Rules);
// acá solo se traduce a lo que ve el usuario. Por decisión de negocio,
// "prevendedor" se muestra como "Asesor comercial" (o "Asesor" donde el espacio
// sea justo). Fuente única: usala en todo display de rol.
export const ROL_LABEL = {
  [ROLES.PREVENDEDOR]: 'Asesor comercial',
  [ROLES.BACKOFFICE]: 'Backoffice',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.DISENADOR]: 'Diseñador',
  [ROLES.SUPERADMIN]: 'Superadmin',
};

// Transiciones válidas: estadoActual -> lista de acciones posibles.
// Cada acción define: estado destino (a), roles autorizados, si requiere nota,
// etiqueta de botón y "tono" para el color del botón en la UI.
export const TRANSICIONES = {
  [ESTADOS.GENERADA]: [
    { a: ESTADOS.EN_REVISION_BACKOFFICE, roles: [ROLES.BACKOFFICE, ROLES.SUPERADMIN], accion: 'Revisar', tono: 'primario' },
    { a: ESTADOS.ANULADA, roles: [ROLES.BACKOFFICE, ROLES.SUPERADMIN], accion: 'Descartar', tono: 'peligro' },
  ],
  [ESTADOS.EN_REVISION_BACKOFFICE]: [
    // notaOpcional: al enviar al admin se ofrece un campo de nota, pero se puede
    // confirmar sin escribirla (no es obligatoria). La nota viaja igual en el
    // ultimoEvento/historial vía transicionarCotizacion.
    // requierePago: para poder enviar a aprobación, el backoffice DEBE completar
    // los datos de pago obligatorios (método + su campo requerido). Lo hace
    // cumplir el modal de acciones (validarPago) y viaja en el mismo writeBatch.
    { a: ESTADOS.PENDIENTE_ADMIN, roles: [ROLES.BACKOFFICE, ROLES.SUPERADMIN], accion: 'Solicitar aprobación', tono: 'primario', notaOpcional: true, requierePago: true },
  ],
  [ESTADOS.PENDIENTE_ADMIN]: [
    { a: ESTADOS.PENDIENTE_DISENO, roles: [ROLES.ADMIN, ROLES.SUPERADMIN], accion: 'Aprobar', requiereNota: true, tono: 'exito' },
    { a: ESTADOS.EN_REVISION_BACKOFFICE, roles: [ROLES.ADMIN, ROLES.SUPERADMIN], accion: 'Devolver', requiereNota: true, tono: 'peligro' },
  ],
  [ESTADOS.PENDIENTE_DISENO]: [
    { a: ESTADOS.EN_DISENO, roles: [ROLES.DISENADOR, ROLES.SUPERADMIN], accion: 'Pasar a diseño', tono: 'primario' },
  ],
  [ESTADOS.EN_DISENO]: [
    { a: ESTADOS.REVISION_FINAL_BACKOFFICE, roles: [ROLES.DISENADOR, ROLES.SUPERADMIN], accion: 'Enviar a revisión final', tono: 'primario' },
  ],
  [ESTADOS.REVISION_FINAL_BACKOFFICE]: [
    { a: ESTADOS.COMPLETADA, roles: [ROLES.BACKOFFICE, ROLES.SUPERADMIN], accion: 'Aprobar', tono: 'exito' },
    { a: ESTADOS.EN_DISENO, roles: [ROLES.BACKOFFICE, ROLES.SUPERADMIN], accion: 'Rechazar', requiereNota: true, tono: 'peligro' },
  ],
  [ESTADOS.COMPLETADA]: [],
  [ESTADOS.ANULADA]: [],
};

/** Devuelve las transiciones que `rol` puede ejecutar desde `estadoActual`. */
export function transicionesPermitidas(estadoActual, rol) {
  return (TRANSICIONES[estadoActual] || []).filter((t) => t.roles.includes(rol));
}

/** ¿`rol` puede pasar una cotización de `estadoActual` a `estadoDestino`? */
export function puedeTransicionar(estadoActual, estadoDestino, rol) {
  return transicionesPermitidas(estadoActual, rol).some((t) => t.a === estadoDestino);
}

/**
 * ¿La transición `estadoActual` -> `estadoDestino` exige una nota?
 * Fuente única (espejo de ARQUITECTURA.md §3 y de firestore.rules):
 * admin aprueba/devuelve y backoffice rechaza el diseño. Independiente del rol.
 */
export function requiereNota(estadoActual, estadoDestino) {
  return (TRANSICIONES[estadoActual] || []).some(
    (t) => t.a === estadoDestino && t.requiereNota === true,
  );
}

// ============================================================
// Vistas de la bandeja por rol — para que una cotización NO desaparezca al
// avanzar de etapa. Desde la óptica de cada rol, su estado cae en un "bucket":
//   - accion:      es su turno (tiene una transición disponible) → panel principal.
//   - enProceso:   ya la entregó a otra etapa; la sigue viendo para seguimiento.
//   - finalizadas: COMPLETADA / ANULADA.
// Cuando una cotización es DEVUELTA (rechazo del paso siguiente), su estado
// vuelve a un estado de `accion` y reaparece sola en el panel principal del rol
// correspondiente. Coherente con TRANSICIONES (mismo archivo).
// ============================================================
export const VISTAS_BANDEJA = {
  [ROLES.PREVENDEDOR]: {
    accion: [],
    enProceso: [
      ESTADOS.GENERADA,
      ESTADOS.EN_REVISION_BACKOFFICE,
      ESTADOS.PENDIENTE_ADMIN,
      ESTADOS.PENDIENTE_DISENO,
      ESTADOS.EN_DISENO,
      ESTADOS.REVISION_FINAL_BACKOFFICE,
    ],
    finalizadas: [ESTADOS.COMPLETADA, ESTADOS.ANULADA],
  },
  [ROLES.BACKOFFICE]: {
    accion: [ESTADOS.GENERADA, ESTADOS.EN_REVISION_BACKOFFICE, ESTADOS.REVISION_FINAL_BACKOFFICE],
    enProceso: [ESTADOS.PENDIENTE_ADMIN, ESTADOS.PENDIENTE_DISENO, ESTADOS.EN_DISENO],
    finalizadas: [ESTADOS.COMPLETADA, ESTADOS.ANULADA],
  },
  [ROLES.ADMIN]: {
    accion: [ESTADOS.PENDIENTE_ADMIN],
    enProceso: [ESTADOS.PENDIENTE_DISENO, ESTADOS.EN_DISENO, ESTADOS.REVISION_FINAL_BACKOFFICE],
    finalizadas: [ESTADOS.COMPLETADA],
  },
  [ROLES.DISENADOR]: {
    accion: [ESTADOS.PENDIENTE_DISENO, ESTADOS.EN_DISENO],
    enProceso: [ESTADOS.REVISION_FINAL_BACKOFFICE],
    finalizadas: [ESTADOS.COMPLETADA],
  },
  [ROLES.SUPERADMIN]: {
    accion: [
      ESTADOS.GENERADA,
      ESTADOS.EN_REVISION_BACKOFFICE,
      ESTADOS.PENDIENTE_ADMIN,
      ESTADOS.PENDIENTE_DISENO,
      ESTADOS.EN_DISENO,
      ESTADOS.REVISION_FINAL_BACKOFFICE,
    ],
    enProceso: [],
    finalizadas: [ESTADOS.COMPLETADA, ESTADOS.ANULADA],
  },
};

/** Buckets de vista de un rol (accion/enProceso/finalizadas). Siempre un objeto. */
export function vistasDeRol(rol) {
  return VISTAS_BANDEJA[rol] || { accion: [], enProceso: [], finalizadas: [] };
}

/** Unión de estados que un rol necesita ver en su bandeja (para la query). */
export function estadosVisiblesDeRol(rol) {
  const v = vistasDeRol(rol);
  return [...new Set([...v.accion, ...v.enProceso, ...v.finalizadas])];
}
