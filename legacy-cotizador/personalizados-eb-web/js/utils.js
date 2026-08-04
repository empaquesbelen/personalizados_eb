// ============================================
// UTILIDADES GENERALES
// ============================================

import { CACHE_CONFIG, LOCALE_CONFIG, MESSAGES, VALIDATION_CONFIG } from './config.js';

/**
 * Formatear número como moneda
 */
export function formatCurrency(amount, decimals = 2) {
  if (isNaN(amount)) return 'CRC 0,00';
  return 'CRC ' + parseFloat(amount).toLocaleString('es-CR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formatear número con separadores
 */
export function formatNumber(amount, decimals = 0) {
  if (isNaN(amount)) return '0';
  return parseFloat(amount).toLocaleString('es-CR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/**
 * Formatear fecha a string
 */
export function formatDate(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${year}-${month}-${day}`;
}

/**
 * Formatear fecha para mostrar en UI
 */
export function formatDateDisplay(date = new Date()) {
  const d = new Date(date);
  return d.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Generar número de cotización único
 */
export function generateQuotationNumber() {
  const date = new Date();
  const dateStr = String(date.getTime()).slice(-6); // últimos 6 dígitos del timestamp
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return dateStr + random;
}

/**
 * Guardar en localStorage con timestamp
 */
export function saveToCache(key, data) {
  const cacheData = {
    data: data,
    timestamp: Date.now()
  };
  try {
    localStorage.setItem(key, JSON.stringify(cacheData));
    return true;
  } catch (error) {
    console.warn('Error guardando en caché:', error);
    return false;
  }
}

/**
 * Recuperar del localStorage si no ha expirado
 */
export function getFromCache(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);
    const age = Date.now() - cacheData.timestamp;

    if (age > CACHE_CONFIG.ttl) {
      localStorage.removeItem(key);
      return null;
    }

    return cacheData.data;
  } catch (error) {
    console.warn('Error leyendo caché:', error);
    return null;
  }
}

/**
 * Limpiar todo el caché
 */
export function clearAllCache() {
  try {
    Object.values(CACHE_CONFIG.keys).forEach(key => {
      if (typeof key === 'string' && !key.includes('_')) {
        localStorage.removeItem(key);
      }
    });
    return true;
  } catch (error) {
    console.warn('Error limpiando caché:', error);
    return false;
  }
}

/**
 * Validar nombre del cliente
 */
export function validateClientName(name) {
  const trimmed = name.trim();
  if (trimmed.length < VALIDATION_CONFIG.minClientNameLength) {
    return { valid: false, error: 'Nombre muy corto' };
  }
  if (trimmed.length > VALIDATION_CONFIG.maxClientNameLength) {
    return { valid: false, error: 'Nombre muy largo' };
  }
  if (!/^[a-zA-Z0-9\s\-ñáéíóúÑÁÉÍÓÚ]+$/.test(trimmed)) {
    return { valid: false, error: 'Caracteres no válidos' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validar cantidad
 */
export function validateQuantity(quantity, minimum = 1) {
  const q = parseInt(quantity);
  if (isNaN(q)) return { valid: false, error: 'Cantidad debe ser numérica' };
  if (q < minimum) return { valid: false, error: `Mínimo: ${minimum}` };
  if (q > VALIDATION_CONFIG.maxQuantity) return { valid: false, error: 'Cantidad muy alta' };
  return { valid: true, value: q };
}

/**
 * Validar tipo de cambio
 */
export function validateExchangeRate(rate) {
  const r = parseFloat(rate);
  if (isNaN(r)) return { valid: false, error: 'Tipo de cambio debe ser numérico' };
  if (r < VALIDATION_CONFIG.exchangeRateMin || r > VALIDATION_CONFIG.exchangeRateMax) {
    return { valid: false, error: `Rango: ${VALIDATION_CONFIG.exchangeRateMin}-${VALIDATION_CONFIG.exchangeRateMax}` };
  }
  return { valid: true, value: r };
}

/**
 * Mostrar alerta en la UI
 */
export function showAlert(message, type = 'info', duration = 5000) {
  const alertEl = document.getElementById('alert-container');
  if (!alertEl) {
    console.warn('Alert container no encontrado');
    return;
  }

  const alert = document.createElement('div');
  alert.className = `alert alert-${type} show`;
  alert.innerHTML = `
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:inherit;font-weight:bold;">×</button>
  `;

  alertEl.appendChild(alert);

  if (duration > 0 && type !== 'danger') {
    setTimeout(() => {
      alert.classList.remove('show');
      setTimeout(() => alert.remove(), 300);
    }, duration);
  }
}

/**
 * Mostrar modal de confirmación
 */
export function showConfirmModal(message, onConfirm, onCancel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const content = modal.querySelector('.modal-content');

    content.innerHTML = `
      <h2>Confirmar</h2>
        <div style="margin-bottom: 20px; color: #555;">${message}</div>
      <div class="modal-buttons">
          <button class="btn btn-cancel" id="btn-cancel">Cancelar</button>
        <button class="btn btn-primary" id="btn-confirm">Confirmar</button>
      </div>
    `;

      const btnConfirm = document.getElementById('btn-confirm');
      const btnCancel = document.getElementById('btn-cancel');

      function handleModalKey(e) {
        if (e.key === 'Escape') { btnCancel.click(); }
        if (e.key === 'Tab') {
          e.preventDefault();
          (document.activeElement === btnConfirm ? btnCancel : btnConfirm).focus();
        }
      }
      modal.addEventListener('keydown', handleModalKey);

      btnConfirm.addEventListener('click', () => {
        modal.classList.remove('show');
        modal.removeEventListener('keydown', handleModalKey);
        resolve(true);
        if (onConfirm) onConfirm();
      });

      btnCancel.addEventListener('click', () => {
        modal.classList.remove('show');
        modal.removeEventListener('keydown', handleModalKey);
        resolve(false);
        if (onCancel) onCancel();
      });

      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.classList.add('show');
      setTimeout(() => btnCancel.focus(), 50);
  });
}

/**
 * Debounce para ejecutar función después de X ms de inactividad
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle para ejecutar función máximo una vez cada X ms
 */
export function throttle(func, limit = 300) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Sanitizar input para prevenir XSS
 */
export function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = String(input);
  return div.innerHTML;
}

/**
 * Obtener datos de sesión del usuario
 */
export function getSessionData() {
  const session = sessionStorage.getItem('session_vendor');
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

/**
 * Guardar datos de sesión
 */
export function saveSessionData(vendor) {
  sessionStorage.setItem('session_vendor', JSON.stringify(vendor));
}

/**
 * Limpiar sesión
 */
export function clearSession() {
  sessionStorage.removeItem('session_vendor');
}

/**
 * Descargar JSON como archivo
 */
export function downloadJSON(data, filename = 'data.json') {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copiar al portapapeles
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn('Error copiando al portapapeles:', error);
    return false;
  }
}

/**
 * Esperar X milisegundos
 */
export function sleep(ms = 1000) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detener propagación de eventos
 */
export function stopPropagation(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
}

/**
 * Crear un UUID simple
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
