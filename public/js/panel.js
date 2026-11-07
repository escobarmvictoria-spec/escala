// Panel de conversión: embudo por canal (web frente a agente de IA).
const LABELS = {
  quoted: 'Cotizaciones',
  plan_selected: 'Plan elegido',
  travelers_set: 'Datos de viajeros',
  reviewed: 'Resumen revisado',
  terms_accepted: 'Condiciones aceptadas',
  paid: 'Pólizas pagadas',
};
const CHANNELS = { web: 'Web (personas)', agente_ia: 'Agente de IA (WebMCP)' };
const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function load() {
  const res = await fetch('/api/metrics');
  const { steps, channels, handoffs = {} } = await res.json();
  const keys = Object.keys(CHANNELS);
  const table = document.getElementById('funnel');
  const cell = (c, s) => {
    const f = channels[c]?.funnel;
    if (!f) return '<td class="is-missing">0</td>';
    return `<td>${f[s]} <small style="font-weight:400;color:var(--slate)">${s === 'quoted' ? '' : pct(f[s], f.quoted)}</small></td>`;
  };
  table.innerHTML = `
    <thead><tr><th scope="col">Paso</th>${keys.map((k) => `<th scope="col">${CHANNELS[k]}</th>`).join('')}</tr></thead>
    <tbody>
      ${steps.map((s) => `<tr><th scope="row">${LABELS[s]}</th>${keys.map((k) => cell(k, s)).join('')}</tr>`).join('')}
      <tr><th scope="row">Ventas</th>${keys.map((k) => `<td>${eur(channels[k]?.revenue_eur ?? 0)}</td>`).join('')}</tr>
      <tr><th scope="row">Pidieron que les llame una persona<small>${esc(Object.entries(Object.values(handoffs).reduce((acc, h) => { for (const [k, v] of Object.entries(h.reasons)) acc[k] = (acc[k] || 0) + v; return acc; }, {})).map(([k, v]) => `${k}: ${v}`).join(' · '))}</small></th>${keys.map((k) => `<td>${handoffs[k]?.total ?? 0}</td>`).join('')}</tr>
      <tr><th scope="row">Planes vendidos</th>${keys
        .map((k) => `<td>${Object.entries(channels[k]?.plans ?? {}).map(([p, n]) => `${p} ${n}`).join(', ') || '—'}</td>`)
        .join('')}</tr>
    </tbody>`;
  document.getElementById('updated').textContent = `Actualizado a las ${new Date().toLocaleTimeString('es-ES')}. Se refresca cada 10 segundos.`;
}

async function loadEval() {
  try {
    const res = await fetch('/eval/latest.json', { cache: 'no-store' });
    if (!res.ok) return;
    const r = await res.json();
    const s = r.summary;
    document.getElementById('eval').hidden = false;
    document.getElementById('eval-summary').innerHTML = `<strong>${s.passed} de ${s.total} escenarios superados.</strong> Compró bien en ${s.purchases_ok} de ${s.purchases_expected} casos, resolvió bien ${s.stops_ok} de ${s.stops_expected} casos en los que no debía comprar (frenar o pasar a una persona) y pidió confirmación antes de pagar en ${s.confirmed} de ${s.paid} pagos. Mediana de ${s.median_tool_calls} herramientas por compra.`;
    document.getElementById('eval-table').innerHTML = `
      <thead><tr><th scope="col">Escenario</th><th scope="col">Esperado</th><th scope="col">Resultado</th><th scope="col">Herramientas</th><th scope="col">Segundos</th></tr></thead>
      <tbody>${r.results
        .map((x) => `<tr><th scope="row">${esc(x.title)}<small>${esc(x.group)}</small></th><td>${esc(x.expected)}</td><td class="${x.passed ? '' : 'is-missing'}">${x.passed ? 'Superado' : 'Fallido'}${x.plan ? `<br><small>${esc(x.plan)}, ${x.total_eur} €</small>` : ''}</td><td>${x.tool_calls}</td><td>${x.seconds}</td></tr>`)
        .join('')}</tbody>`;
    document.getElementById('eval-note').textContent = `Ejecutada el ${new Date(r.ran_at).toLocaleDateString('es-ES')} con ${r.agent_model} como agente y ${r.customer_model} como cliente simulado. Cada resultado se comprueba contra el servidor, no contra lo que dice el agente.`;
  } catch {
    /* sin prueba publicada */
  }
}

load();
loadEval();
setInterval(load, 10000);
