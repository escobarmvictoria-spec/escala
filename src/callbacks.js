// Transferencia a una persona: la web o el agente piden que alguien del equipo llame al cliente,
// con el contexto de la compra para que no tenga que repetir nada.
import crypto from 'node:crypto';
import { ApiError } from './errors.js';
import { formatEur } from './catalog.js';

export const CALLBACK_REASONS = {
  enfermedad_previa: 'Enfermedad previa o tratamiento médico',
  no_asegurable: 'Su caso no se puede contratar online (destino o duración)',
  dudas_coberturas: 'Dudas sobre coberturas o qué plan elegir',
  siniestro: 'Tiene un problema durante el viaje o quiere declarar un siniestro',
  otro: 'Otro motivo',
};
const REASON_SHORT = {
  enfermedad_previa: 'enfermedad previa',
  no_asegurable: 'no se puede contratar online',
  dudas_coberturas: 'dudas de coberturas',
  siniestro: 'problema en el viaje',
  otro: 'otro motivo',
};
export const CALLBACK_TIMES = { sin_preferencia: 'Sin preferencia', cuanto_antes: 'Cuanto antes', manana_manana: 'Mañana por la mañana', manana_tarde: 'Mañana por la tarde' };
export const ASSISTANCE_PHONE = '+34 900 000 000';

function madridHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(date));
}

// Horario de atención ficticio de la demo: de 9:00 a 21:00, hora de España.
export function callbackWindow(preferred, date = new Date()) {
  const h = madridHour(date);
  if (preferred === 'manana_manana') return 'mañana entre las 9:00 y las 14:00';
  if (preferred === 'manana_tarde') return 'mañana entre las 15:00 y las 21:00';
  if (h >= 9 && h < 21) return 'hoy, en horario de 9:00 a 21:00';
  return h >= 21 ? 'mañana a partir de las 9:00' : 'hoy a partir de las 9:00';
}

