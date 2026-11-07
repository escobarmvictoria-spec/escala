// Flujo de contratación como máquina de estados.
// quoted → plan_selected → travelers_set → reviewed → terms_accepted → paid
// Cualquier cambio después de revisar obliga a revisar otra vez: el agente nunca paga algo que no ha visto.

import crypto from 'node:crypto';
import {
  PLANS, ZONES, ZONE_ORDER, TERMS_VERSION, MAX_DAYS, MAX_TRAVELERS, MAX_AGE, QUOTE_TTL_MINUTES,
  MAX_DAYS_IN_ADVANCE, EXCLUDED, EXCLUSIONS, resolveDestination, planById, coveragesFor, formatEur, countryName,
} from './catalog.js';
import { priceTrip } from './pricing.js';
import { ApiError } from './errors.js';

const STATUS_ORDER = ['quoted', 'plan_selected', 'travelers_set', 'reviewed', 'terms_accepted', 'paid'];
const atLeast = (order, status) => STATUS_ORDER.indexOf(order.status) >= STATUS_ORDER.indexOf(status);

export const TEST_CARDS = {
  '4242424242424242': { result: 'approved', label: 'Visa de prueba (aprobada)' },
  '4000000000000002': { result: 'declined', label: 'Tarjeta de prueba rechazada' },
  '4000000000009995': { result: 'insufficient_funds', label: 'Tarjeta de prueba sin fondos' },
};

export function todayMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function parseDate(value, field) {
  const s = String(value ?? '').trim();
  let y, m, d;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [, d, m, y] = match;
  else
    throw new ApiError('invalid_date', `La fecha "${s}" no tiene un formato válido.`, {
      field,
      hint: 'Usa el formato AAAA-MM-DD, por ejemplo 2026-12-20.',
    });
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso)
    throw new ApiError('invalid_date', `La fecha "${s}" no existe.`, { field, hint: 'Revisa día y mes (AAAA-MM-DD).' });
  return iso;
}

const dayDiff = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

function ageOn(birthDate, onDate) {
  const b = new Date(`${birthDate}T00:00:00Z`);
  const t = new Date(`${onDate}T00:00:00Z`);
  let age = t.getUTCFullYear() - b.getUTCFullYear();
  const beforeBirthday =
    t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function parseAge(value, field, startDate) {
  if (value && typeof value === 'object') {
    if (value.birth_date) return ageOn(parseDate(value.birth_date, `${field}.birth_date`), startDate);
    value = value.age;
  }
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120)
    throw new ApiError('invalid_age', `La edad "${value}" no es válida.`, {
      field,
      hint: 'Indica la edad en años como número entero (por ejemplo 34), o la fecha de nacimiento en birth_date.',
    });
  if (age > MAX_AGE)
    throw new ApiError('age_not_insurable', `Escala asegura a viajeros de hasta ${MAX_AGE} años; uno de los viajeros tiene ${age}.`, {
      field,
      hint: `Quita a ese viajero de la cotización. No hay plan disponible para mayores de ${MAX_AGE} años.`,
    });
  return age;
}

function resolveDestinations(input) {
  let list = input;
  if (typeof list === 'string') list = list.split(/[,;]| y | and /i);
  if (!Array.isArray(list) || list.length === 0)
    throw new ApiError('missing_destination', 'Falta el destino del viaje.', {
      field: 'destinations',
      hint: 'Indica uno o varios países, por ejemplo ["Japón"] o ["Francia", "Italia"]. También vale "Europa" o "Mundo".',
    });
  const resolved = [];
  for (const raw of list.map((x) => (typeof x === 'object' && x ? x.country ?? x.name ?? x.code : x))) {
    if (!String(raw ?? '').trim()) continue;
    const r = resolveDestination(raw);
    if (r.error)
      throw new ApiError('unknown_destination', `No reconozco el destino "${raw}".`, {
        field: 'destinations',
        hint: r.suggestions.length
          ? `¿Querías decir ${r.suggestions.join(' o ')}? Usa el nombre del país o su código ISO de dos letras.`
          : 'Usa el nombre del país (en español o inglés) o su código ISO de dos letras, por ejemplo "JP".',
      });
    if (r.code && EXCLUDED.has(r.code))
      throw new ApiError('destination_excluded', `No aseguramos viajes a ${r.name}: Exteriores recomienda no viajar allí.`, {
        field: 'destinations',
        hint: 'Quita ese destino. Escala no puede ofrecer cobertura para ese país.',
      });
    resolved.push(r);
  }
  if (!resolved.length)
    throw new ApiError('missing_destination', 'Falta el destino del viaje.', { field: 'destinations', hint: 'Indica al menos un país.' });
  // Si hay varios destinos, manda la zona más cara.
  const zone = resolved.map((r) => r.zone).sort((a, b) => ZONE_ORDER.indexOf(b) - ZONE_ORDER.indexOf(a))[0];
  return { destinations: resolved.map((r) => ({ code: r.code, name: r.name })), zone };
}

