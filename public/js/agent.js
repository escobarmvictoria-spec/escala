// Alba, la asistente virtual (un chatbot con un agente real, Claude, que compra con las herramientas WebMCP de la página),
// y el registro de lo que hace cualquier agente en la web (también los externos, como ChatGPT).
import { api, store } from './core.js';
import { listTools, callTool } from './webmcp.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_STEPS = 16;
// Cómo se cuenta en el chat cada herramienta que usa Alba (con su nombre técnico, para la demo).
const TOOL_LABELS = {
  get_product_info: 'Consultando coberturas', get_quote: 'Calculando precios', select_plan: 'Eligiendo el plan',
  set_travelers: 'Guardando los datos', review_order: 'Preparando el resumen', accept_terms: 'Registrando que aceptas',
  pay: 'Pagando', get_policy: 'Recuperando la póliza', resend_policy_email: 'Reenviando la póliza',
  save_quote: 'Enviando la cotización', request_human_callback: 'Pidiendo que te llamen', get_order_status: 'Revisando tu compra',
};
const toolLine = (name, state = '') => `${state}${TOOL_LABELS[name] ?? 'Usando la web'} (${name})`;

let drawer, toggle, messages = [], running = false, passcode = null, autoOpened = false;

function open(focus = true) {
  drawer.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  if (focus) ($('#chat-input:not([hidden])') || $('.drawer-close'))?.focus();
}
function close() {
  drawer.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('drawer-open');
  toggle.focus();
}

