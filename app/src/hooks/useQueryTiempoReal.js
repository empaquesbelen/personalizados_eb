// Hook genérico: suscribe una query de Firestore en tiempo real.
// IMPORTANTE: memoizá la query (useMemo) en el componente para no re-suscribir en cada render.
import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

export function useQueryTiempoReal(q) {
  const [docs, setDocs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!q) {
      setCargando(false);
      return;
    }
    setCargando(true);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCargando(false);
      },
      (err) => {
        console.error('Error en query tiempo real:', err);
        setError(err);
        setCargando(false);
      },
    );
    return unsub;
  }, [q]);

  return { docs, cargando, error };
}
