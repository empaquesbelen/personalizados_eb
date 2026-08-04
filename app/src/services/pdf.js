// ============================================
// Generación de PDF de la cotización (proforma) — Módulo Cotizador (Fase 4)
// ------------------------------------------------------------
// Portado de legacy pdf-generator.js. Cambios respecto al legacy:
//   - jsPDF se importa como paquete npm (ESM), no desde un global de CDN.
//   - Colores de marca: índigo #3F51A3 y naranja #F57F29 (antes azul/naranja genéricos).
//   - Las imágenes (logo/cuentas) se sirven desde /logo (app/public/logo).
// El layout (A4 horizontal, tabla dibujada a mano, condiciones a página nueva,
// imagen de cuentas a página nueva) se mantiene fiel al legacy.
// ============================================
import { jsPDF } from 'jspdf';
import { formatearNumero } from './calculo';

// Formato de moneda para el PDF: usa "CRC" en vez de ₡ porque la fuente estándar
// de jsPDF no tiene el glifo del colón (saldría como carácter inválido y además
// descuadra la alineación a la derecha por ancho de glifo desconocido).
function crc(monto, decimales = 2) {
  const n = Number(monto);
  if (!Number.isFinite(n)) return 'CRC 0';
  return (
    'CRC ' +
    n.toLocaleString('es-CR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
  );
}

// Colores de marca en RGB (espejo de los tokens de index.css).
const INDIGO = [63, 81, 163]; // --indigo-500 #3F51A3
const NARANJA = [224, 106, 21]; // --naranja-600 #e06a15 (mejor contraste en papel)
const NEGRO = [40, 40, 40];

function fechaCorta(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Genera y descarga el PDF de la cotización.
 * @param {{
 *   consecutivo:string,
 *   config:{nombreEmpresa,telefono,direccion,cedulaJuridica},
 *   vendedor:{nombre,whatsapp,email},
 *   cliente:{nombre,contacto},
 *   productos:Array,
 *   totales:{subtotal,iva,total,totalUSD},
 *   tipoCambio:number,
 *   condiciones:Array<{articulo,texto}>
 * }} datos
 * @returns {Promise<string>} nombre del archivo generado.
 */
export async function generarPDFCotizacion(datos) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  const config = datos.config || {};
  const vendedor = datos.vendedor || {};
  const cliente = datos.cliente || {};
  const totales = datos.totales || {};
  const tipoCambio = Number(datos.tipoCambio) || 0;

  // ===== ENCABEZADO: logo =====
  const logoMaxWidth = 32;
  const logoMaxHeight = 12;
  const logoDataUrl = await cargarImagenComoPng('/logo/logo.webp');
  if (logoDataUrl) {
    const size = await ajustarImagen(logoDataUrl, logoMaxWidth, logoMaxHeight);
    doc.addImage(logoDataUrl, 'PNG', margin, y, size.width, size.height);
  }

  // Título centrado.
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('COTIZACIÓN PROFORMA', pageWidth / 2, y + 8, { align: 'center' });

  // Bloque de número/fechas (derecha).
  doc.setFontSize(11);
  doc.setTextColor(...NEGRO);
  const hoy = new Date();
  const vigencia = new Date(hoy);
  vigencia.setDate(vigencia.getDate() + 15);
  const bloqueX = pageWidth - margin - 46;
  doc.setFont(undefined, 'bold');
  doc.text(`Cotización #: ${datos.consecutivo || 'S/N'}`, bloqueX, y + 5);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text(`Fecha: ${fechaCorta(hoy)}`, bloqueX, y + 11);
  doc.text(`Vigente hasta: ${fechaCorta(vigencia)}`, bloqueX, y + 16);

  y += 26;

  // ===== EMPRESA (izq) y VENDEDOR (der) =====
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INDIGO);
  doc.text('EMPRESA', margin, y);

  doc.setFont(undefined, 'normal');
  doc.setTextColor(...NEGRO);
  doc.setFontSize(9);
  doc.text(String(config.nombreEmpresa || 'Empaques Belén S.A'), margin, y + 5);
  doc.text(`Tel: ${config.telefono || '(506) 2438-5119'}`, margin, y + 10);
  doc.text(`Dir: ${config.direccion || 'San Rafael, Alajuela'}`, margin, y + 15);
  doc.text(`Cédula: ${config.cedulaJuridica || '3-101-135332'}`, margin, y + 20);

  const vendX = pageWidth - margin - 70;
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INDIGO);
  doc.setFontSize(10);
  doc.text('VENDEDOR', vendX, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...NEGRO);
  doc.setFontSize(9);
  doc.text(String(vendedor.nombre || 'N/D'), vendX, y + 5);
  if (vendedor.whatsapp) doc.text(`WhatsApp: ${vendedor.whatsapp}`, vendX, y + 10);
  if (vendedor.email) doc.text(`Email: ${vendedor.email}`, vendX, y + 15);

  y += 28;

  // ===== CLIENTE (izq) y TIPO DE CAMBIO (der) =====
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INDIGO);
  doc.setFontSize(10);
  doc.text('CLIENTE', margin, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...NEGRO);
  doc.setFontSize(10);
  doc.text(String(cliente.nombre || 'N/D'), margin, y + 6);
  if (cliente.contacto) {
    doc.setFontSize(9);
    doc.text(`Contacto: ${cliente.contacto}`, margin, y + 12);
  }

  doc.setFont(undefined, 'bold');
  doc.setTextColor(...INDIGO);
  doc.setFontSize(10);
  doc.text('Tipo de cambio', vendX, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...NARANJA);
  doc.setFontSize(11);
  doc.text(`$1 = CRC ${tipoCambio.toFixed(2)}`, vendX, y + 6);

  y += 20;

  // ===== TABLA DE PRODUCTOS =====
  const columnas = [
    'Producto',
    'Tamaño',
    'Cantidad',
    'Impresión',
    'Material',
    'Total sin IVA',
    'IVA',
    'Total con IVA',
    'Unit. con IVA',
  ];

  const filas = (datos.productos || []).map((p) => {
    const impresiones = [p.impresion1, p.impresion2]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .join(' / ');
    return [
      p.producto || '',
      p.tamano || '',
      formatearNumero(p.cantidad, 0),
      impresiones,
      p.material || '',
      crc(p.precioSinIVA),
      crc(p.iva),
      crc(p.totalConIVA),
      crc(p.precioUnitario),
    ];
  });

  y = dibujarTablaProductos(doc, columnas, filas, { margin, pageWidth, pageHeight }, y) + 12;

  // ===== TOTALES =====
  const totalsX = pageWidth - margin - 90;
  if (y + 30 > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(...NEGRO);
  doc.text('Subtotal (sin IVA):', totalsX, y);
  doc.text('IVA (13%):', totalsX, y + 7);
  doc.setFont(undefined, 'bold');
  doc.text(crc(totales.subtotal), pageWidth - margin, y, { align: 'right' });
  doc.text(crc(totales.iva), pageWidth - margin, y + 7, { align: 'right' });

  doc.setFontSize(12);
  doc.setTextColor(...INDIGO);
  doc.text('TOTAL (con IVA):', totalsX, y + 15);
  doc.text(crc(totales.total), pageWidth - margin, y + 15, { align: 'right' });

  doc.setFontSize(10);
  doc.setTextColor(...NARANJA);
  doc.setFont(undefined, 'normal');
  doc.text('Total en USD:', totalsX, y + 23);
  doc.text(`$${(Number(totales.totalUSD) || 0).toFixed(2)}`, pageWidth - margin, y + 23, {
    align: 'right',
  });

  // ===== CONDICIONES (página nueva) =====
  const bloquesCondiciones = (datos.condiciones || [])
    .map((c) => {
      const articulo = String(c.articulo || '').trim();
      const texto = String(c.texto || '').trim();
      if (!texto) return '';
      return articulo ? `${articulo}\n${texto}` : texto;
    })
    .filter(Boolean);

  if (bloquesCondiciones.length > 0) {
    doc.addPage();
    dibujarCondiciones(doc, bloquesCondiciones, { margin, pageWidth, pageHeight, startY: margin });
  }

  // ===== INFORMACIÓN DE PAGOS (página nueva) =====
  const cuentasDataUrl = await cargarImagenComoPng('/logo/cuentas.jpg');
  if (cuentasDataUrl) {
    doc.addPage();
    let yc = margin;
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...INDIGO);
    doc.text('Información de pagos', margin, yc);
    yc += 8;
    const maxW = pageWidth - margin * 2;
    const maxH = pageHeight - margin - yc;
    const size = await ajustarImagen(cuentasDataUrl, maxW, maxH);
    const cx = margin + (maxW - size.width) / 2;
    doc.addImage(cuentasDataUrl, 'PNG', cx, yc, size.width, size.height);
  }

  const nombreArchivo = `Cotizacion_${(cliente.nombre || 'cliente').replace(/[^\w\s-]/g, '').trim()}_${datos.consecutivo || fechaCorta()}.pdf`;
  doc.save(nombreArchivo);
  return nombreArchivo;
}

