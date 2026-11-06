// Herramientas WebMCP de Escala.
// Se registran con document.modelContext (estándar actual) y quedan también accesibles como
// navigator.modelContext. Si el navegador no trae WebMCP, el polyfill @mcp-b/global lo aporta.
import { api, store, ApiFailure } from './core.js';

const AGENT = 'agent';
const PLAN_ENUM = ['esencial', 'completo', 'total'];

// Resultado con el formato de MCP (content + isError). Lo entienden los agentes que leen WebMCP
// directamente y los clientes MCP que se conectan a través del puente MCP-B.
const out = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }], ...(obj.ok === false ? { isError: true } : {}) });
const absolute = (url) => new URL(url, location.origin).href;

function failure(err) {
  if (err instanceof ApiFailure && err.body?.error) return { ok: false, error: err.body.error };
  return { ok: false, error: { code: 'network_error', message: err.message, how_to_fix: 'Vuelve a intentarlo en unos segundos.' } };
}

function highlights(planId, product) {
  const p = product?.plans.find((x) => x.id === planId);
  if (!p) return undefined;
  const pick = (name) => p.coverages.find((c) => c.coverage.startsWith(name));
  const med = pick('Gastos médicos');
  return {
    medical_expenses: med?.limit,
    medical_deductible: med?.deductible,
    trip_cancellation: pick('Cancelación')?.limit ?? 'No incluida',
    baggage: pick('Robo, pérdida')?.limit,
    not_included: p.not_included,
  };
}

let productCache = null;
async function product() {
  if (!productCache) productCache = await api.product();
  return productCache;
}

function nextStepFor(order) {
  switch (order.status) {
    case 'quoted':
      return 'Elige un plan con select_plan.';
    case 'plan_selected':
      return 'Envía los datos del tomador y de los viajeros con set_travelers.';
    case 'travelers_set':
      return 'Llama a review_order y enseña el resumen al usuario.';
    case 'reviewed':
      return 'Si el usuario acepta las condiciones, llama a accept_terms con el review_token.';
    case 'terms_accepted':
      return 'Cuando el usuario confirme, llama a pay con amount_eur igual al total.';
    case 'paid':
      return 'Compra terminada. Usa get_policy para ver la póliza y el estado del email.';
    default:
      return null;
  }
}

function policyView(order) {
  const p = order.policy;
  return {
    policy_number: p.policy_number,
    issued_at: p.issued_at,
    pdf_url: absolute(p.pdf_url),
    email: {
      status: p.email.status,
      to: p.email.to,
      ...(p.email.status === 'failed'
        ? { error: p.email.error, how_to_fix: 'Llama a resend_policy_email (puedes indicar otro email).' }
        : {}),
      ...(p.email.status === 'simulated' ? { note: 'Servidor sin proveedor de email: el envío se ha simulado.' } : {}),
    },
    page_url: absolute(`/poliza/${p.policy_number}`),
  };
}

