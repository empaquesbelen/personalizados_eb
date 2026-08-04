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
// cerrar la sesión del superadmin — ver services/usuarios.js). El resto del
// archivo no cambia.
export const firebaseConfig = {
  apiKey: 'AIzaSyDHgCSDEC5ZH_p9kRfwfxqwxhAFTvAcGYM',
  authDomain: 'cotizador-personalizados.firebaseapp.com',
  projectId: 'cotizador-personalizados',
  storageBucket: 'cotizador-personalizados.firebasestorage.app',
  messagingSenderId: '983088483881',
  appId: '1:983088483881:web:f20a130c17c5d490a2d638',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