// ---------------------------------------------------------------------------
// Tabla de productos (dibujada a mano, fiel al legacy drawStrictProductsTable).
// ---------------------------------------------------------------------------
function dibujarTablaProductos(doc, columnas, filas, layout, startY) {
  const { margin, pageWidth, pageHeight } = layout;
  const tableWidth = pageWidth - margin * 2; // 273mm en A4 horizontal, margen 12
  const rightEdge = margin + tableWidth;
  const colWidths = [40, 16, 18, 34, 28, 30, 24, 40, 43]; // suma 273
  const headerHeight = 7;
  const rowHeight = 6.6;
  const paddingX = 1.4;
  const headerFontSize = 6.2;
  const bodyFontSize = 8;
  const bottomReserve = 40;
  let y = startY;

  const truncar = (texto, maxWidth) => {
    const value = String(texto || '');
    if (!value || maxWidth <= 0) return '';
    if (doc.getTextWidth(value) <= maxWidth) return value;
    const suffix = '…';
    let trimmed = value;
    while (trimmed.length > 0 && doc.getTextWidth(trimmed + suffix) > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed ? trimmed + suffix : '';
  };

  const dibujarEncabezado = () => {
    doc.setFillColor(...INDIGO);
    doc.setDrawColor(...INDIGO);
    doc.rect(margin, y, tableWidth, headerHeight, 'FD');
    doc.setFont(undefined, 'bold');
    doc.setFontSize(headerFontSize);
    doc.setTextColor(255, 255, 255);

    let x = margin;
    for (let i = 0; i < columnas.length; i++) {
      const width = colWidths[i] || 20;
      const colText = truncar(columnas[i], Math.max(1, width - paddingX * 2));
      const isRight = i >= 5;
      const isCenter = i === 2;
      let textX = x + paddingX;
      let options = {};
      if (isRight) {
        textX = x + width - paddingX;
        options = { align: 'right' };
      } else if (isCenter) {
        textX = x + width / 2;
        options = { align: 'center' };
      }
      doc.text(colText, textX, y + 4.6, options);
      x += width;
    }
    y += headerHeight;
  };

  const dibujarFila = (celdas, idx) => {
    const fill = idx % 2 === 0 ? 255 : 244;
    doc.setFillColor(fill, fill, fill);
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y, tableWidth, rowHeight, 'FD');
    doc.setFont(undefined, 'normal');
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...NEGRO);

    let x = margin;
    for (let i = 0; i < columnas.length; i++) {
      const width = colWidths[i] || 20;
      const raw = celdas[i] == null ? '' : String(celdas[i]);
      const text = truncar(raw, Math.max(1, width - paddingX * 2));
      const isRight = i >= 5;
      const isCenter = i === 2;
      let textX = x + paddingX;
      let options = {};
      if (isRight) {
        textX = x + width - paddingX;
        options = { align: 'right' };
      } else if (isCenter) {
        textX = x + width / 2;
        options = { align: 'center' };
      }
      doc.text(text, textX, y + 4.4, options);
      x += width;
    }
    y += rowHeight;
  };

  dibujarEncabezado();
  for (let i = 0; i < filas.length; i++) {
    if (y + rowHeight > pageHeight - bottomReserve) {
      doc.addPage();
      y = margin;
      dibujarEncabezado();
    }
    dibujarFila(filas[i], i);
  }
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightEdge, y);
  return y;
}