function validateTrip({ start_date, end_date }) {
  if (!start_date) throw new ApiError('missing_start_date', 'Falta la fecha de salida.', { field: 'start_date', hint: 'Formato AAAA-MM-DD.' });
  if (!end_date) throw new ApiError('missing_end_date', 'Falta la fecha de vuelta.', { field: 'end_date', hint: 'Formato AAAA-MM-DD.' });
  const start = parseDate(start_date, 'start_date');
  const end = parseDate(end_date, 'end_date');
  const today = todayMadrid();
  if (start < today)
    throw new ApiError('start_in_past', `La fecha de salida (${start}) ya ha pasado; hoy es ${today} en España.`, {
      field: 'start_date',
      hint: 'El seguro debe contratarse antes de salir. Usa una fecha de salida de hoy en adelante.',
    });
  if (dayDiff(today, start) > MAX_DAYS_IN_ADVANCE)
    throw new ApiError('start_too_far', `Solo se puede contratar con hasta ${MAX_DAYS_IN_ADVANCE} días de antelación.`, {
      field: 'start_date',
    });
  if (end < start)
    throw new ApiError('end_before_start', 'La fecha de vuelta es anterior a la de salida.', {
      field: 'end_date',
      hint: '¿Están las fechas al revés? end_date debe ser igual o posterior a start_date.',
    });
  const days = dayDiff(start, end) + 1;
  if (days > MAX_DAYS)
    throw new ApiError('trip_too_long', `El viaje dura ${days} días y el máximo es ${MAX_DAYS}.`, {
      field: 'end_date',
      hint: `Para viajes de más de ${MAX_DAYS} días haría falta un seguro de larga estancia, que esta demo no ofrece.`,
    });
  return { start_date: start, end_date: end, days };
}

function event(order, actor, action, detail = null) {
  order.events.push({ at: new Date().toISOString(), actor, action, ...(detail ? { detail } : {}) });
}

function newId(prefix, bytes = 5) {
  return `${prefix}${crypto.randomBytes(bytes).toString('base64url').replace(/[-_]/g, 'x').slice(0, bytes + 3).toUpperCase()}`;
}

function planSummary(p) {
  return {
    plan: p.plan,
    name: p.name,
    available: p.available,
    ...(p.unavailable_reason ? { unavailable_reason: p.unavailable_reason } : {}),
    total_eur: p.total_eur,
    total_text: formatEur(p.total_eur),
    per_traveler_eur: p.per_traveler.map((l) => l.price_eur),
    taxes_included_eur: p.taxes_eur,
    ...(p.group_discount_pct ? { group_discount_pct: p.group_discount_pct } : {}),
  };
}

function keyCoverages(planId, zone) {
  return coveragesFor(planId, zone).map((c) => ({
    coverage: c.name,
    limit: c.limit_text,
    deductible: c.deductible_eur ? formatEur(c.deductible_eur, 0) : 'Sin franquicia',
  }));
}