const TOOLS = [
  {
    name: 'get_product_info',
    title: 'Información del seguro',
    description:
      'Explains Escala travel insurance (demo, not a real insurer): who can buy (residents of Spain, trips up to 90 days, up to 6 travelers, ages 0-84), the three plans (esencial, completo, total) with coverages, limits per insured person, deductibles, what each plan does not include and the main exclusions. Use it to answer coverage questions. Not required to buy.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async run() {
      const p = await product();
      return { ok: true, ...p, terms_url: absolute(p.terms_url) };
    },
  },
  {
    name: 'get_quote',
    title: 'Cotizar viaje',
    description:
      'Step 1 of the purchase. Prices a trip for the three plans at once and returns a quote_id that every later step needs. Prices are final, taxes included, for all travelers together. Destination can be one or more countries (Spanish or English name, ISO code), a main city (e.g. "Tokio", "Nueva York") or a region ("Europa", "Mundo"). With several destinations the most expensive zone applies. Dates are inclusive. Ages decide the price; names are asked later.',
    inputSchema: {
      type: 'object',
      properties: {
        destinations: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'Countries, main cities or region, e.g. ["Japón"] or ["Francia", "Italia"].' },
        start_date: { type: 'string', description: 'Departure date, YYYY-MM-DD. Today or later.' },
        end_date: { type: 'string', description: 'Return date, YYYY-MM-DD. Max 90 days of trip.' },
        travelers: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: { type: 'object', properties: { age: { type: 'integer', minimum: 0, maximum: 84 } }, required: ['age'] },
          description: 'One item per traveler with their age at departure.',
        },
      },
      required: ['destinations', 'start_date', 'end_date', 'travelers'],
    },
    async run(input) {
      const data = await api.quote(input, AGENT);
      const p = await product();
      store.apply(data, 'quote', { by: AGENT });
      const o = data.order;
      return {
        ok: true,
        quote_id: o.quote_id,
        valid_until: o.expires_at,
        trip: {
          destinations: o.trip.destinations.map((d) => d.name),
          zone: o.trip.zone_name,
          start_date: o.trip.start_date,
          end_date: o.trip.end_date,
          days: o.trip.days,
          traveler_ages: o.quote.plans.completo.per_traveler.map((t) => t.age),
        },
        plans: data.plans.map((pl) => ({
          plan: pl.plan,
          name: pl.name,
          total_eur: pl.total_eur,
          per_traveler_eur: pl.per_traveler_eur,
          available: pl.available,
          ...(pl.unavailable_reason ? { unavailable_reason: pl.unavailable_reason } : {}),
          recommended: pl.plan === 'completo',
          highlights: highlights(pl.plan, p),
        })),
        ...(data.plans[0].group_discount_pct ? { group_discount: `${data.plans[0].group_discount_pct}% aplicado por ser 3 o más viajeros` } : {}),
        next_step: 'Recomienda un plan al usuario (completo por defecto) y llama a select_plan.',
      };
    },
  },
  {
    name: 'select_plan',
    title: 'Elegir plan',
    description: 'Step 2. Chooses the plan for a quote. Returns the coverages, limits and deductibles of that plan and its total price. Plan "esencial" only accepts travelers up to 69 years old.',
    inputSchema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string', description: 'quote_id returned by get_quote.' },
        plan: { type: 'string', enum: PLAN_ENUM },
      },
      required: ['quote_id', 'plan'],
    },
    async run({ quote_id, plan }) {
      const data = await api.selectPlan(quote_id, plan, AGENT);
      store.apply(data, 'plan', { by: AGENT });
      const o = data.order;
      return {
        ok: true,
        quote_id: o.quote_id,
        plan: o.plan,
        total_eur: o.total_eur,
        coverages: data.coverages,
        next_step: 'Pide al usuario (si no los tienes) nombre y email del tomador y nombre de cada viajero; después llama a set_travelers.',
      };
    },
  },
  {
    name: 'set_travelers',
    title: 'Datos del tomador y viajeros',
    description:
      'Step 3. Sets the policyholder (the person buying; the policy PDF is emailed to holder.email) and every insured traveler. Never invent names or emails: ask the user. If ages differ from the quote, the price is recalculated and the response says so. Changing data after review_order requires reviewing again.',
    inputSchema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string' },
        holder: {
          type: 'object',
          properties: {
            full_name: { type: 'string', description: 'Name and surname.' },
            email: { type: 'string', description: 'Where the policy will be sent.' },
            phone: { type: 'string', description: 'Optional.' },
          },
          required: ['full_name', 'email'],
        },
        travelers: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              full_name: { type: 'string', description: 'Name and at least one surname.' },
              age: { type: 'integer', minimum: 0, maximum: 84 },
              birth_date: { type: 'string', description: 'Optional, YYYY-MM-DD. If given, it is used instead of age.' },
              document_id: { type: 'string', description: 'Optional DNI, NIE or passport number.' },
            },
            required: ['full_name', 'age'],
          },
        },
      },
      required: ['quote_id', 'holder', 'travelers'],
    },
    async run({ quote_id, holder, travelers }) {
      const data = await api.setTravelers(quote_id, { holder, travelers }, AGENT);
      store.apply(data, 'travelers', { by: AGENT });
      const o = data.order;
      return {
        ok: true,
        quote_id: o.quote_id,
        holder: o.holder,
        insured: o.travelers,
        total_eur: o.total_eur,
        ...(data.price_changed ? { price_changed: `El precio ha cambiado de ${data.previous_total_eur} € a ${o.total_eur} € porque las edades no coinciden con la cotización. Avisa al usuario.` } : {}),
        next_step: 'Llama a review_order.',
      };
    },
  },
  {
    name: 'review_order',
    title: 'Revisar resumen y condiciones',
    description:
      'Step 4. Returns everything the user must see before paying: plan, trip, holder, insured people with their price, total, coverages with limits and deductibles, main exclusions and key terms, plus a review_token. Show the user a short version (plan, dates, insured, total, deductibles) and ask whether they accept the terms and want to pay.',
    inputSchema: { type: 'object', properties: { quote_id: { type: 'string' } }, required: ['quote_id'] },
    async run({ quote_id }) {
      const data = await api.review(quote_id, AGENT);
      store.apply(data, 'review', { by: AGENT });
      return {
        ok: true,
        quote_id,
        review_token: data.review_token,
        terms_version: data.summary.terms.version,
        terms_url: absolute(data.summary.terms.url),
        summary: data.summary,
        next_step: 'Enseña el resumen al usuario. Si acepta las condiciones, llama a accept_terms con review_token y terms_version.',
      };
    },
  },
  {
    name: 'accept_terms',
    title: 'Aceptar condiciones',
    description: 'Step 5. Records that the user accepted the terms shown in review_order. Requires the review_token from the latest review_order; if the order changed since then, review again.',
    inputSchema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string' },
        review_token: { type: 'string' },
        terms_version: { type: 'string' },
        accepted: { type: 'boolean', description: 'Must be true, and only if the user accepted.' },
      },
      required: ['quote_id', 'review_token', 'terms_version', 'accepted'],
    },
    async run({ quote_id, ...rest }) {
      const data = await api.acceptTerms(quote_id, rest, AGENT);
      store.apply(data, 'terms', { by: AGENT });
      return {
        ok: true,
        quote_id,
        status: data.order.status,
        amount_to_pay_eur: data.order.total_eur,
        next_step: `Con la confirmación del usuario, llama a pay con amount_eur ${data.order.total_eur}.`,
      };
    },
  },
  {
    name: 'pay',
    title: 'Pagar y emitir póliza',
    description:
      'Step 6. Pays with a TEST card (no real money), issues the policy and emails the PDF to the holder. Only call it after the user explicitly confirmed the summary and the total. Safeguards: terms must be accepted, amount_eur must equal the reviewed total, user_confirmed must be true, and only test cards work: 4242 4242 4242 4242 is approved, 4000 0000 0000 0002 is declined. Safe to retry: a paid quote returns the same policy and is never charged twice.',
    inputSchema: {
      type: 'object',
      properties: {
        quote_id: { type: 'string' },
        amount_eur: { type: 'number', description: 'Exact total shown in review_order.' },
        card_number: { type: 'string', description: 'Test card number, e.g. "4242 4242 4242 4242".' },
        user_confirmed: { type: 'boolean', description: 'True only if the user explicitly said to pay.' },
      },
      required: ['quote_id', 'amount_eur', 'card_number', 'user_confirmed'],
    },
    annotations: { consequentialHint: true },
    async run({ quote_id, ...rest }) {
      const data = await api.pay(quote_id, rest, AGENT);
      store.apply(data, 'paid', { by: AGENT });
      const o = data.order;
      return {
        ok: true,
        ...(data.already_paid ? { already_paid: 'Esta cotización ya estaba pagada; no se ha cobrado otra vez.' } : {}),
        paid_eur: o.total_eur,
        ...policyView(o),
        next_step:
          o.policy.email.status === 'failed'
            ? 'El email ha fallado: llama a resend_policy_email.'
            : 'Dile al usuario el número de póliza y que se la hemos enviado por email.',
      };
    },
  },
  {
    name: 'get_policy',
    title: 'Ver póliza',
    description: 'Returns an issued policy: number, PDF link, insured people, dates, coverages and whether the email was delivered to the provider. Pass policy_number or quote_id.',
    inputSchema: {
      type: 'object',
      properties: {
        policy_number: { type: 'string', description: 'Format ESC-YYMM-XXXXXX.' },
        quote_id: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: true },
    async run({ policy_number, quote_id }) {
      let data;
      if (policy_number) data = await api.policy(policy_number, AGENT);
      else if (quote_id) {
        const q = await api.getQuote(quote_id, AGENT);
        if (!q.order.policy)
          return {
            ok: false,
            error: { code: 'not_paid_yet', message: 'Esta cotización todavía no tiene póliza.', current_status: q.order.status, how_to_fix: nextStepFor(q.order) },
          };
        data = await api.policy(q.order.policy.policy_number, AGENT);
      } else
        return { ok: false, error: { code: 'missing_identifier', message: 'Falta policy_number o quote_id.', how_to_fix: 'Envía uno de los dos.' } };
      store.apply(data, 'policy', { by: AGENT });
      return { ok: true, ...policyView(data.order), summary: data.summary };
    },
  },
  {
    name: 'resend_policy_email',
    title: 'Reenviar póliza por email',
    description: 'Sends the policy PDF again to the holder. If email is given, it replaces the holder email first (use it when the user wants the policy at another address).',
    inputSchema: {
      type: 'object',
      properties: { policy_number: { type: 'string' }, email: { type: 'string' } },
      required: ['policy_number'],
    },
    async run({ policy_number, email }) {
      const data = await api.resend(policy_number, email, AGENT);
      store.apply(data, 'policy', { by: AGENT });
      return { ok: true, ...policyView(data.order) };
    },
  },
  {
    name: 'get_order_status',
    title: 'Estado de la compra',
    description: 'Read-only. Returns where a quote is in the purchase flow, what is already set and the next step. Use it if you lose track.',
    inputSchema: { type: 'object', properties: { quote_id: { type: 'string' } }, required: ['quote_id'] },
    annotations: { readOnlyHint: true },
    async run({ quote_id }) {
      const data = await api.getQuote(quote_id, AGENT);
      store.apply(data, 'status', { by: AGENT });
      const o = data.order;
      return {
        ok: true,
        quote_id: o.quote_id,
        status: o.status,
        plan: o.plan,
        total_eur: o.total_eur,
        holder: o.holder,
        insured: o.travelers,
        review_token: o.review_token,
        policy_number: o.policy?.policy_number ?? null,
        next_step: nextStepFor(o),
      };
    },
  },
];

