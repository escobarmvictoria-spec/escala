// Prueba de la llamada con Alba: si la persona ya la pide, no se vuelve a preguntar; el aviso de demo va antes de pedir
// los datos; «a la mañana» no se convierte en «mañana por la mañana»; y la confirmación no promete una llamada.
// (Basado en la prueba de contraste:) la misma mención de «Completo» en la misma cotización debe producir
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

async function lastCallback() {
  const r = await fetch(`${BASE}/api/metrics`);
  return r.ok ? r : null;
}

// A. La persona ya pide la llamada
let r = await turn('Tengo diabetes tipo 1 y viajo a México en enero desde Madrid. Quiero que me llame alguien para saber si me cubrís.');
check('no vuelve a preguntar «¿Quieres que te llamemos?»', !/quieres que te llamemos/i.test(r.text));
check('avisa de que es de prueba antes de pedir datos', /no recibirás una llamada real/i.test(r.text) && !r.used.includes('request_human_callback'));
check('pide nombre y teléfono', /nombre/i.test(r.text) && /tel[eé]fono/i.test(r.text));
r = await turn('Rosa Ibáñez, 611 222 333, a la mañana.');
check('registra la solicitud', r.used.includes('request_human_callback'));
const call = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'tool_use' && b.name === 'request_human_callback').pop()?.input ?? {};
check('«a la mañana» no se convierte en «mañana por la mañana»', call.preferred_time !== 'manana_manana', `preferred_time ${call.preferred_time}`);
check('guarda su preferencia con sus palabras', /mañana/i.test(call.summary ?? ''), call.summary);
check('confirma con la referencia', /Solicitud de prueba registrada\. Tu referencia es LL-/.test(r.text));
check('no promete una llamada', !/te llamar[áa]|le llamar[áa]|te llamaremos|entre las \d/i.test(r.text));
r = await turn('¿Me puedes enviar un comprobante al mail?');
check('comprobante: pide el email sin inventarlo', !r.used.includes('send_callback_receipt') && /email|correo/i.test(r.text));
r = await turn('rosa.ibanez@example.com');
const rec = msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'tool_use' && b.name === 'send_callback_receipt').pop()?.input ?? {};
check('comprobante: lo envía con la referencia y ese email', rec.email === 'rosa.ibanez@example.com' && /^LL-/.test(rec.ticket ?? ''), `${rec.ticket} → ${rec.email}`);
check('comprobante: confirma el envío', /comprobante/i.test(r.text) && /rosa\.ibanez@example\.com/.test(r.text));

// B. Solo pregunta si puede hablar con alguien: se ofrece y se espera el sí
msgs.length = 0;
r = await turn('¿Puedo hablar con alguien de Escala?');
check('ofrece la llamada y pregunta', /quieres que te llamemos/i.test(r.text));
check('no pide datos todavía', !/tel[eé]fono/i.test(r.text.replace(/¿Quieres que te llamemos\?/i, '')) || !/dime tu/i.test(r.text));
r = await turn('Sí, por favor.');
check('tras el sí, avisa de que es de prueba y pide los datos', /no recibirás una llamada real/i.test(r.text) && /nombre/i.test(r.text));

await browser.close();
const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok}/${checks.length} comprobaciones superadas`);
process.exit(ok === checks.length ? 0 : 1);
