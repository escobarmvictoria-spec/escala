import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationStart } from '../src/cancellation.js';

// «Ahora» fijo: domingo 8 de noviembre de 2026, 13:00 en Madrid (12:00 UTC).
const now = new Date('2026-11-08T12:00:00Z');

test('primera reserva hace menos de 7 días: cubre desde que contratas', () => {
  const r = cancellationStart({ firstBookingDate: '2026-11-03', departureDate: '2026-12-10', now });
  assert.equal(r.rule, 'desde_contratacion');
  assert.equal(r.covered_before_departure, true);
  assert.equal(r.days_since_first_booking, 5);
  assert.match(r.message, /cubre desde el momento de contratar/);
});

test('primera reserva hace más de 7 días: empieza 72 horas después, antes de salir', () => {
  const r = cancellationStart({ firstBookingDate: '2026-10-01', departureDate: '2026-12-10', now });
  assert.equal(r.rule, 'espera_72h');
  assert.equal(r.covered_before_departure, true);
  assert.equal(r.starts_at, '2026-11-11T12:00:00.000Z');
  assert.match(r.message, /miércoles, 11 de noviembre a las 13:00/);
});

test('si las 72 horas acaban después de la salida, avisa de que no llegaría a activarse', () => {
  const r = cancellationStart({ firstBookingDate: '2026-10-01', departureDate: '2026-11-10', now });
  assert.equal(r.covered_before_departure, false);
  assert.match(r.message, /^Si contratas ahora, la cancelación empezaría a cubrir después de tu salida\. Para estas fechas, esa cobertura no llegaría a activarse antes del viaje\./);
});

test('el día 7 todavía cuenta como dentro del plazo; el 8 ya no', () => {
  assert.equal(cancellationStart({ firstBookingDate: '2026-11-01', departureDate: '2026-12-10', now }).rule, 'desde_contratacion');
  assert.equal(cancellationStart({ firstBookingDate: '2026-10-31', departureDate: '2026-12-10', now }).rule, 'espera_72h');
});

test('fechas inválidas o futuras: error con instrucciones', () => {
  assert.throws(() => cancellationStart({ firstBookingDate: '', departureDate: '2026-12-10', now }), { code: 'invalid_first_booking_date' });
  assert.throws(() => cancellationStart({ firstBookingDate: '2026-11-20', departureDate: '2026-12-10', now }), { code: 'first_booking_in_future' });
});
