// Escala: servidor de la demo (web + API + PDF + email + agente opcional).
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './src/store.js';
import { createOrderService, publicOrder, summaryOf, planSummary, keyCoverages, todayMadrid } from './src/orders.js';
import { renderPolicyPdf } from './src/pdf.js';
import { createMailer, buildPolicyEmail } from './src/email.js';
import { ApiError } from './src/errors.js';
import { PLANS, COVERAGES, EXCLUSIONS, ZONES, TERMS_VERSION, MAX_DAYS, MAX_TRAVELERS, MAX_AGE, coveragesFor, destinationList } from './src/catalog.js';
import { RATES, AGE_BANDS, GROUP_DISCOUNT, GROUP_MIN, LONG_TRIP_FACTOR, LONG_TRIP_THRESHOLD } from './src/pricing.js';
import { agentSystemPrompt } from './src/agent-prompt.js';

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
    terms_version: TERMS_VERSION,
    terms_url: '/condiciones',
  });
});

api.get('/pricing-model', (req, res) => {
  res.json({ ok: true, rates: RATES, age_bands: AGE_BANDS, group: { min_travelers: GROUP_MIN, discount: GROUP_DISCOUNT }, long_trip: { after_day: LONG_TRIP_THRESHOLD, daily_rate_factor: LONG_TRIP_FACTOR } });
});

const coveragesByPlan = (zone) => Object.fromEntries(PLANS.map((p) => [p.id, keyCoverages(p.id, zone)]));

api.get('/destinations', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ ok: true, destinations: destinationList() });
});

api.post('/quotes', (req, res) => {
  const order = orders.createQuote(req.body, actorOf(req));
  res.status(201).json({ ok: true, order: publicOrder(order), plans: Object.values(order.quote.plans).map(planSummary), coverages_by_plan: coveragesByPlan(order.trip.zone) });
});

api.get('/quotes/:id', (req, res) => {
  const order = orders.load(req.params.id);
  res.json({ ok: true, order: publicOrder(order), plans: Object.values(order.quote.plans).map(planSummary), coverages_by_plan: coveragesByPlan(order.trip.zone) });
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
  res.json({ ok: true, steps, channels });
});

// ---------- Agente de demo (opcional): proxy a la API de Anthropic con la clave del servidor ----------
function agentStatus() {
  return { enabled: Boolean(env.ANTHROPIC_API_KEY), model: env.AGENT_MODEL || 'claude-sonnet-5-5', needs_passcode: Boolean(env.AGENT_PASSCODE) };
}
api.get('/agent/status', (req, res) => res.json({ ok: true, ...agentStatus() }));
api.post('/agent/turn', rateLimit(40, 60000), async (req, res) => {
  if (!env.ANTHROPIC_API_KEY)
    throw new ApiError('agent_disabled', 'El agente de demo no está configurado en este servidor.', { status: 503, hint: 'Añade ANTHROPIC_API_KEY al fichero .env y reinicia.' });
  if (env.AGENT_PASSCODE) {
    const a = Buffer.from(String(req.body.passcode || ''));
    const b = Buffer.from(env.AGENT_PASSCODE);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
      throw new ApiError('bad_passcode', 'Código de acceso incorrecto.', { status: 401 });
  }
  const { messages, tools } = req.body;
  if (!Array.isArray(messages) || messages.length > 80) throw new ApiError('bad_request', 'Conversación no válida.');
  if (!Array.isArray(tools) || tools.length > 30) throw new ApiError('bad_request', 'Lista de herramientas no válida.');
  const r = await fetch(env.AGENT_API_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: agentStatus().model,
      max_tokens: 2000,
      system: agentSystemPrompt({ today: todayMadrid() }),
      tools: tools.map((t) => ({
        name: String(t.name).slice(0, 64),
        description: String(t.description || '').slice(0, 4000),
        input_schema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema : { type: 'object', properties: {} },
      })),
      messages,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError('agent_upstream_error', `La API del modelo respondió ${r.status}: ${body?.error?.message || 'error desconocido'}`, { status: 502 });
  res.json({ ok: true, content: body.content, stop_reason: body.stop_reason, usage: body.usage });
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json(new ApiError('not_found', `No existe ${req.method} ${req.originalUrl}.`, { status: 404 }).toJSON()));

// ---------- Web ----------
const pub = path.join(here, 'public');
app.get('/condiciones', (req, res) => res.sendFile(path.join(pub, 'condiciones.html')));
app.get('/panel', (req, res) => res.sendFile(path.join(pub, 'panel.html')));
app.get('/agentes', (req, res) => res.sendFile(path.join(pub, 'agentes.html')));
app.get('/poliza/:number', (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.use(express.static(pub, { extensions: ['html'], maxAge: '5m' }));

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

