// ============================================
// Servicio de usuarios (Firestore + Auth) — gestión por el superadmin.
// ------------------------------------------------------------
// Plan Spark (sin Cloud Functions / Admin SDK): la cuenta de Auth se crea
// desde el cliente con el PATRÓN DE APP SECUNDARIA para NO cerrar la sesión
// del superadmin. `createUserWithEmailAndPassword` inicia sesión al usuario
// nuevo en la instancia de Auth donde se llama; si se usara la instancia
// PRIMARIA, el superadmin quedaría deslogueado. Por eso se crea en una app
// Firebase aparte ('secundaria'), se toma el uid y se cierra su sesión.
// El perfil `usuarios/{uid}` se escribe con la instancia PRIMARIA (`db`).
//
// NOTA: en el cliente NO se pueden borrar cuentas de Auth de terceros (eso
// requiere Admin SDK). El "borrado" seguro es `activo:false` (soft-delete):
// las Security Rules bloquean a los usuarios inactivos. Regla Absoluta #7.
// ============================================
import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '../lib/firebase';

const NOMBRE_APP_SECUNDARIA = 'secundaria';

/**
 * Devuelve la instancia de Auth de la app SECUNDARIA (la crea la primera vez,
 * la reutiliza después con getApp/getApps). Aislada de la app primaria: crear
 * o cerrar sesión aquí NO afecta la sesión del superadmin.
 */
function getAuthSecundaria() {
  const existente = getApps().find((a) => a.name === NOMBRE_APP_SECUNDARIA);
  const secondary = existente || initializeApp(firebaseConfig, NOMBRE_APP_SECUNDARIA);
  return getAuth(secondary);
}

/**
 * Crea un usuario nuevo: cuenta de Auth (app secundaria) + perfil en Firestore
 * (app primaria). La sesión del superadmin queda intacta.
 *
 * @param {{nombre:string, email:string, password:string, rol:string, creadoPor:string}} datos
 * @returns {Promise<string>} uid del usuario creado.
 * @throws el error de Firebase Auth/Firestore original (conserva `.code` para
 *         que la UI muestre un mensaje en español).
 */
export async function crearUsuario({ nombre, email, password, rol, creadoPor }) {
  const auth2 = getAuthSecundaria();

  // 1) Crear la cuenta de Auth en la app secundaria (esto la deja "logueada"
  //    en auth2, nunca en la app primaria del superadmin).
  const cred = await createUserWithEmailAndPassword(auth2, email.trim(), password);
  const uid = cred.user.uid;

  try {
    // 2) Escribir el perfil con la instancia PRIMARIA (db). Autorizado por las
    //    reglas: solo el superadmin puede crear en `usuarios`.
    await setDoc(doc(db, 'usuarios', uid), {
      nombre: nombre.trim(),
      email: email.trim(),
      rol,
      activo: true,
      createdAt: serverTimestamp(),
      creadoPor: creadoPor || null,
    });
  } finally {
    // 3) Cerrar la sesión de la app SECUNDARIA pase lo que pase (aunque el
    //    setDoc falle). La primaria (superadmin) no se toca.
    await signOut(auth2).catch(() => {});
  }

  return uid;
}

/**
 * Actualiza el perfil de un usuario (rol y/o estado activo). No toca Auth.
 * @param {string} uid
 * @param {{rol?:string, activo?:boolean}} cambios
 */
export async function actualizarUsuario(uid, cambios = {}) {
  const datos = {};
  if (cambios.rol !== undefined) datos.rol = cambios.rol;
  if (cambios.activo !== undefined) datos.activo = cambios.activo;
  if (Object.keys(datos).length === 0) return;
  await updateDoc(doc(db, 'usuarios', uid), datos);
}
