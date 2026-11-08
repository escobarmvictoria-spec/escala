// Interfaz de Escala: cotizador, compra y póliza. Pinta el mismo estado que modifican las herramientas WebMCP.
import { api, store, eur, fmtDate, ApiFailure, humanError } from './core.js';
import { registerEscalaTools } from './webmcp.js';
import { initAgentDrawer } from './agent.js';
import { initHumanDialog } from './human.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Email que, si no cabe, se parte por la arroba en vez de salirse del recuadro.
const escEmail = (e) => esc(e).replace(/\./g, '.<wbr>').replace('@', '<wbr>@');

const STEPS = ['plan', 'viajeros', 'revision', 'pago', 'poliza'];
// Resumen de la cancelación dentro de la cotización: decide si compensa pagar más sin salir de los resultados.
let keepCancelOpen = false; // tras comprobar, el desplegable sigue abierto con el resultado
const cancelDetails = (order) => {
  const c = order.cancellation_check;
  const cls = c ? (c.covered_before_departure ? 'is-ok' : 'is-warn') : '';
  return `<details class="cov-more"${c && keepCancelOpen ? ' open' : ''}><summary>Ver causas y cuándo empieza a cubrir</summary>
  <div><p>Cubre 10 causas concretas, entre ellas enfermedad grave, accidente u hospitalización tuya o de un familiar cercano, fallecimiento de un familiar, despido o una citación judicial.</p>
  <p>Si contratas en los 7 días siguientes a tu primera reserva, cubre desde que contratas. Si contratas más tarde, empieza a cubrir 72 horas después. Termina al empezar el viaje.</p>
  <form class="cancel-check" novalidate>
    <label>¿Cuándo hiciste tu primera reserva? <span class="optional">(opcional)</span><input type="date" name="first_booking" required value="${esc(c?.first_booking_date ?? '')}"></label>
    <button type="submit" class="btn-secondary btn-small">Comprobar para mis fechas</button>
    <p class="cancel-result ${cls}" role="status"${c ? '' : ' hidden'}>${esc(c?.message ?? '')}</p>
  </form>
  <p><a href="/condiciones#cancelacion" target="_blank" rel="noopener">Ver las 10 causas en las condiciones</a></p></div></details>`;
};
const COVERAGE_ORDER = ['Gastos médicos en el extranjero', 'Repatriación o traslado sanitario', 'Cancelación del viaje', 'Robo, pérdida o daños del equipaje', 'Retraso del equipaje (más de 12 h)', 'Retraso del vuelo (más de 6 h)', 'Responsabilidad civil privada', 'Accidentes (fallecimiento o invalidez)'];
const STEP_OF = { quoted: 'plan', plan_selected: 'viajeros', travelers_set: 'revision', reviewed: 'revision', terms_accepted: 'pago', paid: 'poliza' };
let viewStep = null; // paso al que vuelve la persona al pulsar en la ruta
let product = null;
let lastRenderedStep = null;
let loadingSummary = false;
let browsingHome = false;
let stalePurchase = false; // la persona cambió el viaje y la nueva cotización falló: la compra anterior queda en pausa

// «¿Cuándo hiciste tu primera reserva?»: aplica la regla de la cancelación a las fechas de esta cotización.
// La web y los agentes consultan la misma regla en el servidor (check_cancellation_start).
document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('.cancel-check');
  if (!form) return;
  ev.preventDefault();
  const out = $('.cancel-result', form);
  const order = store.state.order;
  if (!order) return;
  if (!form.first_booking.value) {
    out.textContent = 'Elige la fecha de tu primera reserva (vuelo, alojamiento…).';
    out.className = 'cancel-result is-error';
    out.hidden = false;
    return;
  }
  await busy($('button', form), async () => {
    try {
      await api.cancellationCheck(order.quote_id, form.first_booking.value);
      // El resultado queda en el pedido: la misma respuesta en Completo y en Total, y si la cancelación
      // no llegaría a activarse, la recomendación y la revisión dejan de usarla como argumento.
      keepCancelOpen = true;
      store.state.summary = null;
      const fresh = await api.getQuote(order.quote_id);
      if (form.closest('#review-sheet')) await ensureSummary(fresh.order);
      store.apply(fresh, 'cancellation', { by: 'web' });
      return;
    } catch (err) {
      out.textContent = humanError(err);
      out.className = 'cancel-result is-error';
    }
    out.hidden = false;
  });
}); // la persona abrió una sección de la portada (p. ej. Coberturas) en mitad de la compra

// Durante la compra la portada se oculta; un enlace a una de sus secciones la vuelve a mostrar sin perder la compra.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[href^="#"], a[href^="/#"]');
  if (!a || !document.body.classList.contains('is-checkout')) return;
  const id = a.getAttribute('href').split('#')[1];
  const target = id && document.getElementById(id);
  if (!target || !target.closest('.home-section')) return;
  ev.preventDefault();
  browsingHome = true;
  document.body.classList.remove('is-checkout');
  history.pushState(null, '', `#${id}`);
  target.scrollIntoView({ block: 'start' });
});

// ---------- utilidades de formulario ----------
function showError(form, err) {
  const box = $('.form-error', form);
  if (!box) return;
  if (!err) {
    box.hidden = true;
    box.textContent = '';
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    return;
  }
  const e = err instanceof ApiFailure ? err.body.error : { message: err.message };
  box.textContent = humanError(err);
  if (['destination_excluded', 'trip_too_long', 'residence_not_supported'].includes(e.code)) {
    box.append(' ');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'human-link';
    b.dataset.openHuman = 'no_asegurable';
    b.textContent = 'Pedir que me llamen';
    box.append(b);
  }
  box.hidden = false;
}

async function busy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Un momento…';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function isoPlusDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

// ---------- cotizador ----------
function ageChip(value = '') {
  const wrap = document.createElement('div');
  wrap.className = 'age-chip';
  const n = $$('.age-chip', $('#ages-list')).length + 1;
  wrap.innerHTML = `<input type="number" min="0" max="84" inputmode="numeric" aria-label="Edad del viajero ${n}" placeholder="Edad" value="${esc(value)}"><span>años</span><button type="button" aria-label="Quitar viajero ${n}">×</button>`;
  $('button', wrap).addEventListener('click', () => {
    if ($$('.age-chip').length > 1) wrap.remove();
  });
  return wrap;
}

function fillQuoteForm(order) {
  const form = $('#quote-form');
  form.destination.value = order.trip.destinations.map((d) => d.place ?? d.name).join(', ');
  form.start_date.value = order.trip.start_date;
  form.end_date.value = order.trip.end_date;
  form.departure_country.value = 'ES';
  const list = $('#ages-list');
  list.innerHTML = '';
  const ages = order.travelers?.map((t) => t.age) ?? order.quote.plans.completo.per_traveler.map((t) => t.age);
  ages.forEach((a) => list.append(ageChip(a)));
}

