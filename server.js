// Escala: servidor de la demo (web + API + PDF + email + agente opcional).
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/store.js';
import { createOrderService, publicOrder, summaryOf, planSummary, keyCoverages, todayMadrid } from './src/orders.js';
import { renderPolicyPdf } from './src/pdf.js';
import { createMailer, buildPolicyEmail, buildQuoteEmail } from './src/email.js';
import { renderProductSheet } from './src/ipid.js';
import { structuredData } from './src/structured-data.js';
import { ApiError } from './src/errors.js';
import { PLANS, COVERAGES, EXCLUSIONS, ZONES, TERMS_VERSION, MAX_DAYS, MAX_TRAVELERS, MAX_AGE, coveragesFor, destinationList, placeSuggestions } from './src/catalog.js';
import { RATES, AGE_BANDS, GROUP_DISCOUNT, GROUP_MIN, LONG_TRIP_FACTOR, LONG_TRIP_THRESHOLD, priceTrip } from './src/pricing.js';
import { agentSystemPrompt } from './src/agent-prompt.js';
import { createCallbackService, publicCallback, teamEmail, CALLBACK_REASONS } from './src/callbacks.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '.env'));
const env = process.env;
const PORT = Number(env.PORT || 3000);
const DATA_DIR = env.DATA_DIR || path.join(here, 'data');

const store = createStore(DATA_DIR);
const mailer = createMailer(env, { outboxDir: path.join(DATA_DIR, 'outbox') });

function issuePolicy(order) {
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  return {
    number: `ESC-${yymm}-${rand}`,
    issued_at: d.toISOString(),
    pdf_token: crypto.randomBytes(12).toString('hex'),
    email: { status: 'pending', to: order.holder.email },
  };
}

let publicBaseUrl = env.PUBLIC_URL || null; // se aprende de la primera petición si no se configura

async function sendPolicyEmail(order) {
  const attempt = { at: new Date().toISOString(), to: order.holder.email };
  try {
    const pdf = await renderPolicyPdf(order);
    const mail = buildPolicyEmail(order, { baseUrl: publicBaseUrl || `http://localhost:${PORT}` });
    const result = await mailer.send({
      to: order.holder.email,
      toName: order.holder.full_name,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      attachment: { name: `poliza-${order.policy.number}.pdf`, content: pdf },
    });
    order.policy.email = {
      status: result.provider === 'outbox' ? 'simulated' : 'sent',
      to: order.holder.email,
      provider: result.provider,
      message_id: result.message_id,
      sent_at: new Date().toISOString(),
      ...(result.note ? { note: result.note } : {}),
    };
    order.events.push({ at: attempt.at, actor: 'system', action: 'email_sent', detail: `${result.provider} → ${order.holder.email}` });
  } catch (err) {
    console.error('[email] fallo al enviar', order.policy.number, err.message);
    order.policy.email = { status: 'failed', to: order.holder.email, provider: mailer.provider, error: err.message.slice(0, 300), failed_at: new Date().toISOString() };
    order.events.push({ at: attempt.at, actor: 'system', action: 'email_failed', detail: err.message.slice(0, 120) });
  }
}

const orders = createOrderService({ store, issuePolicy, sendPolicyEmail });

// Aviso al equipo cuando alguien pide que le llamen (a TEAM_EMAIL o, si no hay, al remitente).
async function notifyTeam(cb) {
  const to = mailer.teamAddress;
  if (!to && mailer.provider !== 'outbox') return { status: 'skipped', note: 'Sin TEAM_EMAIL ni SENDER_EMAIL.' };
  try {
    const mail = teamEmail(cb);
    const r = await mailer.send({ to: to || 'equipo@escala.demo', toName: 'Equipo Escala', subject: mail.subject, text: mail.text, html: mail.html });
    return { status: r.provider === 'outbox' ? 'simulated' : 'sent', to: to || 'equipo@escala.demo' };
  } catch (err) {
    console.error('[callbacks] aviso al equipo fallido', err.message);
    return { status: 'failed', error: err.message.slice(0, 200) };
  }
}
const callbacks = createCallbackService({ store, notifyTeam });

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '300kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!env.PUBLIC_URL && req.get('host') && !/^(localhost|127\.)/.test(req.get('host'))) publicBaseUrl = `${req.protocol}://${req.get('host')}`;
  next();
});

