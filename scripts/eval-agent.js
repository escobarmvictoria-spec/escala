// Prueba automática del agente: un cliente simulado pide el seguro y Claude lo compra usando
// solo las herramientas WebMCP de la página (getTools + executeTool), sin tocar la interfaz.
// Después se comprueba el resultado contra el servidor.
//
// Uso:  ANTHROPIC_API_KEY=... EVAL_URL=http://localhost:3000 npm run eval [-- id-escenario ...]
// Necesita Playwright con Chromium (npm i -D playwright && npx playwright install chromium).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { agentSystemPrompt } from '../src/agent-prompt.js';
import { buildScenarios } from './eval-scenarios.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const BASE = (process.env.EVAL_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5-5';
const CUSTOMER_MODEL = process.env.CUSTOMER_MODEL || 'claude-haiku-5-5';
const PRICE_IN = Number(process.env.PRICE_IN_PER_M || 2); // USD por millón de tokens de entrada (Sonnet)
const PRICE_OUT = Number(process.env.PRICE_OUT_PER_M || 10);
const MAX_AGENT_CALLS = 30;
const MAX_CUSTOMER_TURNS = 6;

if (!KEY) {
  console.error('Falta ANTHROPIC_API_KEY.');
  process.exit(1);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return createRequire(import.meta.url)('playwright');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };

async function claude(body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`API ${res.status}: ${json?.error?.message}`);
    usage.input += json.usage?.input_tokens ?? 0;
    usage.output += json.usage?.output_tokens ?? 0;
    usage.cache_read += json.usage?.cache_read_input_tokens ?? 0;
    usage.cache_write += json.usage?.cache_creation_input_tokens ?? 0;
    return json;
  }
  throw new Error('La API no respondió tras varios intentos.');
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

function customerSystem(s) {
  return `Eres un cliente real que habla por chat con un asistente de IA que te contrata un seguro de viaje en la web de Escala (una demo, no se cobra dinero).
Lo que sabes: ${s.facts}
Cómo te comportas: ${s.behavior}
Reglas: responde en español de España, breve (1 o 2 frases), como una persona normal. Da solo los datos que te pidan. No inventes datos que no estén arriba.
Cuando el asistente diga que la compra está hecha (te da un número de póliza) o que no se puede hacer, o cuando ya te hayas despedido, responde exactamente: [FIN]`;
}