function initQuoteForm() {
  const form = $('#quote-form');
  const today = todayIso();
  form.start_date.min = today;
  form.end_date.min = today;
  form.start_date.value = isoPlusDays(today, 14);
  form.end_date.value = isoPlusDays(today, 20);
  form.start_date.addEventListener('change', () => {
    form.end_date.min = form.start_date.value;
    if (form.end_date.value < form.start_date.value) form.end_date.value = isoPlusDays(form.start_date.value, 6);
  });
  $('#ages-list').append(ageChip());
  $('#add-traveler').addEventListener('click', () => {
    if ($$('.age-chip').length >= 6) return;
    const chip = ageChip();
    $('#ages-list').append(chip);
    $('input', chip).focus();
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError(form, null);
    const ages = $$('.age-chip input', form).map((i) => i.value.trim());
    const missing = ages.findIndex((a) => a === '');
    if (!form.destination.value.trim()) {
      form.destination.setAttribute('aria-invalid', 'true');
      showError(form, new Error('Escribe a dónde viajas.'));
      return form.destination.focus();
    }
    if (missing >= 0) {
      const input = $$('.age-chip input', form)[missing];
      input.setAttribute('aria-invalid', 'true');
      showError(form, new Error('Falta la edad de un viajero.'));
      return input.focus();
    }
    const button = $('button[type=submit]', form);
    await busy(button, async () => {
      const input = {
        destinations: form.destination.value.split(',').map((s) => s.trim()).filter(Boolean),
        start_date: form.start_date.value,
        end_date: form.end_date.value,
        travelers: ages.map((a) => ({ age: Number(a) })),
        departure_country: form.departure_country.value,
        device: matchMedia('(max-width: 640px)').matches ? 'movil' : 'escritorio',
      };
      try {
        const data = await api.quote(input);
        stalePurchase = false;
        store.state.attempt = null;
        viewStep = null;
        store.apply(data, 'quote', { by: 'web' });
        $('#compra').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        // Si el viaje no se puede contratar online, guardamos lo que intentó cotizar para la llamada.
        const code = err instanceof ApiFailure ? err.body?.error?.code : null;
        store.state.attempt = ['destination_excluded', 'trip_too_long', 'residence_not_supported'].includes(code)
          ? { destinations: input.destinations, start_date: input.start_date, end_date: input.end_date, ages: input.travelers.map((t) => t.age) }
          : null;
        showError(form, err);
        // Si había una compra abierta, no puede seguir con datos distintos de los que acaba de escribir.
        const open = store.state.order;
        if (open && open.status !== 'paid') {
          stalePurchase = true;
          render(store.state, 'stale');
        }
      }
    });
  });
}

function tripLabel(order) {
  const ages = order.travelers?.map((t) => t.age) ?? order.quote.plans.completo.per_traveler.map((t) => t.age);
  const who = ages.length === 1 ? `1 viajero de ${ages[0]} años` : `${ages.length} viajeros (${ages.join(', ')} años)`;
  return `${order.trip.destinations.map((d) => d.label ?? d.name).join(', ')} · ${who}`;
}

// ---------- pasos de compra ----------
function currentStep(order) {
  const real = STEP_OF[order.status];
  if (viewStep && STEPS.indexOf(viewStep) <= STEPS.indexOf(real) && order.status !== 'paid') return viewStep;
  return real;
}