function summarize(result) {
  if (!result.ok) return result.error?.message || 'Error';
  if (result.policy_number) return `Póliza ${result.policy_number}`;
  if (result.plans) return result.plans.map((p) => `${p.name} ${p.total_eur} €`).join(' · ');
  if (result.summary) return `Resumen: ${result.summary.plan.name}, ${result.summary.total_text}`;
  if (result.total_eur) return `Total ${result.total_eur} €`;
  if (result.amount_to_pay_eur) return `A pagar ${result.amount_to_pay_eur} €`;
  return 'Hecho';
}

export async function registerEscalaTools() {
  const mc = document.modelContext ?? navigator.modelContext;
  if (!mc?.registerTool) {
    console.warn('[Escala] WebMCP no disponible en este navegador.');
    return { ok: false, count: 0 };
  }
  // Compatibilidad con agentes que todavía buscan navigator.modelContext.
  if (!('modelContext' in navigator)) {
    try {
      Object.defineProperty(navigator, 'modelContext', { configurable: true, get: () => document.modelContext });
    } catch {
      /* algunos navegadores no lo permiten */
    }
  }
  const controller = new AbortController();
  for (const tool of TOOLS) {
    const { run, ...definition } = tool;
    await mc.registerTool(
      {
        ...definition,
        async execute(input = {}) {
          const started = performance.now();
          let result;
          try {
            result = await run(input || {});
          } catch (err) {
            result = failure(err);
          }
          store.log({ tool: tool.name, title: tool.title, ok: result.ok !== false, input, text: summarize(result), ms: Math.round(performance.now() - started) });
          return out(result);
        },
      },
      { signal: controller.signal }
    );
  }
  window.EscalaTools = { names: TOOLS.map((t) => t.name), unregister: () => controller.abort() };
  console.info(`[Escala] ${TOOLS.length} herramientas WebMCP registradas:`, TOOLS.map((t) => t.name).join(', '));
  return { ok: true, count: TOOLS.length };
}
