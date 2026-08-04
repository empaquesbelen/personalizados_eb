// ============================================
// Crea los índices compuestos de firestore.indexes.json vía API REST del
// Firestore Admin, autenticando con la cuenta de servicio.
// Uso: node tools/deployIndexes.js
// ============================================
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'cotizador-personalizados';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)`;

const key = JSON.parse(
  readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)),
);
const { indexes } = JSON.parse(
  readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
);

const auth = new GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

for (const idx of indexes) {
  const { token } = await client.getAccessToken();
  const url = `${BASE}/collectionGroups/${idx.collectionGroup}/indexes`;
  const body = { queryScope: idx.queryScope || 'COLLECTION', fields: idx.fields };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const campos = idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join(', ');
  if (res.status === 200) {
    console.log(`✅ Índice creado en ${idx.collectionGroup} (${campos})`);
  } else if (res.status === 409 || /already.?exists/i.test(text)) {
    console.log(`• Índice ya existe en ${idx.collectionGroup} (${campos})`);
  } else {
    console.error(`❌ Error ${res.status} en ${idx.collectionGroup} (${campos}): ${text.slice(0, 300)}`);
  }
}
console.log('Listo (los índices pueden tardar un momento en construirse).');
