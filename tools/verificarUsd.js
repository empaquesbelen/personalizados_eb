// Diagnóstico: muestra productos con precioEnUsd=true y su precio calculado.
import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const key = JSON.parse(readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)));
const app = initializeApp({ credential: cert(key) });
const db = getFirestore();

const snap = await db.collection('catalogo').where('precioEnUsd', '==', true).limit(6).get();
console.log(`Productos con precioEnUsd=true: (mostrando ${snap.size})\n`);
const TC = 455.75;
snap.forEach((d) => {
  const x = d.data();
  const base = Number(x.precioSinIVA) || 0;
  console.log(`${x.producto} (${x.tamano}) | min=${x.minimo} | precioSinIVA(bruto)=${base} | precioEnUsd=${x.precioEnUsd}`);
  console.log(`   → sin IVA en CRC @${TC} = ${(base * TC).toLocaleString('es-CR')}  | con IVA = ${(base * TC * 1.13).toLocaleString('es-CR')}\n`);
});
await deleteApp(app);
