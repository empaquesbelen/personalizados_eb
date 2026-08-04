// ============================================
// Crea usuarios de PRUEBA (uno por rol) para exercitar el flujo.
// Uso: node tools/seedUsuariosPrueba.js
// Se pueden borrar luego desde Authentication + colección usuarios.
// ============================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const key = JSON.parse(
  readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)),
);
initializeApp({ credential: cert(key) });
const auth = getAuth();
const db = getFirestore();

const PASSWORD = 'Prueba2026!';
const usuarios = [
  { email: 'prevendedor@eb.test', nombre: 'Prevendedor Prueba', rol: 'prevendedor' },
  { email: 'backoffice@eb.test', nombre: 'Backoffice Prueba', rol: 'backoffice' },
  { email: 'admin@eb.test', nombre: 'Admin Prueba', rol: 'admin' },
  { email: 'disenador@eb.test', nombre: 'Disenador Prueba', rol: 'disenador' },
];

for (const u of usuarios) {
  let record;
  try {
    record = await auth.getUserByEmail(u.email);
  } catch {
    record = await auth.createUser({
      email: u.email,
      password: PASSWORD,
      displayName: u.nombre,
    });
  }
  await db.doc(`usuarios/${record.uid}`).set(
    {
      nombre: u.nombre,
      email: u.email,
      rol: u.rol,
      activo: true,
      esPrueba: true,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`✅ ${u.rol.padEnd(12)} → ${u.email}  (uid ${record.uid})`);
}

console.log(`\nContraseña para todos: ${PASSWORD}`);
process.exit(0);
