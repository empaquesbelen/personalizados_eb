// ============================================
// Servicio de cotizaciones (Firestore)
// ------------------------------------------------------------
// Regla Absoluta #2: toda transición cambia el estado Y agrega un evento a
// historial_estados de forma ATÓMICA (writeBatch). Nunca por separado.
// ============================================
import {
  collection,
  doc,
  getDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ESTADOS, ROLES, COLECCION_CONTADORES, estadosVisiblesDeRol } from '../constants/dominio';
import { prefijoConsecutivo, formatearConsecutivo } from './consecutivo';

const COL = 'cotizaciones';
// Colección de contadores atómicos del consecutivo (uno por vendedor+día).
// Espejo del `match /contadores/{clave}` en firestore.rules y de ARQUITECTURA §4.
const CONTADORES = COLECCION_CONTADORES;

/** Objeto de pago por defecto (lo gestiona el backoffice). */
export function pagoPorDefecto() {
  return { metodo: '', comprobante: '', muestraEnviada: false, cotizacionAprobada: false };
}

/**
 * Normaliza el objeto de pago: fuerza el método a un valor válido y descarta
 * los campos que no aplican al método elegido (comprobante solo en Contado;
 * cotizacionAprobada solo en Crédito). Fuente única para UI, validación y
 * persistencia.
 * @param {object} f datos crudos del formulario.
 */
export function normalizarPago(f = {}) {
  const metodo = f.metodo === 'contado' || f.metodo === 'credito' ? f.metodo : '';
  return {
    metodo,
    comprobante: metodo === 'contado' ? String(f.comprobante || '').trim() : '',
    muestraEnviada: Boolean(f.muestraEnviada),
    cotizacionAprobada: metodo === 'credito' ? Boolean(f.cotizacionAprobada) : false,
  };
}

/**
 * Valida que el pago tenga la información OBLIGATORIA para enviar la cotización
 * a aprobación del admin:
 *   - hay que elegir método (Contado o Crédito),
 *   - Contado  → N° de comprobante de pago no vacío,
 *   - Crédito  → casilla "Cotización aprobada" marcada.
 * La casilla "Muestra enviada por correo" es opcional en ambos métodos.
 * @returns {string} '' si es válido; si no, el motivo (para mostrar en la UI).
 */
export function validarPago(pago = {}) {
  const p = normalizarPago(pago);
  if (p.metodo === 'contado') {
    return p.comprobante ? '' : 'Ingresá el número de comprobante de pago (Contado).';
  }
  if (p.metodo === 'credito') {
    return p.cotizacionAprobada ? '' : 'Marcá "Cotización aprobada" para continuar (Crédito).';
  }
  return 'Elegí el método de pago (Contado o Crédito).';
}

/**
 * Descripción compacta del pago para la nota de la transición y el historial
 * (traza — Regla Absoluta #7). No lleva el prefijo "Actualizó…" de resumirPago.
 * @param {object} pago
 * @returns {string}
 */
export function describirPago(pago = {}) {
  const p = normalizarPago(pago);
  if (p.metodo === 'contado') {
    return `Contado · comprobante ${p.comprobante || '—'} · muestra ${p.muestraEnviada ? 'enviada' : 'pendiente'}`;
  }
  if (p.metodo === 'credito') {
    return `Crédito · ${p.cotizacionAprobada ? 'cotización aprobada' : 'sin aprobar'} · muestra ${p.muestraEnviada ? 'enviada' : 'pendiente'}`;
  }
  return 'sin método definido';
}

/**
 * Crea una cotización (estado inicial GENERADA) reservando su CONSECUTIVO de
 * forma ATÓMICA y concurrency-safe, SIN Cloud Functions.
 *
 * Todo ocurre dentro de UNA sola `runTransaction`:
 *   1. lee el contador `contadores/{PREFIJO}` (PREFIJO = vendedor+ddMM),
 *   2. calcula la siguiente secuencia (valor actual + 1; arranca en 1),
 *   3. arma el consecutivo visible `PREFIJO-NN`,
 *   4. INCREMENTA el contador (reserva el número),
 *   5. CREA la cotización con ese consecutivo + su evento espejo (Regla #2),
 *   6. AGREGA el primer evento a historial_estados.
 * Como la reserva del número y la creación de la cotización viven en la MISMA
 * transacción, Firestore serializa los intentos concurrentes (reintenta al
 * detectar contención): NUNCA se emite el mismo consecutivo dos veces, aunque
 * muchos usuarios generen a la vez. La secuencia proviene del contador (no del
 * tiempo). Ver services/consecutivo.js para la semántica (por-día-por-prefijo).
 *
 * @returns {Promise<{id:string, consecutivo:string}>} id del doc + consecutivo reservado.
 */