// Límite sencillo de peticiones por IP para que nadie sature la demo.
const buckets = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${max}`;
    const now = Date.now();
    const b = buckets.get(key) || { n: 0, reset: now + windowMs };
    if (now > b.reset) Object.assign(b, { n: 0, reset: now + windowMs });
    b.n += 1;
    buckets.set(key, b);
    if (b.n > max) return res.status(429).json(new ApiError('rate_limited', 'Demasiadas peticiones seguidas.', { hint: 'Espera un minuto y vuelve a intentarlo.' }).toJSON());
    next();
  };
}

const actorOf = (req) => (req.get('x-escala-actor') === 'agent' ? 'agent' : 'web');

// ---------- API ----------
const api = express.Router();
api.use(rateLimit(240, 60000));

api.get('/health', (req, res) => res.json({ ok: true, today: todayMadrid(), email_provider: mailer.provider, agent: agentStatus() }));

api.get('/product', (req, res) => {
  res.json({
    ok: true,
    brand: 'Escala',
    demo_notice: 'Demo — no es un seguro real',
    who_can_buy: 'Residentes en España, viajes que empiezan en España.',
    product_sheet_url: '/ficha-producto.pdf',
    product_sheet_note: 'Ficha de información del producto (formato IPID, 2 páginas): coberturas, exclusiones, restricciones, pagos y desistimiento.',
    limits: { max_trip_days: MAX_DAYS, max_travelers: MAX_TRAVELERS, max_age: MAX_AGE },
    zones: Object.values(ZONES),
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.tagline,
      max_age: p.max_age,
      recommended: p.recommended,
      coverages: keyCoverages(p.id, 'mundo'),
      not_included: COVERAGES.filter((c) => c.limits[p.id] === null).map((c) => c.name),
    })),
    main_exclusions: EXCLUSIONS,
    trips_within_spain: 'En viajes por España también hay gastos médicos, con límites de 3.000 € (Esencial), 6.000 € (Completo) y 10.000 € (Total), porque complementan la sanidad pública. El resto de coberturas es igual.',
    human_help: 'Si el caso no se puede contratar online o el cliente lo prefiere, una persona del equipo le llama (herramienta request_human_callback).',
    preexisting_conditions: {
      coverage: 'por_confirmar',
      say: 'La cobertura de una enfermedad previa está por confirmar: se excluyen las que no estaban estables antes de contratar. No prometas cobertura. Ofrece que una persona del equipo revise el caso.',
      human_help: { tool: 'request_human_callback', reason: 'enfermedad_previa', option_label: 'Pedir que me llamen' },
    },
    terms_version: TERMS_VERSION,
    terms_url: '/condiciones',
  });
});

api.get('/pricing-model', (req, res) => {
  res.json({ ok: true, rates: RATES, age_bands: AGE_BANDS, group: { min_travelers: GROUP_MIN, discount: GROUP_DISCOUNT }, long_trip: { after_day: LONG_TRIP_THRESHOLD, daily_rate_factor: LONG_TRIP_FACTOR } });
});

// Precio de ejemplo para la portada, calculado con el mismo motor que las cotizaciones (no crea pedidos).
const EXAMPLE_TRIP = { destination: 'Italia', zone: 'europa', days: 7, age: 35 };
api.get('/example-price', (req, res) => {
  const { destination, zone, days, age } = EXAMPLE_TRIP;
  const priced = priceTrip({ zone, days, travelers: [{ age }] });
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    ok: true,
    trip: { destination, zone, zone_name: priced.zone_name, days, travelers: [{ age }] },
    plans: PLANS.map((p) => ({ plan: p.id, name: p.name, recommended: Boolean(p.recommended), total_eur: priced.plans[p.id].total_eur })),
    note: 'Precio final con impuestos (IPS 8 %) incluidos.',
  });
});

const coveragesByPlan = (zone) => Object.fromEntries(PLANS.map((p) => [p.id, keyCoverages(p.id, zone)]));

api.get('/destinations', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ ok: true, destinations: destinationList(), places: placeSuggestions() });
});

api.post('/quotes', (req, res) => {
  const order = orders.createQuote(req.body, actorOf(req));
  res.status(201).json({ ok: true, order: publicOrder(order), plans: Object.values(order.quote.plans).map(planSummary), coverages_by_plan: coveragesByPlan(order.trip.zone) });
});

api.get('/quotes/:id', (req, res) => {
  const order = orders.load(req.params.id);
  res.json({ ok: true, order: publicOrder(order), plans: Object.values(order.quote.plans).map(planSummary), coverages_by_plan: coveragesByPlan(order.trip.zone) });
});

// Guardar la cotización y enviarla por email con un enlace para retomarla (recuperación de abandonos).
api.post('/quotes/:id/save', rateLimit(6, 60000), async (req, res) => {
  const order = orders.saveQuote(req.params.id, req.body, actorOf(req));
  const plans = Object.values(order.quote.plans).map(planSummary);
  const mail = buildQuoteEmail(order, { baseUrl: publicBaseUrl || `http://localhost:${PORT}`, plans });
  let email;
  try {
    const r = await mailer.send({ to: order.saved.email, subject: mail.subject, text: mail.text, html: mail.html });
    email = { status: r.provider === 'outbox' ? 'simulated' : 'sent', to: order.saved.email };
  } catch (err) {
    console.error('[email] cotización', order.id, err.message);
    email = { status: 'failed', to: order.saved.email };
  }
  order.saved.email_status = email.status;
  store.putOrder(order);
  res.json({ ok: true, quote_id: order.id, email, resume_url: mail.resumeUrl, note: 'El usuario puede retomar la compra con el enlace del email; si la cotización caduca, se recalcula con el precio del día.' });
});