// ---------------------------------------------------------------------------
// Condiciones (fiel al legacy drawTwoColumnConditions, una columna).
// ---------------------------------------------------------------------------
function dibujarCondiciones(doc, bloquesInput, layout) {
  const { margin, pageWidth, pageHeight } = layout;
  const contentWidth = pageWidth - margin * 2;
  const bodyFontSize = 8.6;
  const lineHeight = 4;

  const bloques = [];
  bloquesInput
    .map((item) => String(item || '').replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
    .forEach((entry) => {
      const lines = entry.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      bloques.push({ title: lines[0], body: lines.slice(1).join('\n').trim() });
    });

  if (!bloques.length) return layout.startY;

  let y = layout.startY;
  let cursorY = y;
  let primeraPagina = true;

  const encabezadoSeccion = () => {
    const heading = primeraPagina ? 'TÉRMINOS Y CONDICIONES' : 'TÉRMINOS Y CONDICIONES (CONT.)';
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...INDIGO);
    doc.text(heading, margin, y);
    y += 5;
    cursorY = y;
  };

  const nuevaPagina = () => {
    doc.addPage();
    y = margin;
    primeraPagina = false;
    encabezadoSeccion();
  };

  const asegurarLinea = () => {
    if (cursorY + lineHeight > pageHeight - margin) nuevaPagina();
  };

  encabezadoSeccion();

  bloques.forEach((bloque, idx) => {
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(bodyFontSize);
    doc.splitTextToSize(bloque.title, contentWidth).forEach((line) => {
      asegurarLinea();
      doc.text(String(line), margin, cursorY);
      cursorY += lineHeight;
    });

    if (bloque.body) {
      doc.setFont(undefined, 'normal');
      doc.setFontSize(bodyFontSize);
      doc.splitTextToSize(bloque.body, contentWidth).forEach((line) => {
        asegurarLinea();
        doc.text(String(line), margin, cursorY);
        cursorY += lineHeight;
      });
    }

    if (idx < bloques.length - 1) {
      asegurarLinea();
      cursorY += lineHeight; // espacio entre bloques
    }
  });

  return Math.max(y, cursorY) + 2;
}

// ---------------------------------------------------------------------------
// Carga de imágenes: fetch → canvas → PNG data URL (soporta .webp / .jpg).
// jsPDF no acepta WebP directamente, por eso se re-codifica a PNG.
// ---------------------------------------------------------------------------
async function cargarImagenComoPng(ruta) {
  try {
    const res = await fetch(ruta, { cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobAPng(blob);
  } catch {
    return null;
  }
}

function blobAPng(blob) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      let dataUrl = null;
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch {
        dataUrl = null;
      }
      URL.revokeObjectURL(objectUrl);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

function ajustarImagen(dataUrl, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rawW = img.naturalWidth || maxWidth;
      const rawH = img.naturalHeight || maxHeight;
      const ratio = rawW / rawH;
      let width = maxWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
      resolve({ width, height });
    };
    img.onerror = () => resolve({ width: maxWidth, height: maxHeight });
    img.src = dataUrl;
  });
}
