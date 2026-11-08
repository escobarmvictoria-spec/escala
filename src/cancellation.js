// ¿La cancelación empezaría a cubrir antes de salir de viaje?
// Una sola regla (condiciones, apartado 6) para la web y para los agentes:
// - contratando en los 7 días siguientes a la primera reserva, cubre desde la contratación;
// - después, cubre a partir de 72 horas desde la contratación;
// - la cobertura termina al empezar el viaje (00:00 del día de salida, hora de España).
import { ApiError } from './errors.js';

export const CANCEL_GRACE_DAYS = 7;
export const CANCEL_WAIT_HOURS = 72;

const DAY = 864e5;
const TZ = 'Europe/Madrid';

// Medianoche de una fecha YYYY-MM-DD en Madrid, como instante UTC.
function madridMidnight(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = (t) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - t;
  };
  return guess - offset(guess - offset(guess));
}

function todayIso(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

export function formatMadrid(date) {
  const day = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const time = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `el ${day} a las ${time}`;
}

export function cancellationStart({ firstBookingDate, departureDate, now = new Date() }) {
  const first = String(firstBookingDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || Number.isNaN(Date.parse(first)))
    throw new ApiError('invalid_first_booking_date', 'Falta la fecha de la primera reserva o no es válida.', {
      field: 'first_booking_date',
      hint: 'Pregunta al usuario cuándo hizo su primera reserva del viaje (vuelo, alojamiento…) y envíala como YYYY-MM-DD.',
    });
  const today = todayIso(now);
  if (first > today)
    throw new ApiError('first_booking_in_future', 'La primera reserva no puede ser posterior a hoy.', {
      field: 'first_booking_date',
      hint: 'Si todavía no ha reservado nada, la cancelación cubre desde que contrate.',
    });
  const daysSinceBooking = Math.round((madridMidnight(today) - madridMidnight(first)) / DAY);
  const immediate = daysSinceBooking <= CANCEL_GRACE_DAYS;
  const startsAt = immediate ? now : new Date(now.getTime() + CANCEL_WAIT_HOURS * 3600e3);
  const departure = new Date(madridMidnight(departureDate));
  const before = startsAt < departure;
  const rule = immediate ? 'desde_contratacion' : 'espera_72h';
  let message;
  if (!before)
    message = 'Si contratas ahora, la cancelación empezaría a cubrir después de tu salida. Para estas fechas, esa cobertura no llegaría a activarse antes del viaje. Puedes seguir comparando los gastos médicos y el equipaje de cada plan.';
  else if (immediate)
    message = 'Si contratas ahora, la cobertura de cancelación se activa desde la compra y hasta que empiece el viaje. Se aplica a las causas cubiertas por el plan.';
  else
    message = `Si contratas ahora, la cobertura de cancelación se activa ${formatMadrid(startsAt)}, ${CANCEL_WAIT_HOURS} horas después de la compra, y dura hasta que empiece el viaje. Se aplica a las causas cubiertas por el plan.`;
  return {
    rule,
    days_since_first_booking: daysSinceBooking,
    starts_at: startsAt.toISOString(),
    starts_at_text: formatMadrid(startsAt),
    departure_at: departure.toISOString(),
    covered_before_departure: before,
    message,
  };
}
