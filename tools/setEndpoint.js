// Guarda config/general.tipoCambioEndpoint (URL del Apps Script del BCCR).
// Uso: node tools/setEndpoint.js "<url /exec>"
import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const url = process.argv[2] ||
  'https://script.google.com/macros/s/AKfycbx1jljI_LXT8yVvwhV7Xa3xukQiuTWe6II-JoVNJUNM5whL1PZnkalZJld6xl7ph5ntUQ/exec';

if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
  console.error('❌ URL inválida (debe ser una /exec de Apps Script):', url);
  process.exit(1);
}

const key = JSON.parse(readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)));
const app = initializeApp({ credential: cert(key) });
const db = getFirestore();
await db.doc('config/general').set({ tipoCambioEndpoint: url }, { merge: true });
await deleteApp(app);
console.log('✅ config/general.tipoCambioEndpoint =', url);
