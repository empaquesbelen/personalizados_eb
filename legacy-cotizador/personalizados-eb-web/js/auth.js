// ============================================
// AUTENTICACIÓN Y SESIÓN
// ============================================

import { getSessionData, saveSessionData, clearSession } from './utils.js';

/**
 * Verificar si hay sesión activa
 */
export function isLoggedIn() {
  return getSessionData() !== null;
}

/**
 * Obtener vendedor de la sesión actual
 */
export function getCurrentVendor() {
  const session = getSessionData();
  return session ? session.vendor : null;
}

/**
 * Iniciar sesión (seleccionar vendedor)
 */
export function login(vendor) {
  if (!vendor || !vendor.nombre) {
    throw new Error('Datos de vendedor inválidos');
  }

  const sessionData = {
    vendor: vendor,
    loginTime: new Date().toISOString()
  };

  saveSessionData(sessionData);
  console.log('Sesión iniciada:', vendor.nombre);
}

/**
 * Cerrar sesión
 */
export function logout() {
  const vendor = getCurrentVendor();
  clearSession();
  console.log('Sesión cerrada:', vendor ? vendor.nombre : 'desconocido');
}

/**
 * Redirigir a login si no hay sesión
 */
export function requireLogin() {
  if (!isLoggedIn()) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

/**
 * Redirigir a dashboard si ya hay sesión
 */
export function requireLogout() {
  if (isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return false;
  }
  return true;
}

/**
 * Obtener duración de sesión en minutos
 */
export function getSessionDuration() {
  const session = getSessionData();
  if (!session) return 0;

  const loginTime = new Date(session.loginTime);
  const now = new Date();
  return Math.floor((now - loginTime) / (1000 * 60));
}

/**
 * Exportar información de sesión para debugging
 */
export function debugSession() {
  const session = getSessionData();
  console.log('Session Debug:', {
    isLoggedIn: isLoggedIn(),
    vendor: session ? session.vendor.nombre : null,
    duration: getSessionDuration() + ' min',
    sessionData: session
  });
}