api.post('/quotes/:id/resume', (req, res) => {
  const { order, resumed, price_changed, previous_total_eur } = orders.resumeQuote(req.params.id, actorOf(req));
  res.json({ ok: true, resumed, price_changed, previous_total_eur, order: publicOrder(order), plans: Object.values(order.quote.plans).map(planSummary), coverages_by_plan: coveragesByPlan(order.trip.zone) });
});

api.post('/quotes/:id/plan', (req, res) => {
  const order = orders.selectPlan(req.params.id, req.body.plan, actorOf(req));
  res.json({ ok: true, order: publicOrder(order), coverages: keyCoverages(order.plan, order.trip.zone) });
});

api.post('/quotes/:id/travelers', (req, res) => {
  const { order, price_changed, previous_total_eur } = orders.setTravelers(req.params.id, req.body, actorOf(req));
  res.json({ ok: true, order: publicOrder(order), price_changed, previous_total_eur });
});

api.post('/quotes/:id/review', (req, res) => {
  const { order, summary } = orders.review(req.params.id, actorOf(req));
  res.json({ ok: true, order: publicOrder(order), summary, review_token: order.review?.token ?? null });
});

api.post('/quotes/:id/accept-terms', (req, res) => {
  const order = orders.acceptTerms(req.params.id, req.body, actorOf(req));
  res.json({ ok: true, order: publicOrder(order) });
});

api.post('/quotes/:id/pay', async (req, res) => {
  const { order, already_paid } = await orders.pay(req.params.id, req.body, actorOf(req));
  res.json({ ok: true, already_paid, order: publicOrder(order), summary: summaryOf(order) });
});

api.get('/policies/:number', (req, res) => {
  const order = orders.getByPolicy(req.params.number);
  res.json({ ok: true, order: publicOrder(order), summary: summaryOf(order) });
});

api.get('/policies/:number/pdf', async (req, res) => {
  const order = orders.getByPolicy(req.params.number);
  const a = Buffer.from(String(req.query.token || ''));
  const b = Buffer.from(order.policy.pdf_token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    throw new ApiError('forbidden', 'Enlace de descarga no válido.', { status: 403 });
  const pdf = await renderPolicyPdf(order);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `inline; filename="poliza-${order.policy.number}.pdf"`);
  res.send(pdf);
});

