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