function renderRoute(order, step) {
  const reached = STEPS.indexOf(STEP_OF[order.status]);
  $$('.route li').forEach((li) => {
    const i = STEPS.indexOf(li.dataset.step);
    li.classList.toggle('is-done', i < reached || (order.status === 'paid' && i <= reached));
    li.classList.toggle('is-current', li.dataset.step === step && order.status !== 'paid');
    const btn = $('button', li);
    btn.disabled = !(i <= reached && order.status !== 'paid');
    if (li.dataset.step === step) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
}

function renderTripLine(order) {
  const t = order.trip;
  const n = order.travelers?.length ?? order.quote.plans.completo.per_traveler.length;
  $('#trip-line').innerHTML = `
    <strong>${esc(t.destinations.map((d) => d.label ?? d.name).join(', '))}</strong>
    <span>${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}</span>
    <span>${t.days} días</span>
    <span>${n} ${n === 1 ? 'viajero' : 'viajeros'}</span>
    <span>Zona de cobertura: ${esc(t.zone_name)}</span>
    ${order.plan && order.status !== 'paid' ? `<span class="trip-plan">Plan ${esc(order.quote.plans[order.plan].name)}, ${eur(order.total_eur)}</span>` : ''}
    ${order.status === 'paid' ? '' : '<button class="btn-quiet edit" type="button" data-edit-trip>Cambiar el viaje</button>'}
    ${order.experiments?.guardar_atajo === 'B' && currentStep(order) === 'plan' ? '<button class="btn-quiet edit" type="button" data-save-later>Guardar para más tarde</button>' : ''}`;
  $('[data-save-later]')?.addEventListener('click', () => {
    saveSource = 'atajo';
    $('#save-quote').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#s-email').focus({ preventScroll: true });
  });
  $('[data-edit-trip]')?.addEventListener('click', () => {
    fillQuoteForm(order);
    $('#cotizar').scrollIntoView({ behavior: 'smooth' });
    $('#q-destination').focus({ preventScroll: true });
  });
}

let savedFor = null;
let saveSource = 'formulario'; // A/B: ¿se guardó desde el atajo o desde el formulario al pie?
function renderPlans(order) {
  const coverages = store.state.coverages;
  if (savedFor !== order.quote_id) {
    savedFor = order.quote_id;
    $$('#save-quote .save-done, #save-quote .form-error').forEach((el) => (el.hidden = true));
    if (order.holder?.email && !$('#s-email').value) $('#s-email').value = order.holder.email;
  }
  const grid = $('#plans-grid');
  grid.innerHTML = '';
  if (!$('#plans-assist')) {
    // Lo que pasa después de comprar, justo donde se decide: quién paga el hospital si te pones enfermo.
    const assist = document.createElement('div');
    assist.id = 'plans-assist';
    assist.className = 'assist-note';
    assist.innerHTML = '<h3>Si necesitas ir al médico durante el viaje</h3><p>Llama a asistencia 24 horas. Te indicaremos a qué centro acudir y, si el gasto está cubierto, pagaremos directamente al hospital. <a href="/condiciones#urgencia" target="_blank" rel="noopener">Qué hacer en una urgencia</a></p>';
    grid.after(assist);
  }
  if (!$('#plans-help')) {
    const help = document.createElement('p');
    help.id = 'plans-help';
    help.className = 'plans-help';
    help.innerHTML = '<span class="help-line">¿Dudas entre planes? <button type="button" class="human-link" data-open-agent>Hablar con Alba</button></span><span class="help-line">¿Dudas sobre una enfermedad previa? La cobertura está por confirmar. <button type="button" class="human-link" data-open-human="enfermedad_previa">Pedir que me llamen</button></span>';
    $('#plans-assist').after(help);
  }
  const rec = order.recommendation?.plan ?? 'completo';
  $('#plans-reason')?.remove();
  for (const id of ['esencial', 'completo', 'total']) {
    const p = order.quote.plans[id];
    const isRec = id === rec && p.available;
    const meta = product?.plans.find((x) => x.id === id);
    const covs = coverages?.[id] ?? meta?.coverages ?? [];
    const missing = meta?.not_included ?? [];
    const perPerson = p.per_traveler.length > 1 ? `${eur(p.total_eur / p.per_traveler.length)} por persona de media` : `${eur(p.total_eur / order.trip.days)} al día`;
    const el = document.createElement('article');
    el.className = `plan${isRec ? ' is-recommended' : ''}${order.plan === id ? ' is-selected' : ''}${p.available ? '' : ' is-unavailable'}`;
    el.innerHTML = `
      <span class="plan-flag${isRec ? '' : ' is-empty'}">${isRec ? esc(order.recommendation?.label ?? 'Recomendado') : 'Recomendado'}</span>
      <h3>${esc(p.name)}</h3>
      <p class="plan-tagline">${esc(meta?.description ?? '')}</p>
      ${p.available ? `<p class="plan-price">${eur(p.total_eur)}</p>
      <p class="plan-price-note">Total para ${p.per_traveler.length === 1 ? '1 viajero' : `${p.per_traveler.length} viajeros`}, impuestos incluidos. ${perPerson}.${p.group_discount_pct ? ` Incluye ${p.group_discount_pct} % de descuento de grupo.` : ''}</p>` : `<p class="plan-price is-na">No disponible</p>
      <p class="plan-price-note">${esc(p.unavailable_reason)}</p>`}
      ${isRec && order.recommendation?.reason ? `<p class="plan-why">${esc(order.recommendation.reason)}</p>` : '<div class="plan-why is-empty" aria-hidden="true"></div>'}
      <ul class="plan-list">
        ${COVERAGE_ORDER.map((name) => {
          const c = covs.find((x) => x.coverage === name || (name.startsWith('Gastos médicos') && x.coverage.startsWith('Gastos médicos')));
          // La fila de cancelación lleva un desplegable en los planes que la incluyen; en el que no, se reserva el mismo alto para que las filas sigan alineadas.
          const spacer = name === 'Cancelación del viaje' ? '<span class="cov-more-spacer" aria-hidden="true">No incluida en este plan</span>' : '';
          if (!c) return missing.includes(name) ? `<li class="is-missing${spacer ? ' has-more' : ''}"><span>${esc(shortName(name))}</span><span>No incluido</span>${spacer}</li>` : '';
          const more = name === 'Cancelación del viaje' ? cancelDetails(order) : '';
          return `<li${more ? ' class="has-more"' : ''}><span>${esc(shortName(c.coverage))}</span><span>${esc(c.limit)}${c.deductible !== 'Sin franquicia' ? ` <small>(franquicia ${esc(c.deductible)})</small>` : ''}</span>${more}</li>`;
        }).join('')}
      </ul>
      <div class="plan-unavailable is-empty" aria-hidden="true"></div>
      <button class="${order.plan === id ? 'btn-navy' : isRec ? 'btn-primary' : 'btn-secondary'}" type="button" data-plan="${id}" ${p.available ? '' : 'disabled'}>${order.plan === id ? `${esc(p.name)} elegido` : `Elegir ${esc(p.name)}`}</button>`;
    grid.append(el);
  }
  $$('[data-plan]', grid).forEach((b) =>
    b.addEventListener('click', async () => {
      await busy(b, async () => {
        try {
          const data = await api.selectPlan(order.quote_id, b.dataset.plan);
          viewStep = null;
          store.apply(data, 'plan', { by: 'web' });
        } catch (err) {
          alertError(err);
        }
      });
    })
  );
}

function shortName(name) {
  return name
    .replace('Gastos médicos en el extranjero', 'Gastos médicos')
    .replace('Gastos médicos (viaje por España)', 'Gastos médicos')
    .replace('Repatriación o traslado sanitario', 'Repatriación')
    .replace('Robo, pérdida o daños del equipaje', 'Equipaje')
    .replace('Retraso del equipaje (más de 12 h)', 'Retraso de equipaje')
    .replace('Retraso del vuelo (más de 6 h)', 'Retraso de vuelo')
    .replace('Responsabilidad civil privada', 'Responsabilidad civil')
    .replace('Accidentes (fallecimiento o invalidez)', 'Accidentes')
    .replace('Cancelación del viaje', 'Cancelación');
}

function alertError(err) {
  const msg = humanError(err);
  const box = document.createElement('p');
  box.className = 'form-error';
  box.setAttribute('role', 'alert');
  box.textContent = msg;
  $('#trip-line').after(box);
  setTimeout(() => box.remove(), 8000);
}

function renderTravelers(order) {
  const form = $('#travelers-form');
  if (form.dataset.quote === order.quote_id && form.dataset.status === order.status && document.activeElement && form.contains(document.activeElement)) return;
  form.dataset.quote = order.quote_id;
  form.dataset.status = order.status;
  showError(form, null);
  if (order.holder) {
    form.holder_name.value = order.holder.full_name;
    form.holder_email.value = order.holder.email;
    form.holder_phone.value = order.holder.phone ?? '';
  }
  const ages = order.travelers?.map((t) => t.age) ?? order.quote.plans.completo.per_traveler.map((t) => t.age);
  const list = $('#travelers-list');
  list.innerHTML = ages
    .map((age, i) => {
      const t = order.travelers?.[i];
      // Si quien contrata también viaja, el viajero 1 se muestra como resumen (su nombre ya está arriba), con «Editar».
      const summary = i === 0 ? `<p class="traveler-summary" hidden><span>Viajero asegurado · <strong data-t-summary></strong> · <span data-t-summary-age>${esc(age)}</span> años</span><button type="button" class="edit-link" data-t-edit>Editar</button></p>` : '';
      return `<div class="traveler-row-wrap">${summary}<div class="traveler-row">
        <div class="field"><label for="t-name-${i}">Viajero ${i + 1}: nombre y apellidos</label><input id="t-name-${i}" data-t-name autocomplete="${i === 0 ? 'name' : 'off'}" value="${esc(t?.full_name ?? '')}" required></div>
        <div class="field"><label for="t-age-${i}">Edad</label><input id="t-age-${i}" data-t-age type="number" min="0" max="84" value="${esc(age)}" required></div>
      </div></div>`;
    })
    .join('');
  // Datos opcionales, agrupados: teléfono y un documento por viajero.
  $('#docs-list').innerHTML = ages
    .map((_, i) => `<div class="field"><label for="t-doc-${i}">DNI, NIE o pasaporte <span data-doc-who="${i}">del viajero ${i + 1}</span></label><input id="t-doc-${i}" data-t-doc value="${esc(order.travelers?.[i]?.document_id ?? '')}"></div>`)
    .join('');
  $('#optional-data').open = Boolean(order.holder?.phone || order.travelers?.some((t) => t.document_id));
  const firstName = $('[data-t-name]', list);
  const firstAge = $('[data-t-age]', list);
  const summary = $('.traveler-summary', list);
  const row0 = list.querySelector('.traveler-row');
  let editing = Boolean(order.travelers?.[0] && order.holder && order.travelers[0].full_name !== order.holder.full_name);
  if (order.holder && order.travelers?.[0]) $('#holder-travels').checked = order.travelers[0].full_name === order.holder.full_name;
  firstName.dataset.mirrored = !order.travelers?.[0] || order.travelers[0].full_name === order.holder?.full_name ? '1' : '0';
  const docWho = () => $$('[data-doc-who]').forEach((el) => {
    const n = $$('[data-t-name]', list)[Number(el.dataset.docWho)]?.value.trim();
    el.textContent = n ? `de ${n}` : `del viajero ${Number(el.dataset.docWho) + 1}`;
  });
  const sync = () => {
    const travels = $('#holder-travels').checked;
    if (travels && firstName.dataset.mirrored === '1') firstName.value = form.holder_name.value;
    const collapsed = travels && firstName.dataset.mirrored === '1' && !editing;
    summary.hidden = !collapsed;
    row0.hidden = collapsed;
    $('[data-t-summary]', summary).textContent = form.holder_name.value.trim() || 'tu nombre';
    $('[data-t-summary-age]', summary).textContent = firstAge.value;
    if (!travels && firstName.dataset.mirrored === '1') { firstName.value = ''; }
    docWho();
  };
  form.holder_name.oninput = sync;
  $('#holder-travels').onchange = () => { if ($('#holder-travels').checked) { firstName.dataset.mirrored = '1'; editing = false; } sync(); };
  firstName.oninput = () => { firstName.dataset.mirrored = '0'; docWho(); };
  $$('[data-t-name]', list).slice(1).forEach((el) => (el.oninput = docWho));
  $('[data-t-edit]', summary).onclick = () => { editing = true; sync(); firstName.focus(); };
  sync();
}

function initTravelersForm() {
  const form = $('#travelers-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError(form, null);
    const order = store.state.order;
    const rows = $$('.traveler-row', form);
    const docs = $$('[data-t-doc]', form);
    if ($('#holder-travels').checked && $('[data-t-name]', rows[0]).dataset.mirrored === '1') $('[data-t-name]', rows[0]).value = form.holder_name.value;
    const payload = {
      holder: { full_name: form.holder_name.value.trim(), email: form.holder_email.value.trim(), phone: form.holder_phone.value.trim() || undefined },
      travelers: rows.map((r, i) => ({
        full_name: $('[data-t-name]', r).value.trim(),
        age: Number($('[data-t-age]', r).value),
        document_id: docs[i]?.value.trim() || undefined,
      })),
    };
    await busy($('button[type=submit]', form), async () => {
      try {
        const data = await api.setTravelers(order.quote_id, payload);
        store.apply(data, 'travelers', { by: 'web' });
        const reviewed = await api.review(order.quote_id);
        viewStep = null;
        store.apply(reviewed, 'review', { by: 'web' });
        $('#compra').scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        showError(form, err);
        const field = err.body?.error?.field;
        if (field?.startsWith('holder.email')) form.holder_email.setAttribute('aria-invalid', 'true');
      }
    });
  });
}

function renderReview(order) {
  const sheet = $('#review-sheet');
  const s = store.state.summary;
  if (!s || order.status === 'travelers_set') {
    sheet.innerHTML = `<h3>Resumen</h3><p>${store.state.agentDriving ? 'El asistente va a revisar el resumen contigo.' : 'Preparando el resumen…'}</p>`;
    if (!store.state.agentDriving) ensureSummary(order);
    return;
  }
  const accepted = ['terms_accepted', 'paid'].includes(order.status);
  sheet.innerHTML = `
    <h3>Revisa antes de pagar</h3>
    <div class="summary-total summary-total-top"><span>${esc(s.plan.name)}, total con impuestos</span><span>${esc(s.total_text)}</span></div>
    <dl class="summary-grid">
      <div><dt>Plan</dt><dd>${esc(s.plan.name)} <button type="button" class="edit-link" data-goto="plan">Cambiar plan</button></dd></div>
      <div><dt>Destino</dt><dd>${esc(s.trip.destinations)}<br><span class="optional">Zona de cobertura: ${esc(s.trip.zone)}</span></dd></div>
      <div><dt>Fechas</dt><dd>${fmtDate(s.trip.start_date)} – ${fmtDate(s.trip.end_date)} (${s.trip.days} días)</dd></div>
      <div><dt>Póliza a nombre de</dt><dd>${esc(s.holder.full_name)}<br><span class="optional email">${escEmail(s.holder.email)}</span><br><span class="optional">Aquí recibirás la póliza de prueba.</span></dd></div>
    </dl>
    <div class="review-head"><h4>Asegurados</h4><button type="button" class="edit-link" data-goto="viajeros">Editar viajeros</button></div>
    <table class="mini-table"><thead><tr><th>Asegurado</th><th>Edad</th><th class="num">Precio</th></tr></thead><tbody>
      ${s.insured.map((t) => `<tr><td>${esc(t.full_name)}</td><td>${t.age}</td><td class="num">${eur(t.price_eur)}</td></tr>`).join('')}
    </tbody></table>
    <table class="mini-table"><thead><tr><th>Cobertura</th><th class="num">Límite por persona</th><th class="num">Franquicia</th></tr></thead><tbody>
      ${s.coverages.map((c) => `<tr><td>${esc(c.coverage)}${c.note ? `<small class="cov-note${c.note_kind === 'ok' ? ' is-ok' : ''}">${esc(c.note)}</small>` : ''}${c.check_pending ? `<button type="button" class="edit-link cov-check-open" data-cov-check>Comprueba cuándo empieza a cubrir la cancelación</button>
        <form class="cancel-check cov-check" hidden novalidate><label>¿Cuándo hiciste tu primera reserva?<input type="date" name="first_booking" required></label><button type="submit" class="btn-secondary btn-small">Comprobar para mis fechas</button><p class="cancel-result" role="status" hidden></p></form>` : ''}</td><td class="num">${esc(c.limit)}</td><td class="num">${esc(c.deductible)}</td></tr>`).join('')}
    </tbody></table>
    <div class="terms-box">
      <strong>Condiciones (versión ${esc(s.terms.version)})</strong>
      <ul>${s.terms.key_points.map((k) => `<li>${esc(k)}${/^Desistimiento/.test(k) ? ' <a href="/condiciones#desistir" target="_blank" rel="noopener">Cómo desistir</a>' : /^Asistencia/.test(k) ? ' <a href="/condiciones#urgencia" target="_blank" rel="noopener">Qué hacer en una urgencia</a>' : ''}</li>`).join('')}</ul>
      <p style="margin-top:8px"><a href="/ficha-producto.pdf" target="_blank" rel="noopener">Ficha del producto (PDF)</a> y <a href="/condiciones" target="_blank" rel="noopener">condiciones completas</a></p>
    </div>
    <div class="summary-total"><span>Total, impuestos incluidos</span><span>${esc(s.total_text)}</span></div>
    <form id="terms-form" class="actions" novalidate>
      <label class="check"><input type="checkbox" name="accept" ${accepted ? 'checked disabled' : ''}> He leído y acepto las condiciones</label>
      <button class="btn-primary" type="submit">Continuar al pago</button>
      <p class="form-error" role="alert" hidden></p>
    </form>`;
  $('[data-cov-check]', sheet)?.addEventListener('click', (ev) => {
    const f = ev.target.nextElementSibling;
    f.hidden = false;
    ev.target.hidden = true;
    f.first_booking.focus();
  });
  // Corregir donde se detecta el error: vuelve al paso sin perder lo ya escrito.
  $$('[data-goto]', sheet).forEach((b) =>
    b.addEventListener('click', () => {
      viewStep = b.dataset.goto;
      render(store.state, 'nav');
    })
  );
  const form = $('#terms-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (accepted) {
      viewStep = 'pago';
      return render(store.state, 'nav');
    }
    if (!form.accept.checked) return showError(form, new Error('Para continuar, marca que aceptas las condiciones.'));
    await busy($('button', form), async () => {
      try {
        const data = await api.acceptTerms(order.quote_id, { review_token: order.review_token, terms_version: s.terms.version, accepted: true });
        viewStep = null;
        store.apply(data, 'terms', { by: 'web' });
      } catch (err) {
        showError(form, err);
      }
    });
  });
}

