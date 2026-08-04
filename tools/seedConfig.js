// ============================================
// Seed inicial de config/general (Admin SDK)
// Uso: node tools/seedConfig.js
// ============================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const key = JSON.parse(
  readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)),
);

initializeApp({ credential: cert(key) });
const db = getFirestore();

const config = {
  // Datos de empresa (heredados del sistema legacy)
  nombreEmpresa: 'Empaques Belén',
  telefono: '(506) 2438-5119 / 2438-0930',
  direccion: 'San Rafael, Alajuela, Costa Rica',
  cedulaJuridica: '3-101-135332',
  // Parámetros de cálculo
  iva: 0.13,
  // Tipo de cambio manual editable por admin (fallback mientras se resuelve BCCR)
  tipoCambioManual: 512,
  tipoCambioFuente: 'manual',
  actualizadoEn: FieldValue.serverTimestamp(),
};

await db.doc('config/general').set(config, { merge: true });
console.log('✅ config/general creado/actualizado en Firestore.');
process.exit(0);