export function publicOrder(order) {
  return {
    quote_id: order.id,
    status: order.status,
    channel: order.channel,
    from_saved: Boolean(order.from_saved),
    expires_at: order.status === 'paid' ? null : order.expires_at,
    trip: order.trip,
    plan: order.plan,
    quote: order.quote,
    holder: order.holder,
    travelers: order.travelers,
    total_eur: order.plan ? order.quote.plans[order.plan].total_eur : null,
    review_token: atLeast(order, 'reviewed') ? order.review?.token ?? null : null,
    payment: order.payment ? { card_last4: order.payment.card_last4, paid_at: order.payment.paid_at, user_confirmation: order.payment.user_confirmation } : null,
    terms_version: TERMS_VERSION,
    policy: order.policy
      ? {
          policy_number: order.policy.number,
          issued_at: order.policy.issued_at,
          pdf_url: `/api/policies/${order.policy.number}/pdf?token=${order.policy.pdf_token}`,
          email: order.policy.email,
        }
      : null,
  };
}

export function createOrderService({ store, issuePolicy, sendPolicyEmail }) {
  function load(id) {
    const order = store.getOrder(String(id ?? '').trim());
    if (!order)
      throw new ApiError('quote_not_found', `No existe ninguna cotización con quote_id "${id}".`, {
        field: 'quote_id',
        status: 404,
        hint: 'Usa el quote_id que devolvió get_quote, o pide una cotización nueva con get_quote.',
      });
    if (order.status !== 'paid' && new Date(order.expires_at) < new Date())
      throw new ApiError('quote_expired', 'La cotización ha caducado.', {
        field: 'quote_id',
        status: 410,
        hint: 'Pide una cotización nueva con get_quote y repite los pasos (los precios pueden cambiar).',
      });
    if (order.status !== 'paid' && order.trip.start_date < todayMadrid())
      throw new ApiError('start_in_past', 'La fecha de salida de esta cotización ya ha pasado.', {
        hint: 'Pide una cotización nueva con fechas futuras.',
      });
    return order;
  }

  function assertNotPaid(order) {
    if (order.status === 'paid')
      throw new ApiError('already_paid', `Esta cotización ya está pagada: póliza ${order.policy.number}.`, {
        status: 409,
        hint: 'No hace falta hacer nada más. Usa get_policy para ver la póliza.',
      });
  }

  // Si algo cambia después de revisar, hay que volver a revisar y aceptar condiciones.
  function regress(order, to) {
    if (STATUS_ORDER.indexOf(order.status) > STATUS_ORDER.indexOf(to)) {
      order.status = to;
      order.review = null;
      order.terms = null;
    }
  }

  function reprice(order, ages) {
    order.quote = priceTrip({ zone: order.trip.zone, days: order.trip.days, travelers: ages.map((age) => ({ age })) });
    order.quote_ages = ages;
  }

  function reviewToken(order) {
    const payload = JSON.stringify([
      order.id, order.plan, order.trip, order.holder, order.travelers, order.quote.plans[order.plan].total_eur, TERMS_VERSION,
    ]);
    return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 12);
  }

  return {
    load,

    createQuote(input = {}, actor = 'web') {
      if (input.residence_country) {
        const r = resolveDestination(input.residence_country);
        if (r.code !== 'ES')
          throw new ApiError('residence_not_supported', 'Escala solo asegura a personas que residen en España.', {
            field: 'residence_country',
            hint: 'Si el viajero reside en España, usa residence_country "ES" o no envíes este campo.',
          });
      }
      const { destinations, zone } = resolveDestinations(input.destinations ?? input.destination);
      const dates = validateTrip(input);
      let travelers = input.travelers;
      if (!Array.isArray(travelers) && Array.isArray(input.ages)) travelers = input.ages;
      if (!Array.isArray(travelers) || travelers.length === 0)
        throw new ApiError('missing_travelers', 'Faltan los viajeros.', {
          field: 'travelers',
          hint: 'Envía la edad de cada viajero, por ejemplo [{"age": 34}, {"age": 32}].',
        });
      if (travelers.length > MAX_TRAVELERS)
        throw new ApiError('too_many_travelers', `Máximo ${MAX_TRAVELERS} viajeros por póliza.`, {
          field: 'travelers',
          hint: 'Divide el grupo en varias pólizas.',
        });
      const ages = travelers.map((t, i) => parseAge(t, `travelers[${i}].age`, dates.start_date));

      const now = new Date();
      const order = {
        id: newId('Q-'),
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + QUOTE_TTL_MINUTES * 60000).toISOString(),
        status: 'quoted',
        channel: actor === 'agent' ? 'agente_ia' : 'web',
        trip: { destinations, zone, zone_name: ZONES[zone].name, ...dates, residence_country: 'ES' },
        plan: null,
        holder: null,
        travelers: null,
        review: null,
        terms: null,
        payment: null,
        policy: null,
        events: [],
      };
      reprice(order, ages);
      event(order, actor, 'quote_created');
      store.putOrder(order);
      return order;
    },

    // Guardar la cotización para más tarde: se envía por email con un enlace para retomarla.
    saveQuote(id, input = {}, actor = 'web') {
      const order = load(id);
      assertNotPaid(order);
      const email = String(input.email ?? '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        throw new ApiError('invalid_email', `El email "${input.email ?? ''}" no es válido.`, {
          field: 'email',
          hint: 'Pide al usuario el email donde quiere recibir la cotización.',
        });
      if (actor === 'agent' && input.user_agreed !== true)
        throw new ApiError('consent_required', 'Falta la conformidad del usuario para enviarle la cotización.', {
          field: 'user_agreed',
          hint: 'Pregunta al usuario si quiere recibir la cotización por email y envía user_agreed: true solo si dice que sí.',
        });
      order.saved = { email, at: new Date().toISOString(), by: actor, count: (order.saved?.count ?? 0) + 1 };
      event(order, actor, 'quote_saved', email);
      store.putOrder(order);
      return order;
    },

    // Retomar una cotización guardada. Si caducó (2 h) pero el viaje sigue en el futuro,
    // se crea una nueva con el mismo viaje y el precio de hoy.
    resumeQuote(id, actor = 'web') {
      const original = store.getOrder(String(id ?? '').trim());
      if (!original)
        throw new ApiError('quote_not_found', `No existe ninguna cotización con quote_id "${id}".`, { field: 'quote_id', status: 404, hint: 'Pide una cotización nueva.' });
      if (original.status === 'paid') return { order: original, resumed: 'already_paid' };
      const prefill = { destinations: original.trip.destinations.map((d) => d.name), ages: original.quote_ages };
      if (original.trip.start_date < todayMadrid())
        throw new ApiError('start_in_past', 'La fecha de salida de esta cotización ya ha pasado.', {
          status: 410,
          hint: 'Elige fechas nuevas: mantenemos el destino y las edades.',
          details: { prefill },
        });
      const fresh = new Date(original.expires_at) >= new Date();
      let order = original;
      if (!fresh) {
        order = this.createQuote(
          { destinations: original.trip.destinations.map((d) => d.code ?? d.name), start_date: original.trip.start_date, end_date: original.trip.end_date, travelers: original.quote_ages.map((age) => ({ age })) },
          actor
        );
        order.channel = original.channel;
        order.resumed_from = original.id;
        if (original.plan) {
          order.plan = original.plan;
          order.status = 'plan_selected';
        }
        original.recovered_by = order.id;
        store.putOrder(original);
      }
      order.resumed = (order.resumed ?? 0) + 1;
      order.from_saved = true;
      event(order, actor, 'quote_resumed', fresh ? 'misma cotización' : `recalculada desde ${original.id}`);
      store.putOrder(order);
      const before = original.plan ? original.quote.plans[original.plan].total_eur : null;
      const after = order.plan ? order.quote.plans[order.plan].total_eur : null;
      return { order, resumed: fresh ? 'same' : 'repriced', price_changed: before !== null && after !== null && before !== after, previous_total_eur: before };
    },

    selectPlan(id, planInput, actor = 'web') {
      const order = load(id);
      assertNotPaid(order);
      const plan = planById(planInput);
      if (!plan)
        throw new ApiError('unknown_plan', `No existe el plan "${planInput}".`, {
          field: 'plan',
          hint: 'Los planes son "esencial", "completo" y "total".',
        });
      const priced = order.quote.plans[plan.id];
      if (!priced.available)
        throw new ApiError('plan_not_available', priced.unavailable_reason, {
          field: 'plan',
          hint: 'Elige "completo" o "total", que admiten viajeros de hasta 84 años.',
        });
      if (order.plan !== plan.id) regress(order, order.travelers ? 'travelers_set' : 'plan_selected');
      order.plan = plan.id;
      if (!atLeast(order, 'plan_selected')) order.status = 'plan_selected';
      event(order, actor, 'plan_selected', plan.id);
      store.putOrder(order);
      return order;
    },

    setTravelers(id, input = {}, actor = 'web') {
      const order = load(id);
      assertNotPaid(order);
      if (!order.plan)
        throw new ApiError('plan_not_selected', 'Antes de los datos de los viajeros hay que elegir un plan.', {
          hint: 'Llama a select_plan con "esencial", "completo" o "total".',
          status: 409,
        });
      const holder = input.holder || {};
      const holderName = String(holder.full_name ?? holder.name ?? '').trim();
      const email = String(holder.email ?? '').trim().toLowerCase();
      if (holderName.length < 3)
        throw new ApiError('missing_holder_name', 'Falta el nombre y apellidos del tomador (quien contrata y recibe la póliza).', {
          field: 'holder.full_name',
        });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        throw new ApiError('invalid_email', `El email "${holder.email ?? ''}" no es válido.`, {
          field: 'holder.email',
          hint: 'La póliza se envía a este email. Pide al usuario un email correcto.',
        });
      const list = input.travelers;
      if (!Array.isArray(list) || list.length === 0)
        throw new ApiError('missing_travelers', 'Faltan los datos de los viajeros asegurados.', {
          field: 'travelers',
          hint: 'Envía nombre completo y edad (o fecha de nacimiento) de cada viajero.',
        });
      if (list.length > MAX_TRAVELERS)
        throw new ApiError('too_many_travelers', `Máximo ${MAX_TRAVELERS} viajeros por póliza.`, { field: 'travelers' });
      const travelers = list.map((t, i) => {
        const name = String(t.full_name ?? t.name ?? '').trim();
        if (name.length < 3 || !/\s/.test(name))
          throw new ApiError('invalid_traveler_name', `Falta el nombre y apellido del viajero ${i + 1}.`, {
            field: `travelers[${i}].full_name`,
            hint: 'Indica nombre y al menos un apellido, por ejemplo "Lucía Martín".',
          });
        const age = parseAge(t.birth_date ? { birth_date: t.birth_date } : t.age, `travelers[${i}].age`, order.trip.start_date);
        const doc = t.document_id ? String(t.document_id).trim().toUpperCase().slice(0, 20) : null;
        return { full_name: name, age, ...(t.birth_date ? { birth_date: parseDate(t.birth_date, `travelers[${i}].birth_date`) } : {}), document_id: doc };
      });

      const previousTotal = order.quote.plans[order.plan].total_eur;
      const ages = travelers.map((t) => t.age);
      const agesChanged = JSON.stringify(ages) !== JSON.stringify(order.quote_ages);
      if (agesChanged) {
        const before = order.quote;
        reprice(order, ages);
        if (!order.quote.plans[order.plan].available) {
          const reason = order.quote.plans[order.plan].unavailable_reason;
          order.quote = before;
          throw new ApiError('plan_not_available', reason, {
            field: 'travelers',
            hint: 'Cambia a "completo" o "total" con select_plan y vuelve a enviar los viajeros.',
          });
        }
      }
      regress(order, 'travelers_set');
      order.holder = { full_name: holderName, email, phone: holder.phone ? String(holder.phone).slice(0, 25) : null };
      order.travelers = travelers;
      order.status = 'travelers_set';
      event(order, actor, 'travelers_set', `${travelers.length} viajero(s)`);
      store.putOrder(order);
      const newTotal = order.quote.plans[order.plan].total_eur;
      return { order, price_changed: agesChanged && newTotal !== previousTotal, previous_total_eur: previousTotal };
    },

    review(id, actor = 'web') {
      const order = load(id);
      if (order.status === 'paid') return { order, summary: summaryOf(order) };
      if (!atLeast(order, 'travelers_set'))
        throw new ApiError('travelers_missing', 'Faltan los datos del tomador y de los viajeros.', {
          status: 409,
          hint: order.plan ? 'Llama a set_travelers.' : 'Llama primero a select_plan y después a set_travelers.',
        });
      order.review = { token: reviewToken(order), at: new Date().toISOString() };
      if (!atLeast(order, 'reviewed')) order.status = 'reviewed';
      event(order, actor, 'order_reviewed');
      store.putOrder(order);
      return { order, summary: summaryOf(order) };
    },

    acceptTerms(id, input = {}, actor = 'web') {
      const order = load(id);
      assertNotPaid(order);
      if (!atLeast(order, 'reviewed') || !order.review)
        throw new ApiError('review_required', 'Antes de aceptar las condiciones hay que revisar el resumen del pedido.', {
          status: 409,
          hint: 'Llama a review_order, enseña el resumen al usuario y usa el review_token que devuelve.',
        });
      if (input.accepted !== true)
        throw new ApiError('terms_not_accepted', 'Para contratar hay que aceptar las condiciones.', {
          field: 'accepted',
          hint: 'Envía accepted: true solo si el usuario ha aceptado las condiciones.',
        });
      if (input.terms_version && input.terms_version !== TERMS_VERSION)
        throw new ApiError('terms_version_mismatch', `Las condiciones vigentes son la versión ${TERMS_VERSION}.`, {
          field: 'terms_version',
          hint: 'Vuelve a llamar a review_order para ver las condiciones vigentes.',
        });
      if (input.review_token !== order.review.token || reviewToken(order) !== order.review.token)
        throw new ApiError('review_outdated', 'El pedido ha cambiado desde la última revisión o el review_token no coincide.', {
          field: 'review_token',
          status: 409,
          hint: 'Llama otra vez a review_order y usa el review_token nuevo.',
        });
      order.terms = { version: TERMS_VERSION, accepted_at: new Date().toISOString(), by: actor };
      order.status = 'terms_accepted';
      event(order, actor, 'terms_accepted', TERMS_VERSION);
      store.putOrder(order);
      return order;
    },

    async pay(id, input = {}, actor = 'web') {
      const order = load(id);
      if (order.status === 'paid') return { order, already_paid: true };
      if (order.status !== 'terms_accepted')
        throw new ApiError('not_ready_to_pay', 'El pedido todavía no está listo para pagar.', {
          status: 409,
          hint: atLeast(order, 'reviewed')
            ? 'Falta aceptar las condiciones: llama a accept_terms.'
            : 'Sigue el orden: select_plan → set_travelers → review_order → accept_terms → pay.',
          details: { current_status: order.status },
        });
      if (reviewToken(order) !== order.review?.token)
        throw new ApiError('review_outdated', 'El pedido ha cambiado desde la revisión.', {
          status: 409,
          hint: 'Llama otra vez a review_order y a accept_terms.',
        });
      const confirmation = String(input.user_confirmation ?? '').trim();
      if (confirmation.length < 2)
        throw new ApiError('confirmation_required', 'Falta la confirmación del usuario para pagar.', {
          field: 'user_confirmation',
          hint: 'Enseña el resumen de review_order, pregunta si quiere pagar y espera su respuesta. Envía en user_confirmation sus palabras exactas (por ejemplo «sí, paga»). Una orden anterior al resumen no vale.',
        });
      const total = order.quote.plans[order.plan].total_eur;
      const amount = Number(input.amount_eur);
      if (!Number.isFinite(amount) || Math.abs(amount - total) > 0.005)
        throw new ApiError('amount_mismatch', `El importe a pagar es ${formatEur(total)} y se ha enviado ${input.amount_eur ?? 'nada'}.`, {
          field: 'amount_eur',
          hint: `Envía amount_eur: ${total}. Este control evita pagar un importe distinto del que vio el usuario.`,
        });
      const card = String(input.card_number ?? '').replace(/[\s-]/g, '');
      if (!/^\d{13,19}$/.test(card))
        throw new ApiError('invalid_card', 'El número de tarjeta no es válido.', {
          field: 'card_number',
          hint: 'Es una demo: usa la tarjeta de prueba 4242 4242 4242 4242.',
        });
      const test = TEST_CARDS[card];
      if (!test) {
        event(order, actor, 'payment_rejected', 'tarjeta no de prueba');
        store.putOrder(order);
        throw new ApiError('real_card_not_allowed', 'Esta demo no acepta tarjetas reales. No se ha cobrado nada.', {
          field: 'card_number',
          hint: 'Usa la tarjeta de prueba 4242 4242 4242 4242.',
        });
      }
      if (test.result !== 'approved') {
        event(order, actor, 'payment_declined', test.result);
        store.putOrder(order);
        throw new ApiError(
          test.result === 'declined' ? 'card_declined' : 'insufficient_funds',
          test.result === 'declined' ? 'El banco ha rechazado la tarjeta. No se ha cobrado nada.' : 'La tarjeta no tiene fondos suficientes. No se ha cobrado nada.',
          { field: 'card_number', status: 402, hint: 'Pide al usuario otra tarjeta. En la demo, la que funciona es 4242 4242 4242 4242.' }
        );
      }
      order.payment = {
        id: newId('PAY-', 6),
        amount_eur: total,
        card_last4: card.slice(-4),
        card_label: test.label,
        paid_at: new Date().toISOString(),
        by: actor,
        user_confirmation: confirmation.slice(0, 200),
      };
      order.policy = issuePolicy(order);
      order.status = 'paid';
      event(order, actor, 'paid', `${formatEur(total)} con tarjeta ****${card.slice(-4)}`);
      event(order, 'system', 'policy_issued', order.policy.number);
      store.putOrder(order);
      await sendPolicyEmail(order);
      store.putOrder(order);
      return { order, already_paid: false };
    },

    getByPolicy(number) {
      const n = String(number ?? '').trim().toUpperCase();
      const id = store.orderIdForPolicy(n);
      if (!id)
        throw new ApiError('policy_not_found', `No existe la póliza "${number}".`, {
          field: 'policy_number',
          status: 404,
          hint: 'El número de póliza tiene el formato ESC-AAMM-XXXXXX. También puedes buscarla por quote_id.',
        });
      return store.getOrder(id);
    },

    async resendEmail(order, email, actor = 'web') {
      if (email) {
        const e = String(email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))
          throw new ApiError('invalid_email', `El email "${email}" no es válido.`, { field: 'email' });
        if (e !== order.holder.email) event(order, actor, 'email_changed', `${order.holder.email} → ${e}`);
        order.holder.email = e;
      }
      event(order, actor, 'email_resend_requested');
      await sendPolicyEmail(order);
      store.putOrder(order);
      return order;
    },
  };
}

