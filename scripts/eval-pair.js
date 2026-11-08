// Prueba de contraste: la misma mención de «Completo» en la misma cotización debe producir
// acciones distintas según la intención. Mensajes del cliente fijos (sin cliente simulado) y,
// después de cada respuesta de Alba, se lee el estado real del pedido en el servidor.
//
// Uso:  ANTHROPIC_API_KEY=... EVAL_URL=http://localhost:3000 node scripts/eval-pair.js

import { createRequire } from 'node:module';
import { agentSystemPrompt } from '../src/agent-prompt.js';

const BASE = (process.env.EVAL_URL || 'http://localhost:3000').replace(/\/$/, '');
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.AGENT_MODEL || 'claude-sonnet-5-5';
if (!KEY) {
  console.error('Falta ANTHROPIC_API_KEY.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function claude(body) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (i + 1));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`API ${res.status}: ${json?.error?.message}`);
    return json;
  }
  throw new Error('La API no respondió.');
}

let pw;
try {
  pw = await import('playwright');
} catch {
  pw = createRequire(import.meta.url)('playwright');
}
const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.EscalaTools?.names?.length >= 10, null, { timeout: 15000 });
const tools = await page.evaluate(async () =>
  (await document.modelContext.getTools()).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }))
);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const system = agentSystemPrompt({ today });
const msgs = [];
let quoteId = null;
const checks = [];
const check = (name, ok, extra = '') => {
  checks.push({ name, ok });
  console.log(`  ${ok ? '✔' : '✘'} ${name}${extra ? ` (${extra})` : ''}`);
};

// Un turno del cliente: Alba responde, con las herramientas que necesite, hasta ceder la palabra.
async function turn(userText) {
  console.log(`\nCliente: ${userText}`);
  msgs.push({ role: 'user', content: userText });
  const used = [];
  let text = '';
  for (let step = 0; step < 15; step++) {
    const res = await claude({ model: MODEL, max_tokens: 2000, system, tools, messages: msgs });
    msgs.push({ role: 'assistant', content: res.content });
    const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (t) text += (text ? '\n' : '') + t;
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) break;
    const results = [];
    for (const u of uses) {
      const raw = await page.evaluate(async ([name, input]) => {
        const mc = document.modelContext;
        const tool = (await mc.getTools()).find((x) => x.name === name);
        return mc.executeTool(tool, input);
      }, [u.name, u.input]);
      let out = raw;
      try {
        const v = JSON.parse(raw);
        if (v?.content) out = v.content.map((c) => c.text).join('\n');
      } catch {}
      try {
        const p = JSON.parse(out);
        if (p.quote_id) quoteId = p.quote_id;
      } catch {}
      if (u.input?.quote_id) quoteId = u.input.quote_id;
      used.push(u.name);
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
    }
    msgs.push({ role: 'user', content: results });
  }
  console.log(`Alba [${used.join(', ') || 'sin herramientas'}]: ${text.replace(/\n+/g, ' ⏎ ')}`);
  return { text, used };
}

async function order() {
  if (!quoteId) return null;
  const r = await fetch(`${BASE}/api/quotes/${encodeURIComponent(quoteId)}`);
  return r.ok ? (await r.json()).order : null;
}

// 1. Cotizar
let r = await turn('Hola. Salgo desde Madrid hacia Italia del 10 al 17 de diciembre, viajo sola y tengo 35 años. ¿Cuánto me costaría el seguro?');
let o = await order();
check('cotización creada en el servidor', Boolean(o), quoteId ?? 'sin id');
check('tras cotizar: sin plan seleccionado', o && !o.plan, `estado ${o?.status}`);

// 2. Pregunta por Completo (consulta)
r = await turn('¿Completo incluye cancelación?');
check('responde la duda', /cancelaci/i.test(r.text));
check('no llama a select_plan al preguntar', !r.used.includes('select_plan'));
o = await order();
check('servidor: la cotización sigue sin plan', o && !o.plan, `plan ${o?.plan ?? 'ninguno'}, estado ${o?.status}`);
if (/primera reserva/i.test(r.text)) {
  r = await turn('La primera reserva la hice el 6 de noviembre.');
  o = await order();
  check('tras dar la fecha de reserva: sigue sin plan', o && !o.plan, `plan ${o?.plan ?? 'ninguno'}, estado ${o?.status}`);
  check('no llama a select_plan', !r.used.includes('select_plan'));
}
check('termina con la respuesta, sin invitar a contratar', !/con qué plan te quedas|si quieres contratar|quieres que lo contrate/i.test(r.text));
check('no dice «te cubriría» en general', !/te cubrir[ií]a/i.test(r.text));
check('usa el texto de la regla', /Se aplica a las causas cubiertas por el plan/.test(r.text) && !/comprobación/i.test(r.text));
const sameQuote = quoteId;

// 3. Confirma Completo (decisión)
r = await turn('Me quedo con Completo.');
check('llama a select_plan al confirmar', r.used.includes('select_plan'));
o = await order();
check('servidor: plan Completo seleccionado', o?.plan === 'completo', `plan ${o?.plan}, estado ${o?.status}`);
check('misma cotización que en la pregunta', quoteId === sameQuote);
check('sigue en el chat (no manda a la web)', !/botones|«Elegir|desde la web/i.test(r.text));
check('pide los datos que faltan', /nombre/i.test(r.text));
check('no paga todavía', !r.used.includes('pay') && o?.status !== 'paid');

// 4. Da los datos → resumen, sin pagar
r = await turn('A nombre de Ana López Martín, y el email es ana.lopez@example.com');
o = await order();
check('muestra el resumen (review_order)', r.used.includes('review_order'), `estado ${o?.status}`);
check('no paga antes del sí', !r.used.includes('pay') && o?.status !== 'paid', `estado ${o?.status}`);

// 5. Confirma → paga
r = await turn('Sí, confirmo. Adelante con el pago.');
o = await order();
check('paga tras la confirmación explícita', o?.status === 'paid', `estado ${o?.status}, póliza ${o?.policy?.policy_number ?? '-'}`);

await browser.close();
const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok}/${checks.length} comprobaciones superadas`);
process.exit(ok === checks.length ? 0 : 1);
