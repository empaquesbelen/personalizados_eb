// ============================================
// FORMULARIO PRINCIPAL Y LÓGICA DEL DASHBOARD
// ============================================

import { getVendores, getProductos, getTamanos, getOpciones, getCatalogoBusqueda, getCondiciones, getConfiguracion, guardarCotizacion, getHistorial, initializeSheets } from './api.js';
import { calculateProductPrice, calculateQuotationTotals, convertToUSD, validateCompleteQuotation, preloadProductBasePrices } from './calculator.js';
import { generateQuotationPDF } from './pdf-generator.js?v=20260430a';
import {
  formatCurrency, formatDate, formatNumber, formatDateDisplay,
  generateQuotationNumber, showAlert, showConfirmModal,
  validateClientName, sanitizeInput,
  debounce
} from './utils.js';

// Estado global del formulario
let formState = {
  productos: [],
  clientName: '',
  contact: '',
  exchangeRate: 512,
  companyInfo: {},
  rowCounter: 0,
  currentVendor: null,
  lastConditionsSignature: ''
};

let searchState = {
  catalogo: [],
  filtered: [],
  selected: {}
};

let uiState = {
  summaryReviewed: false,
  quotationGenerated: false,
  bulkAdding: false,
  pendingSummaryRefresh: false
};

const CARLOS_VENDOR_NAME = 'carlos mejia';
const CARLOS_VENDOR_PASSWORD = 'CarM26';

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isCarlosVendor(vendor) {
  return normalizeName(vendor && vendor.nombre) === CARLOS_VENDOR_NAME;
}

function canUseFreeQuantity() {
  return isCarlosVendor(formState.currentVendor);
}

function sanitizeQuantityValue(rawValue) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return 0;

  const integerValue = Math.floor(Math.abs(numeric));
  const MAX_QTY = 1000000000;
  return Math.min(integerValue, MAX_QTY);
}

function getRowMinAndStep(row, quantityInput) {
  const minQty = Math.max(1, parseInt(row.dataset.minQuantity || quantityInput.min || '1', 10) || 1);
  const stepQty = Math.max(1, parseInt(row.dataset.quantityStep || minQty, 10) || minQty);
  return { minQty, stepQty };
}

function enforceRowQuantityRules(row, preferredQuantity = null) {
  if (!row) return;

  const quantityInput = row.querySelector('.cantidad-input');
  if (!quantityInput) return;

  const currentRaw = preferredQuantity !== null && preferredQuantity !== undefined
    ? preferredQuantity
    : quantityInput.value;
  const current = sanitizeQuantityValue(currentRaw);

  if (canUseFreeQuantity()) {
    const qty = Math.max(1, current || 1);
    quantityInput.min = '1';
    quantityInput.step = '1';
    quantityInput.dataset.stepValue = '1';
    quantityInput.value = String(qty);
    return qty;
  }

  const { minQty, stepQty } = getRowMinAndStep(row, quantityInput);

  let qty = current;
  if (qty < minQty) qty = minQty;

  if (stepQty > 1) {
    // Redondear hacia arriba para cumplir el salto sin quedar bajo lo ingresado.
    qty = Math.ceil(qty / stepQty) * stepQty;
    if (qty < minQty) qty = minQty;
  }

  quantityInput.min = String(minQty);
  quantityInput.step = String(stepQty);
  quantityInput.dataset.stepValue = String(stepQty);
  quantityInput.value = String(qty);
  return qty;
}

function nudgeRowQuantityByStep(row, direction) {
  if (!row || (direction !== 1 && direction !== -1)) return;

  const quantityInput = row.querySelector('.cantidad-input');
  if (!quantityInput || quantityInput.disabled) return;

  if (canUseFreeQuantity()) {
    const current = sanitizeQuantityValue(quantityInput.value) || 1;
    const next = Math.max(1, current + direction);
    quantityInput.value = String(next);
    calculateRowTotal(row);
    return;
  }

  const { minQty, stepQty } = getRowMinAndStep(row, quantityInput);
  const current = enforceRowQuantityRules(row);
  const next = direction > 0
    ? current + stepQty
    : Math.max(minQty, current - stepQty);

  quantityInput.value = String(next);
  enforceRowQuantityRules(row, next);
  calculateRowTotal(row);
}

function applyQuantityRulesToAllRows() {
  const rows = document.querySelectorAll('.product-row');
  rows.forEach((row) => {
    enforceRowQuantityRules(row);
  });
}

function updateQuickStepsProgress() {
  const step1 = document.getElementById('quick-step-1');
  const step2 = document.getElementById('quick-step-2');
  const step3 = document.getElementById('quick-step-3');
  const step4 = document.getElementById('quick-step-4');

  const hasClient = Boolean((formState.clientName || '').trim());
  const hasVendor = Boolean(formState.currentVendor && formState.currentVendor.nombre);
  const hasProducts = Array.isArray(formState.productos) && formState.productos.length > 0;

  if (step1) step1.classList.toggle('completed', hasClient && hasVendor);
  if (step2) step2.classList.toggle('completed', hasProducts);
  if (step3) step3.classList.toggle('completed', hasProducts && uiState.summaryReviewed);
  if (step4) step4.classList.toggle('completed', uiState.quotationGenerated);
}

/**
 * Inicializar el dashboard
 */
