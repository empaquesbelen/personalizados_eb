import { defineConfig } from 'vitest/config';

// Config de tests de la RAÍZ (suite de QA: dominio + security rules).
// La app (app/) tiene su propio toolchain; esto NO la afecta.
export default defineConfig({
  // Dedupe firebase a UNA sola copia. `app/` tiene su propio node_modules/firebase,
  // así que sin esto `vi.mock('firebase/firestore')` (registrado contra la copia de
  // la raíz) NO intercepta los imports hechos desde app/src (que usan la copia de
  // app/). Con el dedupe ambos resuelven a la copia de la raíz y el mock aplica.
  // Los tests de reglas ya usaban la copia de la raíz: para ellos es un no-op.
  resolve: { dedupe: ['firebase'] },
  test: {
    include: ['tests/**/*.test.js'],
    // Holgado para el arranque/latencia del emulador de Firestore.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
