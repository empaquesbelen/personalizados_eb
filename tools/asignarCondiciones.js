// ============================================================
// Asigna a cada producto del catálogo su `condicionId` correspondiente,
// MATERIALIZANDO el mismo match heurístico por nombre/material que ya usaba el
// cotizador (resolverSujetoCondicion + getCondiciones). Solo toca productos que
// AÚN NO tienen `condicionId` (no pisa asignaciones hechas a mano en el módulo).
//
// Uso:
//   node tools/asignarCondiciones.js            → DRY-RUN (solo muestra)
//   node tools/asignarCondiciones.js --commit    → escribe en Firestore
// ============================================================
import { readFileSync } from 'node:fs';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COMMIT = process.argv.includes('--commit');

// --- Normalización (espejo de catalogo.js) ---
const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const compacto = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Sujeto de condición (espejo de resolverSujetoCondicion): los Vasos varían por material.
function resolverSujeto(producto, material) {
  const nombre = String(producto || '').trim();
  if (!nombre) return '';
  if (!compacto(nombre).includes('vaso')) return nombre;
  const m = compacto(material);
  if (m.includes('carton') && m.includes('pla')) return 'Vasos Carton + PLA';
  if (m.includes('pet')) return 'Vasos Pet';
  if (m.includes('carton')) return 'Vasos Carton';
  return nombre;
}

// Match flexible (espejo de getCondiciones): exacto → contiene → tokens.
function matchCondicion(articulo, conds) {
  if (!articulo) return null;
  const target = norm(articulo);
  const tc = compacto(articulo);
  const conTexto = conds.filter((c) => String(c.texto || '').trim());
  const exacto = conTexto.find((c) => norm(c.articulo) === target);
  if (exacto) return exacto;
  let mejor = { score: 0, largo: 0, cond: null };
  for (const c of conTexto) {
    const sc = compacto(c.articulo);
    if (!sc || !tc) continue;
    let score = 0;
    if (sc === tc) score = 95;
    else if (tc.includes(sc) || sc.includes(tc)) score = 80;
    else {
      const tt = target.split(/\s+/).filter(Boolean);
      const st = norm(c.articulo).split(/\s+/).filter(Boolean);
      const ov = st.filter((t) => tt.includes(t)).length;
      if (ov > 0) score = 50 + Math.min(20, ov * 10);
    }
    if (score > 0 && (score > mejor.score || (score === mejor.score && sc.length > mejor.largo))) {
      mejor = { score, largo: sc.length, cond: c };
    }
  }
  return mejor.cond;
}

const key = JSON.parse(readFileSync(new URL('../secrets/serviceAccountKey.json', import.meta.url)));
const app = initializeApp({ credential: cert(key) });
const db = getFirestore();

const [catSnap, condSnap] = await Promise.all([
  db.collection('catalogo').get(),
  db.collection('condiciones').get(),
]);
const condiciones = condSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const aAsignar = [];
let yaAsignados = 0;
let sinMatch = 0;
const porCondicion = {};

for (const doc of catSnap.docs) {
  const p = doc.data();
  if (p.condicionId !== undefined) {
    yaAsignados += 1; // respeta lo ya asignado (a mano o antes)
    continue;
  }
  const sujeto = resolverSujeto(p.producto, p.material);
  const cond = matchCondicion(sujeto, condiciones);
  aAsignar.push({
    ref: doc.ref,
    producto: p.producto,
    material: p.material,
    condId: cond ? cond.id : '',
    condArticulo: cond ? cond.articulo : '(Ninguna)',
  });
  if (cond) porCondicion[cond.articulo] = (porCondicion[cond.articulo] || 0) + 1;
  else sinMatch += 1;
}

console.log(`\n== Catálogo: ${catSnap.size} productos · Condiciones disponibles: ${condiciones.length} ==`);
console.log(`Ya tenían condicionId (NO se tocan): ${yaAsignados}`);
console.log(
  `A asignar: ${aAsignar.length}  →  con condición: ${aAsignar.length - sinMatch} · sin match (Ninguna): ${sinMatch}\n`,
);
console.log('Distribución por condición asignada:');
Object.entries(porCondicion)
  .sort((a, b) => b[1] - a[1])
  .forEach(([art, n]) => console.log(`  ${String(n).padStart(4)}  ${art}`));
if (sinMatch) console.log(`  ${String(sinMatch).padStart(4)}  (Ninguna)`);

console.log('\nEjemplos (producto / material → condición):');
aAsignar.slice(0, 15).forEach((c) => console.log(`  ${c.producto} / ${c.material || '—'}  →  ${c.condArticulo}`));

if (!COMMIT) {
  console.log('\n(⚠️ DRY-RUN — no se escribió nada. Agregá --commit para aplicar.)');
} else {
  let n = 0;
  for (let i = 0; i < aAsignar.length; i += 400) {
    const batch = db.batch();
    aAsignar.slice(i, i + 400).forEach((c) => batch.update(c.ref, { condicionId: c.condId }));
    await batch.commit();
    n += Math.min(400, aAsignar.length - i);
  }
  console.log(`\n✅ Asignado condicionId a ${n} productos.`);
}

await deleteApp(app);
