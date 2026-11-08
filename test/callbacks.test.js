import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../src/store.js';
import { createOrderService } from '../src/orders.js';
import { createCallbackService, callbackWindow, publicCallback } from '../src/callbacks.js';

const future = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

test('pedir que llame una persona: valida, guarda el contexto y avisa al equipo', async () => {
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'escala-cb-')));
  const orders = createOrderService({ store, issuePolicy: () => ({}), sendPolicyEmail: async () => {} });
  const notified = [];
  const svc = createCallbackService({ store, notifyTeam: async (cb) => (notified.push(cb.id), { status: 'sent' }) });
  const o = orders.createQuote({ destinations: ['Italia'], start_date: future(10), end_date: future(14), travelers: [{ age: 84 }], departure_country: 'ES' }, 'agent');
  await assert.rejects(() => svc.create({ full_name: 'Clara Prieto', phone: '123', user_agreed: true }), { code: 'invalid_phone' });
  await assert.rejects(() => svc.create({ full_name: 'Clara Prieto', phone: '600 111 222' }), { code: 'consent_required' });
  const cb = await svc.create({ full_name: 'Clara Prieto', phone: '600 111 222', user_agreed: true, reason: 'enfermedad_previa', quote_id: o.id, summary: 'Abuelo con marcapasos' }, 'agent');
  assert.match(cb.id, /^LL-[0-9A-F]{6}$/);
  assert.equal(cb.channel, 'agente_ia');
  assert.ok(cb.context.trip.includes('Italia'));
  assert.deepEqual(notified, [cb.id]);
  assert.equal(store.getOrder(o.id).events.at(-1).action, 'human_requested');
});

test('la ventana de llamada respeta el horario de 9 a 21 h', () => {
  assert.equal(callbackWindow('cuanto_antes', new Date('2026-11-09T10:00:00Z')), 'hoy, en horario de 9:00 a 21:00');
  assert.equal(callbackWindow('cuanto_antes', new Date('2026-11-09T22:30:00Z')), 'mañana a partir de las 9:00');
  assert.equal(callbackWindow('cuanto_antes', new Date('2026-11-09T05:00:00Z')), 'hoy a partir de las 9:00');
  assert.equal(callbackWindow('manana_tarde'), 'mañana entre las 15:00 y las 21:00');
});

test('sin cotización se adjunta el viaje que intentó cotizar; un problema en viaje va a la asistencia', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escala-cb2-'));
  const store = createStore(dir);
  const svc = createCallbackService({ store, notifyTeam: async () => ({ status: 'sent' }) });
  const cb = await svc.create({ full_name: 'Ramón Gil', phone: '600 111 222', user_agreed: true, reason: 'no_asegurable', trip_attempt: { destinations: ['Italia'], start_date: '2026-12-10', end_date: '2026-12-17', ages: [90] } });
  assert.equal(cb.preferred_time, 'sin_preferencia');
  assert.match(cb.context.trip, /Italia, 2026-12-10 a 2026-12-17/);
  assert.equal(cb.context.travelers, '90 años');
  assert.equal(publicCallback(cb).context_kind, 'intento');
  await assert.rejects(() => svc.create({ full_name: 'Ramón Gil', phone: '600 111 222', user_agreed: true, reason: 'siniestro' }), { code: 'use_assistance_phone' });
});
