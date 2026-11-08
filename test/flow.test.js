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
  // Todas las cotizaciones de estas pruebas salen de España salvo que la prueba diga otra cosa.
  const createQuote = svc.createQuote.bind(svc);
  svc.createQuote = (input, actor) => createQuote(input && typeof input === 'object' && !('departure_country' in input) ? { departure_country: 'ES', ...input } : input, actor);
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
  assert.match(nyc.recommendation.reason, /más que Completo en todo el viaje: 5\sM€ en gastos médicos, en lugar de 1\sM€\./);
  const roma = publicOrder(svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(26), travelers: [{ age: 35 }] }, 'web'));
  assert.equal(roma.recommendation.plan, 'completo');
  assert.equal(roma.recommendation.compared_with, 'esencial');
  assert.match(roma.recommendation.reason, /más que Esencial en todo el viaje: 1\sM€ en gastos médicos, sin franquicia, y cobertura de cancelación\./);
  const mayor = publicOrder(svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(26), travelers: [{ age: 72 }] }, 'web'));
  assert.equal(mayor.recommendation.compared_with, undefined, 'sin Esencial disponible, el sello no compara con él');
});

test('si no se puede contratar online, el error le dice al agente que ofrezca una persona', () => {
  const { svc } = service();
  const cases = [
    { destinations: ['Italia'], start_date: future(20), end_date: future(139), travelers: [{ age: 35 }] },
  ];
  for (const input of cases) {
    try {
      svc.createQuote(input, 'agent');
      assert.fail('debería rechazarse');
    } catch (e) {
      const body = e.toJSON();
      assert.equal(body.error.human_help.tool, 'request_human_callback');
      assert.equal(body.error.human_help.reason, 'no_asegurable');
    }
  }
  try { svc.createQuote({ destinations: [] }, 'agent'); } catch (e) { assert.equal(e.toJSON().error.human_help, undefined); }
});

test('edad máxima: 90 años se rechaza sin ofrecer llamada; 84 y 72 se pueden cotizar; 90 días de viaje no es la edad', () => {
  const { svc } = service();
  const err = (input) => { try { svc.createQuote(input, 'agent'); return null; } catch (e) { return e.toJSON().error; } };
  const base = { destinations: ['Italia'], start_date: future(20), end_date: future(26) };
  const solo = err({ ...base, travelers: [{ age: 90 }] });
  assert.equal(solo.code, 'age_not_insurable');
  assert.match(solo.message, /^Escala cubre a viajeros de hasta 84 años en la fecha de salida/);
  assert.equal(solo.human_help, undefined, 'sin oferta de llamada');
  assert.doesNotMatch(solo.how_to_fix, /llamen|request_human_callback/);
  assert.match(solo.how_to_fix, /sin ofrecer una llamada/);
  assert.equal(solo.details.final, true);
  const grupo = err({ ...base, travelers: [{ age: 40 }, { age: 90 }] });
  assert.match(grupo.how_to_fix, /quedaría fuera de la póliza\. ¿Quieres que siga\?/);
  const o84 = svc.createQuote({ ...base, travelers: [{ age: 84 }] }, 'agent');
  assert.equal(o84.quote.plans.esencial.available, false);
  assert.equal(o84.quote.plans.completo.available, true);
  assert.equal(o84.quote.plans.total.available, true);
  const o72 = svc.createQuote({ ...base, travelers: [{ age: 72 }] }, 'agent');
  assert.equal(o72.quote.plans.esencial.available, false);
  assert.ok(o72.quote.plans.completo.available && o72.quote.plans.total.available);
  const largo = svc.createQuote({ destinations: ['Italia'], start_date: future(20), end_date: future(109), travelers: [{ age: 35 }] }, 'agent');
  assert.equal(largo.trip.days, 90, '90 días de viaje están dentro del máximo');
  const demasiado = err({ destinations: ['Italia'], start_date: future(20), end_date: future(110), travelers: [{ age: 35 }] });
  assert.equal(demasiado.code, 'trip_too_long');
  assert.equal(demasiado.human_help.tool, 'request_human_callback', 'la duración mantiene la derivación');
});

