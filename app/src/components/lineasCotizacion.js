// ============================================
// Líneas de la cotización — modelo por BUSCADOR + CARRITO (Cotizador + Detalle)
// ------------------------------------------------------------
// Reemplaza la antigua cascada. Cada línea referencia un `item` del catálogo
// (una combinación completa) y su `cantidad`; los campos del producto NO se
// editan (vienen del buscador). Solo la cantidad es editable, con la regla de
// múltiplos del mínimo (`ajustarCantidad`). El precio se recalcula de forma
// sincrónica en el componente con `calcularLinea` (no hay derivación asíncrona).
// Se apoya en services/catalogo.js y services/calculo.js.
// ============================================
import {
  buscarItem,
  claveItem,
  getCondiciones,
  resolverSujetoCondicion,
} from '../services/catalogo';
import { ajustarCantidad } from '../services/calculo';

let contadorLineas = 0;

/**
 * Crea una línea del carrito a partir de un item del catálogo. La cantidad
 * inicial es el mínimo del producto.
 * @param {object} item documento del catálogo (combinación completa).
 * @returns {{ id:string, clave:string, item:object, cantidad:number }}
 */
export function lineaDesdeItem(item) {
  const minimo = Math.max(1, Math.round(Number(item?.minimo) || 1));
  return {
    id: `l${contadorLineas++}`,
    clave: item?.clave || claveItem(item),
    item,
    cantidad: minimo,
  };
}

/**
 * Sintetiza un item "desprendido" del catálogo a partir de un producto ya
 * guardado en la cotización (para no perder líneas si la combinación ya no está
 * en el catálogo actual). El precio base en colones se despeja del subtotal de
 * línea guardado: base = precioSinIVA(línea) * minimo / cantidad.
 */
function itemDesdeProductoGuardado(p) {
  const minimo = Math.max(1, Math.round(Number(p?.minimo) || 1));
  const cantidad = Math.max(minimo, Math.floor(Number(p?.cantidad) || minimo));
  const subtotalLinea = Number(p?.precioSinIVA) || 0; // sin IVA, escalado a cantidad
  const baseSinIVA = cantidad > 0 ? (subtotalLinea * minimo) / cantidad : 0;
  return {
    cod: p?.cod || '',
    producto: p?.producto || '',
    tamano: p?.tamano || '',
    impresion1: p?.impresion1 || '',
    impresion2: p?.impresion2 || '',
    material: p?.material || '',
    minimo,
    precioSinIVA: baseSinIVA, // ya en colones
    precioEnUsd: false, // el subtotal guardado ya estaba en colones
  };
}

/**
 * Reconstruye las líneas del carrito a partir de los productos guardados en una
 * cotización (para el modo edición del Detalle). Busca el item vigente en el
 * catálogo (para poder recalcular con precios actuales); si la combinación ya
 * no existe, sintetiza el item desde lo guardado para no perder la línea.
 * @param {Array} productos productos guardados en la cotización.
 * @returns {Promise<Array>} líneas del carrito.
 */
export async function reconstruirLineas(productos) {
  const lista = Array.isArray(productos) ? productos : [];
  const lineas = await Promise.all(
    lista.map(async (p) => {
      const item =
        (await buscarItem(p.producto, p.tamano, p.impresion1, p.impresion2, p.material)) ||
        itemDesdeProductoGuardado(p);
      const linea = lineaDesdeItem(item);
      // Respetar la cantidad guardada (ajustada a la regla de múltiplos).
      linea.cantidad = ajustarCantidad(p.cantidad || item.minimo, item.minimo);
      return linea;
    }),
  );
  return lineas;
}

/** Recolecta las condiciones (una por "sujeto" único) para el PDF. */
export async function recolectarCondiciones(productos) {
  const sujetos = [];
  (productos || []).forEach((p) => {
    const sujeto = resolverSujetoCondicion(p.producto, p.material);
    if (sujeto && !sujetos.includes(sujeto)) sujetos.push(sujeto);
  });
  const entradas = await Promise.all(
    sujetos.map(async (articulo) => {
      const texto = await getCondiciones(articulo);
      return { articulo, texto };
    }),
  );
  return entradas.filter((e) => String(e.texto || '').trim().length > 0);
}
