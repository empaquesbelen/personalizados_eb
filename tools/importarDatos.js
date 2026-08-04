// ============================================
// Importa datos del Google Sheet legacy → Firestore.
//   BaseDatos   → catalogo
//   Condiciones → condiciones
//   Vendedores  → vendedores (referencia; el superadmin crea los usuarios reales)
//   Configuracion → config/general (merge)
//
// Lee el Sheet vía gviz CSV (funciona con "cualquiera con el enlace").
// Uso:
//   node tools/importarDatos.js            → CORRIDA EN SECO (solo muestra)
//   node tools/importarDatos.js --commit   → escribe en Firestore
// ============================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SPREADSHEET_ID = '1yOsHxWOgHfuCT3ylgCjQHadoLEyWl7sKdcdyg1IK_sw';
const COMMIT = process.argv.includes('--commit');

// ---------- utilidades ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNum(value, def = 0) {
  if (value == null || value === '') return def;
  let str = String(value).trim().replace(/[₡$\s]/g, '');
  if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) str = str.replace(/\./g, '').replace(',', '.');
    else str = str.replace(/,/g, '');
  } else if (str.includes(',')) str = str.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(str)) str = str.replace(/\./g, '');
  else str = str.replace(/,/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? def : n;
}

function slug(...parts) {
  return parts.map((p) => norm(p)).filter(Boolean).join('_').slice(0, 200) || 'x';
}

async function fetchTab(nombre) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo leer la pestaña "${nombre}" (HTTP ${res.status})`);
  const text = await res.text();
  const rows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  return rows;
}

function indexarHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => { map[norm(h)] = i; });
  return map;
}

// ---------- transformaciones ----------
function mapBaseDatos(rows) {
  const H = indexarHeaders(rows[0]);
  const col = (r, ...names) => {
    for (const n of names) if (H[n] !== undefined) return r[H[n]];
    return '';
  };
  const docs = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const producto = String(col(r, 'producto')).trim();
    const tamano = String(col(r, 'tamano', 'tamao', 'tamanio')).trim();
    if (!producto || !tamano) continue;
    const cod = String(col(r, 'cod', 'codigo', 'id')).trim();
    const impresion1 = String(col(r, 'impresion1')).trim();
    const impresion2 = String(col(r, 'impresion2')).trim();
    const material = String(col(r, 'material')).trim();
    docs.push({
      _id: slug(cod, producto, tamano, impresion1, impresion2, material),
      cod, producto, tamano,
      minimo: Math.max(1, Math.round(parseNum(col(r, 'minimo'), 1))),
      impresion1, impresion2, material,
      precioSinIVA: parseNum(col(r, 'preciosiniva', 'precio'), 0),
      precioEnUsd: norm(col(r, 'precioenusd')) === 'aplica',
      activo: true,
    });
  }
  return docs;
}

function mapCondiciones(rows) {
  const H = indexarHeaders(rows[0]);
  const iArt = H['articulo'] ?? 0;
  const iTxt = H['condiciones'] ?? H['condicion'] ?? 1;
  const docs = [];
  for (let i = 1; i < rows.length; i++) {
    const articulo = String(rows[i][iArt] || '').trim();
    const texto = String(rows[i][iTxt] || '').trim();
    if (!articulo) continue;
    docs.push({ _id: slug(articulo), articulo, texto });
  }
  return docs;
}

function mapVendedores(rows) {
  const H = indexarHeaders(rows[0]);
  const iN = H['nombre'] ?? 0;
  const iW = H['whatsapp'] ?? 1;
  const iE = H['email'] ?? H['correo'] ?? 2;
  const docs = [];
  for (let i = 1; i < rows.length; i++) {
    const nombre = String(rows[i][iN] || '').trim();
    if (!nombre) continue;
    docs.push({
      _id: slug(nombre),
      nombre,
      whatsapp: String(rows[i][iW] || '').trim(),
      email: String(rows[i][iE] || '').trim(),
    });
  }
  return docs;
}

function mapConfiguracion(rows) {
  const cfg = {};
  const clave = {
    tipocambio: 'tipoCambioManual', iva: 'iva', nombreempresa: 'nombreEmpresa',
    telefono: 'telefono', direccion: 'direccion', cedulajuridica: 'cedulaJuridica',
  };
  for (let i = 1; i < rows.length; i++) {
    const k = norm(rows[i][0]);
    const v = String(rows[i][1] ?? '').trim();
    if (!clave[k]) continue;
    cfg[clave[k]] = (k === 'tipocambio' || k === 'iva') ? parseNum(v) : v;
  }
  return cfg;
}

// ---------- ejecución ----------
const [baseRows, condRows, vendRows, confRows] = await Promise.all([
  fetchTab('BaseDatos'), fetchTab('Condiciones'), fetchTab('Vendedores'), fetchTab('Configuracion'),
]);

const catalogo = mapBaseDatos(baseRows);
const condiciones = mapCondiciones(condRows);
const vendedores = mapVendedores(vendRows);
const config = mapConfiguracion(confRows);
config.nombreEmpresa = 'Empaques Belén'; // no importar el nombre legacy "Personalizados EB"

console.log('== HEADERS DETECTADOS ==');
console.log('BaseDatos:  ', baseRows[0]);
console.log('Condiciones:', condRows[0]);
console.log('Vendedores: ', vendRows[0]);
console.log('\n== CONTEOS ==');
console.log(`catalogo:    ${catalogo.length}`);
console.log(`condiciones: ${condiciones.length}`);
console.log(`vendedores:  ${vendedores.length}`);
console.log(`config:      ${Object.keys(config).length} claves`);
console.log('\n== MUESTRAS ==');
console.log('catalogo[0]:', JSON.stringify(catalogo[0], null, 2));
console.log('condiciones[0]:', JSON.stringify(condiciones[0]));
console.log('config:', JSON.stringify(config));

const conUsd = catalogo.filter((c) => c.precioEnUsd).length;
console.log(`\ncatálogo con precioEnUsd=Aplica: ${conUsd}`);

if (!COMMIT) {
  console.log('\n(⚠️ CORRIDA EN SECO — no se escribió nada. Agregá --commit para escribir en Firestore.)');
} else {
  // --- escritura en Firestore ---
  const key = JSON.parse(readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)));
  const app = initializeApp({ credential: cert(key) });
  const db = getFirestore();

  const escribirColeccion = async (nombre, docs) => {
    let escritos = 0;
    for (let i = 0; i < docs.length; i += 400) {
      const chunk = docs.slice(i, i + 400);
      const batch = db.batch();
      chunk.forEach(({ _id, ...data }) => batch.set(db.doc(`${nombre}/${_id}`), data, { merge: true }));
      await batch.commit();
      escritos += chunk.length;
    }
    console.log(`✅ ${nombre}: ${escritos} documentos`);
  };

  await escribirColeccion('catalogo', catalogo);
  await escribirColeccion('condiciones', condiciones);
  await escribirColeccion('vendedores', vendedores);
  await db.doc('config/general').set(config, { merge: true });
  console.log('✅ config/general actualizado');
  await deleteApp(app);
  console.log('\n🎉 Importación completa.');
}