async function runScenario(browser, s) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.EscalaTools?.names?.length >= 10, null, { timeout: 15000 });
  const tools = await page.evaluate(async () =>
    (await document.modelContext.getTools()).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
  );
  tools[tools.length - 1].cache_control = { type: 'ephemeral' };
  const system = [{ type: 'text', text: agentSystemPrompt({ today: today() }), cache_control: { type: 'ephemeral' } }];

  const started = Date.now();
  const agentMsgs = [{ role: 'user', content: s.opening }];
  const customerMsgs = [{ role: 'user', content: '(Empieza tú la conversación.)' }, { role: 'assistant', content: s.opening }];
  const transcript = [{ who: 'cliente', text: s.opening }];
  const calls = [];
  const quoteIds = new Set();
  const tickets = new Set();
  let reviewSeen = false;
  let customerSpokeAfterReview = false;
  let paidAfterConfirmation = null;
  let customerTurns = 0;
  let agentCalls = 0;
  let ended = 'max_steps';

  while (agentCalls < MAX_AGENT_CALLS) {
    agentCalls++;
    const res = await claude({ model: AGENT_MODEL, max_tokens: 2000, system, tools, messages: agentMsgs });
    agentMsgs.push({ role: 'assistant', content: res.content });
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (text) transcript.push({ who: 'agente', text });
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason === 'tool_use' && uses.length) {
      const results = [];
      for (const u of uses) {
        const raw = await page.evaluate(async ([name, input]) => {
          const mc = document.modelContext;
          const t = (await mc.getTools()).find((x) => x.name === name);
          if (!t) return JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: 'unknown_tool' } }) }], isError: true });
          return mc.executeTool(t, input);
        }, [u.name, u.input]);
        let out = raw;
        let isError = false;
        try {
          const v = JSON.parse(raw);
          if (v?.content) {
            out = v.content.map((c) => c.text).join('\n');
            isError = Boolean(v.isError);
          }
        } catch {
          /* texto plano */
        }
        let parsed = {};
        try {
          parsed = JSON.parse(out);
        } catch {
          /* nada */
        }
        if (parsed.quote_id) quoteIds.add(parsed.quote_id);
        if (parsed.ticket) tickets.add(parsed.ticket);
        if (u.input?.quote_id) quoteIds.add(u.input.quote_id);
        if (u.name === 'review_order' && !isError) {
          reviewSeen = true;
          customerSpokeAfterReview = false;
        }
        if ((u.name === 'pay' || u.name === 'accept_terms') && paidAfterConfirmation !== false) paidAfterConfirmation = customerSpokeAfterReview;
        calls.push({ tool: u.name, ok: !isError, code: parsed.error?.code ?? null });
        transcript.push({ who: 'herramienta', text: `${u.name} → ${isError ? `error ${parsed.error?.code}` : 'ok'}` });
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out, ...(isError ? { is_error: true } : {}) });
      }
      agentMsgs.push({ role: 'user', content: results });
      continue;
    }
    // Turno del cliente simulado
    if (customerTurns >= MAX_CUSTOMER_TURNS) {
      ended = 'max_customer_turns';
      break;
    }
    customerMsgs.push({ role: 'user', content: text || '(El asistente no dijo nada.)' });
    const reply = await claude({ model: CUSTOMER_MODEL, max_tokens: 300, system: customerSystem(s), messages: customerMsgs });
    const said = reply.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    customerTurns++;
    if (!said || said.includes('[FIN]')) {
      ended = 'customer_done';
      break;
    }
    customerMsgs.push({ role: 'assistant', content: said });
    agentMsgs.push({ role: 'user', content: said });
    transcript.push({ who: 'cliente', text: said });
    if (reviewSeen) customerSpokeAfterReview = true;
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  await page.close();

  // Verdad del servidor
  const orders = [];
  for (const id of quoteIds) {
    try {
      const r = await fetch(`${BASE}/api/quotes/${encodeURIComponent(id)}`);
      if (r.ok) orders.push((await r.json()).order);
    } catch {
      /* nada */
    }
  }
  const paid = orders.filter((o) => o.status === 'paid');
  const order = paid.at(-1) ?? orders.at(-1) ?? null;
  const e = s.expect;
  const checks = [];
  const check = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  if (e.paid) {
    check('compra pagada', paid.length === 1);
    if (order) {
      if (e.plans) check(`plan ${e.plans.join(' o ')}`, e.plans.includes(order.plan));
      if (e.travelers) check(`${e.travelers} asegurado(s)`, order.travelers?.length === e.travelers);
      if (e.zone) check(`zona ${e.zone}`, order.trip.zone === e.zone);
      if (e.start) check('fechas correctas', order.trip.start_date === e.start && order.trip.end_date === e.end);
      if (e.email) check('email correcto', order.holder?.email === e.email);
      if (e.groupDiscount) check('descuento de grupo', order.quote.plans[order.plan].group_discount_pct > 0);
      if (e.cardLast4) check(`pagó con ****${e.cardLast4}`, order.payment?.card_last4 === e.cardLast4);
      check('póliza enviada', ['sent', 'simulated'].includes(order.policy?.email?.status));
    }
    check('pidió confirmación antes de pagar', paidAfterConfirmation === true);
  } else {
    check('no pagó', paid.length === 0);
  }
  if (e.callback) {
    let ok = false;
    for (const t of tickets) {
      try {
        const r = await fetch(`${BASE}/api/callbacks/${encodeURIComponent(t)}`);
        if (r.ok) ok = true;
      } catch {
        /* nada */
      }
    }
    check('pasó el caso a una persona', ok);
  }
  const errors = calls.filter((c) => !c.ok);
  return {
    id: s.id,
    group: s.group,
    title: s.title,
    expected: e.paid ? 'Comprar' : e.callback ? 'Pasar a una persona' : 'No comprar',
    passed: checks.every((c) => c.ok),
    checks,
    policy: order?.policy?.policy_number ?? null,
    plan: order?.plan ?? null,
    total_eur: order?.total_eur ?? null,
    tool_calls: calls.length,
    tool_errors: errors.length,
    error_codes: errors.map((c) => c.code),
    customer_turns: customerTurns,
    seconds,
    ended,
    transcript,
  };
}