export function createCallbackService({ store, notifyTeam }) {
  return {
    async create(input = {}, actor = 'web') {
      const name = String(input.full_name ?? input.name ?? '').trim();
      if (name.length < 2)
        throw new ApiError('missing_name', 'Falta el nombre de la persona a la que hay que llamar.', { field: 'full_name' });
      const phone = String(input.phone ?? '').trim();
      const digits = phone.replace(/[^\d]/g, '');
      if (digits.length < 9 || digits.length > 15)
        throw new ApiError('invalid_phone', `El teléfono "${phone}" no es válido.`, {
          field: 'phone',
          hint: 'Pide un teléfono de 9 cifras (o con prefijo internacional), por ejemplo 600 123 456.',
        });
      if (input.user_agreed !== true)
        throw new ApiError('consent_required', 'Falta que la persona acepte que la llamen.', {
          field: 'user_agreed',
          hint: 'Pregunta al usuario si quiere que le llame alguien del equipo y envía user_agreed: true solo si dice que sí.',
        });
      const reason = CALLBACK_REASONS[input.reason] ? input.reason : 'otro';
      // Un problema durante el viaje no espera a una llamada comercial: va al teléfono de asistencia 24 h.
      if (reason === 'siniestro')
        throw new ApiError('use_assistance_phone', `Para un problema durante el viaje, llama a la asistencia 24 horas: ${ASSISTANCE_PHONE} (en la demo, ficticio). Está en la póliza.`, {
          field: 'reason',
          status: 422,
          hint: `No pidas una llamada: dale al usuario el teléfono de asistencia que figura en su póliza, ${ASSISTANCE_PHONE}.`,
        });
      const preferred = CALLBACK_TIMES[input.preferred_time] ? input.preferred_time : 'sin_preferencia';

      let context = null;
      if (input.quote_id) {
        const order = store.getOrder(String(input.quote_id).trim());
        if (order) {
          const p = order.plan ? order.quote.plans[order.plan] : null;
          context = {
            quote_id: order.id,
            status: order.status,
            trip: `${order.trip.destinations.map((d) => d.name).join(', ')}, ${order.trip.start_date} a ${order.trip.end_date} (${order.trip.days} días)`,
            travelers: (order.travelers ?? order.quote_ages.map((age) => ({ age }))).map((t) => (t.full_name ? `${t.full_name} (${t.age})` : `${t.age} años`)).join(', '),
            plan: p ? `${p.name}, ${formatEur(p.total_eur)}` : null,
          };
          order.events.push({ at: new Date().toISOString(), actor, action: 'human_requested', detail: reason });
          store.putOrder(order);
        }
      }
      // Sin cotización (por ejemplo, la edad bloqueó el cotizador): se adjunta el viaje que intentó cotizar.
      if (!context && input.trip_attempt && typeof input.trip_attempt === 'object') {
        const a = input.trip_attempt;
        const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
        const dest = clean(Array.isArray(a.destinations) ? a.destinations.join(', ') : a.destinations, 120);
        const ages = (Array.isArray(a.ages) ? a.ages : []).slice(0, 6).map((x) => Number(x)).filter((x) => Number.isFinite(x));
        if (dest || ages.length)
          context = {
            quote_id: null,
            status: 'sin_cotizacion',
            trip: `${dest || 'destino sin indicar'}, ${clean(a.start_date, 10) || '?'} a ${clean(a.end_date, 10) || '?'} (intento de cotización)`,
            travelers: ages.map((x) => `${x} años`).join(', ') || 'sin indicar',
            plan: null,
          };
      }
      const cb = {
        id: `LL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        created_at: new Date().toISOString(),
        channel: actor === 'agent' ? 'agente_ia' : 'web',
        full_name: name.slice(0, 80),
        phone: phone.slice(0, 25),
        email: input.email ? String(input.email).trim().slice(0, 120) : null,
        reason,
        reason_text: CALLBACK_REASONS[reason],
        preferred_time: preferred,
        when: callbackWindow(preferred),
        summary: input.summary ? String(input.summary).trim().slice(0, 1000) : null,
        context,
        team_notified: null,
      };
      store.putCallback(cb);
      cb.team_notified = await notifyTeam(cb);
      store.putCallback(cb);
      return cb;
    },
    get(id) {
      const cb = store.getCallback(String(id ?? '').trim().toUpperCase());
      if (!cb) throw new ApiError('callback_not_found', `No existe la solicitud "${id}".`, { status: 404 });
      return cb;
    },
  };
}

export function publicCallback(cb) {
  return {
    ticket: cb.id,
    full_name: cb.full_name,
    phone: cb.phone,
    reason: cb.reason_text,
    when: cb.when,
    channel: cb.channel,
    context_attached: Boolean(cb.context),
    context_kind: cb.context ? (cb.context.quote_id ? 'cotizacion' : 'intento') : null,
    quote_id: cb.context?.quote_id ?? null,
  };
}

export function teamEmail(cb) {
  const lines = [
    `Solicitud ${cb.id} (${cb.channel === 'agente_ia' ? 'pedida por un agente de IA' : 'pedida en la web'})`,
    `Llamar a: ${cb.full_name}, ${cb.phone}${cb.email ? `, ${cb.email}` : ''}`,
    `Cuándo: ${cb.when}`,
    `Motivo: ${cb.reason_text}`,
    cb.summary ? `Lo que ya sabemos: ${cb.summary}` : null,
    cb.context ? `${cb.context.quote_id ? 'Compra en curso' : 'Viaje que intentó cotizar'}: ${cb.context.trip}; viajeros: ${cb.context.travelers}${cb.context.plan ? `; plan ${cb.context.plan}` : ''}${cb.context.quote_id ? `; estado ${cb.context.status} (${cb.context.quote_id})` : ''}` : null,
    '',
    'Demo — no es un seguro real.',
  ].filter((l) => l !== null);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return {
    subject: `Llamar a ${cb.full_name}: ${REASON_SHORT[cb.reason] ?? 'otro motivo'} (${cb.id})`,
    text: lines.join('\n'),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#19233F">${lines.map((l) => (l ? `<p style="margin:0 0 8px">${esc(l)}</p>` : '')).join('')}</div>`,
  };
}
