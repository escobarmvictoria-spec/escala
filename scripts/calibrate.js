// Compara la tarifa de Escala con cotizaciones reales publicadas y resume la desviación por zona y plan.
// Uso: npm run calibrate
import fs from 'node:fs';
import { priceTrip, RATES } from '../src/pricing.js';

const data = JSON.parse(fs.readFileSync(new URL('./market-data.json', import.meta.url)));
const rows = data.quotes.map((q) => {
  const ours = priceTrip({ zone: q.zone, days: q.days, travelers: [{ age: 30 }] }).plans[q.tier].total_eur;
  return { ...q, ours, diff: (ours - q.price) / q.price };
});

const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)} %`;
const pad = (s, n) => String(s).padEnd(n);
console.log('Tarifa (base € + € por día):', JSON.stringify(RATES));
console.log(`\n${pad('Zona', 11)}${pad('Días', 6)}${pad('Producto de mercado', 46)}${pad('Mercado', 10)}${pad('Escala', 18)}Diferencia`);
for (const r of rows) console.log(`${pad(r.zone, 11)}${pad(r.days, 6)}${pad(r.product, 46)}${pad(r.price.toFixed(2), 10)}${pad(`${r.tier} ${r.ours.toFixed(2)}`, 18)}${pct(r.diff)}`);

console.log('\nDesviación mediana por zona y plan (Escala frente a mercado):');
const groups = {};
for (const r of rows) (groups[`${r.zone}/${r.tier}`] ||= []).push(r.diff);
for (const [k, v] of Object.entries(groups)) {
  const s = [...v].sort((a, b) => a - b);
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  console.log(`  ${pad(k, 22)} n=${v.length}  mediana ${pct(med)}  rango ${pct(s[0])} a ${pct(s[s.length - 1])}`);
}
const all = rows.map((r) => Math.abs(r.diff));
console.log(`\nError absoluto medio: ${(all.reduce((a, b) => a + b, 0) / all.length * 100).toFixed(1)} % sobre ${rows.length} cotizaciones.`);

// Con --md, imprime la tabla en Markdown para docs/pricing.md
if (process.argv.includes('--md')) {
  console.log('\n| Zona | Días | Producto de mercado | Mercado | Plan Escala | Escala | Diferencia |');
  console.log('|---|---:|---|---:|---|---:|---:|');
  for (const r of rows) console.log(`| ${r.zone} | ${r.days} | ${r.product} | ${r.price.toFixed(2)} € | ${r.tier} | ${r.ours.toFixed(2)} € | ${pct(r.diff)} |`);
}