async function ensureSummary(order) {
  if (loadingSummary) return;
  loadingSummary = true;
  try {
    const data = order.status === 'paid' ? await api.policy(order.policy.policy_number) : await api.review(order.quote_id);
    store.apply(data, 'review', { by: 'web' });
  } catch (err) {
    console.warn(err);
  } finally {
    loadingSummary = false;
  }
}

// En el pago queda a la vista qué se contrata, con enlaces para corregir sin perder el viaje.
function renderPay(order) {
  const t = order.trip;
  const plan = order.quote.plans[order.plan];
  const names = (order.travelers ?? []).map((x) => x.full_name);
  $('#pay-summary').innerHTML = `
    <div class="pay-total"><span>Vas a contratar</span><strong>${eur(order.total_eur)}</strong></div>
    <dl>
      <div><dt>Destino</dt><dd>${esc(t.destinations.map((d) => d.label ?? d.name).join(', '))}</dd></div>
      <div><dt>Fechas</dt><dd>${fmtDate(t.start_date)} – ${fmtDate(t.end_date)} (${t.days} días)</dd></div>
      <div><dt>Plan</dt><dd>${esc(plan.name)} <button type="button" class="edit-link" data-goto="plan">Cambiar plan</button></dd></div>
      <div><dt>${names.length === 1 ? 'Asegurado' : 'Asegurados'}</dt><dd>${names.map(esc).join(', ')} <button type="button" class="edit-link" data-goto="viajeros">Editar</button></dd></div>
    </dl>
    <button type="button" class="edit-link" data-goto="revision">Ver el resumen completo</button>`;
  $$('[data-goto]', $('#pay-summary')).forEach((b) =>
    b.addEventListener('click', () => {
      viewStep = b.dataset.goto;
      render(store.state, 'nav');
    })
  );
  $('#pay-button').textContent = `Simular pago de ${eur(order.total_eur)}`;
}

