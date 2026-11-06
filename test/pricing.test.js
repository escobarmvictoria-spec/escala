import test from 'node:test';
import assert from 'node:assert/strict';
import { priceTrip, RATES } from '../src/pricing.js';
import { resolveDestination } from '../src/catalog.js';

test('una semana en Europa, adulto, Esencial cuesta 17,20 € (lo que dice la portada)', () => {
  assert.equal(priceTrip({ zone: 'europa', days: 7, travelers: [{ age: 35 }] }).plans.esencial.total_eur, 17.2);
});

test('el orden de planes y zonas es lógico en cualquier duración', () => {
  const zones = ['espana', 'europa', 'mundo', 'usa_canada'];
  for (const days of [1, 4, 7, 15, 31, 60, 90]) {
    for (const z of zones) {
      const p = priceTrip({ zone: z, days, travelers: [{ age: 30 }] }).plans;
      assert.ok(p.esencial.total_eur < p.completo.total_eur && p.completo.total_eur < p.total.total_eur, `${z} ${days}d`);
    }
    for (const plan of ['esencial', 'completo', 'total']) {
      const prices = zones.map((z) => priceTrip({ zone: z, days, travelers: [{ age: 30 }] }).plans[plan].total_eur);
      assert.deepEqual([...prices].sort((a, b) => a - b), prices, `${plan} ${days}d`);
    }
  }
});

test('menores pagan menos, mayores más, y Esencial no admite mayores de 69', () => {
  const q = priceTrip({ zone: 'mundo', days: 10, travelers: [{ age: 8 }, { age: 40 }, { age: 70 }] });
  const [kid, adult, senior] = q.plans.completo.per_traveler.map((t) => t.price_eur);
  assert.ok(kid < adult && adult < senior);
  assert.equal(q.plans.esencial.available, false);
  assert.equal(q.plans.completo.group_discount_pct, 10);
});

test('los viajes largos abaratan el precio por día', () => {
  const p30 = priceTrip({ zone: 'europa', days: 30, travelers: [{ age: 30 }] }).plans.completo.price_per_day_eur;
  const p90 = priceTrip({ zone: 'europa', days: 90, travelers: [{ age: 30 }] }).plans.completo.price_per_day_eur;
  assert.ok(p90 < p30);
});

test('destinos: países, ciudades, regiones y errores con sugerencia', () => {
  assert.equal(resolveDestination('Tokio').code, 'JP');
  assert.equal(resolveDestination('EEUU').zone, 'usa_canada');
  assert.equal(resolveDestination('marruecos').zone, 'europa');
  assert.equal(resolveDestination('Europa').zone, 'europa');
  const bad = resolveDestination('Jpaon');
  assert.equal(bad.error, 'unknown');
  assert.ok(bad.suggestions.some((s) => s.includes('JP')));
  assert.ok(RATES.mundo);
});
