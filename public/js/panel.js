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

async function load() {
  const res = await fetch('/api/metrics');
  const { steps, channels } = await res.json();
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
      <tr><th scope="row">Planes vendidos</th>${keys
        .map((k) => `<td>${Object.entries(channels[k]?.plans ?? {}).map(([p, n]) => `${p} ${n}`).join(', ') || '—'}</td>`)
        .join('')}</tr>
    </tbody>`;
  document.getElementById('updated').textContent = `Actualizado a las ${new Date().toLocaleTimeString('es-ES')}. Se refresca cada 10 segundos.`;
}

load();
setInterval(load, 10000);