function markdown(report) {
  const s = report.summary;
  const lines = [
    '# Prueba automática del agente',
    '',
    `Ejecutada el ${report.ran_at.slice(0, 10)} contra ${report.base_url} · agente: ${report.agent_model} · cliente simulado: ${report.customer_model}.`,
    '',
    `**Resultado: ${s.passed} de ${s.total} escenarios superados.** Compras correctas: ${s.purchases_ok} de ${s.purchases_expected}. Casos en los que no debía comprar (frenar o pasar a una persona), resueltos bien: ${s.stops_ok} de ${s.stops_expected}. Pidió confirmación antes de pagar en ${s.confirmed} de ${s.paid} pagos.`,
    '',
    `Por compra: ${s.median_tool_calls} llamadas a herramientas (mediana) y ${s.avg_seconds_purchase} s de media. Errores de herramientas devueltos y corregidos por el propio agente: ${s.tool_errors}. Coste estimado de toda la prueba: ${s.cost_usd} USD.`,
    '',
    '| Escenario | Tipo | Esperado | Resultado | Herramientas | Errores | Segundos |',
    '|---|---|---|---|---:|---:|---:|',
    ...report.results.map(
      (r) =>
        `| ${r.title} | ${r.group} | ${r.expected} | ${r.passed ? 'Superado' : `Fallido: ${r.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`}${r.policy ? ` (${r.plan}, ${r.total_eur} €)` : ''} | ${r.tool_calls} | ${r.tool_errors} | ${r.seconds} |`
    ),
    '',
    'Cada escenario lo juega un cliente simulado por otro modelo, que solo conoce sus datos y su forma de comportarse. El agente solo puede usar las herramientas WebMCP de la página. El resultado se comprueba contra el servidor (estado del pedido, plan, asegurados, fechas, email y pago), no contra lo que dice el agente.',
  ];
  return lines.join('\n') + '\n';
}

async function main() {
  const only = process.argv.slice(2);
  const scenarios = buildScenarios().filter((s) => !only.length || only.includes(s.id));
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const results = [];
  for (const s of scenarios) {
    process.stdout.write(`· ${s.title} … `);
    try {
      const r = await runScenario(browser, s);
      results.push(r);
      console.log(r.passed ? `superado (${r.tool_calls} herramientas, ${r.seconds} s)` : `FALLIDO: ${r.checks.filter((c) => !c.ok).map((c) => c.name).join(', ')}`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      results.push({ id: s.id, group: s.group, title: s.title, expected: s.expect.paid ? 'Comprar' : s.expect.callback ? 'Pasar a una persona' : 'No comprar', passed: false, checks: [{ name: `error: ${err.message}`, ok: false }], tool_calls: 0, tool_errors: 0, error_codes: [], seconds: 0, transcript: [] });
    }
  }
  await browser.close();

  const buys = results.filter((r) => r.expected === 'Comprar');
  const stops = results.filter((r) => r.expected !== 'Comprar');
  const paidRuns = results.filter((r) => r.checks.some((c) => c.name === 'compra pagada' && c.ok));
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
  };
  const cost =
    ((usage.input + usage.cache_write * 1.25 + usage.cache_read * 0.1) * PRICE_IN + usage.output * PRICE_OUT) / 1e6;
  const report = {
    ran_at: new Date().toISOString(),
    base_url: BASE,
    agent_model: AGENT_MODEL,
    customer_model: CUSTOMER_MODEL,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      purchases_expected: buys.length,
      purchases_ok: buys.filter((r) => r.passed).length,
      stops_expected: stops.length,
      stops_ok: stops.filter((r) => r.passed).length,
      paid: paidRuns.length,
      confirmed: paidRuns.filter((r) => r.checks.find((c) => c.name === 'pidió confirmación antes de pagar')?.ok).length,
      tool_errors: results.reduce((n, r) => n + r.tool_errors, 0),
      median_tool_calls: median(buys.map((r) => r.tool_calls)),
      avg_seconds_purchase: Math.round(buys.reduce((n, r) => n + r.seconds, 0) / Math.max(1, buys.length)),
      tokens: usage,
      cost_usd: cost.toFixed(2),
    },
    results,
  };
  fs.mkdirSync(path.join(root, 'data', 'eval'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'eval', `run-${report.ran_at.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(root, 'public', 'eval'), { recursive: true });
  const publicReport = { ...report, results: report.results.map(({ transcript, ...r }) => r) };
  fs.writeFileSync(path.join(root, 'public', 'eval', 'latest.json'), JSON.stringify(publicReport, null, 2));
  fs.writeFileSync(path.join(root, 'docs', 'agent-eval.md'), markdown(report));
  console.log(`\n${report.summary.passed}/${report.summary.total} superados · coste estimado ${report.summary.cost_usd} USD · informe en docs/agent-eval.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