export function summaryOf(order) {
  const p = order.quote.plans[order.plan];
  return {
    plan: { id: order.plan, name: p.name },
    trip: {
      destinations: order.trip.destinations.map((d) => d.name).join(', '),
      zone: order.trip.zone_name,
      start_date: order.trip.start_date,
      end_date: order.trip.end_date,
      days: order.trip.days,
    },
    holder: order.holder,
    insured: order.travelers.map((t, i) => ({ ...t, price_eur: p.per_traveler[i]?.price_eur })),
    total_eur: p.total_eur,
    total_text: formatEur(p.total_eur),
    taxes_included_eur: p.taxes_eur,
    ...(p.group_discount_pct ? { group_discount_pct: p.group_discount_pct } : {}),
    coverages: keyCoverages(order.plan, order.trip.zone),
    main_exclusions: EXCLUSIONS,
    terms: {
      version: TERMS_VERSION,
      url: '/condiciones',
      key_points: [
        'Demo: no es un seguro real y no se cobra dinero real.',
        'Cobertura desde la fecha de salida hasta la de vuelta, ambas incluidas.',
        'Desistimiento: 14 días desde la contratación si el viaje no ha empezado.',
        'Asistencia 24 horas por teléfono durante todo el viaje.',
      ],
    },
  };
}

export { planSummary, keyCoverages, STATUS_ORDER, countryName, PLANS };
