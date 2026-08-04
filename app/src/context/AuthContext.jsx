// ============================================
// Contexto de autenticación y perfil (rol)
// ============================================
import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // usuario de Firebase Auth
  const [perfil, setPerfil] = useState(null); // documento usuarios/{uid}
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // Volvemos a "cargando" en CADA cambio de sesión (login/logout): así, entre
      // que Auth confirma el usuario y que llega su perfil (rol) de Firestore, el
      // guard muestra el spinner en vez de "Cuenta sin acceso" por un instante.
      // onAuthStateChanged solo dispara en alta/baja de sesión (no en refresh de
      // token), así que esto no provoca parpadeos periódicos.
      setCargando(true);
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'usuarios', u.uid));
          setPerfil(snap.exists() ? { id: u.uid, ...snap.data() } : null);
        } catch (e) {
          console.error('Error cargando perfil de usuario:', e);
          setPerfil(null);
        }
      } else {
        setPerfil(null);
      }
      setCargando(false);
    });
    return unsub;
  }, []);

  // recordar=true → la sesión persiste aunque se cierre el navegador (hasta
  // cerrar sesión manualmente). recordar=false → dura solo la pestaña actual.
  const login = async (email, password, recordar = true) => {
    await setPersistence(
      auth,
      recordar ? browserLocalPersistence : browserSessionPersistence,
    );
    return signInWithEmailAndPassword(auth, email, password);
  };
  const logout = () => signOut(auth);

  const value = {
    user,
    perfil,
    rol: perfil?.rol || null,
    activo: perfil?.activo !== false, // si no existe el campo, se asume activo
    cargando,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