function initPayForm() {
  const form = $('#pay-form');
  form.card_number.addEventListener('input', () => {
    const digits = form.card_number.value.replace(/\D/g, '').slice(0, 19);
    form.card_number.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  });
  form.card_exp.addEventListener('input', () => {
    const d = form.card_exp.value.replace(/\D/g, '').slice(0, 4);
    form.card_exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError(form, null);
    const order = store.state.order;
    const [mm, yy] = form.card_exp.value.split('/').map(Number);
    const now = new Date();
    const expOk = mm >= 1 && mm <= 12 && yy >= 0 && new Date(2000 + yy, mm, 1) > now;
    if (!expOk) {
      form.card_exp.setAttribute('aria-invalid', 'true');
      return showError(form, new Error('La fecha de caducidad no es válida. Usa MM/AA con una fecha futura, por ejemplo 12/29.'));
    }
    if (!/^\d{3,4}$/.test(form.card_cvc.value.trim())) {
      form.card_cvc.setAttribute('aria-invalid', 'true');
      return showError(form, new Error('El CVC son 3 o 4 cifras.'));
    }
    await busy($('#pay-button'), async () => {
      try {
        const data = await api.pay(order.quote_id, { amount_eur: order.total_eur, card_number: form.card_number.value, user_confirmation: `Pulsó «Simular pago de ${eur(order.total_eur)}» en la web` });
        viewStep = null;
        form.reset();
        store.apply(data, 'paid', { by: 'web' });
        $('#compra').scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        showError(form, err);
        // Tarjeta rechazada: el plan, los viajeros y el total se conservan; solo hay que cambiar la tarjeta.
        if (['card_declined', 'insufficient_funds'].includes(err.body?.error?.code)) {
          form.card_number.setAttribute('aria-invalid', 'true');
          form.card_number.focus();
          form.card_number.select();
        }
      }
    });
  });
}

function emailPill(email) {
  if (email.status === 'sent') return `<span class="status-pill ok">Enviada a ${escEmail(email.to)}</span>`;
  if (email.status === 'simulated') return `<span class="status-pill warn">Envío simulado a ${escEmail(email.to)} (servidor sin email configurado)</span>`;
  if (email.status === 'pending') return `<span class="status-pill warn">Enviando a ${escEmail(email.to)}…</span>`;
  return `<span class="status-pill bad">No se ha podido enviar a ${escEmail(email.to)}</span>`;
}

function renderPolicy(order) {
  const sheet = $('#policy-sheet');
  const p = order.policy;
  const plan = order.quote.plans[order.plan];
  const destinations = order.trip.destinations.map((d) => d.label ?? d.name).join(', ');
  // El momento en que el mensaje de marca es literalmente cierto: el viaje ya está protegido.
  sheet.innerHTML = `
    <div class="policy-hero">
      <p class="policy-status">Póliza emitida${order.channel === 'agente_ia' ? ' por tu asistente de IA' : ''}</p>
      <h3 class="policy-title">Tu viaje, bien protegido.</h3>
      <p class="policy-number">${esc(p.policy_number)}</p>
      ${emailPill(p.email)}
    </div>
    <div class="trip-route" role="group" aria-label="Tu viaje">
      <div class="tr-point"><small>Salida</small><strong>${fmtDate(order.trip.start_date)}</strong><span>Desde España</span></div>
      <div class="tr-line" aria-hidden="true"><i></i><i></i></div>
      <div class="tr-point is-end"><small>Vuelta</small><strong>${fmtDate(order.trip.end_date)}</strong><span>${esc(destinations)}</span></div>
    </div>
    <dl class="summary-grid">
      <div><dt>Plan</dt><dd>${esc(plan.name)}, ${order.trip.days} días</dd></div>
      <div><dt>Asegurados</dt><dd>${order.travelers.map((t) => esc(t.full_name)).join('<br>')}</dd></div>
      <div><dt>Pagado</dt><dd>${eur(plan.total_eur)} <span class="optional">(prueba)</span></dd></div>
    </dl>
    <div class="actions">
      <a class="btn-primary" href="${esc(p.pdf_url)}" target="_blank" rel="noopener">Descargar la póliza (PDF)</a>
      <button class="btn-secondary" type="button" data-new-quote>Cotizar otro viaje</button>
      <a class="human-link" href="/condiciones#urgencia">Tengo una urgencia</a>
      <a class="human-link" href="/condiciones#reembolso">He pagado un gasto</a>
    </div>
    <form class="resend" id="resend-form" novalidate>
      <div class="field"><label for="r-email">¿No te ha llegado? Reenvíala</label><input id="r-email" type="email" value="${esc(order.holder.email)}"></div>
      <button class="btn-secondary" type="submit">Reenviar</button>
      <p class="form-error" role="alert" hidden></p>
    </form>
    <div class="policy-next">
      <h3>Antes de salir</h3>
    </div>`;
  // La misma lista que en la portada (una sola fuente de verdad).
  const checklist = $('#antes-de-salir .checklist');
  if (checklist) $('.policy-next', sheet).append(checklist.cloneNode(true));
  else $('.policy-next', sheet).remove();
  $('[data-new-quote]', sheet).addEventListener('click', () => {
    store.reset();
    history.replaceState(null, '', '/');
    $('#cotizar').scrollIntoView({ behavior: 'smooth' });
  });
  const form = $('#resend-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await busy($('button', form), async () => {
      try {
        const data = await api.resend(p.policy_number, $('#r-email').value.trim());
        store.apply(data, 'policy', { by: 'web' });
      } catch (err) {
        showError(form, err);
      }
    });
  });
}

