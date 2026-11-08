// Núcleo compartido por la interfaz y por las herramientas WebMCP:
// los dos usan la misma API y el mismo estado, así la página muestra lo que hace el agente.

const listeners = new Set();
const state = {
  order: null,
  plans: null,
  coverages: null,
  summary: null,
  agentDriving: false,
  activity: [],
  attempt: null, // último viaje que no se pudo cotizar (para pasárselo al equipo si pide que le llamen)
};

function restore() {
  try {
    const id = sessionStorage.getItem('escala.quote_id');
    return id || null;
  } catch {
    return null;
  }
}

function persist(id) {
  try {
    if (id) sessionStorage.setItem('escala.quote_id', id);
    else sessionStorage.removeItem('escala.quote_id');
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export class ApiFailure extends Error {
  constructor(body, status) {
    super(body?.error?.message || `Error ${status}`);
    this.body = body;
    this.status = status;
  }
}

// Los errores de la API están escritos para agentes de IA (qué campo enviar, qué herramienta llamar).
// En la web, la persona recibe la misma información dicha para ella. Los agentes siguen viendo el original.
const CARD_HELP = 'En la demo funciona la tarjeta de prueba 4242 4242 4242 4242.';
const HUMAN_ERRORS = {
  missing_destination: () => 'Escribe a dónde viajas.',
  unknown_destination: (e) => {
    const typed = /"(.+)"/.exec(e.message)?.[1];
    const guess = /¿Querías decir ([^?]+)\?/.exec(e.how_to_fix ?? '')?.[1]?.replace(/\s*\([A-Z]{2}\)/g, '');
    const what = typed ? `«${typed}»` : 'ese destino';
    return guess ? `No encontramos ${what}. ¿Querías decir ${guess}?` : `No encontramos ${what}. Escribe el nombre del país, por ejemplo «Japón» o «Italia».`;
  },
  destination_excluded: (e) => e.message,
  invalid_age: () => 'Revisa la edad: escribe los años con un número, por ejemplo 34.',
  age_not_insurable: (e) => {
    const age = e.details?.age;
    const max = e.details?.max_age ?? 84;
    const who = (e.details?.travelers ?? 1) > 1 ? `Uno de los viajeros tiene ${age}` : `El viajero tiene ${age}`;
    return `Escala cubre a viajeros de hasta ${max} años en la fecha de salida. ${who}, así que no podemos ofrecerle un seguro para este viaje.${(e.details?.travelers ?? 1) > 1 ? ' Puedes quitarlo de la cotización y cotizar al resto.' : ''} Si buscáis otra póliza, comprobad que admita su edad y qué límite de gastos médicos se le aplica.`;
  },
  missing_start_date: () => 'Elige la fecha de salida.',
  missing_end_date: () => 'Elige la fecha de vuelta.',
  invalid_date: () => 'Revisa las fechas: alguna no es válida.',
  start_in_past: () => 'La fecha de salida ya ha pasado. El seguro se contrata antes de salir: elige una fecha de hoy en adelante.',
  end_before_start: () => 'La vuelta es anterior a la salida. Revisa que las fechas no estén al revés.',
  trip_too_long: (e) => `${e.message} Para viajes más largos hace falta un seguro de larga estancia, que Escala no ofrece.`,
  too_many_travelers: () => 'Puedes asegurar hasta 6 viajeros por póliza.',
  missing_holder_name: () => 'Escribe tu nombre y apellidos.',
  invalid_email: () => 'Revisa el email: es donde te enviaremos la póliza.',
  quote_expired: () => 'Tu cotización ha caducado (duran 2 horas). Vuelve a calcular el precio arriba.',
  quote_not_found: () => 'No encontramos esta cotización. Vuelve a calcular el precio arriba.',
  review_outdated: () => 'Has cambiado algo después de revisar el resumen. Revísalo de nuevo antes de pagar.',
  invalid_card: () => `Revisa el número de tarjeta. ${CARD_HELP}`,
  real_card_not_allowed: (e) => `${e.message} ${CARD_HELP}`,
  card_declined: (e) => `${e.message} Prueba con otra tarjeta. ${CARD_HELP}`,
  insufficient_funds: (e) => `${e.message} Prueba con otra tarjeta. ${CARD_HELP}`,
  invalid_phone: () => 'Revisa el teléfono: escribe 9 cifras, por ejemplo 600 123 456, o el número con prefijo internacional.',
  consent_required: () => 'Marca la casilla para que podamos llamarte.',
  rate_limited: () => 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  internal_error: () => 'Algo ha fallado de nuestro lado. No se ha cobrado nada. Vuelve a intentarlo en unos segundos.',
};

export function humanError(err) {
  const e = err instanceof ApiFailure ? err.body?.error : null;
  if (!e) return err?.message || 'Algo ha fallado. Vuelve a intentarlo.';
  const fn = HUMAN_ERRORS[e.code];
  return fn ? fn(e) : e.message;
}

async function request(method, url, body, actor = 'web') {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-escala-actor': actor },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: { code: 'bad_response', message: `Respuesta inesperada del servidor (${res.status}).` } };
  }
  if (!res.ok || data.ok === false) throw new ApiFailure(data, res.status);
  return data;
}

export const api = {
  product: () => request('GET', '/api/product'),
  quote: (input, actor) => request('POST', '/api/quotes', input, actor),
  getQuote: (id, actor) => request('GET', `/api/quotes/${encodeURIComponent(id)}`, null, actor),
  selectPlan: (id, plan, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/plan`, { plan }, actor),
  setTravelers: (id, input, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/travelers`, input, actor),
  review: (id, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/review`, {}, actor),
  acceptTerms: (id, input, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/accept-terms`, input, actor),
  pay: (id, input, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/pay`, input, actor),
  policy: (number, actor) => request('GET', `/api/policies/${encodeURIComponent(number)}`, null, actor),
  resend: (number, email, actor) => request('POST', `/api/policies/${encodeURIComponent(number)}/resend`, email ? { email } : {}, actor),
  callback: (input, actor) => request('POST', '/api/callbacks', input, actor),
  saveQuote: (id, input, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/save`, input, actor),
  resumeQuote: (id, actor) => request('POST', `/api/quotes/${encodeURIComponent(id)}/resume`, {}, actor),
  agentStatus: () => request('GET', '/api/agent/status'),
  agentTurn: (payload) => request('POST', '/api/agent/turn', payload),
};

export const store = {
  state,
  savedQuoteId: restore,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(reason, extra = {}) {
    for (const fn of listeners) {
      try {
        fn(state, reason, extra);
      } catch (e) {
        console.error(e);
      }
    }
  },
  // Cada respuesta de la API actualiza el estado y la interfaz se vuelve a pintar.
  apply(data, reason, extra) {
    if (data.order) {
      if (state.order && state.order.quote_id !== data.order.quote_id) {
        state.summary = null;
        state.agentDriving = false;
      }
      state.order = data.order;
      persist(data.order.quote_id);
    }
    if (data.plans) state.plans = data.plans;
    if (data.coverages_by_plan) state.coverages = data.coverages_by_plan;
    if (data.summary) state.summary = data.summary;
    if (extra?.by === 'agent') state.agentDriving = true;
    this.emit(reason, extra);
  },
  reset() {
    state.order = null;
    state.plans = null;
    state.summary = null;
    state.coverages = null;
    state.agentDriving = false;
    persist(null);
    this.emit('reset');
  },
  log(entry) {
    state.activity.unshift({ at: new Date(), ...entry });
    state.activity = state.activity.slice(0, 60);
    this.emit('activity', entry);
  },
};

export const eur = (n) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n);

export const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

window.Escala = { api, store };