export async function initDashboard() {
  try {
    // Configurar eventos
    setupEventListeners();

    // Cargar datos principales y vendedores en paralelo para reducir tiempo inicial
    await Promise.all([
      loadInitialData(),
      loadVendorsDropdown()
    ]);

    updateQuickStepsProgress();

    showAlert('Sistema cargado correctamente', 'success', 3000);
  } catch (error) {
    console.error('Error inicializando dashboard:', error);
    showAlert(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Cargar datos iniciales (config, fecha, tipo de cambio)
 */
async function loadInitialData() {
  try {
    // Cargar configuración, productos y catálogo en paralelo
    const [configResult, productosResult, catalogoResult] = await Promise.allSettled([
      getConfiguracion(),
      getProductos(),
      getCatalogoBusqueda()
    ]);

    let config;
    if (configResult.status === 'fulfilled') {
      config = configResult.value;
    } else {
      console.warn('⚠️ No se pudo obtener configuración del servidor, usando defaults:', configResult.reason);
      config = {
        nombreEmpresa: 'Empaques Belén',
        telefono: '(506) 2438-5119 / 2438-0930',
        direccion: 'San Rafael, Alajuela, Costa Rica',
        cedulaJuridica: '3-101-135332',
        tipoCambio: 512,
        iva: 0.13,
        tipoCambioFuente: 'manual'
      };
    }

    if (productosResult.status === 'fulfilled') {
      window.availableProductos = productosResult.value;
    } else {
      console.error('Error cargando productos:', productosResult.reason);
      window.availableProductos = [];
    }
    formState.companyInfo = {
      nombre: config.nombreEmpresa || 'Empaques Belén',
      telefono: config.telefono || '(506) 2438-5119',
      direccion: config.direccion || 'San Rafael, Alajuela',
      cedula: config.cedulaJuridica || '3-101-135332'
    };

    // Actualizar tipo de cambio en la UI (desde BCCR o valor manual del Sheets)
    const tipoCambio = parseFloat(config.tipoCambio) || 512;
    formState.exchangeRate = tipoCambio;
    const rateInput = document.getElementById('exchange-rate');
    if (rateInput) rateInput.value = String(tipoCambio);
    const rateDisplay = document.querySelector('.exchange-rate-display');
    if (rateDisplay) {
      const fuente = config.tipoCambioFuente === 'BCCR' ? ' (BCCR)' : '';
      rateDisplay.textContent = `CRC ${tipoCambio.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $1${fuente}`;
    }

    const preloadedCatalog = catalogoResult.status === 'fulfilled' ? catalogoResult.value : [];
    await initializeProductSearch(preloadedCatalog);

    console.log('Datos iniciales cargados exitosamente');
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
    throw error;
  }
}

async function initializeProductSearch(preloadedCatalog = null) {
  try {
    const data = Array.isArray(preloadedCatalog) ? preloadedCatalog : await getCatalogoBusqueda();
    const rawCatalog = Array.isArray(data) ? data : [];

    // Precomputar una sola vez el campo normalizado para búsquedas rápidas
    searchState.catalogo = rawCatalog.map(item => {
      const fallbackRaw = `${item.producto || ''} ${item.tamano || ''} ${item.impresion1 || ''} ${item.impresion2 || ''} ${item.material || ''}`;
      return {
        ...item,
        searchableNormalized: item.searchableNormalized || normalizeSearchText(item.searchable || fallbackRaw)
      };
    });

    searchState.filtered = searchState.catalogo.slice(0, 80);
    searchState.selected = {};

    renderSearchFilters(searchState.catalogo);
    renderSearchResults(searchState.filtered);
    renderSelectedItemsCart();
  } catch (error) {
    console.error('Error inicializando buscador de productos:', error);
    showAlert('No se pudo cargar el buscador rápido de productos', 'warning');
  }
}

function createSelectionKey(item) {
  return [item.cod, item.producto, item.tamano, item.impresion1, item.impresion2, item.material].join('|');
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function setSelectSingleValue(selectEl, value, placeholder = '-- Selecciona --') {
  selectEl.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholder;
  selectEl.appendChild(placeholderOption);

  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  selectEl.appendChild(option);
  selectEl.value = value;
}

function lockProductRowInputs(row, minQty = 1) {
  const safeMin = Math.max(1, parseInt(minQty, 10) || 1);
  const selectFields = row.querySelectorAll('select');
  selectFields.forEach(field => {
    field.disabled = true;
    field.setAttribute('aria-disabled', 'true');
    field.title = 'Esta línea fue agregada desde el buscador y no es editable';
  });

  const quantityInput = row.querySelector('.cantidad-input');
  if (quantityInput) {
    quantityInput.disabled = false;
    quantityInput.removeAttribute('aria-disabled');
    quantityInput.title = `Cantidad editable en saltos de ${safeMin}`;
    quantityInput.min = String(safeMin);
    quantityInput.step = String(safeMin);
    quantityInput.dataset.stepValue = String(safeMin);
  }

  row.dataset.quantityStep = String(safeMin);
  row.classList.add('product-row-locked');
  enforceRowQuantityRules(row);
}

function unlockProductRowQuantityInput(row) {
  if (!row) return;

  const quantityInput = row.querySelector('.cantidad-input');
  if (!quantityInput) return;

  quantityInput.disabled = false;
  quantityInput.removeAttribute('aria-disabled');
  enforceRowQuantityRules(row);
}

function renderSearchFilters(catalogo) {
  const codFilter = document.getElementById('search-filter-cod');
  const productFilter = document.getElementById('search-filter-producto');
  const sizeFilter = document.getElementById('search-filter-tamano');
  const materialFilter = document.getElementById('search-filter-material');
  if (!codFilter || !productFilter || !sizeFilter || !materialFilter) return;

  const availableProducts = Array.isArray(window.availableProductos) ? window.availableProductos : [];
  const currentSelection = productFilter.value || '';
  const products = Array.from(new Set([
    ...availableProducts,
    ...catalogo.map(item => item.producto)
  ]))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));

  productFilter.innerHTML = '<option value="">Todos los productos</option>';

  products.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    productFilter.appendChild(option);
  });

  if (currentSelection && products.includes(currentSelection)) {
    productFilter.value = currentSelection;
  }

  // El filtro de tamaño depende del producto/consulta para evitar combinaciones inexistentes.
  updateSearchSizeFilterOptions(catalogo);
  updateSearchMaterialFilterOptions(catalogo);
}

function updateSearchSizeFilterOptions(catalogo, queryNormalized = '') {
  const codFilter = document.getElementById('search-filter-cod');
  const productFilter = document.getElementById('search-filter-producto');
  const sizeFilter = document.getElementById('search-filter-tamano');
  const materialFilter = document.getElementById('search-filter-material');
  if (!codFilter || !productFilter || !sizeFilter || !materialFilter) return;

  const selectedCod = String(codFilter.value || '').trim();
  const selectedProduct = productFilter.value || '';
  const selectedMaterial = materialFilter.value || '';
  const previousSize = sizeFilter.value || '';

  const scoped = catalogo.filter(item => {
    if (selectedCod && !String(item.cod || '').includes(selectedCod)) return false;
    if (selectedProduct && item.producto !== selectedProduct) return false;
    if (selectedMaterial && item.material !== selectedMaterial) return false;
    if (queryNormalized && !item.searchableNormalized.includes(queryNormalized)) return false;
    return true;
  });

  const sizes = Array.from(new Set(scoped.map(item => item.tamano))).sort();
  sizeFilter.innerHTML = '<option value="">Todos los tamaños</option>';

  sizes.forEach(size => {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size;
    sizeFilter.appendChild(option);
  });

  // Si el tamaño actual ya no aplica para el producto/consulta, se limpia automáticamente.
  if (previousSize && sizes.includes(previousSize)) {
    sizeFilter.value = previousSize;
  } else if (previousSize) {
    sizeFilter.value = '';
  }
}

