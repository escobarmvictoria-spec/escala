import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';
import { createOrderService, publicOrder } from '../src/orders.js';

function service() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escala-'));
  const sent = [];
  const svc = createOrderService({
    store: createStore(dir),
    issuePolicy: () => ({ number: 'ESC-TEST-000001', issued_at: new Date().toISOString(), pdf_token: 'x', email: { status: 'pending' } }),
    sendPolicyEmail: async (o) => { sent.push(o.holder.email); o.policy.email = { status: 'sent', to: o.holder.email }; },
  });
  return { svc, sent };
}

const future = (d) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

test('compra completa por un agente, con controles antes de pagar', async () => {
  const { svc, sent } = service();
  const o = svc.createQuote({ destinations: ['Japón'], start_date: future(30), end_date: future(44), travelers: [{ age: 34 }, { age: 36 }] }, 'agent');
  assert.equal(o.channel, 'agente_ia');
  await assert.rejects(() => svc.pay(o.id, {}, 'agent'), { code: 'not_ready_to_pay' });
  svc.selectPlan(o.id, 'completo', 'agent');
  assert.throws(() => svc.setTravelers(o.id, { holder: { full_name: 'Ana López', email: 'ana@' }, travelers: [] }), { code: 'invalid_email' });
  svc.setTravelers(o.id, { holder: { full_name: 'Ana López', email: 'ana@example.com' }, travelers: [{ full_name: 'Ana López', age: 34 }, { full_name: 'Juan Gil', age: 36 }] }, 'agent');
  assert.throws(() => svc.acceptTerms(o.id, { accepted: true }), { code: 'review_required' });
  const { order, summary } = svc.review(o.id, 'agent');
  assert.throws(() => svc.acceptTerms(o.id, { accepted: true, review_token: 'nope' }), { code: 'review_outdated' });
  svc.acceptTerms(o.id, { accepted: true, review_token: order.review.token, terms_version: summary.terms.version }, 'agent');
  await assert.rejects(() => svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4242424242424242' }), { code: 'confirmation_required' });
  await assert.rejects(() => svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4242424242424242', user_confirmation: ' ' }), { code: 'confirmation_required' });
  await assert.rejects(() => svc.pay(o.id, { amount_eur: 1, card_number: '4242424242424242', user_confirmation: 'sí, paga' }), { code: 'amount_mismatch' });
  await assert.rejects(() => svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4111111111111111', user_confirmation: 'sí, paga' }), { code: 'real_card_not_allowed' });
  await assert.rejects(() => svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4000000000000002', user_confirmation: 'sí, paga' }), { code: 'card_declined' });
  const paid = await svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4242 4242 4242 4242', user_confirmation: 'sí, paga' }, 'agent');
  assert.equal(paid.order.status, 'paid');
  assert.equal(paid.order.payment.card_last4, '4242');
  assert.equal(paid.order.payment.user_confirmation, 'sí, paga');
  assert.deepEqual(sent, ['ana@example.com']);
  const again = await svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4242 4242 4242 4242', user_confirmation: 'sí, paga' }, 'agent');
  assert.equal(again.already_paid, true);
  assert.equal(sent.length, 1, 'no se cobra ni se envía dos veces');
});

test('cambiar datos después de revisar obliga a revisar otra vez', () => {
  const { svc } = service();
  const o = svc.createQuote({ destinations: 'Francia', start_date: future(5), end_date: future(9), travelers: [30] });
  svc.selectPlan(o.id, 'esencial');
  svc.setTravelers(o.id, { holder: { full_name: 'Ana López', email: 'ana@example.com' }, travelers: [{ full_name: 'Ana López', age: 30 }] });
  const { order } = svc.review(o.id);
  const token = order.review.token;
  svc.selectPlan(o.id, 'total');
  assert.equal(svc.load(o.id).status, 'travelers_set');
  assert.throws(() => svc.acceptTerms(o.id, { accepted: true, review_token: token }), { code: 'review_required' });
});

test('validaciones con mensajes útiles', () => {
  const { svc } = service();
  assert.throws(() => svc.createQuote({ destinations: ['Japón'], start_date: '2020-01-01', end_date: '2020-01-05', travelers: [{ age: 30 }] }), { code: 'start_in_past' });
  assert.throws(() => svc.createQuote({ destinations: ['Japón'], start_date: future(10), end_date: future(5), travelers: [{ age: 30 }] }), { code: 'end_before_start' });
  assert.throws(() => svc.createQuote({ destinations: ['Japón'], start_date: future(1), end_date: future(120), travelers: [{ age: 30 }] }), { code: 'trip_too_long' });
  assert.throws(() => svc.createQuote({ destinations: ['Siria'], start_date: future(1), end_date: future(5), travelers: [{ age: 30 }] }), { code: 'destination_excluded' });
  assert.throws(() => svc.createQuote({ destinations: ['Japón'], start_date: future(1), end_date: future(5), travelers: [{ age: 90 }] }), { code: 'age_not_insurable' });
  const o = svc.createQuote({ destinations: ['Japón'], start_date: future(1), end_date: future(5), travelers: [{ age: 72 }] });
  assert.throws(() => svc.selectPlan(o.id, 'esencial'), { code: 'plan_not_available' });
});

test('guardar la cotización por email y retomarla: misma cotización o recalculada si caducó', async () => {
  const { svc } = service();
  const o = svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(26), travelers: [{ age: 40 }] }, 'web');
  assert.throws(() => svc.saveQuote(o.id, { email: 'no-es-email' }, 'web'), { code: 'invalid_email' });
  assert.throws(() => svc.saveQuote(o.id, { email: 'ana@example.com' }, 'agent'), { code: 'consent_required' });
  svc.saveQuote(o.id, { email: 'Ana@Example.com' }, 'web');
  assert.equal(svc.load(o.id).saved.email, 'ana@example.com');
  const same = svc.resumeQuote(o.id, 'web');
  assert.equal(same.resumed, 'same');
  assert.equal(same.order.id, o.id);
  // Caducada: se crea otra con el mismo viaje y el plan que tenía elegido.
  svc.selectPlan(o.id, 'completo', 'web');
  const stored = svc.load(o.id);
  stored.expires_at = new Date(Date.now() - 1000).toISOString();
  const again = svc.resumeQuote(o.id, 'web');
  assert.equal(again.resumed, 'repriced');
  assert.notEqual(again.order.id, o.id);
  assert.equal(again.order.resumed_from, o.id);
  assert.equal(again.order.plan, 'completo');
  assert.equal(again.order.trip.days, 7);
});
test('en EE. UU. se recomienda Total y el sello compara con el plan de referencia', () => {
  const { svc } = service();
  const nyc = publicOrder(svc.createQuote({ destinations: ['Estados Unidos'], start_date: future(20), end_date: future(26), travelers: [{ age: 35 }] }, 'web'));
  assert.equal(nyc.recommendation.plan, 'total');
  const extra = Math.round((nyc.quote.plans.total.total_eur - nyc.quote.plans.completo.total_eur) * 100) / 100;
  assert.equal(nyc.recommendation.extra_eur, extra);
  assert.equal(nyc.recommendation.compared_with, 'completo');
  assert.match(nyc.recommendation.reason, /más que Completo en todo el viaje, tu límite médico sube de 1\.000\.000\s€ a 5\.000\.000\s€/);
  const roma = publicOrder(svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(26), travelers: [{ age: 35 }] }, 'web'));
  assert.equal(roma.recommendation.plan, 'completo');
  assert.equal(roma.recommendation.compared_with, 'esencial');
  assert.match(roma.recommendation.reason, /más que Esencial en todo el viaje, añades cancelación, subes el límite médico de 150\.000\s€ a 1\.000\.000\s€ y quitas la franquicia de 75\s€/);
  const mayor = publicOrder(svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(26), travelers: [{ age: 72 }] }, 'web'));
  assert.equal(mayor.recommendation.compared_with, undefined, 'sin Esencial disponible, el sello no compara con él');
});
