// ============================================
// GENERACIÓN DE PDF - jsPDF (tabla manual controlada)
// ============================================
 
import { formatCurrency, formatNumber, formatDate } from './utils.js';
 
/**
 * Generar PDF de cotización profesional
 */
export async function generateQuotationPDF(quotationData) {
  try {
    // Resolver librerías PDF en entorno de módulos ES6 + CDN UMD
    const JsPDFConstructor =
      (globalThis.jspdf && globalThis.jspdf.jsPDF) ||
      globalThis.jsPDF;
 
    if (!JsPDFConstructor) {
      throw new Error('Librería jsPDF no está cargada. Verifica el CDN en HTML.');
    }
 
    const doc = new JsPDFConstructor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    let yPosition = margin;
 
    // ===== ENCABEZADO =====
    // Cargar logo real si está disponible; si no, usar placeholder.
    const logoMaxWidth = 30;
    const logoMaxHeight = 8;
    const logoDataUrl = await getLogoDataUrl();
    if (logoDataUrl) {
      const logoSize = await getImageSizeFitted(logoDataUrl, logoMaxWidth, logoMaxHeight);
      doc.addImage(logoDataUrl, 'PNG', margin, yPosition, logoSize.width, logoSize.height);
    } else {
      doc.setFillColor(200, 200, 200);
      doc.rect(margin, yPosition, logoMaxWidth, logoMaxHeight, 'F');
      doc.setFontSize(10);
      doc.text('LOGO', margin + (logoMaxWidth / 2), yPosition + (logoMaxHeight * 0.65), { align: 'center' });
    }
 
    // Título
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text('COTIZACION PROFORMA', pageWidth / 2, yPosition + 8, { align: 'center' });
 
    // Número de cotización
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const quotationDate = new Date();
    const validUntilDate = new Date(quotationDate);
    validUntilDate.setDate(validUntilDate.getDate() + 15);
    const quotationNumber = `${quotationData.quotationNumber || 'S/N'}`;
    doc.text(`Cotización #: ${quotationNumber}`, pageWidth - margin - 40, yPosition + 5);
    doc.text(`Fecha: ${formatDate(quotationDate)}`, pageWidth - margin - 40, yPosition + 12);
    doc.text(`Vigente hasta: ${formatDate(validUntilDate)}`, pageWidth - margin - 40, yPosition + 19);
 
    yPosition += 30;
 
    // ===== INFORMACIÓN DE LA EMPRESA =====
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text('EMPRESA:', margin, yPosition);
 
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    const companyInfo = quotationData.companyInfo || {};
    const companyName = String(companyInfo.nombre || '').trim();
    const isLegacyName = companyName.toLowerCase() === 'personalizados eb';
    const resolvedCompanyName = (!companyName || isLegacyName)
      ? 'Empaques Belén S.A'
      : companyName;
    doc.text(resolvedCompanyName, margin, yPosition + 5);
    doc.text(`Tel: ${companyInfo.telefono || '(506) 2438-5119'}`, margin, yPosition + 10);
    doc.text(`Dir: ${companyInfo.direccion || 'San Rafael, Alajuela'}`, margin, yPosition + 15);
    doc.text(`Cédula: ${companyInfo.cedula || '3-101-135332'}`, margin, yPosition + 20);
 
    // Información del vendedor (lado derecho)
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text('VENDEDOR:', pageWidth - margin - 60, yPosition);
 
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    const vendor = quotationData.vendor || {};
    doc.text(vendor.nombre || 'N/A', pageWidth - margin - 60, yPosition + 5);
    doc.text(`WhatsApp: ${vendor.whatsapp || 'N/A'}`, pageWidth - margin - 60, yPosition + 10);
    if (vendor.email) {
      doc.text(`Email: ${vendor.email}`, pageWidth - margin - 60, yPosition + 15);
    }
 
    yPosition += 30;
 
    // ===== INFORMACIÓN DEL CLIENTE =====
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text('CLIENTE:', margin, yPosition);
 
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(quotationData.clientName || 'N/A', margin, yPosition + 6);
 
    if (quotationData.contact) {
      doc.setFontSize(9);
      doc.text(`Contacto: ${quotationData.contact}`, margin, yPosition + 12);
    }
 
    // Tipo de cambio (lado derecho)
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.setFontSize(10);
    doc.text('Tipo de Cambio:', pageWidth - margin - 60, yPosition);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(255, 102, 0);
    doc.setFontSize(11);
    doc.text(`$1 = CRC ${quotationData.exchangeRate.toFixed(2)}`, pageWidth - margin - 60, yPosition + 6);
 
    yPosition += 20;
 
    // ===== TABLA DE PRODUCTOS =====
    const tableColumns = [
      'Producto',
      'Tamaño',
      'Cantidad U',
      'Impresión',
      'Material',
      'Total sin IVA',
      'IVA',
      'Total con IVA',
      'Total unit con IVA'
    ];
 
    const formatMaybeNumber = (value, decimals = 0) => {
      if (value === null || value === undefined || value === '') return '';
      return formatNumber(value, decimals);
    };
 
    const formatMaybeCurrency = (value) => {
      if (value === null || value === undefined || value === '') return '';
      return 'CRC ' + parseFloat(value).toLocaleString('es-CR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    };
 
    const tableRows = quotationData.productos.map((p) => {
      const impresiones = [p.impresion1, p.impresion2]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ');
 
      return [
        p.producto || '',
        p.tamano || '',
        formatMaybeNumber(p.cantidad, 0),
        impresiones || '',
        p.material || '',
        formatMaybeCurrency(p.precioSinIVA),
        formatMaybeCurrency(p.iva),
        formatMaybeCurrency(p.totalConIVA),
        formatMaybeCurrency(p.precioUnitario)
      ];
    });
 
    yPosition = drawStrictProductsTable(doc, tableColumns, tableRows, {
      margin,
      pageWidth,
      pageHeight
    }, yPosition) + 14;
 
    // ===== TOTALES =====
    const totalsStartX = pageWidth - margin - 90;
    const totalsBlockHeight = 28;
    if (yPosition + totalsBlockHeight > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
 
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Subtotal (sin IVA):`, totalsStartX, yPosition);
    doc.text(`IVA (13%):`, totalsStartX, yPosition + 7);
 
    doc.setFont(undefined, 'bold');
    doc.text(formatCurrency(quotationData.subtotal), pageWidth - margin - 10, yPosition, { align: 'right' });
    doc.text(formatCurrency(quotationData.tax), pageWidth - margin - 10, yPosition + 7, { align: 'right' });
 
    doc.setFontSize(12);
    doc.setTextColor(0, 102, 204);
    doc.text(`TOTAL (con IVA):`, totalsStartX, yPosition + 15);
    doc.text(formatCurrency(quotationData.total), pageWidth - margin - 10, yPosition + 15, { align: 'right' });
 
    // Total en dólares
    doc.setFontSize(10);
    doc.setTextColor(255, 102, 0);
    doc.setFont(undefined, 'normal');
    doc.text(`Total en USD:`, totalsStartX, yPosition + 23);
    doc.text(`$${quotationData.totalUSD.toFixed(2)}`, pageWidth - margin - 10, yPosition + 23, { align: 'right' });
 
    yPosition += 32;
 
    // ===== CONDICIONES =====
    if (quotationData.conditions && quotationData.conditions.length > 0) {
      // Siempre iniciar términos en una nueva hoja para mantener consistencia visual.
      doc.addPage();
      yPosition = margin;

      yPosition = drawTwoColumnConditions(doc, quotationData.conditions, {
        margin,
        pageWidth,
        pageHeight,
        startY: yPosition
      });
    }

    // ===== INFORMACIÓN DE PAGOS =====
    const cuentasDataUrl = await getAccountsDataUrl();
    if (cuentasDataUrl) {
      // Siempre iniciar en página nueva para garantizar imagen grande y legible.
      doc.addPage();
      yPosition = margin;

      const titleHeight = 8;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0, 102, 204);
      doc.text('Información de Pagos', margin, yPosition);
      yPosition += titleHeight;

      const cuentasMaxWidth = pageWidth - (margin * 2);
      const cuentasMaxHeight = pageHeight - margin - yPosition;
      const cuentasSize = await getImageSizeFitted(cuentasDataUrl, cuentasMaxWidth, cuentasMaxHeight);
      const cuentasX = margin + ((cuentasMaxWidth - cuentasSize.width) / 2);
      doc.addImage(cuentasDataUrl, 'PNG', cuentasX, yPosition, cuentasSize.width, cuentasSize.height);
      yPosition += cuentasSize.height + 4;
    }
 
    // Descargar archivo
    const filename = `Cotizacion_${quotationData.clientName}_${formatDate()}_${quotationData.quotationNumber || 'temporal'}.pdf`;
    doc.save(filename);
 
    return filename;
  } catch (error) {
    console.error('Error generando PDF:', error);
    throw error;
  }
}
 
function drawStrictProductsTable(doc, columns, rows, layout, startY) {
  const margin = layout.margin;
  const pageWidth = layout.pageWidth;
  const pageHeight = layout.pageHeight;
  const tableWidth = pageWidth - (margin * 2); // 273mm en A4 landscape con margen 12
  const rightEdge = margin + tableWidth;

  // Ajuste fino: más ancho para IVA y balance mejor entre los totales.
  const colWidths = [40, 16, 16, 34, 12, 28, 24, 40, 63]; // total: 273
  const headerHeight = 6.8;
  const rowHeight = 6.4;
  const paddingX = 1.2;
  const headerFontSize = 5.8;
  const bodyFontSize = 8.0;
  const bottomReserve = 42;
  let y = startY;

  const truncateToCell = (text, maxWidth) => {
    const value = String(text || '');
    if (!value || maxWidth <= 0) return '';
    if (doc.getTextWidth(value) <= maxWidth) return value;

    const suffix = '-';
    const suffixWidth = doc.getTextWidth(suffix);
    if (suffixWidth >= maxWidth) return '';

    let trimmed = value;
    while (trimmed.length > 0 && doc.getTextWidth(trimmed) + suffixWidth > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    return trimmed ? (trimmed + suffix) : '';
  };

  const drawHeader = () => {
    doc.setFillColor(0, 102, 204);
    doc.setDrawColor(0, 102, 204);
    doc.rect(margin, y, tableWidth, headerHeight, 'FD');

    doc.setFont(undefined, 'bold');
    doc.setFontSize(headerFontSize);
    doc.setTextColor(255, 255, 255);

    let x = margin;
    for (let i = 0; i < columns.length; i++) {
      const width = colWidths[i] || 20;
      const colText = truncateToCell(columns[i], Math.max(1, width - (paddingX * 2)));
      const isRight = i >= 5;
      const isCenter = i === 2;

      let textX = x + paddingX;
      let options = {};
      if (isRight) {
        textX = x + width - paddingX;
        options = { align: 'right' };
      } else if (isCenter) {
        textX = x + (width / 2);
        options = { align: 'center' };
      }

      doc.text(colText, textX, y + 4.4, options);
      x += width;
    }

    y += headerHeight;
  };

  const drawBodyRow = (cells, rowIndex) => {
    const fill = rowIndex % 2 === 0 ? 255 : 250;
    doc.setFillColor(fill, fill, fill);
    doc.setDrawColor(220, 220, 220);
    doc.rect(margin, y, tableWidth, rowHeight, 'FD');

    doc.setFont(undefined, 'normal');
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(40, 40, 40);

    let x = margin;
    for (let i = 0; i < columns.length; i++) {
      const width = colWidths[i] || 20;
      const raw = cells[i] === null || cells[i] === undefined ? '' : String(cells[i]);
      const text = truncateToCell(raw, Math.max(1, width - (paddingX * 2)));
      const isRight = i >= 5;
      const isCenter = i === 2;

      let textX = x + paddingX;
      let options = {};
      if (isRight) {
        textX = x + width - paddingX;
        options = { align: 'right' };
      } else if (isCenter) {
        textX = x + (width / 2);
        options = { align: 'center' };
      }

      doc.text(text, textX, y + 4.3, options);
      x += width;
    }

    y += rowHeight;
  };

  drawHeader();

  for (let i = 0; i < rows.length; i++) {
    if (y + rowHeight > pageHeight - bottomReserve) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    drawBodyRow(rows[i], i);
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, rightEdge, y);
  return y;
}

function drawTwoColumnConditions(doc, conditionsInput, layout) {
  const margin = layout.margin;
  const pageWidth = layout.pageWidth;
  const pageHeight = layout.pageHeight;
  let y = layout.startY;
  const contentWidth = pageWidth - (margin * 2);
  const bodyFontSize = 8.6;
  const bodyLineHeight = 3.9;
  const blockSpacingLines = 1;
  const sectionTitleGap = 4;

  const blocks = [];
  const items = Array.isArray(conditionsInput)
    ? conditionsInput
    : [String(conditionsInput || '').trim()];

  items
    .map((item) => String(item || '').replace(/\r\n/g, '\n').trim())
    .filter(Boolean)
    .forEach((entry) => {
      const lines = entry.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return;

      const termTitle = lines[0];
      const termBody = lines.slice(1).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      blocks.push({ title: termTitle, body: termBody });
    });

  if (!blocks.length) {
    return y;
  }

  let firstPage = true;
  let cursorY = y;

  const drawSectionHeading = () => {
    const heading = firstPage ? 'TÉRMINOS Y CONDICIONES:' : 'TÉRMINOS Y CONDICIONES (CONT.):';
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 102, 204);
    doc.text(heading, margin, y);
    y += sectionTitleGap;
    cursorY = y;
  };

  const advancePage = () => {
    doc.addPage();
    y = margin;
    firstPage = false;
    drawSectionHeading();
  };

  const ensureLineRoom = () => {
    if (cursorY + bodyLineHeight <= pageHeight - margin) {
      return;
    }
    advancePage();
  };

  drawSectionHeading();

  blocks.forEach((block, blockIndex) => {
    doc.setTextColor(0, 0, 0);

    doc.setFont(undefined, 'bold');
    doc.setFontSize(bodyFontSize);
    const titleLines = doc.splitTextToSize(block.title, contentWidth);
    titleLines.forEach((line) => {
      ensureLineRoom();
      doc.text(String(line), margin, cursorY);
      cursorY += bodyLineHeight;
    });

    if (block.body) {
      doc.setFont(undefined, 'normal');
      doc.setFontSize(bodyFontSize);
      const bodyLines = doc.splitTextToSize(block.body, contentWidth);
      bodyLines.forEach((line) => {
        ensureLineRoom();
        doc.text(String(line), margin, cursorY);
        cursorY += bodyLineHeight;
      });
    }

    if (blockIndex < blocks.length - 1) {
      for (let i = 0; i < blockSpacingLines; i++) {
        ensureLineRoom();
        cursorY += bodyLineHeight;
      }
    }
  });

  return Math.max(y, cursorY) + 2;
}
 
async function getLogoDataUrl() {
  const candidates = [
    './logo/logo.webp',
    'logo/logo.webp',
    './logo/logo.png',
    'logo/logo.png',
    './logo/logo.jpg',
    'logo/logo.jpg',
    './logo/logo.jpeg',
    'logo/logo.jpeg',
    './logo.webp',
    'logo.webp'
  ];

  const dataUrl = await loadImageDataUrlWithFallback(candidates);
  if (!dataUrl) {
    console.warn('No se pudo cargar el logo para PDF (rutas probadas).');
  }
  return dataUrl;
}

async function getAccountsDataUrl() {
  const candidates = [
    './logo/cuentas.jpg',
    'logo/cuentas.jpg',
    './logo/cuentas.jpeg',
    'logo/cuentas.jpeg',
    './logo/cuentas.png',
    'logo/cuentas.png',
    './cuentas.jpg',
    'cuentas.jpg'
  ];

  const dataUrl = await loadImageDataUrlWithFallback(candidates);
  if (!dataUrl) {
    console.warn('No se pudo cargar la imagen de cuentas para PDF (rutas probadas).');
  }
  return dataUrl;
}

async function loadImageDataUrlWithFallback(candidates) {
  const tried = new Set();
  for (const rawPath of candidates) {
    const path = String(rawPath || '').trim();
    if (!path || tried.has(path)) continue;
    tried.add(path);

    const fromFetch = await fetchImageAsPngDataUrl(path);
    if (fromFetch) return fromFetch;

    const fromDirectImage = await imagePathToPngDataUrl(path);
    if (fromDirectImage) return fromDirectImage;
  }
  return null;
}

async function fetchImageAsPngDataUrl(path) {
  try {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    return await blobToPngDataUrl(blob);
  } catch (error) {
    return null;
  }
}

function imagePathToPngDataUrl(path) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeoutId = setTimeout(() => finish(null), 4000);

    image.onload = () => {
      clearTimeout(timeoutId);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 1;
      canvas.height = image.naturalHeight || 1;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(null);
        return;
      }

      try {
        ctx.drawImage(image, 0, 0);
        finish(canvas.toDataURL('image/png'));
      } catch (error) {
        finish(null);
      }
    };

    image.onerror = () => {
      clearTimeout(timeoutId);
      finish(null);
    };

    image.src = path;
  });
}
 
function blobToPngDataUrl(blob) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
 
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
 
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
        return;
      }
 
      ctx.drawImage(image, 0, 0);
      const pngDataUrl = canvas.toDataURL('image/png');
      URL.revokeObjectURL(objectUrl);
      resolve(pngDataUrl);
    };
 
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
 
    image.src = objectUrl;
  });
}
 
function getImageSizeFitted(dataUrl, maxWidth, maxHeight) {
  return new Promise((resolve) => {
    const image = new Image();
 
    image.onload = () => {
      const rawWidth = image.naturalWidth || maxWidth;
      const rawHeight = image.naturalHeight || maxHeight;
      const ratio = rawWidth / rawHeight;
 
      let width = maxWidth;
      let height = width / ratio;
 
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }
 
      resolve({ width, height });
    };
 
    image.onerror = () => {
      resolve({ width: maxWidth, height: maxHeight });
    };
 
    image.src = dataUrl;
  });
}
 
/**
 * Validar que los datos de cotización sean completos
 */
export function validateQuotationData(data) {
  const errors = [];
 
  if (!data.clientName || data.clientName.trim() === '') {
    errors.push('Nombre del cliente requerido');
  }
 
  if (!data.productos || data.productos.length === 0) {
    errors.push('Debe incluir al menos un producto');
  }
 
  if (!data.companyInfo || Object.keys(data.companyInfo).length === 0) {
    errors.push('Información de empresa no disponible');
  }
 
  if (!data.exchangeRate || data.exchangeRate <= 0) {
    errors.push('Tipo de cambio inválido');
  }
 
  if (!data.subtotal || !data.tax || !data.total) {
    errors.push('Totales no calculados');
  }
 
  return {
    valid: errors.length === 0,
    errors: errors
  };
}
 