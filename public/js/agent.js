// Cajón del asistente: registro de actividad WebMCP y, si el servidor lo tiene activado,
// un agente real (Claude) que descubre y usa las herramientas con document.modelContext.getTools()/executeTool().
import { api, store } from './core.js';
import { listTools, callTool } from './webmcp.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_STEPS = 16;

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
function miniMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- /gm, '• ')
    .replace(/(https?:\/\/[^\s<)]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, '').slice(0, 48)}${url.length > 56 ? '…' : ''}</a>`);
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

function renderActivity() {
  const items = store.state.activity;
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
        const line = addMsg('tool', `→ ${call.name}`);
        let output;
        try {
          output = tool ? await runTool(tool, call.input) : JSON.stringify({ ok: false, error: { code: 'unknown_tool', message: `No existe la herramienta ${call.name}.` } });
        } catch (err) {
          output = JSON.stringify({ ok: false, error: { code: 'tool_exception', message: err.message } });
        }
        const { text, ok } = readResult(output);
        line.textContent = `${ok ? '✓' : '✗'} ${call.name}`;
        if (!ok) line.classList.add('is-error');
        results.push({ type: 'tool_result', tool_use_id: call.id, content: text, ...(ok ? {} : { is_error: true }) });
      }
      messages.push({ role: 'user', content: results });
      if (step === MAX_STEPS - 1) addMsg('system', 'El asistente ha llegado al máximo de pasos por mensaje. Escribe "sigue" para continuar.');
    }
  } catch (err) {
    thinking.remove();
    const e = err.body?.error;
    if (e?.code === 'bad_passcode') {
      passcode = null;
      try { sessionStorage.removeItem('escala.passcode'); } catch { /* nada */ }
    }
    addMsg('system', e ? `${e.message}${e.how_to_fix ? ` ${e.how_to_fix}` : ''}` : err.message);
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
  addMsg('assistant', 'Hola. Cuéntame tu viaje (destino, fechas, edades) y lo aseguro por ti. Te enseñaré el resumen antes de pagar.');
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
  document.querySelectorAll('[data-open-agent]').forEach((b) => b.addEventListener('click', () => open()));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !drawer.hidden) close();
  });

  store.subscribe((state, reason) => {
    if (reason !== 'activity') return;
    renderActivity();
    // Si un agente externo empieza a usar las herramientas, abrimos el registro para que se vea.
    if (!autoOpened && drawer.hidden && !running) {
      autoOpened = true;
      open(false);
    }
    const dot = toggle.querySelector('.agent-dot');
    dot.classList.add('is-busy');
    clearTimeout(dot._t);
    dot._t = setTimeout(() => !running && dot.classList.remove('is-busy'), 1500);
  });

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
      <p><strong>Usa tu propio agente.</strong> Esta página expone sus herramientas con WebMCP. Un agente compatible (por ejemplo, Chrome con WebMCP activado o la extensión MCP-B) puede cotizar y comprar sin tocar la interfaz.</p>
      <p>Lo que haga el agente aparecerá abajo, en «Actividad WebMCP», y la página avanzará sola.</p>
      <p><a href="/agentes">Cómo conectar un agente</a></p>`;
  }
}
