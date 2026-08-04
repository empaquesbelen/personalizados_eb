// ============================================
// Despliega firestore.rules vía API REST de Firebase Rules,
// autenticando con la cuenta de servicio (google-auth-library).
// Uso: node tools/deployRules.js
// ============================================
import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = 'cotizador-personalizados';
const BASE = 'https://firebaserules.googleapis.com/v1';

const key = JSON.parse(
  readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)),
);
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

const auth = new GoogleAuth({
  credentials: key,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

async function req(method, path, body) {
  const { token } = await client.getAccessToken();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* deja json en null */ }
  return { status: res.status, json, text };
}

// 1) Crear un ruleset con el contenido de firestore.rules
console.log('→ Creando ruleset…');
const created = await req('POST', `/projects/${PROJECT}/rulesets`, {
  source: { files: [{ name: 'firestore.rules', content: rules }] },
});

if (created.status !== 200) {
  console.error(`❌ Falló crear ruleset (HTTP ${created.status}):`);
  console.error(created.text.slice(0, 600));
  process.exit(1);
}
const rulesetName = created.json.name;
console.log('✔ Ruleset:', rulesetName);

// 2) Apuntar el release cloud.firestore al nuevo ruleset (PATCH; si no existe, POST)
const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
console.log('→ Actualizando release cloud.firestore…');
let rel = await req('PATCH', `/${releaseName}`, {
  release: { name: releaseName, rulesetName },
});
if (rel.status === 404) {
  rel = await req('POST', `/projects/${PROJECT}/releases`, {
    name: releaseName,
    rulesetName,
  });
}

if (rel.status !== 200) {
  console.error(`❌ Falló actualizar release (HTTP ${rel.status}):`);
  console.error(rel.text.slice(0, 600));
  process.exit(1);
}

console.log('✅ Reglas publicadas correctamente en', PROJECT);
process.exit(0);