export async function crearCotizacion({
  prevendedor,
  cliente,
  productos,
  totales,
  tipoCambio,
  pago = null,
  fecha = new Date(),
}) {
  // Rol REAL del que crea (las reglas exigen ultimoEvento.rol == rol()).
  // Normalmente prevendedor; superadmin también puede crear (matriz de permisos).
  const rolActor = prevendedor.rol || ROLES.PREVENDEDOR;
  const prefijo = prefijoConsecutivo(prevendedor.nombre || prevendedor.email, fecha);
  const contadorRef = doc(db, CONTADORES, prefijo);
  const cotRef = doc(collection(db, COL));

  const consecutivo = await runTransaction(db, async (tx) => {
    // --- LECTURAS primero (requisito de Firestore) ---
    const snap = await tx.get(contadorRef);
    const actual = snap.exists() ? Number(snap.data().valor) || 0 : 0;
    const siguiente = actual + 1;
    const consecutivoReservado = formatearConsecutivo(prefijo, siguiente);

    const now = serverTimestamp();
    // Evento espejo del create: estado inicial GENERADA (sin estado anterior).
    const ultimoEvento = {
      estadoAnterior: null,
      estadoNuevo: ESTADOS.GENERADA,
      usuarioId: prevendedor.id,
      rol: rolActor,
      nota: '',
      timestamp: now,
    };

    // --- ESCRITURAS ---
    // (1) Reserva del número: el contador SOLO puede subir de a 1 (lo exigen las
    //     reglas del match /contadores). Si no existía, se crea en 1.
    if (snap.exists()) {
      tx.update(contadorRef, { valor: siguiente, actualizadoEn: now });
    } else {
      tx.set(contadorRef, { valor: siguiente, prefijo, creadoEn: now, actualizadoEn: now });
    }

    // (2) La cotización con el consecutivo reservado.
    tx.set(cotRef, {
      consecutivo: consecutivoReservado,
      estado: ESTADOS.GENERADA,
      prevendedorId: prevendedor.id,
      prevendedorNombre: prevendedor.nombre || prevendedor.email || '',
      cliente: cliente || {},
      productos: productos || [],
      totales: totales || {},
      tipoCambio: tipoCambio || null,
      // Método de pago (lo gestiona el backoffice). Se inicializa vacío.
      pago: pago || pagoPorDefecto(),
      notaActual: '',
      // Espejo del último evento (Regla Absoluta #2): las reglas lo exigen en el
      // create. La subcolección historial_estados sigue siendo la traza completa.
      ultimoEvento,
      createdAt: now,
      updatedAt: now,
    });

    // (3) Primer evento en la subcolección de trazabilidad (mismo commit atómico).
    const evtRef = doc(collection(cotRef, 'historial_estados'));
    tx.set(evtRef, { ...ultimoEvento });

    return consecutivoReservado;
  });

  return { id: cotRef.id, consecutivo };
}

/**
 * Ejecuta una transición de estado de forma atómica (estado + historial).
 *
 * `pago` es opcional: cuando la transición exige datos de pago (backoffice
 * enviando a aprobación del admin), se guarda EN EL MISMO writeBatch que el
 * cambio de estado (atómico). Las Security Rules lo permiten: la rama que
 * autoriza es `transicionValida() && eventoEspejoUpdate()`, que no restringe
 * el campo `pago`. Así nunca queda una transición sin sus datos de pago.
 *
 * @param {{cotizacionId:string, estadoNuevo:string, usuario:{id,rol}, nota?:string, pago?:object}} p
 */
