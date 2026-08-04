  // ============================================
  // GOOGLE APPS SCRIPT - API REST MEJORADO
  // Sistema de Cotización EB
  // ============================================

  const SPREADSHEET_ID = '1yOsHxWOgHfuCT3ylgCjQHadoLEyWl7sKdcdyg1IK_sw';
  const SHEET_NAMES = {
    baseDatos: 'BaseDatos',
    vendedores: 'Vendedores',
    condiciones: 'Condiciones',
    configuracion: 'Configuracion',
    historial: 'Historial'
  };

  const VENDOR_REPLACEMENTS = {
    'odilon rodriguez': ['Juan Pablo Herrera', '', ''],
    'odilón rodriguez': ['Juan Pablo Herrera', '', ''],
    'odilon rodríguez': ['Juan Pablo Herrera', '', ''],
    'odilón rodríguez': ['Juan Pablo Herrera', '', ''],
    'michael soto': ['Julián Salazar', '', '']
  };

  const HISTORIAL_HEADERS = ['Consecutivo', 'Fecha', 'Vendedor', 'Cliente', 'Productos', 'Total', 'TipoCambio'];

  /**
  * Obtener o crear una hoja
  */
  function getOrCreateSheet(sheetName) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Logger.log(`Hoja ${sheetName} no existe, creando...`);
      sheet = ss.insertSheet(sheetName);
    }
    
    return sheet;
  }

  /**
  * MANEJADOR PRINCIPAL GET
  */
  function doGet(e) {
    const path = e.parameter.path || '';
    Logger.log('📥 GET Request:', path);

    try {
      let response;
      
      switch(path) {
        case 'vendedores':
          response = getVendedores();
          break;
        case 'productos':
          response = getProductos();
          break;
        case 'tamanos':
          response = getTamanos(e.parameter.producto);
          break;
        case 'opciones':
          response = getOpciones(
            e.parameter.producto,
            e.parameter.tamano,
            e.parameter.impresion1,
            e.parameter.impresion2
          );
          break;
        case 'catalogo-busqueda':
          response = getCatalogoBusqueda();
          break;
        case 'condiciones':
          response = getCondiciones(e.parameter.producto);
          break;
        case 'configuracion':
          response = getConfiguracion();
          break;
        case 'configuracion-simple':
          // Versión sin llamada a BCCR (para debugging)
          response = getConfiguracionSimple();
          break;
        case 'historial':
          response = getHistorial(e.parameter.vendedor);
          break;
        case 'buscar-producto':
          response = buscarProducto(
            e.parameter.producto,
            e.parameter.tamano,
            e.parameter.impresion1,
            e.parameter.impresion2,
            e.parameter.material,
            e.parameter.cod
          );
          break;
        case 'buscar-productos-lote':
          response = buscarProductosLote(e.parameter.items);
          break;
        case 'guardar-cotizacion':
          response = guardarCotizacion(
            e.parameter.vendedor,
            e.parameter.cliente,
            e.parameter.productos,
            e.parameter.total,
            e.parameter.tipoCambio
          );
          break;
        case 'bccr-test':
          // Endpoint de diagnóstico del BCCR para debugging
          response = testBccrIntegration();
          break;
        case 'urlfetch-test':
          response = testUrlFetchPermission();
          break;
        case 'init':
          initializeSpreadsheet();
          response = successResponse({
            success: true,
            message: 'Spreadsheet inicializado correctamente'
          });
          break;
        case 'reset-init':
          // Forzar reinicialización completa
          const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
          Object.values(SHEET_NAMES).forEach(name => {
            const sheet = ss.getSheetByName(name);
            if (sheet) {
              ss.deleteSheet(sheet);
            }
          });
          initializeSpreadsheet();
          response = successResponse({
            success: true,
            message: 'Spreadsheet reinicializado correctamente con datos de ejemplo'
          });
          break;
        default:
          response = errorResponse('Ruta no encontrada: ' + path);
      }

      return response;
    } catch (error) {
      Logger.log('❌ Error en GET:', error);
      return errorResponse(error.toString());
    }
  }

  // ============ FUNCIONES GET ============

  function getVendedores() {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.vendedores);
      
      // Si está vacía, inicializar
      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }

      syncVendorRoster(sheet);
      
      const data = sheet.getDataRange().getValues();
      const vendedores = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0]) {
          vendedores.push({
            nombre: row[0],
            whatsapp: row[1] || '',
            email: row[2] || ''
          });
        }
      }

      return successResponse(vendedores);
    } catch (error) {
      Logger.log('Error en getVendedores:', error);
      return errorResponse('Error obteniendo vendedores: ' + error);
    }
  }

  function syncVendorRoster(sheet) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = sheet.getRange(2, 1, lastRow - 1, 3);
    const rows = range.getValues();
    let changed = false;
    let hasJuan = false;
    let hasJulian = false;

    rows.forEach((row) => {
      const rawName = String(row[0] || '').trim();
      const normalizedName = rawName.toLowerCase();

      if (normalizedName === 'juan pablo herrera') {
        hasJuan = true;
      }

      if (normalizedName === 'julián salazar' || normalizedName === 'julian salazar') {
        hasJulian = true;
      }

      if (VENDOR_REPLACEMENTS[normalizedName]) {
        row[0] = VENDOR_REPLACEMENTS[normalizedName][0];
        row[1] = VENDOR_REPLACEMENTS[normalizedName][1];
        row[2] = VENDOR_REPLACEMENTS[normalizedName][2];
        changed = true;

        if (row[0] === 'Juan Pablo Herrera') hasJuan = true;
        if (row[0] === 'Julián Salazar') hasJulian = true;
      }
    });

    if (changed) {
      range.setValues(rows);
    }

    const rowsToAppend = [];
    if (!hasJuan) rowsToAppend.push(['Juan Pablo Herrera', '', '']);
    if (!hasJulian) rowsToAppend.push(['Julián Salazar', '', '']);

    if (rowsToAppend.length > 0) {
      rowsToAppend.forEach((row) => sheet.appendRow(row));
    }
  }

  function getProductos() {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      
      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }
      
      const data = sheet.getDataRange().getValues();
      const productosSet = new Set();
      
      for (let i = 1; i < data.length; i++) {
        const rowProducto = normalizeSheetText(data[i][1]);
        if (rowProducto) {
          productosSet.add(rowProducto);
        }
      }

      const productos = Array.from(productosSet).sort();
      return successResponse(productos);
    } catch (error) {
      Logger.log('Error en getProductos:', error);
      return errorResponse('Error obteniendo productos: ' + error);
    }
  }

  function getTamanos(producto) {
    try {
      if (!producto) {
        return successResponse([]);
      }

      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      const data = sheet.getDataRange().getValues();
      const normalizedProducto = normalizeComparableText(producto);

      const tamanosSet = new Set();
      for (let i = 1; i < data.length; i++) {
        const rowProducto = normalizeComparableText(data[i][1]);
        const rowTamano = normalizeSheetText(data[i][2]);

        if (rowProducto === normalizedProducto && rowTamano) {
          tamanosSet.add(rowTamano);
        }
      }

      const tamanos = Array.from(tamanosSet).sort();
      return successResponse(tamanos);
    } catch (error) {
      Logger.log('Error en getTamanos:', error);
      return errorResponse('Error obteniendo tamaños: ' + error);
    }
  }

  function getOpciones(producto, tamano, impresion1, impresion2) {
    try {
      if (!producto || !tamano) {
        return successResponse({
          impresiones1: [],
          impresiones2: [],
          materiales: []
        });
      }

      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      const data = sheet.getDataRange().getValues();

      const impresiones1Set = new Set();
      const impresiones2Set = new Set();
      const materialesSet = new Set();

      const normalizedProducto = normalizeComparableText(producto);
      const normalizedTamano = normalizeComparableText(tamano);

      for (let i = 1; i < data.length; i++) {
        const rowProducto = normalizeComparableText(data[i][1]);
        const rowTamano = normalizeComparableText(data[i][2]);
        if (rowProducto !== normalizedProducto || rowTamano !== normalizedTamano) {
          continue;
        }

        const rowImpresion1 = normalizeSheetText(data[i][4]);
        const rowImpresion2 = normalizeSheetText(data[i][5]);
        const rowMaterial = normalizeSheetText(data[i][6]);

        if (rowImpresion1) {
          impresiones1Set.add(rowImpresion1);
        }

        if (impresion1 && normalizeSheetText(rowImpresion1) !== normalizeSheetText(impresion1)) {
          continue;
        }

        if (rowImpresion2) {
          impresiones2Set.add(rowImpresion2);
        }

        if (impresion2 && normalizeSheetText(rowImpresion2) !== normalizeSheetText(impresion2)) {
          continue;
        }

        if (rowMaterial) {
          materialesSet.add(rowMaterial);
        }
      }

      return successResponse({
        impresiones1: Array.from(impresiones1Set),
        impresiones2: Array.from(impresiones2Set),
        materiales: Array.from(materialesSet)
      });
    } catch (error) {
      Logger.log('Error en getOpciones:', error);
      return errorResponse('Error obteniendo opciones: ' + error);
    }
  }

  function getCatalogoBusqueda() {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);

      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }

      const data = sheet.getDataRange().getValues();
      const uniqueMap = {};

      for (let i = 1; i < data.length; i++) {
        const cod = String(data[i][0] || '').trim();
        const producto = String(data[i][1] || '').trim();
        const tamano = String(data[i][2] || '').trim();
        const minimo = Number(data[i][3] || 0);
        const impresion1 = String(data[i][4] || '').trim();
        const impresion2 = String(data[i][5] || '').trim();
        const material = String(data[i][6] || '').trim();

        if (!producto || !tamano) {
          continue;
        }

        const key = [cod, producto, tamano, impresion1, impresion2, material].join('|');
        if (!uniqueMap[key]) {
          const searchableRaw = [cod, producto, tamano, impresion1, impresion2, material]
            .filter(function(value) { return value; })
            .join(' ');
          uniqueMap[key] = {
            cod: cod,
            producto: producto,
            tamano: tamano,
            minimo: minimo,
            impresion1: impresion1,
            impresion2: impresion2,
            material: material,
            searchable: searchableRaw.toLowerCase(),
            searchableNormalized: normalizeSearchText(searchableRaw)
          };
        }
      }

      const catalogo = Object.values(uniqueMap).sort((a, b) => {
        const p = a.producto.localeCompare(b.producto);
        if (p !== 0) return p;
        const t = a.tamano.localeCompare(b.tamano);
        if (t !== 0) return t;
        const i1 = a.impresion1.localeCompare(b.impresion1);
        if (i1 !== 0) return i1;
        const i2 = a.impresion2.localeCompare(b.impresion2);
        if (i2 !== 0) return i2;
        return a.material.localeCompare(b.material);
      });

      return successResponse(catalogo);
    } catch (error) {
      Logger.log('Error en getCatalogoBusqueda:', error);
      return errorResponse('Error obteniendo catálogo de búsqueda: ' + error);
    }
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function normalizeLookupKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeLookupCompact(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function getCondiciones(producto) {
    try {
      if (!producto) {
        return successResponse('');
      }

      const sheet = getOrCreateSheet(SHEET_NAMES.condiciones);
      
      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }
      
      const data = sheet.getDataRange().getValues();
      const target = normalizeLookupKey(producto);
      const targetCompact = normalizeLookupCompact(producto);

      // 1) Coincidencia exacta (comportamiento principal)
      for (let i = 1; i < data.length; i++) {
        if (normalizeLookupKey(data[i][0]) === target) {
          return successResponse(data[i][1] || '');
        }
      }

      // 2) Coincidencia flexible para variaciones de nombre (ej: "Vasos 12 oz" vs "Vasos")
      let bestMatch = { score: 0, subjectLen: 0, condition: '' };

      for (let i = 1; i < data.length; i++) {
        const subjectRaw = String(data[i][0] || '').trim();
        const conditionRaw = data[i][1] || '';
        if (!subjectRaw || !conditionRaw) continue;

        const subject = normalizeLookupKey(subjectRaw);
        const subjectCompact = normalizeLookupCompact(subjectRaw);
        if (!subjectCompact || !targetCompact) continue;

        let score = 0;
        if (subjectCompact === targetCompact) {
          score = 95;
        } else if (targetCompact.indexOf(subjectCompact) !== -1 || subjectCompact.indexOf(targetCompact) !== -1) {
          score = 80;
        } else {
          const targetTokens = target.split(/\s+/).filter(Boolean);
          const subjectTokens = subject.split(/\s+/).filter(Boolean);
          const overlap = subjectTokens.filter(function(token) {
            return targetTokens.indexOf(token) !== -1;
          }).length;

          if (overlap > 0) {
            score = 50 + Math.min(20, overlap * 10);
          }
        }

        // Preferir matches más específicos cuando el score empata
        if (score > 0) {
          if (score > bestMatch.score || (score === bestMatch.score && subjectCompact.length > bestMatch.subjectLen)) {
            bestMatch = {
              score: score,
              subjectLen: subjectCompact.length,
              condition: conditionRaw
            };
          }
        }
      }

      if (bestMatch.score > 0) {
        return successResponse(bestMatch.condition);
      }

      return successResponse('');
    } catch (error) {
      Logger.log('Error en getCondiciones:', error);
      return errorResponse('Error obteniendo condiciones: ' + error);
    }
  }

  function getConfiguracion() {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.configuracion);
      
      // Si está vacía, inicializar
      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }
      
      const data = sheet.getDataRange().getValues();

      const config = {
        tipoCambio: 512,
        iva: 0.13,
        nombreEmpresa: 'Empaques Belén',
        telefono: '(506) 2438-5119 / 2438-0930',
        direccion: 'San Rafael, Alajuela, Costa Rica',
        cedulaJuridica: '3-101-135332'
      };

      for (let i = 1; i < data.length; i++) {
        const key = data[i][0];
        const value = data[i][1];
      
        if (key === 'TipoCambio') config.tipoCambio = parseFloat(value) || 512;
        if (key === 'IVA') config.iva = parseFloat(value) || 0.13;
        if (key === 'NombreEmpresa') config.nombreEmpresa = value || 'Empaques Belén';
        if (key === 'Telefono') config.telefono = value || '(506) 2438-5119';
        if (key === 'Direccion') config.direccion = value || 'San Rafael, Alajuela';
        if (key === 'CedulaJuridica') config.cedulaJuridica = value || '3-101-135332';
      }

      // Intentar tipo de cambio en vivo desde el BCCR.
      // Usa credenciales públicas verificadas (hardcodeadas, no requiere Sheets)
      config.tipoCambioFuente = 'manual';
      try {
        const liveRate = fetchTipoCambioBCCR();
        if (liveRate) {
          config.tipoCambio = liveRate;
          config.tipoCambioFuente = 'BCCR';
        }
      } catch (bccrError) {
        Logger.log('⚠️ BCCR error (continuando con tipo manual): ' + bccrError);
        // Continuar con tipo de cambio manual si BCCR falla
      }

      return successResponse(config);
    } catch (error) {
      Logger.log('Error en getConfiguracion:', error);
      return errorResponse('Error obteniendo configuración: ' + error);
    }
  }

  /**
   * Versión simple de configuración sin llamada a BCCR (para debugging)
   */
  function getConfiguracionSimple() {
    try {
      const sheet = getOrCreateSheet(SHEET_NAMES.configuracion);
      
      // Si está vacía, inicializar
      if (sheet.getLastRow() === 0) {
        initializeSpreadsheet();
      }
      
      const data = sheet.getDataRange().getValues();

      const config = {
        tipoCambio: 512,
        iva: 0.13,
        nombreEmpresa: 'Empaques Belén',
        telefono: '(506) 2438-5119 / 2438-0930',
        direccion: 'San Rafael, Alajuela, Costa Rica',
        cedulaJuridica: '3-101-135332',
        tipoCambioFuente: 'manual'
      };

      for (let i = 1; i < data.length; i++) {
        const key = data[i][0];
        const value = data[i][1];

        if (key === 'TipoCambio') config.tipoCambio = parseFloat(value) || 512;
        if (key === 'IVA') config.iva = parseFloat(value) || 0.13;
        if (key === 'NombreEmpresa') config.nombreEmpresa = value || 'Empaques Belén';
        if (key === 'Telefono') config.telefono = value || '(506) 2438-5119';
        if (key === 'Direccion') config.direccion = value || 'San Rafael, Alajuela';
        if (key === 'CedulaJuridica') config.cedulaJuridica = value || '3-101-135332';
      }

      Logger.log('✅ Configuración simple (sin BCCR) devuelta');
      return successResponse(config);
    } catch (error) {
      Logger.log('Error en getConfiguracionSimple:', error);
      return errorResponse('Error obteniendo configuración: ' + error);
    }
  }

  // Credenciales públicas verificadas del repositorio oficial DaveSV/Indicadores-Econ-micos-BCCR-Api.
  // Funcionan sin registro propio. Si el usuario configura BccrEmail+BccrToken propios, se usan esos.
  const BCCR_DEFAULT_EMAIL = 'alb.saenz@gmail.com';
  const BCCR_DEFAULT_TOKEN = 'IL7CLLIAAL';

  function authorizeExternalRequest() {
    const response = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
    Logger.log('authorizeExternalRequest HTTP ' + response.getResponseCode());
    return response.getResponseCode();
  }

  function testUrlFetchPermission() {
    try {
      const response = UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
      return successResponse({
        ok: true,
        status: response.getResponseCode()
      });
    } catch (error) {
      return successResponse({
        ok: false,
        error: String(error)
      });
    }
  }

  /**
   * Endpoint de diagnóstico: prueba el BCCR y devuelve logs detallados
   */
  function testBccrIntegration() {
    const logs = [];
    
    try {
      logs.push('=== BCCR Integration Test ===');
      
      // Verificar credenciales default
      logs.push('1. Using hardcoded credentials:');
      logs.push('   Email: ' + BCCR_DEFAULT_EMAIL);
      logs.push('   Token: ' + BCCR_DEFAULT_TOKEN.substring(0, 5) + '...');
      
      // Llamar BCCR manualmente para ver la respuesta bruta
      logs.push('2. Calling BCCR...');
      const tz = Session.getScriptTimeZone();
      const today = new Date();
      const date = new Date(today);
      const dateStr = Utilities.formatDate(date, tz, 'dd/MM/yyyy');
      
      const url =
        'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos' +
        '?Indicador=318' +
        '&FechaInicio=' + encodeURIComponent(dateStr) +
        '&FechaFinal='  + encodeURIComponent(dateStr) +
        '&Nombre=SistemaEB' +
        '&SubNiveles=N' +
        '&CorreoElectronico=' + encodeURIComponent(BCCR_DEFAULT_EMAIL) +
        '&Token='             + encodeURIComponent(BCCR_DEFAULT_TOKEN);
      
      logs.push('   Date: ' + dateStr);
      
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      logs.push('   HTTP Status: ' + response.getResponseCode());
      
      const body = response.getContentText();
      logs.push('   Response length: ' + body.length + ' bytes');
      logs.push('   Response snippet: ' + body.substring(0, 300));
      
      // Intentar extraer el rate
      logs.push('3. Extracting rate...');
      const rate = extractBccrRateFromResponse(body);
      
      if (rate) {
        logs.push('   ✅ SUCCESS: Rate = ' + rate);
      } else {
        logs.push('   ❌ FAILED: extractBccrRateFromResponse returned null');
        // Buscar manualmente en la respuesta
        if (body.includes('NUM_VALOR')) {
          logs.push('   ⚠️  Body contains NUM_VALOR but extraction failed!');
          const manualMatch = body.match(/NUM_VALOR[^>]*>([^<]*)</);
          if (manualMatch && manualMatch[1]) {
            logs.push('   Manual match found: ' + manualMatch[1]);
          }
        } else {
          logs.push('   ⚠️  Body does NOT contain NUM_VALOR');
        }
      }
      
      return successResponse({
        success: true,
        logs: logs,
        rate: rate,
        tipoCambioFuente: rate ? 'BCCR' : 'manual'
      });
    } catch (error) {
      logs.push('❌ Error: ' + error);
      return successResponse({
        success: false,
        logs: logs,
        error: String(error)
      });
    }
  }

  /**
   * Obtiene el tipo de cambio de venta del dólar desde el Web Service del BCCR.
   * Indicador 318 = Tipo de cambio de venta (USD → CRC).
   * Usa credenciales públicas verificadas (hardcodeadas).
   * Retrocede hasta 4 días para cubrir fines de semana y feriados.
   */
  function fetchTipoCambioBCCR() {
    const correo = BCCR_DEFAULT_EMAIL;
    const tkn    = BCCR_DEFAULT_TOKEN;

    try {
      const tz = Session.getScriptTimeZone();
      const today = new Date();

      for (let daysBack = 0; daysBack <= 4; daysBack++) {
        const date = new Date(today);
        date.setDate(today.getDate() - daysBack);
        const dateStr = Utilities.formatDate(date, tz, 'dd/MM/yyyy');

        const url =
          'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos' +
          '?Indicador=318' +
          '&FechaInicio=' + encodeURIComponent(dateStr) +
          '&FechaFinal='  + encodeURIComponent(dateStr) +
          '&Nombre=SistemaEB' +
          '&SubNiveles=N' +
          '&CorreoElectronico=' + encodeURIComponent(correo) +
          '&Token='             + encodeURIComponent(tkn);

        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        if (response.getResponseCode() !== 200) {
          Logger.log('BCCR HTTP ' + response.getResponseCode() + ' para ' + dateStr);
          continue;
        }

        const body = response.getContentText();
        const rate = extractBccrRateFromResponse(body);
        if (rate) {
          Logger.log('✅ Tipo de cambio BCCR: ' + rate + ' (' + dateStr + ')');
          return rate;
        }
      }

      Logger.log('⚠️ BCCR no devolvió valor válido. Se usará tipo de cambio manual.');
      return null;
    } catch (error) {
      Logger.log('Error llamando API BCCR: ' + error);
      return null;
    }
  }

  function extractBccrRateFromResponse(body) {
    if (!body) return null;

    // Formato DataSet (ObtenerIndicadoresEconomicos): <NUM_VALOR>468.77000000</NUM_VALOR>
    let match = body.match(/<NUM_VALOR>([\d.]+)<\/NUM_VALOR>/i);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      return (!isNaN(value) && value > 0) ? value : null;
    }

    // Formato XML simple, por si viene como texto plano o escapado
    const unescaped = String(body).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    match = unescaped.match(/<NUM_VALOR>([\d.,]+)<\/NUM_VALOR>/i);
    if (match && match[1]) {
      const value = parseFloat(String(match[1]).replace(',', '.'));
      return (!isNaN(value) && value > 0) ? value : null;
    }

    return null;
  }

  function getHistorial(vendedor) {
    try {
      if (!vendedor) {
        return successResponse([]);
      }

      const sheet = ensureHistorialSheet();
      
      const data = sheet.getDataRange().getValues();

      const historial = [];
      for (let i = 1; i < data.length; i++) {
        if (data[i][2] === vendedor) {
          historial.push({
            consecutivo: data[i][0] || '',
            fecha: data[i][1],
            vendedor: data[i][2],
            cliente: data[i][3],
            total: parseFloat(data[i][5]) || 0,
            tipoCambio: parseFloat(data[i][6]) || 512
          });
        }
      }

      return successResponse(historial.reverse().slice(0, 10));
    } catch (error) {
      Logger.log('Error en getHistorial:', error);
      return errorResponse('Error obteniendo historial: ' + error);
    }
  }

  /**
   * Obtiene el tipo de cambio USD→CRC activo.
   * Usa CacheService (5 min) para no llamar BCCR en cada búsqueda de producto.
   */
  function getCachedTipoCambio() {
    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get('tipoCambio_usd');
      if (cached) {
        const val = parseFloat(cached);
        if (!isNaN(val) && val > 0) return val;
      }
      const rate = fetchTipoCambioBCCR();
      if (rate && rate > 0) {
        cache.put('tipoCambio_usd', String(rate), 300);
        return rate;
      }
    } catch (e) {
      Logger.log('getCachedTipoCambio error: ' + e);
    }
    return 512; // fallback
  }

  /**
   * Aplica la conversión USD→CRC cuando la fila tiene PrecioEnUsd="Aplica" (col M, index 12).
   * Recalcula precioSinIVA, iva, totalConIVA y precioUnitario a partir del precio convertido.
   */
  function aplicarConversionUsd(rawPrecioSinIVA, minimo, row, tipoCambio) {
    const precioSinIVA = rawPrecioSinIVA * tipoCambio;
    const iva = precioSinIVA * 0.13;
    const totalConIVA = precioSinIVA + iva;
    const precioUnitario = totalConIVA / minimo;
    return { precioSinIVA: precioSinIVA, iva: iva, totalConIVA: totalConIVA, precioUnitario: precioUnitario };
  }

  function buscarProducto(producto, tamano, impresion1, impresion2, material, cod) {
    try {
      if (!producto || !tamano) {
        return errorResponse('Parámetros requeridos faltantes');
      }

      const requestedCod = String(cod || '').trim();
      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      const data = sheet.getDataRange().getValues();
      let existeProductoTamano = false;
      const impresiones1Validas = new Set();
      const impresiones2Validas = new Set();
      const materialesValidos = new Set();

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowCod = normalizeSheetText(row[0]);
        const rowProducto = normalizeSheetText(row[1]);
        const rowTamano = normalizeSheetText(row[2]);
        const rowImpresion1 = normalizeSheetText(row[4]);
        const rowImpresion2 = normalizeSheetText(row[5]);
        const rowMaterial = normalizeSheetText(row[6]);

        if (requestedCod && rowCod !== requestedCod) {
          continue;
        }

        if (rowProducto === String(producto || '').trim() && rowTamano === String(tamano || '').trim()) {
          existeProductoTamano = true;
          if (rowImpresion1) impresiones1Validas.add(rowImpresion1);
          if (rowImpresion2) impresiones2Validas.add(rowImpresion2);
          if (rowMaterial) materialesValidos.add(rowMaterial);
        }

        if (
          rowProducto === String(producto || '').trim() &&
          rowTamano === String(tamano || '').trim() &&
          rowImpresion1 === String(impresion1 || '').trim() &&
          rowImpresion2 === String(impresion2 || '').trim() &&
          rowMaterial === String(material || '').trim()
        ) {
          const rawPrecioSinIVA = parseNumericValue(row[7], 0);
          const minimo = Math.max(1, Math.round(parseNumericValue(row[3], 1)));
          const precioEnUsdFlag = String(row[12] || '').trim().toLowerCase();

          let precioSinIVA, iva, totalConIVA, precioUnitario;
          if (precioEnUsdFlag === 'aplica') {
            const tc = getCachedTipoCambio();
            const conv = aplicarConversionUsd(rawPrecioSinIVA, minimo, row, tc);
            precioSinIVA = conv.precioSinIVA;
            iva = conv.iva;
            totalConIVA = conv.totalConIVA;
            precioUnitario = conv.precioUnitario;
          } else {
            precioSinIVA = rawPrecioSinIVA;
            iva = parseNumericValue(row[9], precioSinIVA * 0.13);
            totalConIVA = parseNumericValue(row[10], precioSinIVA + iva);
            precioUnitario = parseNumericValue(row[11], totalConIVA / minimo);
          }

          return successResponse({
            cod: row[0],
            minimo: minimo,
            precioSinIVA: precioSinIVA,
            iva: iva,
            totalConIVA: totalConIVA,
            precioUnitario: precioUnitario
          });
        }
      }

      if (existeProductoTamano) {
        return errorResponse(
          'La combinacion seleccionada no existe para este producto y tamano. ' +
          'Opciones validas -> Impresion 1: ' + Array.from(impresiones1Validas).join(', ') +
          ' | Impresion 2: ' + Array.from(impresiones2Validas).join(', ') +
          ' | Material: ' + Array.from(materialesValidos).join(', ')
        );
      }

      return errorResponse('Producto no encontrado');
    } catch (error) {
      Logger.log('Error en buscarProducto:', error);
      return errorResponse('Error buscando producto: ' + error);
    }
  }

  function buscarProductosLote(itemsJson) {
    try {
      let items = [];
      try {
        items = JSON.parse(itemsJson || '[]');
      } catch (parseError) {
        return errorResponse('Parámetro items inválido');
      }

      if (!Array.isArray(items) || items.length === 0) {
        return successResponse({
          results: {},
          requested: 0,
          found: 0
        });
      }

      const normalizeValue = (value) => String(value || '').trim();
      const buildKey = (producto, tamano, impresion1, impresion2, material, cod) => [
        normalizeValue(cod),
        normalizeValue(producto),
        normalizeValue(tamano),
        normalizeValue(impresion1),
        normalizeValue(impresion2),
        normalizeValue(material)
      ].join('|');

      const buildComboKey = (producto, tamano, impresion1, impresion2, material) =>
        buildKey(producto, tamano, impresion1, impresion2, material, '');

      const getRowKey = (row) => buildKey(
        row[1],
        row[2],
        row[4],
        row[5],
        row[6],
        row[0]
      );

      const requested = {};
      items.forEach((item) => {
        const key = buildKey(item.producto, item.tamano, item.impresion1, item.impresion2, item.material, item.cod);
        if (!key || key === '|||||') return;
        requested[key] = {
          producto: normalizeValue(item.producto),
          tamano: normalizeValue(item.tamano),
          impresion1: normalizeValue(item.impresion1),
          impresion2: normalizeValue(item.impresion2),
          material: normalizeValue(item.material),
          cod: normalizeValue(item.cod)
        };
      });

      const requestedKeys = Object.keys(requested);
      if (requestedKeys.length === 0) {
        return successResponse({
          results: {},
          requested: 0,
          found: 0
        });
      }

      const sheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      const data = sheet.getDataRange().getValues();
      const results = {};
      let tcLote = null; // tipo de cambio cargado de forma lazy solo si algún producto lo necesita

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowKey = getRowKey(row);
        const rowComboKey = buildComboKey(
          normalizeSheetText(row[1]),
          normalizeSheetText(row[2]),
          normalizeSheetText(row[4]),
          normalizeSheetText(row[5]),
          normalizeSheetText(row[6])
        );

        const requestedKey = requested[rowKey] ? rowKey : (requested[rowComboKey] ? rowComboKey : null);
        if (!requestedKey || results[requestedKey]) {
          continue;
        }

        const rawPrecioSinIVA = parseNumericValue(row[7], 0);
        const minimo = Math.max(1, Math.round(parseNumericValue(row[3], 1)));
        const precioEnUsdFlag = String(row[12] || '').trim().toLowerCase();

        let precioSinIVA, iva, totalConIVA, precioUnitario;
        if (precioEnUsdFlag === 'aplica') {
          if (!tcLote) tcLote = getCachedTipoCambio();
          const conv = aplicarConversionUsd(rawPrecioSinIVA, minimo, row, tcLote);
          precioSinIVA = conv.precioSinIVA;
          iva = conv.iva;
          totalConIVA = conv.totalConIVA;
          precioUnitario = conv.precioUnitario;
        } else {
          precioSinIVA = rawPrecioSinIVA;
          iva = parseNumericValue(row[9], precioSinIVA * 0.13);
          totalConIVA = parseNumericValue(row[10], precioSinIVA + iva);
          precioUnitario = parseNumericValue(row[11], totalConIVA / minimo);
        }

        results[requestedKey] = {
          cod: row[0],
          minimo: minimo,
          precioSinIVA: precioSinIVA,
          iva: iva,
          totalConIVA: totalConIVA,
          precioUnitario: precioUnitario
        };
      }

      return successResponse({
        results: results,
        requested: requestedKeys.length,
        found: Object.keys(results).length
      });
    } catch (error) {
      Logger.log('Error en buscarProductosLote:', error);
      return errorResponse('Error buscando productos en lote: ' + error);
    }
  }

  function guardarCotizacion(vendedor, cliente, productos, total, tipoCambio) {
    try {
      if (!vendedor || !cliente) {
        return errorResponse('Vendedor y cliente requeridos');
      }

      const sheet = ensureHistorialSheet();
      
      const now = new Date();
      const fecha = now.toLocaleString('es-ES');
      const consecutivo = generateHistorialConsecutive(sheet, vendedor, now);
      const productosJSON = typeof productos === 'string' ? productos : JSON.stringify(productos || []);
      const row = [consecutivo, fecha, vendedor, cliente, productosJSON, total || 0, tipoCambio || 512];

      sheet.appendRow(row);
      Logger.log('✅ Cotización guardada:', row);

      return successResponse({
        success: true,
        message: 'Cotización guardada exitosamente',
        timestamp: fecha,
        consecutivo: consecutivo
      });
    } catch (error) {
      Logger.log('Error en guardarCotizacion:', error);
      return errorResponse('Error guardando cotización: ' + error);
    }
  }

  // ============ FUNCIONES HELPER ============

  function ensureHistorialSheet() {
    const sheet = getOrCreateSheet(SHEET_NAMES.historial);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HISTORIAL_HEADERS);
      return sheet;
    }

    const currentHeader = sheet.getRange(1, 1, 1, Math.max(2, sheet.getLastColumn())).getValues()[0];
    const firstHeader = String(currentHeader[0] || '').trim().toLowerCase();
    const secondHeader = String(currentHeader[1] || '').trim().toLowerCase();

    // Migrar formato antiguo: [Fecha, Vendedor, ...] -> [Consecutivo, Fecha, Vendedor, ...]
    if (firstHeader === 'fecha' && secondHeader === 'vendedor') {
      sheet.insertColumnBefore(1);
    }

    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
    return sheet;
  }

  function generateHistorialConsecutive(sheet, vendedor, dateObj) {
    const vendorCode = buildVendorCode(vendedor);
    const dateCode = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'ddMM');
    const prefix = vendorCode + dateCode;

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return prefix + '01';
    }

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let maxSequence = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i][0] || '').trim().toUpperCase();
      if (!id || id.indexOf(prefix) !== 0) {
        continue;
      }

      const suffix = parseInt(id.slice(prefix.length), 10);
      if (!isNaN(suffix) && suffix > maxSequence) {
        maxSequence = suffix;
      }
    }

    return prefix + String(maxSequence + 1).padStart(2, '0');
  }

  function buildVendorCode(vendedor) {
    const normalized = String(vendedor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    return (normalized + 'XXX').slice(0, 3);
  }

  function parseNumericValue(value, defaultValue) {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    if (typeof value === 'number') {
      return value;
    }

    let str = String(value).trim().replace(/[₡$\s]/g, '');

    if (str.includes('.') && str.includes(',')) {
      if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
        // Formato tipo 419.084,72
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato tipo 419,084.72
        str = str.replace(/,/g, '');
      }
    } else if (str.includes(',')) {
      str = str.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
      // Formato miles con punto y sin decimales, ej: 370.871
      str = str.replace(/\./g, '');
    } else {
      str = str.replace(/,/g, '');
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  function normalizeSheetText(value) {
    return String(value || "").trim();
  }

  function normalizeComparableText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase()
      .trim();
  }

  function successResponse(data) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        data: data
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function errorResponse(message) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  function initializeSpreadsheet() {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      Logger.log('🔧 Inicializando spreadsheet...');

      // Crear/obtener todas las hojas
      const dbSheet = getOrCreateSheet(SHEET_NAMES.baseDatos);
      const vendSheet = getOrCreateSheet(SHEET_NAMES.vendedores);
      const condSheet = getOrCreateSheet(SHEET_NAMES.condiciones);
      const configSheet = getOrCreateSheet(SHEET_NAMES.configuracion);
      const histSheet = getOrCreateSheet(SHEET_NAMES.historial);

      // Inicializar BaseDatos
      if (dbSheet.getLastRow() === 0) {
        const headers = ['Cod', 'Producto', 'Tamaño', 'Minimo', 'Impresion1', 'Impresion2', 'Material', 'PrecioSinIVA', 'UnitSinIVA', 'IVA', 'TotalConIVA', 'TotalUnitConIVA'];
        dbSheet.appendRow(headers);

        const ejemplos = [
          [1, 'Bolsas Papel', '1/2', 4000, 'Full Color 25% Área', '1 Cara', 'Papel', 370871.43],
          [2, 'Bolsas Papel', '1', 3000, 'Full Color 25% Área', '1 Cara', 'Papel', 450000],
          [3, 'Bolsas Papel', '2', 2500, 'Full Color 25% Área', '1 Cara', 'Papel', 520000],
          [4, 'Fundas', '6x10', 5000, 'Full Color', '1 Cara', 'BOPP Perlado', 600000],
          [5, 'Fundas', '8x12', 4000, 'Full Color', '2 Cara', 'BOPP Perlado', 750000],
          [6, 'Bandejas', 'Papa Grande', 3000, '1 Color', '1 Cara', 'Cartón', 400000],
        ];

        ejemplos.forEach((row, index) => {
          const rowNum = index + 2;
          const fullRow = row.concat([
            `=H${rowNum}/D${rowNum}`,
            `=H${rowNum}*0.13`,
            `=H${rowNum}+J${rowNum}`,
            `=K${rowNum}/D${rowNum}`
          ]);
          dbSheet.appendRow(fullRow);
        });
      }

      // Inicializar Vendedores
      if (vendSheet.getLastRow() === 0) {
        vendSheet.appendRow(['Nombre', 'WhatsApp', 'Email']);
        const vendedores = [
          ['Stephanie Gonzalez', '7004-9754', 'stephanie@empresa.com'],
          ['Alonso Jimenez', '7118-5913', ''],
          ['Aaron Soto', '7118-3987', ''],
          ['Nelson Mora', '7193-3326', ''],
          ['Emanuel Bustos', '7176-1040', ''],
          ['Juan Pablo Herrera', '', ''],
          ['Julián Salazar', '', ''],
          ['Diego Segura', '7111-3101', ''],
          ['Jordan Chacón', '7300-7552', ''],
          ['Carlos Mejia', '7004-9774', '']
        ];
        vendedores.forEach(row => vendSheet.appendRow(row));
      }

      // Inicializar Condicionesz
      if (condSheet.getLastRow() === 0) {
        condSheet.appendRow(['Articulo', 'Condiciones']);
        const condiciones = [
          ['Bolsas Papel', 'Impresión Pequeña escala:\n- Área de impresión 25% de la cara a imprimir\n- Impresión a una o dos caras según preferencia\n- Forma de pago: Adelanto 50% y 50% contra entrega\n- Tiempo de entrega: 15 días después de aprobado el arte'],
          ['Fundas', '- Impresión a una o dos caras según preferencia\n- Forma de pago: Adelanto 50% y 50% contra entrega\n- Tiempo de entrega: 22 días\n- Una sola entrega\n- En la producción puede salir un +/- 5%'],
          ['Bandejas', '- Tiempo de entrega: 30 a 45 días\n- Forma de pago: Adelanto 50% y 50% contra entrega']
        ];
        condiciones.forEach(row => condSheet.appendRow(row));
      }

      // Inicializar Configuracion
      if (configSheet.getLastRow() === 0) {
        configSheet.appendRow(['Parametro', 'Valor']);
        configSheet.appendRow(['TipoCambio', 512]);
        configSheet.appendRow(['IVA', 0.13]);
        configSheet.appendRow(['NombreEmpresa', 'Empaques Belén']);
        configSheet.appendRow(['Telefono', '(506) 2438-5119 / 2438-0930']);
        configSheet.appendRow(['Direccion', 'San Rafael, Alajuela, Costa Rica']);
        configSheet.appendRow(['CedulaJuridica', '3-101-135332']);
      }

      // Inicializar Historial
      if (histSheet.getLastRow() === 0) {
        histSheet.appendRow(HISTORIAL_HEADERS);
      }

      Logger.log('✅ Spreadsheet inicializado correctamente');
      return true;
    } catch (error) {
      Logger.log('❌ Error inicializando spreadsheet:', error);
      return false;
    }
  } 