api.post('/policies/:number/resend', rateLimit(10, 60000), async (req, res) => {
  const order = orders.getByPolicy(req.params.number);
  await orders.resendEmail(order, req.body?.email, actorOf(req));
  res.json({ ok: true, order: publicOrder(order) });
});

// Transferencia a una persona
api.post('/callbacks', rateLimit(10, 60000), async (req, res) => {
  const cb = await callbacks.create(req.body, actorOf(req));
  res.status(201).json({ ok: true, callback: publicCallback(cb) });
});
api.get('/callbacks/:id', (req, res) => res.json({ ok: true, callback: publicCallback(callbacks.get(req.params.id)) }));

// Métricas del embudo por canal: web frente a agentes de IA.
api.get('/metrics', (req, res) => {
  const steps = ['quoted', 'plan_selected', 'travelers_set', 'reviewed', 'terms_accepted', 'paid'];
  const rank = (s) => steps.indexOf(s);
  const channels = {};
  for (const o of store.allOrders()) {
    const c = (channels[o.channel] ||= { funnel: Object.fromEntries(steps.map((s) => [s, 0])), revenue_eur: 0, plans: {} });
    for (const s of steps) if (rank(o.status) >= rank(s)) c.funnel[s] += 1;
    if (o.status === 'paid') {
      c.revenue_eur = Math.round((c.revenue_eur + o.payment.amount_eur) * 100) / 100;
      c.plans[o.plan] = (c.plans[o.plan] || 0) + 1;
    }
  }
  const handoffs = {};
  for (const cb of store.allCallbacks()) {
    const h = (handoffs[cb.channel] ||= { total: 0, reasons: {} });
    h.total += 1;
    h.reasons[cb.reason_text] = (h.reasons[cb.reason_text] || 0) + 1;
  }
  // Recuperación de abandonos: cotizaciones guardadas por email, retomadas y compradas después.
  const all = store.allOrders();
  const saved = all.filter((o) => o.saved);
  const resumed = all.filter((o) => o.from_saved);
  const recovery = {
    saved: saved.length,
    resumed: new Set(resumed.map((o) => o.resumed_from ?? o.id)).size,
    paid_after_resume: resumed.filter((o) => o.status === 'paid').length,
    revenue_eur: Math.round(resumed.filter((o) => o.status === 'paid').reduce((a, o) => a + o.payment.amount_eur, 0) * 100) / 100,
  };
  res.json({ ok: true, steps, channels, handoffs, recovery });
});

