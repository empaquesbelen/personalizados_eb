// ============================================
// Inicialización de Firebase — proyecto "cotizador-personalizados"
// ============================================
// NOTA DE SEGURIDAD (CLAUDE.md · Regla Absoluta #5):
// La apiKey web es PÚBLICA por diseño; NO es un secreto. La seguridad real
// vive en Firebase Auth + Firestore Security Rules. Las claves de servicio /
// Admin SDK jamás van en este archivo ni en el cliente.

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Se exporta para poder inicializar una app SECUNDARIA (alta de usuarios sin
// cerrar la sesión del superadmin — ver services/usuarios.js).
//
// La config se puede sobreescribir con variables de entorno `VITE_FIREBASE_*`
// (p. ej. en Netlify, para apuntar a otro proyecto sin tocar código). Si no
// están definidas, se usan los valores por defecto de abajo. Recordá: estos
// valores son PÚBLICOS (no secretos) — la seguridad vive en las Rules.
const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyDHgCSDEC5ZH_p9kRfwfxqwxhAFTvAcGYM',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'cotizador-personalizados.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'cotizador-personalizados',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'cotizador-personalizados.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '983088483881',
  appId: env.VITE_FIREBASE_APP_ID || '1:983088483881:web:f20a130c17c5d490a2d638',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