export async function transicionarCotizacion({ cotizacionId, estadoNuevo, usuario, nota = '', pago = undefined }) {
  const ref = doc(db, COL, cotizacionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('La cotización no existe.');
  const estadoAnterior = snap.data().estado;

  const now = serverTimestamp();

  // Evento espejo de la transición: se escribe en el doc (para que las reglas
  // puedan exigir el rastro, Regla Absoluta #2) Y en la subcolección.
  const ultimoEvento = {
    estadoAnterior,
    estadoNuevo,
    usuarioId: usuario.id,
    rol: usuario.rol,
    nota,
    timestamp: now,
  };

  const cambios = {
    estado: estadoNuevo,
    notaActual: nota,
    ultimoEvento,
    updatedAt: now,
  };
  // Registrar quién tomó la cotización según la etapa.
  if (estadoNuevo === ESTADOS.EN_REVISION_BACKOFFICE) cambios.backofficeId = usuario.id;
  if (estadoNuevo === ESTADOS.EN_DISENO) cambios.disenadorId = usuario.id;
  // Datos de pago obligatorios al enviar a aprobación (van en el mismo batch).
  if (pago !== undefined && pago !== null) cambios.pago = normalizarPago(pago);

  const batch = writeBatch(db);
  batch.update(ref, cambios);
  const evtRef = doc(collection(ref, 'historial_estados'));
  batch.set(evtRef, { ...ultimoEvento });
  await batch.commit();
}

/**
 * Edición de CONTENIDO por backoffice/superadmin (sin cambiar el estado) CON
 * registro de auditoría.
 *
 * Hace un `writeBatch`:
 *  (a) `update` del doc con los campos de contenido + `updatedAt`. NO toca
 *      `estado` ni `ultimoEvento`: así cae en `edicionContenido()` de
 *      firestore.rules (que exige !cambiaEstado()), lo que autoriza a
 *      backoffice/superadmin a actualizar contenido.
 *  (b) `set` de un evento en la subcolección `historial_estados` que documenta
 *      QUÉ / CUÁNDO / QUIÉN, SIN cambio de estado: usa
 *      `estadoAnterior == estadoNuevo == <estado actual>` (las reglas del
 *      create de historial solo exigen usuarioId propio, rol real y
 *      estadoNuevo string — no requieren cambio de estado).
 *
 * NO cambia estado ni requiere modificar `firestore.rules`. Cualquier cambio de
 * estado sigue pasando SIEMPRE por `transicionarCotizacion` (Regla Absoluta #2).
 *
 * @param {string} cotizacionId
 * @param {{cliente?:object, productos?:Array, totales?:object, tipoCambio?:number, pago?:object}} datos
 * @param {{usuario?:{id:string,rol:string,nombre?:string}, resumen?:string}} auditoria
 */
export async function actualizarContenidoCotizacion(
  cotizacionId,
  { cliente, productos, totales, tipoCambio, pago } = {},
  { usuario, resumen } = {},
) {
  const ref = doc(db, COL, cotizacionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('La cotización no existe.');
  const estadoActual = snap.data().estado;

  const now = serverTimestamp();

  // (a) Solo los campos de contenido + updatedAt. Nunca estado/ultimoEvento.
  const cambios = { updatedAt: now };
  if (cliente !== undefined) cambios.cliente = cliente;
  if (productos !== undefined) cambios.productos = productos;
  if (totales !== undefined) cambios.totales = totales;
  if (tipoCambio !== undefined) cambios.tipoCambio = tipoCambio;
  if (pago !== undefined) cambios.pago = pago;

  const batch = writeBatch(db);
  batch.update(ref, cambios);

  // (b) Evento de auditoría de EDICIÓN (sin cambio de estado). Solo si se
  //     conoce el usuario que edita (para atribuir el evento a su uid/rol).
  if (usuario?.id) {
    const evtRef = doc(collection(ref, 'historial_estados'));
    batch.set(evtRef, {
      estadoAnterior: estadoActual,
      estadoNuevo: estadoActual, // sin cambio de estado
      usuarioId: usuario.id,
      rol: usuario.rol,
      nota: resumen || 'Editó el contenido de la cotización',
      timestamp: now,
    });
  }

  await batch.commit();
}

// ---------------------------------------------------------------------------
// Resúmenes de auditoría (mejor esfuerzo) para la `nota` del evento de edición.
// Puras: no tocan Firestore; se calculan en el llamador con el antes/después.
// ---------------------------------------------------------------------------

/** Clave estable de un producto (misma combinación = misma línea). */
function claveProducto(p) {
  return ['cod', 'producto', 'tamano', 'impresion1', 'impresion2', 'material']
    .map((k) => String(p?.[k] ?? '').trim().toLowerCase())
    .join('|');
}

/** Etiqueta legible de un producto para la nota. */
function etiquetaProducto(p) {
  const nombre = String(p?.producto || p?.cod || 'producto').trim();
  const tam = String(p?.tamano || '').trim();
  return tam ? `${nombre} (${tam})` : nombre;
}

const numCR = (n) => Number(n || 0).toLocaleString('es-CR');

/**
 * Compara el contenido anterior vs. el nuevo (cliente + productos) y arma un
 * resumen legible del cambio. Si no puede diferenciar, devuelve un texto
 * genérico. Mejor esfuerzo (Punto 2 del flujo de backoffice).
 * @param {{cliente?:object, productos?:Array}} anterior
 * @param {{cliente?:object, productos?:Array}} nuevo
 * @returns {string}
 */
export function resumirEdicionContenido(anterior = {}, nuevo = {}) {
  const antes = new Map((anterior.productos || []).map((p) => [claveProducto(p), p]));
  const despues = new Map((nuevo.productos || []).map((p) => [claveProducto(p), p]));

  const agregados = [];
  const quitados = [];
  const cambiosCantidad = [];

  for (const [clave, p] of despues) {
    if (!antes.has(clave)) agregados.push(etiquetaProducto(p));
  }
  for (const [clave, p] of antes) {
    if (!despues.has(clave)) quitados.push(etiquetaProducto(p));
  }
  for (const [clave, pNuevo] of despues) {
    const pViejo = antes.get(clave);
    if (!pViejo) continue;
    const qa = Number(pViejo.cantidad || 0);
    const qb = Number(pNuevo.cantidad || 0);
    if (qa !== qb) {
      cambiosCantidad.push(`cambió cantidad de ${etiquetaProducto(pNuevo)} de ${numCR(qa)} a ${numCR(qb)}`);
    }
  }

  const partes = [];
  if (agregados.length) partes.push(`Agregó ${agregados.join(', ')}`);
  if (quitados.length) partes.push(`Quitó ${quitados.join(', ')}`);
  if (cambiosCantidad.length) partes.push(cambiosCantidad.join('; '));

  // Cambios en los datos del cliente.
  const cliAntes = anterior.cliente || {};
  const cliNuevo = nuevo.cliente || {};
  const clienteCambio =
    String(cliAntes.nombre || '').trim() !== String(cliNuevo.nombre || '').trim() ||
    String(cliAntes.contacto || '').trim() !== String(cliNuevo.contacto || '').trim();
  if (clienteCambio) partes.push('cambió datos del cliente');

  if (!partes.length) return 'Editó el contenido de la cotización';
  return partes.join('; ');
}

/**
 * Resumen legible del estado resultante de los datos de pago (Punto 4).
 * @param {object} pago objeto de pago normalizado.
 * @returns {string}
 */
export function resumirPago(pago = {}) {
  const metodo = pago.metodo;
  const detalles = [];
  if (metodo === 'contado') {
    detalles.push('método Contado');
    detalles.push(pago.comprobante ? `comprobante ${String(pago.comprobante).trim()}` : 'sin N° de comprobante');
    detalles.push(pago.muestraEnviada ? 'muestra enviada' : 'muestra pendiente');
  } else if (metodo === 'credito') {
    detalles.push('método Crédito');
    detalles.push(pago.cotizacionAprobada ? 'cotización aprobada' : 'cotización sin aprobar');
    detalles.push(pago.muestraEnviada ? 'muestra enviada' : 'muestra pendiente');
  } else {
    detalles.push('sin método definido');
  }
  return `Actualizó datos de pago: ${detalles.join(', ')}`;
}

/**
 * Query de la bandeja según el rol del usuario.
 *
 * admin y diseñador traen NO solo los estados donde actúan, sino también los de
 * "en proceso" y "finalizadas" (unión de sus buckets — ver VISTAS_BANDEJA en
 * dominio.js), para que una cotización no desaparezca de su vista al avanzar de
 * etapa. La separación en pestañas (Requieren acción / En proceso / Finalizadas)
 * la hace la Bandeja del lado cliente. Las Security Rules ya permiten estas
 * lecturas (admin lee todo; diseñador lee sus estados, incluida COMPLETADA), así
 * que no hacen falta cambios de reglas. Índice usado: (estado, createdAt DESC).
 *
 * prevendedor ve todas las suyas (cualquier estado); backoffice/superadmin ven
 * todas: en esos casos la unión sería demasiado amplia, así que se consultan sin
 * el filtro `in` (más simple y ya cubre todos los buckets).
 */
export function queryBandeja(perfil) {
  if (!perfil?.id) return null;
  const base = collection(db, COL);

  switch (perfil.rol) {
    case ROLES.PREVENDEDOR:
      return query(base, where('prevendedorId', '==', perfil.id), orderBy('createdAt', 'desc'));
    case ROLES.ADMIN:
      return query(base, where('estado', 'in', estadosVisiblesDeRol(ROLES.ADMIN)), orderBy('createdAt', 'desc'));
    case ROLES.DISENADOR:
      return query(base, where('estado', 'in', estadosVisiblesDeRol(ROLES.DISENADOR)), orderBy('createdAt', 'desc'));
    case ROLES.BACKOFFICE:
    case ROLES.SUPERADMIN:
    default:
      return query(base, orderBy('createdAt', 'desc'));
  }
}