// Markdown mínimo y seguro para las respuestas del asistente: negritas, viñetas y enlaces.
// Formato mínimo y seguro para las respuestas de Alba: negritas, listas, enlaces y tablas.
// Todo se escapa antes; solo se generan etiquetas conocidas.
function inline(text) {
  return esc(text)
    .replace(/(\d) (€|%|h\b)/g, '$1\u00a0$2') // «1.000.000 €» no se parte en dos líneas
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<)]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '').slice(0, 48)}${url.length > 56 ? '…' : ''}</a>`);
}
const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
export function miniMarkdown(text) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (isRow(lines[i]) && i + 1 < lines.length && isRule(lines[i + 1])) {
      const head = cells(lines[i]);
      const body = [];
      i += 2;
      while (i < lines.length && isRow(lines[i])) body.push(cells(lines[i++]));
      i--;
      out.push(`<div class="msg-table"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
        .map((r) => `<tr>${r.map((c, j) => (j === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`)
        .join('')}</tbody></table></div>`);
      continue;
    }
    const l = lines[i];
    const h = /^#{1,4}\s+(.*)$/.exec(l);
    if (h) out.push(`<strong>${inline(h[1])}</strong>`);
    else if (/^\s*[-*•]\s+/.test(l)) out.push(`${/^\s{2,}/.test(l) ? '   ' : ''}• ${inline(l.replace(/^\s*[-*•]\s+/, ''))}`);
    else out.push(inline(l));
  }
  // Las tablas no llevan salto de línea extra alrededor (el mensaje usa pre-wrap).
  return out.join('\n').replace(/\n?(<div class="msg-table">[\s\S]*?<\/div>)\n?/g, '$1');
}

function addMsg(role, text, extra = '') {
  const el = document.createElement('div');
  el.className = `msg ${role} ${extra}`.trim();
  if (role === 'assistant') el.innerHTML = miniMarkdown(text);
  else el.textContent = text;
  $('#chat-log').append(el);
  el.scrollIntoView({ block: 'end' });
  return el;
}

// El registro técnico solo aparece cuando un agente externo (como ChatGPT) usa las herramientas,
// o en modo presentación: abre la web con ?demo una vez y queda activo en esa pestaña.
// Cuando es Alba, sus pasos ya se cuentan dentro del chat.
let demoMode = false;
let externalActivity = false;
try {
  if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('escala.demo', '1');
  demoMode = sessionStorage.getItem('escala.demo') === '1';
} catch {
  /* sin almacenamiento: solo con actividad */
}
function renderActivity() {
  const items = store.state.activity;
  $('#activity').hidden = !(demoMode || externalActivity);
  $('#activity-count').textContent = String(items.length);
  $('#activity-log').innerHTML = items
    .map(
      (a) => `<li><span class="${a.ok ? 'ok' : 'bad'}">${a.ok ? '✓' : '✗'}</span><code>${esc(a.tool)}</code><span class="t">${a.at.toLocaleTimeString('es-ES')} · ${a.ms} ms</span><span class="txt">${esc(a.text)}</span></li>`
    )
    .join('');
}

// executeTool devuelve el resultado serializado; puede venir como {content:[{type:'text',text}]} o como texto.
function readResult(output) {
  let value = output;
  try {
    value = JSON.parse(output);
  } catch {
    return { text: String(output), ok: true };
  }
  if (typeof value === 'string') return { text: value, ok: true };
  if (value && Array.isArray(value.content)) {
    const text = value.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    return { text, ok: !value.isError };
  }
  return { text: JSON.stringify(value), ok: value?.ok !== false };
}

function modelContext() {
  return document.modelContext ?? navigator.modelContext;
}

// Con el polyfill, el asistente descubre y ejecuta las herramientas a través de document.modelContext.
// Con WebMCP nativo (que no expone getTools/executeTool), usa el mismo registro de herramientas de Escala.
async function toolList() {
  const mc = modelContext();
  return typeof mc?.getTools === 'function' ? mc.getTools() : listTools();
}

async function runTool(tool, input) {
  const mc = modelContext();
  return typeof mc?.executeTool === 'function' ? mc.executeTool(tool, input) : callTool(tool.name, input);
}

async function runAgent(userText) {
  running = true;
  toggle.querySelector('.agent-dot').classList.add('is-busy');
  $('#chat-form button').disabled = true;
  messages.push({ role: 'user', content: userText });
  const thinking = addMsg('assistant', 'Pensando…');
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const registered = await toolList();
      const tools = registered.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
      const res = await api.agentTurn({ passcode, messages, tools });
      messages.push({ role: 'assistant', content: res.content });
      thinking.remove();
      for (const block of res.content) if (block.type === 'text' && block.text.trim()) addMsg('assistant', block.text.trim());
      const calls = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || calls.length === 0) break;
      const results = [];
      for (const call of calls) {
        const tool = registered.find((t) => t.name === call.name);
        const line = addMsg('tool', toolLine(call.name, '… '));
        let output;
        try {
          output = tool ? await runTool(tool, call.input) : JSON.stringify({ ok: false, error: { code: 'unknown_tool', message: `No existe la herramienta ${call.name}.` } });
        } catch (err) {
          output = JSON.stringify({ ok: false, error: { code: 'tool_exception', message: err.message } });
        }
        const { text, ok } = readResult(output);
        line.textContent = toolLine(call.name, ok ? '✓ ' : '✗ ');
        if (!ok) line.classList.add('is-error');
        results.push({ type: 'tool_result', tool_use_id: call.id, content: text, ...(ok ? {} : { is_error: true }) });
      }
      messages.push({ role: 'user', content: results });
      if (step === MAX_STEPS - 1) addMsg('system', 'He llegado al máximo de pasos por mensaje. Escribe "sigue" y continúo.');
    }
  } catch (err) {
    thinking.remove();
    const e = err.body?.error;
    if (e?.code === 'bad_passcode') {
      passcode = null;
      try { sessionStorage.removeItem('escala.passcode'); } catch { /* nada */ }
    }
    const down = e?.code === 'agent_unavailable' || e?.code === 'bad_response' || (err.status ?? 0) >= 500;
    addMsg('system', down
      ? 'Alba no está disponible en este momento. Puedes cotizar y contratar directamente en la web, o pedir que te llame una persona.'
      : e ? `${e.message}${e.how_to_fix ? ` ${e.how_to_fix}` : ''}` : err.message);
    messages.pop();
  } finally {
    running = false;
    toggle.querySelector('.agent-dot').classList.remove('is-busy');
    $('#chat-form button').disabled = false;
  }
}

function initChat(status) {
  $('#chat').hidden = false;
  try {
    passcode = sessionStorage.getItem('escala.passcode');
  } catch {
    passcode = null;
  }
  addMsg('assistant', 'Hola, soy **Alba**, la asistente virtual de Escala. Te ayudo a comparar coberturas y a resolver tus dudas. ¿Por dónde empezamos?');
  const quick = $('#quick-replies');
  $('#chat-log').append(quick); // los atajos van justo debajo del saludo, como en un chat
  quick.hidden = false;
  const send = (text) => {
    if (running) return;
    quick.hidden = true;
    addMsg('user', text);
    runAgent(text);
  };
  quick.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-quick]');
    if (!b) return;
    if (status.needs_passcode && !passcode) return addMsg('assistant', 'Primero escribe el código de acceso de la demo.');
    const order = store.state.order;
    if (b.dataset.quick === 'coberturas') send('Quiero comparar las coberturas de los planes.');
    if (b.dataset.quick === 'cotizar') send('Quiero cotizar mi viaje.');
    if (b.dataset.quick === 'retomar') {
      if (order && order.status !== 'paid') return send(`Quiero retomar mi cotización ${order.quote_id}.`);
      quick.hidden = true;
      addMsg('user', 'Quiero retomar una cotización.');
      addMsg('assistant', 'Si la guardaste, abre el email «Tu cotización de Escala» y pulsa **Retomar mi compra**: vuelves justo donde lo dejaste. Si no lo tienes a mano, la rehacemos en un momento: ¿a dónde viajas y en qué fechas?');
    }
  });
  $('#chat-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text || running) return;
    if (status.needs_passcode && !passcode) {
      passcode = text;
      try { sessionStorage.setItem('escala.passcode', passcode); } catch { /* nada */ }
      input.value = '';
      addMsg('assistant', 'Código guardado. ¿Qué viaje quieres asegurar?');
      return;
    }
    input.value = '';
    $('#quick-replies').hidden = true;
    addMsg('user', text);
    runAgent(text);
  });
  $('#chat-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      $('#chat-form').requestSubmit();
    }
  });
  if (status.needs_passcode && !passcode) addMsg('assistant', 'Primero escribe el código de acceso de la demo.');
}

export async function initAgentDrawer(toolsPromise) {
  drawer = $('#agent-drawer');
  toggle = $('.agent-toggle');
  toggle.addEventListener('click', () => (drawer.hidden ? open() : close()));
  $('.drawer-close').addEventListener('click', close);
  // Delegado: también sirve para los botones que se crean después (la ayuda bajo los planes).
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-open-agent]')) open();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !drawer.hidden) close();
  });

  store.subscribe((state, reason) => {
    if (reason !== 'activity') return;
    // Si un agente externo (no Alba) empieza a usar las herramientas, abrimos el registro para que se vea.
    if (!running) externalActivity = true;
    renderActivity();
    if (!running) {
      $('#external-note').hidden = false;
      $('#activity').open = true;
      if (!autoOpened && drawer.hidden) {
        autoOpened = true;
        open(false);
      }
    }
    const dot = toggle.querySelector('.agent-dot');
    dot.classList.add('is-busy');
    clearTimeout(dot._t);
    dot._t = setTimeout(() => !running && dot.classList.remove('is-busy'), 1500);
  });

  renderActivity();
  const tools = await toolsPromise;
  const statusEl = $('#webmcp-status');
  if (tools.ok) {
    statusEl.innerHTML = `<strong>WebMCP activo:</strong> ${tools.count} herramientas registradas en <code>document.modelContext</code>${tools.mode === 'native' ? ' (WebMCP nativo del navegador)' : ''}.`;
    toggle.querySelector('.agent-dot').classList.add('is-live');
  } else {
    statusEl.textContent = 'WebMCP no está disponible en este navegador. La web funciona igual para personas.';
  }

  let status = { enabled: false };
  try {
    status = await api.agentStatus();
  } catch {
    /* sin agente */
  }
  if (status.enabled && tools.ok) initChat(status);
  else {
    const off = $('#agent-off');
    off.hidden = false;
    off.innerHTML = `
      <p>Alba no está disponible ahora mismo en esta web.</p>
      <p><strong>Usa tu propio agente.</strong> Esta página expone sus herramientas con WebMCP. Un agente compatible (por ejemplo, Chrome con WebMCP activado o la extensión MCP-B) puede cotizar y comprar sin tocar la interfaz.</p>
      <p>Lo que haga el agente aparecerá abajo, en «Actividad WebMCP», y la página avanzará sola.</p>
      <p><a href="/agentes">Cómo conectar un agente</a></p>`;
  }
}