test('si la cancelación no llegaría a activarse, la recomendación y el resumen no la usan como argumento', async () => {
  const { svc } = service();
  const { summaryOf } = await import('../src/orders.js');
  const o = svc.createQuote({ destinations: ['Italia'], start_date: future(30), end_date: future(36), travelers: [{ age: 35 }] }, 'web');
  assert.match(publicOrder(o).recommendation.reason, /y cobertura de cancelación\.$/);
  o.cancellation_check = { first_booking_date: '2026-01-01', covered_before_departure: false };
  const rec = publicOrder(o).recommendation;
  assert.doesNotMatch(rec.reason, /y cobertura de cancelación/);
  assert.match(rec.reason, /Para tus fechas, la cobertura de cancelación no se activaría antes de salir\.$/);
  assert.equal(publicOrder(o).cancellation_check.covered_before_departure, false);
  o.plan = 'completo';
  o.travelers = [{ full_name: 'Ana Demo', age: 35 }];
  const s = summaryOf(o);
  assert.equal(s.cancellation_warning, 'Para tus fechas, la cobertura de cancelación no se activaría antes de salir.');
  assert.equal(s.coverages.find((c) => c.coverage === 'Cancelación del viaje').note, s.cancellation_warning);
  o.plan = 'esencial';
  assert.equal(summaryOf(o).cancellation_warning, undefined); // Esencial no incluye cancelación: no hay nada que avisar
  o.cancellation_check.covered_before_departure = true;
  o.plan = 'completo';
  assert.equal(summaryOf(o).cancellation_warning, undefined);
});

test('conserva la ciudad escrita y registra variante y dispositivo de la cotización web', () => {
  const { svc } = service();
  const o = svc.createQuote({ destinations: ['Nueva York'], start_date: future(30), end_date: future(36), travelers: [{ age: 35 }], device: 'movil' }, 'web');
  assert.deepEqual(o.trip.destinations[0], { code: 'US', name: 'Estados Unidos', place: 'Nueva York', label: 'Nueva York, Estados Unidos' });
  assert.equal(o.trip.zone, 'usa_canada');
  assert.equal(o.device, 'movil');
  assert.equal(publicOrder(o).experiments.guardar_atajo, 'B');
  assert.equal(publicOrder(o).experiments.cabecera_movil, 'B');
  const j = svc.createQuote({ destinations: ['Japón'], start_date: future(30), end_date: future(36), travelers: [{ age: 35 }] }, 'agent');
  assert.equal(j.trip.destinations[0].label, undefined); // país escrito tal cual: sin duplicar
  assert.deepEqual(publicOrder(j).experiments, {});
});

test('solo se cotizan viajes que empiezan en España: sin origen, pregunta; desde Lisboa, no hay cotización', () => {
  const { svc } = service();
  const base = { destinations: ['Nueva York'], start_date: future(20), end_date: future(26), travelers: [{ age: 40 }] };
  const err = (input) => { try { svc.createQuote(input, 'agent'); return null; } catch (e) { return e.toJSON().error; } };
  assert.equal(err({ ...base, departure_country: undefined }).code, 'missing_departure');
  const lisboa = err({ ...base, departure_country: 'Lisboa' });
  assert.equal(lisboa.code, 'departure_outside_spain');
  assert.match(lisboa.message, /Este viaje sale de Portugal/);
  assert.equal(lisboa.details.final, true);
  assert.equal(lisboa.human_help, undefined); // límite firme: sin llamada
  assert.equal(err({ ...base, departure_country: 'otro país' }).code, 'departure_outside_spain');
  for (const d of ['ES', 'España', 'Madrid', 'Barcelona']) assert.equal(svc.createQuote({ ...base, departure_country: d }, 'agent').trip.departure_country, 'ES');
});

test('el resumen lleva la cancelación con su fecha de activación, o invita a comprobarla', async () => {
  const { svc } = service();
  const { summaryOf } = await import('../src/orders.js');
  const o = svc.createQuote({ destinations: ['Italia'], start_date: future(30), end_date: future(36), travelers: [{ age: 35 }] }, 'web');
  o.plan = 'completo';
  o.travelers = [{ full_name: 'Ana Demo', age: 35 }];
  const cancel = (s) => s.coverages.find((c) => c.coverage === 'Cancelación del viaje');
  assert.equal(cancel(summaryOf(o)).check_pending, true);
  o.cancellation_check = { covered_before_departure: true, message: 'Si contratas ahora, la cobertura de cancelación se activa desde la compra y hasta que empiece el viaje. Se aplica a las causas cubiertas por el plan.' };
  assert.equal(cancel(summaryOf(o)).note_kind, 'ok');
  assert.match(cancel(summaryOf(o)).note, /se activa desde la compra/);
  assert.match(summaryOf(o).terms.key_points.join(' '), /pagamos directamente al hospital/);
});