function render(state, reason, extra = {}) {
  const section = $('#compra');
  const order = state.order;
  if (!order) {
    section.hidden = true;
    lastRenderedStep = null;
    document.body.classList.remove('is-checkout');
    return;
  }
  if (reason === 'activity') return;
  section.hidden = false;
  if (extra.by === 'agent') { viewStep = null; stalePurchase = false; }
  let stale = $('#stale-note');
  if (!stale) {
    stale = document.createElement('div');
    stale.id = 'stale-note';
    stale.className = 'stale-note';
    stale.setAttribute('role', 'status');
    $('#trip-line').before(stale);
  }
  section.classList.toggle('is-stale', stalePurchase);
  stale.hidden = !stalePurchase;
  if (stalePurchase) {
    stale.innerHTML = `<p><strong>Tu compra anterior está en pausa.</strong> El nuevo viaje no se ha podido cotizar, así que no puedes seguir con una compra hecha con otros datos. Revisa el aviso del cotizador o vuelve a tu cotización anterior.</p>
      <button type="button" class="btn-secondary" data-back-quote>Volver a la cotización anterior · ${esc(tripLabel(order))}</button>`;
    $('[data-back-quote]', stale).addEventListener('click', () => {
      stalePurchase = false;
      fillQuoteForm(order);
      showError($('#quote-form'), null);
      render(store.state, 'nav');
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.body.classList.remove('is-checkout');
    lastRenderedStep = null;
    return;
  }
  const step = currentStep(order);
  const resumeNote = $('#resume-note');
  if (resumeNote.dataset.for !== order.quote_id) resumeNote.hidden = true;
  renderRoute(order, step);
  renderTripLine(order);
  $('.agent-notice').hidden = !(state.agentDriving && order.status !== 'paid');
  for (const s of STEPS) $(`#step-${s}`).hidden = s !== step;
  if (step === 'plan') renderPlans(order);
  if (step === 'viajeros') renderTravelers(order);
  if (step === 'revision') renderReview(order);
  if (step === 'pago') renderPay(order);
  if (step === 'poliza') renderPolicy(order);
  // Desde los datos hasta la póliza, la portada se aparta: solo la compra (y, al final, lo que toca hacer).
  if (step !== lastRenderedStep) browsingHome = false;
  document.body.classList.toggle('is-checkout', !browsingHome && ['viajeros', 'revision', 'pago', 'poliza'].includes(step));
  const moved = step !== lastRenderedStep && lastRenderedStep !== null;
  if ((extra.by === 'agent' && step !== lastRenderedStep) || (moved && reason !== 'restore')) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  lastRenderedStep = step;
  if (order.status === 'paid' && !location.pathname.startsWith('/poliza/')) history.replaceState(null, '', `/poliza/${order.policy.policy_number}`);
}

// ---------- contenido estático que depende del catálogo ----------
function renderCoverageTable() {
  if (!product) return;
  const plans = product.plans;
  const names = [...new Set(plans.flatMap((p) => p.coverages.map((c) => c.coverage)).concat(plans.flatMap((p) => p.not_included)))];
  names.sort((a, b) => COVERAGE_ORDER.indexOf(a) - COVERAGE_ORDER.indexOf(b));
  const plain = {
    'Gastos médicos en el extranjero': 'Médico, hospital y medicinas si enfermas o te lesionas.',
    'Repatriación o traslado sanitario': 'Te llevamos a casa o al hospital adecuado.',
    'Cancelación del viaje': 'Reembolso de reservas no recuperables por una causa cubierta.',
    'Robo, pérdida o daños del equipaje': 'Tus cosas, si la maleta se pierde, te la roban o llega dañada.',
    'Retraso del equipaje (más de 12 h)': 'Compras básicas mientras llega tu maleta.',
    'Retraso del vuelo (más de 6 h)': 'Un importe fijo para gastos durante la espera.',
    'Responsabilidad civil privada': 'Si sin querer causas daños a otra persona.',
    'Accidentes (fallecimiento o invalidez)': 'Indemnización por invalidez permanente o fallecimiento.',
  };
  const col = (p) => `${p.recommended ? 'is-recommended ' : ''}plan-${esc(p.id)}`;
  $('#coverage-table').innerHTML = `
    <thead><tr><th scope="col">Cobertura</th>${plans.map((p) => `<th scope="col" class="${col(p)}">${esc(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${names
      .map((n) => `<tr><th scope="row">${esc(n)}<small>${esc(plain[n] ?? '')}${n === 'Cancelación del viaje' ? ' <a href="/condiciones#cancelacion">Ver las 10 causas y cuándo empieza a cubrir</a>' : ''}</small></th>${plans
        .map((p) => {
          const c = p.coverages.find((x) => x.coverage === n);
          if (!c) return `<td class="${col(p)} is-missing">No incluido</td>`;
          // En gastos médicos la franquicia se ve en los tres planes, también cuando no hay.
          const ded = c.deductible !== 'Sin franquicia' ? `Franquicia ${esc(c.deductible)}` : n.startsWith('Gastos médicos') ? 'Sin franquicia' : '';
          return `<td class="${col(p)}">${esc(c.limit)}${ded ? `<br><small>${ded}</small>` : ''}</td>`;
        })
        .join('')}</tr>`)
      .join('')}
    </tbody>`;
  // Requisitos para contratar, separados de las coberturas y de las exclusiones.
  const reqs = $('#coverage-reqs');
  if (reqs) {
    const ages = plans.map((p) => p.max_age);
    const limits = product.limits ?? {};
    reqs.innerHTML = `<h3>Para contratar</h3><ul>
      <li>Edad máxima: ${ages[0]} años en ${esc(plans[0].name)} y ${Math.max(...ages)} en ${plans.slice(1).map((p) => esc(p.name)).join(' y ')}.</li>
      <li>Vivir en España y que el viaje empiece en España.</li>
      <li>Viajes de hasta ${limits.max_trip_days ?? 90} días y hasta ${limits.max_travelers ?? 6} viajeros por póliza.</li></ul>`;
  }
  $('#exclusions-list').innerHTML = product.main_exclusions.filter((e) => !/empiezan fuera de España/.test(e)).map((e) => `<li>${esc(e)}</li>`).join('');
  initPlanSwitch(plans);
}

// En el móvil la tabla enseña un plan cada vez; empieza por el recomendado.
function initPlanSwitch(plans) {
  const sw = $('#plan-switch');
  if (!sw) return;
  const show = (id) => {
    $$('button', sw).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.showPlan === id)));
    plans.forEach((p) => $$(`#coverage-table .plan-${p.id}`).forEach((cell) => cell.classList.toggle('is-off', p.id !== id)));
  };
  sw.innerHTML = plans.map((p) => `<button type="button" data-show-plan="${esc(p.id)}" aria-pressed="false">${esc(p.name)}</button>`).join('');
  // Al cambiar de plan, la fila que se estaba mirando se queda en el mismo sitio de la pantalla.
  // Algunos navegadores y agentes desplazan la página hasta la posición original del selector fijo
  // justo antes del toque; por eso volvemos a la última posición estable (de hace más de 250 ms).
  const positions = [];
  addEventListener('scroll', () => {
    positions.push([performance.now(), scrollY]);
    while (positions.length > 40) positions.shift();
  }, { passive: true });
  const stableY = () => {
    const now = performance.now();
    for (let i = positions.length - 1; i >= 0; i--) if (now - positions[i][0] > 250) return positions[i][1];
    return scrollY;
  };
  const jumpTo = (y) => window.scrollTo({ top: y, behavior: 'instant' });
  $$('button', sw).forEach((b) => b.addEventListener('click', () => {
    const y = stableY();
    if (Math.abs(scrollY - y) > 120) jumpTo(y);
    const edge = sw.getBoundingClientRect().bottom;
    const row = $$('#coverage-table tbody tr').find((tr) => tr.getBoundingClientRect().bottom > edge);
    const before = row?.getBoundingClientRect().top;
    show(b.dataset.showPlan);
    if (row) jumpTo(scrollY + row.getBoundingClientRect().top - before);
  }));
  sw.hidden = false;
  show((plans.find((p) => p.recommended) ?? plans[0]).id);
}

// Precio de ejemplo en la portada: viene del motor de tarifa, nunca escrito a mano.
async function renderExamplePrice() {
  const box = $('#example-price');
  if (!box) return;
  try {
    const res = await fetch('/api/example-price');
    if (!res.ok) return;
    const { trip, plans } = await res.json();
    const length = trip.days === 7 ? 'Una semana' : `${trip.days} días`;
    box.innerHTML = `
      <span class="notch l" aria-hidden="true"></span><span class="notch r" aria-hidden="true"></span>
      <div class="stub-head">
        <p class="stub-title" id="example-title">Precios de ejemplo por plan</p>
        <p class="stub-trip">${length} en ${esc(trip.destination)}, una persona de ${trip.travelers[0].age} años</p>
      </div>
      <ul class="stub-plans">${plans
        .map((p) => `<li class="${p.recommended ? 'is-recommended' : ''}"><span>Plan ${esc(p.name)}</span><strong>${eur(p.total_eur)}</strong></li>`)
        .join('')}</ul>
      <p class="stub-note">Precios finales con impuestos. Cotiza tu viaje para ver cuánto cuesta asegurarlo.</p>`;
    box.hidden = false;
    box.closest('.ticket')?.classList.add('has-stub');
  } catch {
    /* sin precio de ejemplo la portada funciona igual */
  }
}

// El botón flotante se esconde mientras el cotizador está a la vista (sería un botón repetido).
// Acción principal siempre a mano: en escritorio, en la cabecera fija; en móvil, una barra inferior
// que aparece solo cuando el cotizador (o la cotización en curso) queda fuera de pantalla.
// Si ya hay una cotización, la acción es «Retomar mi cotización» y lleva al paso pendiente.
const hasOpenQuote = () => Boolean(store.state.order && store.state.order.status !== 'paid');
function updateMainCta() {
  const resume = hasOpenQuote();
  $$('[data-main-cta]').forEach((el) => {
    el.textContent = resume ? 'Retomar mi cotización' : 'Cotizar mi viaje';
    el.setAttribute('href', resume ? '#compra' : '#cotizar');
  });
  document.body.classList.toggle('has-quote', resume);
}
function initFloatCta() {
  // La cabecera fija se coloca justo debajo de la banda de demo.
  const band = $('.demo-band');
  const setBand = () => document.documentElement.style.setProperty('--band-h', `${band?.offsetHeight ?? 0}px`);
  setBand();
  addEventListener('resize', setBand);
  if (!('IntersectionObserver' in window)) return;
  const seen = new Map();
  const sync = () => {
    const target = hasOpenQuote() ? '#compra' : '#quote-form';
    document.body.classList.toggle('quote-visible', Boolean(seen.get(target)));
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(`#${e.target.id}`, e.isIntersecting);
    sync();
  }, { threshold: 0.05 });
  ['#quote-form', '#compra'].forEach((s) => $(s) && io.observe($(s)));
  store.subscribe((state, reason) => {
    if (reason === 'activity') return;
    updateMainCta();
    sync();
  });
  updateMainCta();
}

// Los botones de acción principal llevan al cotizador (cursor en el destino) o, si hay una cotización, al paso pendiente.
function initQuoteLinks() {
  $$('[data-focus-quote]').forEach((a) =>
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      $('#site-nav')?.classList.remove('is-open');
      if (hasOpenQuote()) {
        viewStep = null;
        render(store.state, 'nav');
        $('#compra').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      $('#cotizar').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#q-destination').focus({ preventScroll: true });
    })
  );
}

// Buscador de destino con sugerencias: países, ciudades e islas habituales y regiones.
// Funciona por la última parte escrita, así que también sirve para varios destinos separados por comas.
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const POPULAR = ['Japón', 'Italia', 'Estados Unidos', 'Francia', 'Tailandia', 'Nueva York', 'Europa'];
// Destinos frecuentes desde España: a igual coincidencia, salen primero.
const FREQUENT = new Set(['Japón', 'Italia', 'Estados Unidos', 'Francia', 'Reino Unido', 'Portugal', 'Alemania', 'Grecia', 'Tailandia', 'México', 'Marruecos', 'Argentina', 'Nueva York', 'Londres', 'París', 'Roma', 'Tokio', 'Lisboa', 'Cancún', 'Europa']);
async function loadDestinations() {
  let items = [];
  try {
    const res = await fetch('/api/destinations');
    const { destinations, places = [] } = await res.json();
    items = [
      ...destinations.map((d) => ({ name: d.name, hint: '' })),
      ...places.map((p) => ({ name: p.name, hint: p.kind === 'region' ? 'Región' : p.country })),
    ].map((i) => ({ ...i, key: fold(i.name), words: fold(i.name).split(/[\s-]+/) }));
  } catch {
    return; /* el campo funciona igual sin sugerencias */
  }
  const input = $('#q-destination');
  const list = $('#dest-options');
  let shown = [];
  let active = -1;
  const parts = () => input.value.split(',');
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const paint = () => {
    list.innerHTML = shown
      .map((i, n) => `<li role="option" id="dest-opt-${n}" aria-selected="${n === active}" data-n="${n}"><span>${esc(i.name)}</span>${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</li>`)
      .join('');
    if (active >= 0) input.setAttribute('aria-activedescendant', `dest-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const open = () => {
    const segs = parts();
    const q = fold(segs[segs.length - 1]);
    const taken = new Set(segs.slice(0, -1).map(fold));
    if (!q) shown = POPULAR.map((n) => items.find((i) => i.name === n)).filter(Boolean).filter((i) => !taken.has(i.key));
    else {
      shown = items
        .filter((i) => !taken.has(i.key))
        .map((i) => ({ i, score: i.key.startsWith(q) ? 0 : i.words.some((w) => w.startsWith(q)) ? 1 : q.length >= 3 && i.key.includes(q) ? 2 : 9 }))
        .filter((x) => x.score < 9)
        .sort((a, b) => a.score - b.score || FREQUENT.has(b.i.name) - FREQUENT.has(a.i.name) || a.i.name.localeCompare(b.i.name, 'es'))
        .slice(0, 7)
        .map((x) => x.i);
      if (shown.length === 1 && shown[0].key === q) shown = [];
    }
    active = -1;
    if (!shown.length) return close();
    paint();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const choose = (n) => {
    const segs = parts();
    segs[segs.length - 1] = (segs.length > 1 ? ' ' : '') + shown[n].name;
    input.value = segs.join(',');
    close();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  input.addEventListener('input', open);
  input.addEventListener('focus', open);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (ev) => {
    if (list.hidden) {
      if (ev.key === 'ArrowDown') open();
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      paint();
    } else if (ev.key === 'Enter' && active >= 0) {
      ev.preventDefault();
      choose(active);
    } else if (ev.key === 'Escape') {
      close();
    }
  });
  list.addEventListener('mousedown', (ev) => ev.preventDefault());
  list.addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-n]');
    if (li) choose(Number(li.dataset.n));
  });
}

// Volver desde el email de «Enviarme la cotización» (/retomar/ID).
async function resumeFromEmail(id) {
  history.replaceState(null, '', '/');
  try {
    const data = await api.resumeQuote(id);
    if (data.resumed === 'already_paid' && data.order.policy) {
      location.replace(`/poliza/${data.order.policy.policy_number}`);
      return;
    }
    store.apply(data, 'restore', { by: 'web' });
    fillQuoteForm(data.order);
    const note = $('#resume-note');
    const o = data.order;
    const planName = o.plan ? data.plans.find((p) => p.plan === o.plan)?.name : null;
    const now = o.plan ? eur(o.total_eur) : null;
    note.textContent = [
      `Has vuelto a tu cotización${planName ? ` con el plan ${planName} elegido` : ''}.`,
      data.resumed === 'repriced'
        ? data.price_changed
          ? `El precio ha cambiado desde que la guardaste: antes ${eur(data.previous_total_eur)}, ahora ${now}. Revísalo antes de seguir.`
          : 'Como habían pasado más de 2 horas, hemos comprobado el precio con la tarifa de hoy: no ha cambiado.'
        : 'Sigue donde la dejaste, con el mismo precio.',
    ].join(' ');
    note.dataset.for = o.quote_id;
    note.hidden = false;
    requestAnimationFrame(() => $('#compra').scrollIntoView({ block: 'start' }));
  } catch (err) {
    const prefill = err instanceof ApiFailure ? err.body.error?.details?.prefill : null;
    if (prefill) {
      const form = $('#quote-form');
      form.destination.value = prefill.destinations.join(', ');
      $('#ages-list').innerHTML = '';
      prefill.ages.forEach((a) => $('#ages-list').append(ageChip(a)));
    }
    showError(err);
  }
}

function initSaveQuote() {
  const form = $('#save-quote');
  if (!form) return;
  const fields = $('.save-fields', form);
  const done = $('.save-done', form);
  const err = $('.form-error', form);
  const showFields = () => {
    done.hidden = true;
    fields.hidden = false;
    form.email.focus();
    form.email.select();
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.hidden = true;
    done.hidden = true;
    const order = store.state.order;
    if (!order) return;
    await busy($('button', form), async () => {
      try {
        const data = await api.saveQuote(order.quote_id, { email: form.email.value, source: saveSource });
        saveSource = 'formulario';
        const link = data.resume_url || `${location.origin}/retomar/${order.quote_id}`;
        const msg =
          data.email.status === 'sent'
            ? `Listo: te lo hemos enviado a ${data.email.to}. Puedes cerrar la página; el enlace del email te trae de vuelta aquí.`
            : data.email.status === 'simulated'
              ? `Envío simulado a ${data.email.to} (el servidor no tiene email configurado).`
              : 'No hemos podido enviar el email. Copia el enlace para no perder tu cotización.';
        done.innerHTML = `<span class="save-msg">${esc(msg)}</span>
          <span class="save-actions">
            <button type="button" class="link-button" data-copy-link>Copiar enlace para retomar</button>
            <button type="button" class="link-button" data-change-email>Cambiar email</button>
          </span>
          <span class="save-copied" role="status" hidden>Enlace copiado.</span>`;
        $('[data-copy-link]', done).addEventListener('click', async () => {
          const ok = $('.save-copied', done);
          try {
            await navigator.clipboard.writeText(link);
            ok.textContent = 'Enlace copiado. Pégalo donde quieras para volver a esta cotización.';
          } catch {
            ok.innerHTML = `Copia este enlace: <a href="${esc(link)}">${esc(link)}</a>`;
          }
          ok.hidden = false;
        });
        $('[data-change-email]', done).addEventListener('click', showFields);
        fields.hidden = true;
        done.hidden = false;
      } catch (e) {
        err.textContent = humanError(e);
        err.hidden = false;
      }
    });
  });
}

async function restoreOrder() {
  const r = location.pathname.match(/^\/retomar\/([A-Za-z0-9-]+)$/);
  if (r) return resumeFromEmail(r[1]);
  const m = location.pathname.match(/^\/poliza\/([A-Z0-9-]+)$/i);
  try {
    if (m) {
      const data = await api.policy(m[1]);
      store.apply(data, 'restore', { by: 'web' });
      return;
    }
    // Solo se recupera una compra a medias (por si recargas la página).
    // Una compra ya pagada no vuelve a abrirse en la portada: sigue disponible en /poliza/NÚMERO.
    const id = store.savedQuoteId();
    if (id) {
      const data = await api.getQuote(id);
      if (data.order.status === 'paid') {
        store.reset();
        return;
      }
      store.apply(data, 'restore', { by: 'web' });
      fillQuoteForm(data.order);
    }
  } catch {
    store.reset();
  }
}

// Menú en el móvil
function initMenu() {
  const toggle = $('.menu-toggle');
  const nav = $('#site-nav');
  if (!toggle || !nav) return;
  const set = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) set(false);
  });
}

// Si una foto no está disponible, la sustituye un fondo de marca.
function initPhotos() {
  $$('.photo img').forEach((img) => {
    const missing = () => img.closest('.photo').classList.add('is-missing');
    img.addEventListener('error', missing);
    if (img.complete && img.naturalWidth === 0) missing();
  });
}

async function main() {
  store.subscribe(render);
  initQuoteForm();
  initTravelersForm();
  initPayForm();
  initHumanDialog();
  // Desde el pie de otras páginas: /#pedir-llamada abre directamente «Pedir que me llamen».
  if (location.hash === '#pedir-llamada') {
    history.replaceState(null, '', '/');
    $('[data-open-human]')?.click();
  }
  initMenu();
  initPhotos();
  initQuoteLinks();
  initSaveQuote();
  initFloatCta();
  renderExamplePrice();
  $$('.route button').forEach((b) =>
    b.addEventListener('click', () => {
      viewStep = b.closest('li').dataset.step;
      render(store.state, 'nav');
    })
  );
  const tools = registerEscalaTools().catch((e) => {
    console.error('[Escala] Error registrando herramientas WebMCP', e);
    return { ok: false, count: 0, error: e.message };
  });
  initAgentDrawer(tools);
  try {
    product = await api.product();
    renderCoverageTable();
  } catch (e) {
    console.warn(e);
  }
  loadDestinations();
  await restoreOrder();
}

main();