// ---------- Agente de demo (opcional): proxy a la API de Anthropic con la clave del servidor ----------
function agentStatus() {
  return { enabled: Boolean(env.ANTHROPIC_API_KEY), model: env.AGENT_MODEL || 'claude-sonnet-5-5', needs_passcode: Boolean(env.AGENT_PASSCODE) };
}
api.get('/agent/status', (req, res) => res.json({ ok: true, ...agentStatus() }));
// Tope de gasto del asistente integrado: turnos por día (hora de Madrid), en total y por IP.
// Protege el saldo de la API aunque la web sea pública y el asistente no pida código.
const AGENT_DAILY_TURNS = Number(env.AGENT_DAILY_TURNS || 400);
const AGENT_DAILY_TURNS_PER_IP = Number(env.AGENT_DAILY_TURNS_PER_IP || 120);
const agentUsage = { day: null, total: 0, byIp: new Map() };
function countAgentTurn(ip) {
  const day = todayMadrid();
  if (agentUsage.day !== day) Object.assign(agentUsage, { day, total: 0, byIp: new Map() });
  const mine = agentUsage.byIp.get(ip) ?? 0;
  if (agentUsage.total >= AGENT_DAILY_TURNS || mine >= AGENT_DAILY_TURNS_PER_IP)
    throw new ApiError('agent_daily_limit', 'El asistente de la demo ha llegado a su límite de uso de hoy.', {
      status: 429,
      hint: 'Puedes contratar en la web como siempre o pedir que te llame una persona. El límite se reinicia a medianoche (hora de Madrid).',
    });
  agentUsage.total += 1;
  agentUsage.byIp.set(ip, mine + 1);
}
api.post('/agent/turn', rateLimit(40, 60000), async (req, res) => {
  if (!env.ANTHROPIC_API_KEY)
    throw new ApiError('agent_disabled', 'El agente de demo no está configurado en este servidor.', { status: 503, hint: 'Añade ANTHROPIC_API_KEY al fichero .env y reinicia.' });
  if (env.AGENT_PASSCODE) {
    const a = Buffer.from(String(req.body.passcode || ''));
    const b = Buffer.from(env.AGENT_PASSCODE);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      throw new ApiError('bad_passcode', 'Código de acceso incorrecto.', { status: 401 });
  }
  countAgentTurn(req.ip);
  const { messages, tools } = req.body;
  if (!Array.isArray(messages) || messages.length > 80) throw new ApiError('bad_request', 'Conversación no válida.');
  if (!Array.isArray(tools) || tools.length > 30) throw new ApiError('bad_request', 'Lista de herramientas no válida.');
  const r = await fetch(env.AGENT_API_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: agentStatus().model,
      max_tokens: 2000,
      system: [{ type: 'text', text: agentSystemPrompt({ today: todayMadrid() }), cache_control: { type: 'ephemeral' } }],
      tools: tools.map((t, i) => ({
        name: String(t.name).slice(0, 64),
        description: String(t.description || '').slice(0, 4000),
        input_schema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
        ...(i === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
      })),
      messages,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    // El detalle técnico (crédito, clave, caída del proveedor) va al log; a la persona, un mensaje útil.
    // 503 y no 502: Cloudflare sustituye las respuestas 502 por su propia página y el chat no podría leer el mensaje.
    console.error(`[alba] la API del modelo respondió ${r.status}: ${body?.error?.message || 'error desconocido'}`);
    throw new ApiError('agent_unavailable', 'Alba no está disponible en este momento.', {
      status: 503,
      hint: 'Puedes cotizar y contratar directamente en la web, o pedir que te llame una persona.',
    });
  }
  res.json({ ok: true, content: body.content, stop_reason: body.stop_reason, usage: body.usage });
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json(new ApiError('not_found', `No existe ${req.method} ${req.originalUrl}.`, { status: 404 }).toJSON()));

// ---------- Web ----------
const pub = path.join(here, 'public');
app.get('/condiciones', (req, res) => res.sendFile(path.join(pub, 'condiciones.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(pub, 'panel.html')));
app.get('/agentes', (req, res) => res.sendFile(path.join(pub, 'agentes.html')));
app.get('/privacidad', (req, res) => res.sendFile(path.join(pub, 'privacidad.html')));
// Portada con datos estructurados (schema.org) generados con el catálogo y la tarifa.
function sendIndex(req, res) {
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  const base = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html.replace('<!--structured-data-->', structuredData(html, base)));
}
app.get(['/', '/index.html'], sendIndex);
app.get('/poliza/:number', sendIndex);
app.get('/retomar/:id', sendIndex);
// Ficha de información del producto (formato IPID), siempre al día con el catálogo.
let productSheet = null;
app.get('/ficha-producto.pdf', async (req, res) => {
  productSheet ??= await renderProductSheet();
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'inline; filename="escala-ficha-producto.pdf"');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(productSheet);
});
// Sin caché de 5 minutos: el navegador revalida (ETag) y siempre ve la última versión publicada.
// Las imágenes y fuentes, que no cambian, sí se guardan un día.
app.use(express.static(pub, {
  extensions: ['html'],
  setHeaders(res, file) {
    res.set('Cache-Control', /\.(?:jpe?g|png|webp|svg|woff2?)$/i.test(file) ? 'public, max-age=86400' : 'no-cache');
  },
}));

app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json(err.toJSON());
  if (err?.type === 'entity.parse.failed')
    return res.status(400).json(new ApiError('invalid_json', 'El cuerpo de la petición no es JSON válido.').toJSON());
  console.error('[error]', err);
  res.status(500).json(new ApiError('internal_error', 'Error interno. No se ha cobrado nada.', { hint: 'Vuelve a intentarlo en unos segundos.' }).toJSON());
});

app.listen(PORT, () => {
  console.log(`Escala escuchando en http://localhost:${PORT} · email: ${mailer.provider} · agente: ${agentStatus().enabled ? 'activo' : 'apagado'}`);
});

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