function updateSearchMaterialFilterOptions(catalogo, queryNormalized = '') {
  const codFilter = document.getElementById('search-filter-cod');
  const productFilter = document.getElementById('search-filter-producto');
  const sizeFilter = document.getElementById('search-filter-tamano');
  const materialFilter = document.getElementById('search-filter-material');
  if (!codFilter || !productFilter || !sizeFilter || !materialFilter) return;

  const selectedCod = String(codFilter.value || '').trim();
  const selectedProduct = productFilter.value || '';
  const selectedSize = sizeFilter.value || '';
  const previousMaterial = materialFilter.value || '';

  const scoped = catalogo.filter(item => {
    if (selectedCod && !String(item.cod || '').includes(selectedCod)) return false;
    if (selectedProduct && item.producto !== selectedProduct) return false;
    if (selectedSize && item.tamano !== selectedSize) return false;
    if (queryNormalized && !item.searchableNormalized.includes(queryNormalized)) return false;
    return true;
  });

  const materials = Array.from(new Set(scoped.map(item => item.material).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  materialFilter.innerHTML = '<option value="">Todos los materiales</option>';

  materials.forEach(material => {
    const option = document.createElement('option');
    option.value = material;
    option.textContent = material;
    materialFilter.appendChild(option);
  });

  materialFilter.disabled = materials.length <= 1;

  if (previousMaterial && materials.includes(previousMaterial)) {
    materialFilter.value = previousMaterial;
  } else if (previousMaterial) {
    materialFilter.value = '';
  }
}

function isVasosProduct(item) {
  const normalizedProduct = normalizeSearchText(item && item.producto);
  return normalizedProduct.includes('vaso');
}

function getVasosTemperatureRank(item) {
  const combined = normalizeSearchText(
    `${item?.impresion1 || ''} ${item?.impresion2 || ''} ${item?.material || ''}`
  );

  if (combined.includes('caliente')) return 0;
  if (combined.includes('frio') || combined.includes('fria')) return 1;
  return 2;
}

function getColorCountRank(item) {
  const combinedRaw = `${item?.impresion1 || ''} ${item?.impresion2 || ''}`;
  const match = combinedRaw.match(/(\d+)\s*color/i);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
}

function sortSearchResults(list) {
  return [...list].sort((a, b) => {
    const aIsVasos = isVasosProduct(a);
    const bIsVasos = isVasosProduct(b);

    // Orden personalizado solo para Vasos.
    if (aIsVasos && bIsVasos) {
      const productCmp = String(a.producto || '').localeCompare(String(b.producto || ''), 'es');
      if (productCmp !== 0) return productCmp;

      const sizeCmp = String(a.tamano || '').localeCompare(String(b.tamano || ''), 'es', { numeric: true });
      if (sizeCmp !== 0) return sizeCmp;

      const tempCmp = getVasosTemperatureRank(a) - getVasosTemperatureRank(b);
      if (tempCmp !== 0) return tempCmp;

      const colorCmp = getColorCountRank(a) - getColorCountRank(b);
      if (colorCmp !== 0) return colorCmp;

      const imp1Cmp = String(a.impresion1 || '').localeCompare(String(b.impresion1 || ''), 'es');
      if (imp1Cmp !== 0) return imp1Cmp;

      const imp2Cmp = String(a.impresion2 || '').localeCompare(String(b.impresion2 || ''), 'es');
      if (imp2Cmp !== 0) return imp2Cmp;

      return String(a.material || '').localeCompare(String(b.material || ''), 'es');
    }

    return 0;
  });
}

function runProductSearch() {
  const query = (document.getElementById('product-search-input')?.value || '').trim();
  const queryNormalized = normalizeSearchText(query);

  updateSearchSizeFilterOptions(searchState.catalogo, queryNormalized);
  updateSearchMaterialFilterOptions(searchState.catalogo, queryNormalized);

  const selectedCod = String(document.getElementById('search-filter-cod')?.value || '').trim();
  const selectedProduct = document.getElementById('search-filter-producto')?.value || '';
  const selectedSize = document.getElementById('search-filter-tamano')?.value || '';
  const selectedMaterial = document.getElementById('search-filter-material')?.value || '';

  const list = searchState.catalogo.filter(item => {
    if (selectedCod && !String(item.cod || '').includes(selectedCod)) return false;
    if (selectedProduct && item.producto !== selectedProduct) return false;
    if (selectedSize && item.tamano !== selectedSize) return false;
    if (selectedMaterial && item.material !== selectedMaterial) return false;
    if (!queryNormalized) return true;

    return item.searchableNormalized.includes(queryNormalized);
  });

  const sortedList = sortSearchResults(list);
  searchState.filtered = sortedList.slice(0, 150);
  renderSearchResults(searchState.filtered);

}

function renderSearchResults(results) {
  const container = document.getElementById('product-search-results');
  if (!container) return;

  if (!results.length) {
    container.innerHTML = '<p class="table-empty-state">No hay coincidencias con esos filtros</p>';
    return;
  }

  container.innerHTML = `
    <table class="search-results-table">
      <thead>
        <tr>
          <th style="width: 40px;">Sel.</th>
          <th style="width: 90px;">Cod</th>
          <th>Coincidencia</th>
          <th style="width: 90px;">Mínimo</th>
        </tr>
      </thead>
      <tbody>
        ${results.map(item => {
          const key = createSelectionKey(item);
          const checked = searchState.selected[key] ? 'checked' : '';
          return `
            <tr>
              <td>
                <input type="checkbox" class="search-item-checkbox" data-key="${sanitizeInput(key)}" ${checked} aria-label="Seleccionar combinación">
              </td>
              <td>${sanitizeInput(item.cod || '')}</td>
              <td>
                <div class="search-row-main">${sanitizeInput(item.producto)} (${sanitizeInput(item.tamano)})</div>
                <div class="search-row-sub">${sanitizeInput(item.impresion1)} · ${sanitizeInput(item.impresion2)} · ${sanitizeInput(item.material)}</div>
              </td>
              <td>${formatNumber(item.minimo || 0)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderSelectedItemsCart() {
  const selectedList = document.getElementById('selected-items-list');
  const selectedCount = document.getElementById('selected-items-count');
  if (!selectedList || !selectedCount) return;

  const selectedItems = Object.values(searchState.selected);
  selectedCount.textContent = `${selectedItems.length} seleccionados`;

  if (!selectedItems.length) {
    selectedList.innerHTML = '<p class="table-empty-state">No hay líneas seleccionadas</p>';
    return;
  }

  selectedList.innerHTML = selectedItems.map(item => `
    <div class="selected-item-pill">
      <strong>${sanitizeInput(item.producto)} (${sanitizeInput(item.tamano)})</strong>
      <span>${sanitizeInput(item.impresion1)} · ${sanitizeInput(item.impresion2)} · ${sanitizeInput(item.material)}</span>
    </div>
  `).join('');
}

async function addSelectedProductsToTable() {
  const selectedItems = Object.values(searchState.selected);
  if (!selectedItems.length) {
    showAlert('Selecciona al menos una combinación en la búsqueda', 'warning');
    return;
  }

  const addBtn = document.getElementById('add-selected-products-btn');
  addBtn.disabled = true;
  const totalItems = selectedItems.length;
  let processedItems = 0;
  const addedRows = [];
  const calculationTasks = [];
  uiState.bulkAdding = true;
  uiState.pendingSummaryRefresh = false;

  const updateAddButtonProgress = () => {
    addBtn.textContent = `Agregando ${processedItems}/${totalItems}...`;
  };

  updateAddButtonProgress();

  try {
    // Precalentar en paralelo para no bloquear el arranque del contador Agregando X/Y.
    const preloadPromise = preloadProductBasePrices(selectedItems)
      .catch((preloadError) => {
        console.warn('No se pudo precargar precios base en lote:', preloadError);
      });

    const MAX_BULK_CONCURRENCY = 6;
    let index = 0;
    const workerCount = Math.min(MAX_BULK_CONCURRENCY, totalItems);
    const workers = Array.from({ length: workerCount }, async () => {
      while (index < totalItems) {
        const currentIndex = index;
        index += 1;

        const item = selectedItems[currentIndex];
        try {
          const result = await addProductRowFromSelection(item, {
            deferSummary: true,
            backgroundCalculate: true,
            preloadPromise: preloadPromise
          });

          if (result && result.row) {
            addedRows.push(result.row);
            if (result.calculationPromise) {
              calculationTasks.push(result.calculationPromise);
            }
          }
        } finally {
          processedItems += 1;
          updateAddButtonProgress();
        }
      }
    });

    await Promise.allSettled(workers);

    searchState.selected = {};
    renderSelectedItemsCart();
    runProductSearch();

    showAlert(`${selectedItems.length} línea(s) agregada(s). Calculando precios...`, 'info', 2200);
    addBtn.textContent = `Calculando precios 0/${calculationTasks.length}...`;

    let completedCalculations = 0;
    await Promise.allSettled(
      calculationTasks.map((task) => task.finally(() => {
        completedCalculations += 1;
        addBtn.textContent = `Calculando precios ${completedCalculations}/${calculationTasks.length}...`;
      }))
    );

    // Un solo recálculo global al finalizar todo el lote.
    await updateQuotationSummary();

    showAlert('Productos agregados', 'success', 2500);
    addedRows.forEach((row) => unlockProductRowQuantityInput(row));
  } catch (error) {
    console.error('Error agregando selección:', error);
    showAlert('No fue posible agregar una o más líneas seleccionadas', 'danger');
    addedRows.forEach((row) => unlockProductRowQuantityInput(row));
    await updateQuotationSummary();
  } finally {
    uiState.bulkAdding = false;
    uiState.pendingSummaryRefresh = false;
    addBtn.disabled = false;
    addBtn.textContent = 'Agregar Seleccionados';
  }
}

async function addProductRowFromSelection(item, options = {}) {
  const row = await addProductRow({ focusFirstField: false });
  if (!row) return;

  const productoSelect = row.querySelector('.producto-select');
  const tamanoSelect = row.querySelector('.tamano-select');
  const impresion1Select = row.querySelector('.impresion1-select');
  const impresion2Select = row.querySelector('.impresion2-select');
  const materialSelect = row.querySelector('.material-select');
  const cantidadInput = row.querySelector('.cantidad-input');

  // Relleno instantáneo (sin pipeline campo-por-campo con múltiples awaits)
  productoSelect.value = item.producto;
  setSelectSingleValue(tamanoSelect, item.tamano, '-- Selecciona tamaño --');
  setSelectSingleValue(impresion1Select, item.impresion1);
  setSelectSingleValue(impresion2Select, item.impresion2);
  setSelectSingleValue(materialSelect, item.material);
  row.dataset.productCod = String(item.cod || '').trim();

  const minQty = Math.max(1, parseInt(item.minimo, 10) || 1);
  row.dataset.minQuantity = String(minQty);
  row.dataset.quantityStep = String(minQty);
  cantidadInput.min = String(minQty);
  cantidadInput.step = String(minQty);
  cantidadInput.value = String(minQty);

  // Bloquear selects de inmediato para evitar cualquier edición temporal.
  lockProductRowInputs(row, minQty);

  // Cantidad no editable hasta que termine de calcularse el precio inicial.
  cantidadInput.disabled = true;
  cantidadInput.setAttribute('aria-disabled', 'true');
  cantidadInput.title = 'Esperando cálculo del precio...';

  const calculationPromise = (async () => {
    // Si hay precarga en curso, aprovecharla antes del cálculo real de la fila.
    if (options.preloadPromise) {
      await options.preloadPromise;
    }

    // Cálculo posterior para mantener la lógica actual de precios y resumen.
    // Se mantiene bloqueada hasta que termine el lote y aparezca el mensaje de éxito.
    await calculateRowTotal(row, false, { deferSummary: Boolean(options.deferSummary) });
    cantidadInput.title = 'Disponible al finalizar "Productos agregados"';
  })();

  if (options.backgroundCalculate) {
    return {
      row,
      calculationPromise
    };
  }

  await calculationPromise;
  return {
    row,
    calculationPromise: null
  };
}

/**
 * Cargar vendedores en el dropdown
 */
async function loadVendorsDropdown() {
  try {
    const vendedores = await getVendores();

    const vendorSelect = document.getElementById('vendor-select');
    vendorSelect.innerHTML = '<option value="">-- Selecciona vendedor --</option>';

    vendedores.forEach(vendor => {
      const option = document.createElement('option');
      option.value = JSON.stringify(vendor);
      option.textContent = vendor.nombre;
      vendorSelect.appendChild(option);
    });

    // Event listener para cambio de vendedor
    let previousVendorValue = '';
    vendorSelect.addEventListener('change', async function() {
      if (this.value) {
        const selectedVendor = JSON.parse(this.value);

        if (isCarlosVendor(selectedVendor)) {
          const entered = window.prompt('Ingresa la contraseña de Carlos Mejia para habilitar su perfil:');
          if (entered !== CARLOS_VENDOR_PASSWORD) {
            showAlert('Contraseña incorrecta para Carlos Mejia', 'danger');
            this.value = previousVendorValue;
            return;
          }
        }

        formState.currentVendor = selectedVendor;
        previousVendorValue = this.value;
        this.closest('.vendor-field').classList.remove('vendor-required-active');
        showAlert(`Vendedor: ${formState.currentVendor.nombre}`, 'success', 2000);
        applyQuantityRulesToAllRows();
        await loadHistory();
      } else {
        formState.currentVendor = null;
        previousVendorValue = '';
        this.closest('.vendor-field').classList.add('vendor-required-active');
        applyQuantityRulesToAllRows();
        await loadHistory();
      }

      updateQuickStepsProgress();
    });
  } catch (error) {
    console.error('Error cargando vendedores:', error);
    showAlert('No fue posible cargar los vendedores', 'warning');
  }
}

/**
 * Agregar fila de producto al formulario
 */
export async function addProductRow(options = {}) {
  try {
    const { focusFirstField = true } = options;
    const productos = window.availableProductos || await getProductos();
    const template = document.getElementById('product-row-template');

    if (!template) {
      showAlert('Error: Template no encontrado', 'danger');
      return;
    }

    // Crear fila nueva
    const newRow = document.createElement('tr');
    newRow.className = 'product-row';
    newRow.dataset.rowId = formState.rowCounter++;
    newRow.innerHTML = template.innerHTML;

    // Agregar a tabla
    const tbody = document.querySelector('#products-table tbody');
      const emptyState = tbody.querySelector('.products-empty-state');
      if (emptyState) emptyState.remove();
    tbody.appendChild(newRow);

    // Configurar eventos de la fila
    setupProductRowEvents(newRow, productos);

    // Actualizar numeración
    updateRowNumbers();

    // Focus en el primer campo
    const productSelect = newRow.querySelector('.producto-select');
    if (focusFirstField && productSelect && !productSelect.disabled) {
      productSelect.focus();
    }
    return newRow;

  } catch (error) {
    console.error('Error agregando fila:', error);
    showAlert(`Error: ${error.message}`, 'danger');
    return null;
  }
}

/**
 * Configurar eventos de una fila de producto
 */
function setupProductRowEvents(row, productos) {
  const productoSelect = row.querySelector('.producto-select');
  const tamanoSelect = row.querySelector('.tamano-select');
  const impresion1Select = row.querySelector('.impresion1-select');
  const impresion2Select = row.querySelector('.impresion2-select');
  const materialSelect = row.querySelector('.material-select');
  const cantidadInput = row.querySelector('.cantidad-input');
  const deleteBtn = row.querySelector('.delete-btn');

  // Populate producto dropdown
  productoSelect.innerHTML = '<option value="">-- Selecciona producto --</option>';
  productos.forEach(p => {
    const option = document.createElement('option');
    option.value = p;
    option.textContent = p;
    productoSelect.appendChild(option);
  });

  // Eventos con debounce
  const updateOpciones = debounce(async () => {
    await updateProductOpciones(row);
  }, 300);

  productoSelect.addEventListener('change', async () => {
    tamanoSelect.innerHTML = '<option value="">-- Cargando --</option>';
    await updateTamanos(row);
    updateOpciones();
  });

  // Tamaño: ejecutar SIN debounce para que opciones estén listas cuando se seleccione Impresión 1
  tamanoSelect.addEventListener('change', async () => {
    await updateProductOpciones(row);
  });

  impresion1Select.addEventListener('change', async function() {
    await updateImpresion2(row);
    await updateMaterials(row);
  });

  impresion2Select.addEventListener('change', async function() {
    await updateMaterials(row);
  });

  // ✅ Calcular cuando se selecciona Material (último campo dependiente)
  materialSelect.addEventListener('change', () => {
    if (cantidadInput.value) {
      calculateRowTotal(row);
    }
  });

  // Calcular en tiempo real cuando cambia cantidad
  cantidadInput.addEventListener('change', () => {
    enforceRowQuantityRules(row);
    calculateRowTotal(row);
  });

  cantidadInput.addEventListener('blur', () => {
    enforceRowQuantityRules(row);
    calculateRowTotal(row);
  });

  cantidadInput.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      nudgeRowQuantityByStep(row, 1);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      nudgeRowQuantityByStep(row, -1);
    }
  });

  // Botón eliminar
  deleteBtn.addEventListener('click', () => {
    row.remove();
      const tbody = document.querySelector('#products-table tbody');
      if (!tbody.querySelector('.product-row')) {
        tbody.innerHTML = '<tr class="products-empty-state"><td colspan="9" class="table-empty-state">Selecciona líneas en el buscador y presiona "Agregar Seleccionados"</td></tr>';
      }
    updateQuotationSummary();
    updateRowNumbers();
  });
}

/**
 * Actualizar tamaños para el producto seleccionado
 */
async function updateTamanos(row) {
  try {
    const productoSelect = row.querySelector('.producto-select');
    const tamanoSelect = row.querySelector('.tamano-select');
    const producto = productoSelect.value;

    if (!producto) {
      tamanoSelect.innerHTML = '<option value="">-- Selecciona producto primero --</option>';
      return;
    }

    tamanoSelect.innerHTML = '<option value="">Cargando tamaños...</option>';
    const tamanos = await getTamanos(producto);

    tamanoSelect.innerHTML = '<option value="">-- Selecciona tamaño --</option>';
    tamanos.forEach(t => {
      const option = document.createElement('option');
      option.value = t;
      option.textContent = t;
      tamanoSelect.appendChild(option);
    });

    // ✅ Auto-select si solo hay un tamaño
    if (tamanos.length === 1) {
      tamanoSelect.value = tamanos[0];
      await updateProductOpciones(row);
    }
  } catch (error) {
    console.error('Error cargando tamaños:', error);
    row.querySelector('.tamano-select').innerHTML = '<option value="">Error cargando</option>';
  }
}

/**
 * Actualizar impresiones y materiales
 */
async function updateProductOpciones(row) {
  try {
    const productoSelect = row.querySelector('.producto-select');
    const tamanoSelect = row.querySelector('.tamano-select');
    const impresion1Select = row.querySelector('.impresion1-select');
    const impresion2Select = row.querySelector('.impresion2-select');
    const materialSelect = row.querySelector('.material-select');

    const producto = productoSelect.value;
    const tamano = tamanoSelect.value;

    if (!producto || !tamano) {
      resetSelects(impresion1Select, impresion2Select, materialSelect);
      return;
    }

    const opciones = await getOpciones(producto, tamano);

    // Guardar selecciones actuales
    const previousImp1 = impresion1Select.value;
    const previousImp2 = impresion2Select.value;

    // Llenar Impresión 1
    impresion1Select.innerHTML = '<option value="">-- Selecciona --</option>';
    (opciones.impresiones1 || []).forEach(imp => {
      const option = document.createElement('option');
      option.value = imp;
      option.textContent = imp;
      impresion1Select.appendChild(option);
    });

    // Restaurar selección anterior de Impresión 1 si existe, o auto-select si solo hay una
    if (previousImp1 && Array.from(impresion1Select.options).some(opt => opt.value === previousImp1)) {
      impresion1Select.value = previousImp1;
    } else if ((opciones.impresiones1 || []).length === 1) {
      // ✅ Auto-select si solo hay una opción
      impresion1Select.value = opciones.impresiones1[0];
    }

    // Llenar Impresión 2 y Materiales según selección actual
    if (impresion1Select.value) {
      const opcionesFiltradas = await getOpciones(producto, tamano, impresion1Select.value);
      impresion2Select.innerHTML = '<option value="">-- Selecciona --</option>';
      (opcionesFiltradas.impresiones2 || []).forEach(imp => {
        const option = document.createElement('option');
        option.value = imp;
        option.textContent = imp;
        impresion2Select.appendChild(option);
      });

      // Restaurar selección anterior de Impresión 2 si existe, o auto-select si solo hay una
      if (previousImp2 && Array.from(impresion2Select.options).some(opt => opt.value === previousImp2)) {
        impresion2Select.value = previousImp2;
      } else if ((opcionesFiltradas.impresiones2 || []).length === 1) {
        // ✅ Auto-select si solo hay una opción
        impresion2Select.value = opcionesFiltradas.impresiones2[0];
      }

      // Llenar Materiales si Impresión 2 se seleccionó
      if (impresion2Select.value) {
        const opcionesMateriales = await getOpciones(producto, tamano, impresion1Select.value, impresion2Select.value);
        materialSelect.innerHTML = '<option value="">-- Selecciona --</option>';
        (opcionesMateriales.materiales || []).forEach(mat => {
          const option = document.createElement('option');
          option.value = mat;
          option.textContent = mat;
          materialSelect.appendChild(option);
        });

        // ✅ Auto-select Material si solo hay una opción
        if ((opcionesMateriales.materiales || []).length === 1) {
          materialSelect.value = opcionesMateriales.materiales[0];
          // Calcular si hay cantidad
          const cantidadInput = row.querySelector('.cantidad-input');
          if (cantidadInput.value) {
            calculateRowTotal(row);
          }
        }
      } else {
        materialSelect.innerHTML = '<option value="">-- Selecciona primero los demás campos --</option>';
      }
    } else {
      impresion2Select.innerHTML = '<option value="">-- Selecciona Impresión 1 primero --</option>';
      materialSelect.innerHTML = '<option value="">-- Selecciona primero los demás campos --</option>';
    }

    // Guardar opciones disponibles en el row (estado inicial)
    row.dataset.availableImp2 = JSON.stringify([]);
    row.dataset.availableMaterials = JSON.stringify([]);
  } catch (error) {
    console.error('Error cargando opciones:', error);
    showAlert('Error cargando opciones', 'danger');
  }
}

/**
 * Actualizar impresiones 2 después de seleccionar impresión 1
 */
async function updateImpresion2(row) {
  const productoSelect = row.querySelector('.producto-select');
  const tamanoSelect = row.querySelector('.tamano-select');
  const impresion1Select = row.querySelector('.impresion1-select');
  const impresion2Select = row.querySelector('.impresion2-select');
  const materialSelect = row.querySelector('.material-select');

  impresion2Select.innerHTML = '<option value="">Cargando opciones...</option>';
    impresion2Select.classList.add('is-loading');
  materialSelect.innerHTML = '<option value="">-- Selecciona Impresión 2 primero --</option>';

  if (!impresion1Select.value) {
    impresion2Select.innerHTML = '<option value="">-- Selecciona Impresión 1 primero --</option>';
      impresion2Select.classList.remove('is-loading');
    row.dataset.availableImp2 = JSON.stringify([]);
    return;
  }

  try {
    const opciones = await getOpciones(
      productoSelect.value,
      tamanoSelect.value,
      impresion1Select.value
    );
    const opciones2 = opciones.impresiones2 || [];

    row.dataset.availableImp2 = JSON.stringify(opciones2);

    impresion2Select.innerHTML = '<option value="">-- Selecciona --</option>';
    if (opciones2.length > 0) {
      opciones2.forEach(imp => {
        const option = document.createElement('option');
        option.value = imp;
        option.textContent = imp;
        impresion2Select.appendChild(option);
      });

      // ✅ Auto-select si solo hay una opción
      if (opciones2.length === 1) {
        impresion2Select.value = opciones2[0];
        // Actualizar materiales en cascada si Impresión 2 fue auto-seleccionada
        await updateMaterials(row);
      }
    } else {
      impresion2Select.innerHTML = '<option value="">Sin opciones para esta Impresión 1</option>';
    }
  } catch (error) {
    console.error('Error cargando Impresión 2:', error);
    impresion2Select.innerHTML = '<option value="">Error cargando</option>';
    } finally {
      impresion2Select.classList.remove('is-loading');
  }
}

/**
 * Actualizar materiales después de seleccionar impresión 2
 */
async function updateMaterials(row) {
  const productoSelect = row.querySelector('.producto-select');
  const tamanoSelect = row.querySelector('.tamano-select');
  const impresion1Select = row.querySelector('.impresion1-select');
  const impresion2Select = row.querySelector('.impresion2-select');
  const materialSelect = row.querySelector('.material-select');

  // Los materiales se cargan en updateProductOpciones, solo necesitamos mostrarlos si Impresión 2 está seleccionada
  if (!impresion1Select.value || !impresion2Select.value) {
    materialSelect.innerHTML = '<option value="">-- Selecciona Impresión 2 primero --</option>';
    row.dataset.availableMaterials = JSON.stringify([]);
    return;
  }

  materialSelect.innerHTML = '<option value="">Cargando materiales...</option>';
  materialSelect.classList.add('is-loading');

  let materials = [];
  try {
    const opciones = await getOpciones(
      productoSelect.value,
      tamanoSelect.value,
      impresion1Select.value,
      impresion2Select.value
    );
    materials = opciones.materiales || [];
    row.dataset.availableMaterials = JSON.stringify(materials);
  } catch (error) {
    console.error('Error cargando materiales:', error);
    materialSelect.innerHTML = '<option value="">Error cargando</option>';
    materialSelect.classList.remove('is-loading');
    return;
  }

  materialSelect.classList.remove('is-loading');
  materialSelect.innerHTML = '<option value="">-- Selecciona --</option>';
  materials.forEach(mat => {
    const option = document.createElement('option');
    option.value = mat;
    option.textContent = mat;
    materialSelect.appendChild(option);
  });

  // ✅ Auto-select si solo hay una opción
  if (materials.length === 1) {
    materialSelect.value = materials[0];
    // Calcular si hay cantidad ingresada
    const cantidadInput = row.querySelector('.cantidad-input');
    if (cantidadInput.value) {
      calculateRowTotal(row);
    }
  }
}

/**
 * Resetear selects a estado inicial
 */
function resetSelects(...selects) {
  selects.forEach(select => {
    select.innerHTML = '<option value="">-- Completa los campos anteriores --</option>';
  });
}

/**
 * Calcular total de una fila
 */
async function calculateRowTotal(row, hasRetried = false, options = {}) {
  if (!row) return;
  const deferSummary = Boolean(options.deferSummary) || uiState.bulkAdding;
  if (row.dataset.isCalculating === '1') {
    row.dataset.pendingRecalc = '1';
    return;
  }

  try {
    row.dataset.isCalculating = '1';
    row.dataset.pendingRecalc = '0';
    const productoSelect = row.querySelector('.producto-select');
    const cantidadInput = row.querySelector('.cantidad-input');
    const priceCell = row.querySelector('.price-cell');

    const producto = productoSelect.value;
    let cantidad = sanitizeQuantityValue(cantidadInput.value);
    const minRequired = Math.max(1, parseInt(row.dataset.minQuantity || '1', 10) || 1);

    if (!producto) {
      priceCell.innerHTML = '';
      delete row.dataset.priceData;
      if (deferSummary) {
        uiState.pendingSummaryRefresh = true;
      } else {
        await updateQuotationSummary();
      }
      return;
    }

    if (cantidad <= 0) {
      priceCell.innerHTML = '';
      delete row.dataset.priceData;
      if (deferSummary) {
        uiState.pendingSummaryRefresh = true;
      } else {
        await updateQuotationSummary();
      }
      return;
    }

    if (cantidad < minRequired) {
      cantidad = minRequired;
      cantidadInput.value = String(minRequired);
    }

    cantidad = enforceRowQuantityRules(row, cantidad);
    const requestedQty = cantidad;

    const calcKey = [
      productoSelect.value,
      row.querySelector('.tamano-select').value,
      row.querySelector('.impresion1-select').value,
      row.querySelector('.impresion2-select').value,
      row.querySelector('.material-select').value,
      cantidad
    ].join('|');

    if (row.dataset.lastCalcKey === calcKey && row.dataset.priceData) {
      return;
    }

    // Indicador visual mientras se consulta/calcula el precio de la línea.
    priceCell.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;vertical-align:middle;margin-right:6px;"></span><span class="price-loading-text">Calculando...</span>';
    priceCell.classList.add('is-calculating');

    // Buscar precio del producto
    const priceData = await calculateProductPrice(
      productoSelect.value,
      row.querySelector('.tamano-select').value,
      row.querySelector('.impresion1-select').value,
      row.querySelector('.impresion2-select').value,
      row.querySelector('.material-select').value,
      cantidad,
      row.dataset.productCod || ''
    );

    // Si el usuario cambió la cantidad mientras se consultaba el precio,
    // descartamos este resultado para no pisar el valor más reciente.
    const latestQty = parseInt(cantidadInput.value, 10) || 0;
    if (latestQty !== requestedQty) {
      row.dataset.pendingRecalc = '1';
      return;
    }

    const currentMin = Math.max(1, parseInt(row.dataset.minQuantity || '1', 10) || 1);
    const minFromPrice = Math.max(1, parseInt(priceData.minimo, 10) || 1);
    const effectiveMin = Math.max(currentMin, minFromPrice);
    row.dataset.minQuantity = String(effectiveMin);
    row.dataset.quantityStep = String(effectiveMin);
    cantidad = enforceRowQuantityRules(row, cantidad);

    if (cantidad < effectiveMin && !hasRetried) {
      cantidadInput.value = String(effectiveMin);
      return calculateRowTotal(row, true);
    }

    // Guardar datos en el row para usarlos después
    row.dataset.priceData = JSON.stringify(priceData);
    row.dataset.lastCalcKey = calcKey;

    // Mostrar total
    priceCell.textContent = formatCurrency(priceData.totalProductoConIVA || 0);
    priceCell.classList.remove('is-calculating');

    // Actualizar resumen general
    if (deferSummary) {
      uiState.pendingSummaryRefresh = true;
    } else {
      await updateQuotationSummary();
    }
  } catch (error) {
    console.error('Error calculando precio:', error);
    const priceCell = row.querySelector('.price-cell');
    priceCell.textContent = '';
    priceCell.classList.remove('is-calculating');
    delete row.dataset.priceData;
    if (deferSummary) {
      uiState.pendingSummaryRefresh = true;
    } else {
      await updateQuotationSummary();
    }

    // Mostrar aviso al usuario con el mensaje de error específico
    showAlert(error.message, 'warning', 5000);
  } finally {
    row.dataset.isCalculating = '0';
    if (row.dataset.pendingRecalc === '1') {
      row.dataset.pendingRecalc = '0';
      // Reintentar con el último valor ingresado por el usuario.
      calculateRowTotal(row, hasRetried, options);
    }
  }
}

/**
 * Actualizar resumen de cotización
 */
async function updateQuotationSummary() {
  try {
    const rows = document.querySelectorAll('.product-row');
    let allProducts = [];

    for (const row of rows) {
      const priceDataStr = row.dataset.priceData;
      if (!priceDataStr) continue;

      const priceData = JSON.parse(priceDataStr);
      const cantidad = parseInt(row.querySelector('.cantidad-input').value) || 0;
      const impresion1 = row.querySelector('.impresion1-select').value;
      const impresion2 = row.querySelector('.impresion2-select').value;
      const material = row.querySelector('.material-select').value;
      const subtotalLinea = priceData.totalProducto || 0;
      const totalLinea = priceData.totalProductoConIVA || 0;
      const ivaLinea = totalLinea - subtotalLinea;

      allProducts.push({
        producto: row.querySelector('.producto-select').value,
        tamano: row.querySelector('.tamano-select').value,
        impresion1: impresion1,
        impresion2: impresion2,
        material: material,
        cantidad: cantidad,
        minimo: priceData.minimo || 0,
        precioSinIVA: subtotalLinea,
        iva: ivaLinea,
        totalConIVA: totalLinea,
        precioUnitario: priceData.precioUnitario || 0,
        precioBaseSinIVA: priceData.precioSinIVA || 0,
        totalBaseConIVA: priceData.totalConIVA || 0,
        totalProductoConIVA: priceData.totalProductoConIVA || 0
      });
    }

    renderSummaryTable(allProducts);

    // Guardar en estado global
    formState.productos = allProducts;

    // Calcular totales
    const totals = calculateQuotationTotals(allProducts);
    const exchangeRate = parseFloat(document.getElementById('exchange-rate').value) || 512;
    const totalUSD = convertToUSD(totals.total, exchangeRate);

    // Actualizar UI
    document.getElementById('subtotal-amount').textContent = formatCurrency(totals.subtotal);
    document.getElementById('tax-amount').textContent = formatCurrency(totals.tax);
    document.getElementById('total-amount').textContent = formatCurrency(totals.total);
    document.getElementById('total-usd-amount').textContent = '$' + totalUSD.toFixed(2);

    // Cargar condiciones por producto y material (si existen en la hoja Condiciones)
    const conditionsSection = document.getElementById('conditions-section');
    if (allProducts.length > 0) {
      if (conditionsSection) conditionsSection.style.display = '';
      const conditionSubjects = collectConditionSubjects(allProducts);
      const signature = conditionSubjects.slice().sort((a, b) => a.localeCompare(b, 'es')).join('|');
      if (signature !== formState.lastConditionsSignature) {
        await loadMultipleConditions(conditionSubjects);
        formState.lastConditionsSignature = signature;
      }
    } else {
      if (conditionsSection) conditionsSection.style.display = 'none';
      document.getElementById('conditions-box').innerHTML = '';
      formState.lastConditionsSignature = '';
    }

    updateQuickStepsProgress();
  } catch (error) {
    console.error('Error actualizando resumen:', error);
  }
}

function renderSummaryTable(products) {
  const summaryTbody = document.getElementById('summary-tbody');
  if (!summaryTbody) return;

  if (!products || products.length === 0) {
    summaryTbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #666;">Agrega productos para ver el resumen</td>
      </tr>
    `;
    return;
  }

  summaryTbody.innerHTML = products.map(item => `
    <tr>
      <td style="text-align: left;">${sanitizeInput(item.producto)} ${item.tamano ? `(${sanitizeInput(item.tamano)})` : ''}</td>
      <td style="text-align: center;">${formatNumber(item.minimo || 0)}</td>
      <td style="text-align: center;">${formatNumber(item.cantidad || 0)}</td>
      <td style="text-align: right;">${formatCurrency(item.precioSinIVA || 0)}</td>
      <td style="text-align: right;">${formatCurrency(item.iva || 0)}</td>
      <td style="text-align: right;">${formatCurrency(item.totalConIVA || 0)}</td>
      <td style="text-align: right;">${formatCurrency(item.precioUnitario || 0, 4)}</td>
    </tr>
  `).join('');
}
/**
 * Cargar condiciones de múltiples productos
 */
async function loadMultipleConditions(productos) {
  try {
    if (!productos || productos.length === 0) {
      document.getElementById('conditions-box').innerHTML = '';
      return;
    }

    const conditionsBox = document.getElementById('conditions-box');
    let allConditionsHTML = '';
    const uniqueSubjects = Array.from(new Set(productos.map(p => String(p || '').trim()).filter(Boolean)));
    const conditionsMap = await getConditionsForProducts(uniqueSubjects);
    const subjectsWithConditions = uniqueSubjects.filter((subject) => String(conditionsMap[subject] || '').trim().length > 0);

    subjectsWithConditions.forEach((subject) => {
      const conditionText = conditionsMap[subject] || '';
      const formattedConditions = String(conditionText)
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('<br>');

      allConditionsHTML += `<div style="margin-bottom: 20px;">
        <h3 style="margin-bottom: 8px;">${subject}</h3>
        <div style="font-size:12px; padding-left: 10px; border-left: 3px solid #ddd;">${formattedConditions}</div>
      </div>`;
    });

    conditionsBox.innerHTML = allConditionsHTML || '<p style="color: #999;">Sin condiciones especiales</p>';
  } catch (error) {
    console.error('Error cargando condiciones:', error);
    document.getElementById('conditions-box').innerHTML = '';
  }
}

/**
 * Cargar condiciones del primer producto (mantener para compatibilidad)
 */
async function loadConditions(producto) {
  await loadMultipleConditions([producto]);

}

function resolveProductConditionSubject(item) {
  const productName = String(item?.producto || '').trim();
  const materialName = String(item?.material || '').trim();
  if (!productName) return '';

  const productNormalized = normalizeSearchText(productName);
  if (!productNormalized.includes('vaso')) {
    return productName;
  }

  const materialNormalized = normalizeSearchText(materialName);
  if (materialNormalized.includes('carton') && materialNormalized.includes('pla')) {
    return 'Vasos Carton + PLA';
  }

  if (materialNormalized.includes('pet')) {
    return 'Vasos Pet';
  }

  if (materialNormalized.includes('carton')) {
    return 'Vasos Carton';
  }

  return productName;
}

function collectConditionSubjects(products) {
  const orderedProducts = [];

  products.forEach((item) => {
    const productName = resolveProductConditionSubject(item);

    if (productName) orderedProducts.push(productName);
  });

  // Mantener orden de aparición solo por producto mapeado a sujeto válido.
  return Array.from(new Set(orderedProducts));
}

async function getConditionsForProducts(productos) {
  const uniqueProductos = Array.from(new Set((productos || []).map(p => String(p || '').trim()).filter(Boolean)));
  const entries = await Promise.all(uniqueProductos.map(async (producto) => {
    try {
      const value = await getCondiciones(producto);
      return [producto, value || ''];
    } catch (error) {
      console.warn('No se pudo obtener condición para', producto, error);
      return [producto, ''];
    }
  }));

  return Object.fromEntries(entries);
}

/**
 * Actualizar numeración de filas
 */
function updateRowNumbers() {
  const rows = document.querySelectorAll('.product-row');
  rows.forEach((row, index) => {
    row.querySelector('.row-number').textContent = index + 1;
  });
}

/**
 * Generar cotización (PDF)
 */
export async function generateQuotation() {
  try {
    // Verificar si hay vendedor seleccionado
    if (!formState.currentVendor) {
      showAlert('Selecciona un vendedor', 'danger');
        document.getElementById('vendor-select').focus();
      return;
    }

    // Validar datos
    const clientValidation = validateClientName(formState.clientName);
    if (!clientValidation.valid) {
      showAlert(`Nombre de cliente: ${clientValidation.error}`, 'danger');
        document.getElementById('client-name').focus();
      return;
    }

    const quotationValidation = validateCompleteQuotation(formState.clientName, formState.productos);
    if (!quotationValidation.valid) {
      quotationValidation.errors.forEach(err => showAlert(err, 'danger'));
      return;
    }

      // Pre-calcular totales para mostrar en el modal de confirmación
      const exchangeRate = parseFloat(document.getElementById('exchange-rate').value);
      const totals = calculateQuotationTotals(formState.productos);
      const totalUSD = convertToUSD(totals.total, exchangeRate);
      const generateBtn = document.getElementById('generate-quotation-btn');

      // Mostrar modal con totales visibles antes de confirmar
      await showConfirmModal(
        `¿Generar cotización para <strong>${sanitizeInput(formState.clientName)}</strong>?<br><br>Total: <strong>${formatCurrency(totals.total)}</strong> &nbsp;/&nbsp; <span style="color:#888;">$${totalUSD.toFixed(2)}</span>`,
        async () => {
          generateBtn.disabled = true;
          generateBtn.textContent = 'Generando PDF...';
          try {
            const quotationNumber = generateQuotationNumber();

            const quotationData = {
              clientName: sanitizeInput(formState.clientName),
              contact: sanitizeInput(formState.contact) || 'N/A',
              productos: formState.productos,
              companyInfo: formState.companyInfo,
              exchangeRate: exchangeRate,
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.total,
              totalUSD: totalUSD,
              quotationNumber: quotationNumber,
              vendor: formState.currentVendor,
              conditions: []
            };

            const conditionSubjects = collectConditionSubjects(formState.productos);
            const conditionsMap = await getConditionsForProducts(conditionSubjects);
            quotationData.conditions = conditionSubjects
              .filter((subject) => String(conditionsMap[subject] || '').trim().length > 0)
              .map((subject) => `${subject}\n${conditionsMap[subject]}`);

            const filename = await generateQuotationPDF(quotationData);

            uiState.quotationGenerated = true;
            updateQuickStepsProgress();

            // Guardar en historial
            try {
              await guardarCotizacion(
                formState.currentVendor.nombre,
                formState.clientName,
                formState.productos,
                totals.total,
                exchangeRate
              );
            } catch (error) {
              console.warn('No se guardó en historial:', error);
            }

            showAlert(`PDF generado: ${filename}`, 'success', 4000);
            loadHistory();
          } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generar Cotización PDF';
          }
        }
      );
  } catch (error) {
    console.error('Error generando cotización:', error);
    showAlert(error.message, 'danger');
  }
}



/**
 * Cargar historial de cotizaciones
 */
async function loadHistory() {
  try {
    if (!formState.currentVendor) {
      document.getElementById('history-container').innerHTML = '<p style="color: #666;">Selecciona un vendedor para ver su historial</p>';
      return;
    }

    const historial = await getHistorial(formState.currentVendor.nombre);
    const historyContainer = document.getElementById('history-container');

    if (!historial || historial.length === 0) {
      historyContainer.innerHTML = '<p style="color: #666;">Sin cotizaciones aún</p>';
      return;
    }

    let html = `
      <table class="history-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
    `;

    historial.slice(0, 10).forEach(item => {
      html += `
        <tr>
          <td>${formatDate(item.fecha || new Date())}</td>
          <td>${sanitizeInput(item.cliente)}</td>
          <td>${formatCurrency(item.total || 0)}</td>
          <td><span style="background:#E8F5E9;color:#2E7D32;padding:4px 8px;border-radius:4px;font-size:11px;">Generada</span></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    historyContainer.innerHTML = html;
  } catch (error) {
    console.error('Error cargando historial:', error);
    document.getElementById('history-container').innerHTML = '<p style="color: #999;">Error cargando historial</p>';
  }
}

/**
 * Configurar eventos del formulario
 */
function setupEventListeners() {
  const debouncedSearch = debounce(runProductSearch, 150);

  // Toggle de resumen (inicia minimizado para reducir saturación visual)
  const summaryToggleBtn = document.getElementById('toggle-summary-btn');
  const summaryContent = document.getElementById('summary-content');
  if (summaryToggleBtn && summaryContent) {
    summaryToggleBtn.addEventListener('click', () => {
      const expanded = summaryToggleBtn.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !expanded;

      summaryToggleBtn.setAttribute('aria-expanded', String(nextExpanded));
      summaryContent.hidden = !nextExpanded;

      const toggleText = summaryToggleBtn.querySelector('.toggle-text');
      if (toggleText) {
        toggleText.textContent = nextExpanded ? 'Minimizar' : 'Expandir';
      }

      if (nextExpanded) {
        uiState.summaryReviewed = true;
        updateQuickStepsProgress();
      }
    });
  }

  // Buscador de combinaciones
  document.getElementById('product-search-input').addEventListener('input', debouncedSearch);
  document.getElementById('search-filter-cod').addEventListener('input', debouncedSearch);
  document.getElementById('search-filter-producto').addEventListener('change', runProductSearch);
  document.getElementById('search-filter-tamano').addEventListener('change', runProductSearch);
  document.getElementById('search-filter-material').addEventListener('change', runProductSearch);

  // Selección de filas desde resultados
  document.getElementById('product-search-results').addEventListener('change', (e) => {
    if (!e.target.classList.contains('search-item-checkbox')) return;
    const key = e.target.dataset.key;
    const found = searchState.catalogo.find(item => createSelectionKey(item) === key);
    if (!found) return;

    if (e.target.checked) {
      searchState.selected[key] = found;
    } else {
      delete searchState.selected[key];
    }
    renderSelectedItemsCart();
  });

  document.getElementById('clear-selected-items-btn').addEventListener('click', () => {
    searchState.selected = {};
    renderSelectedItemsCart();
    runProductSearch();
  });

  document.getElementById('add-selected-products-btn').addEventListener('click', addSelectedProductsToTable);

  // Botón generar cotización
  document.getElementById('generate-quotation-btn').addEventListener('click', generateQuotation);

  

  // Campo nombre del cliente
  const clientNameInput = document.getElementById('client-name');
  clientNameInput.addEventListener('change', function() {
    const validation = validateClientName(this.value);
    formState.clientName = validation.value || '';
    if (!validation.valid) {
      this.classList.add('invalid');
    } else {
      this.classList.remove('invalid');
    }

    updateQuickStepsProgress();
  });

  // Campo contacto
  document.getElementById('client-contact').addEventListener('change', function() {
    formState.contact = this.value;
  });

  // Enforce mínimo permitido por línea en tiempo real
  document.addEventListener('input', function(e) {
    if (!e.target.classList.contains('cantidad-input')) return;
    const row = e.target.closest('.product-row');
    if (!row) return;

    if (e.target.disabled) return;
    const raw = String(e.target.value || '').trim();
    if (!raw) return;

    const sanitized = sanitizeQuantityValue(raw);
    if (sanitized > 0 && String(sanitized) !== raw) {
      e.target.value = String(sanitized);
    }
  });

  document.addEventListener('change', function(e) {
    if (!e.target.classList.contains('cantidad-input')) return;
    const row = e.target.closest('.product-row');
    if (!row) return;
    enforceRowQuantityRules(row);
  });

  document.addEventListener('blur', function(e) {
    if (!e.target.classList || !e.target.classList.contains('cantidad-input')) return;
    const row = e.target.closest('.product-row');
    if (!row) return;
    enforceRowQuantityRules(row);
  }, true);

  // Actualizar dropdowns cuando se selecciona
  document.addEventListener('change', async function(e) {
    if (e.target.classList.contains('impresion1-select')) {
      const row = e.target.closest('.product-row');
      await updateImpresion2(row);
    }
    if (e.target.classList.contains('impresion2-select')) {
      const row = e.target.closest('.product-row');
      await updateMaterials(row);
    }
  });

}

/**
 * Limpiar formulario
 */
export function clearForm() {
  if (confirm('¿Limpiar todos los datos del formulario?')) {
    document.getElementById('client-name').value = '';
    document.getElementById('client-contact').value = '';
    document.querySelector('#products-table tbody').innerHTML = '';
    formState.productos = [];
    updateQuotationSummary();
    showAlert('Formulario limpiado', 'info', 2000);
  }
}
