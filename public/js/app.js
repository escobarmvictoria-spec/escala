// Interfaz de Escala: cotizador, compra y póliza. Pinta el mismo estado que modifican las herramientas WebMCP.
import { api, store, eur, fmtDate, ApiFailure } from './core.js';
import { registerEscalaTools } from './webmcp.js';
import { initAgentDrawer } from './agent.js';
import { initHumanDialog } from './human.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STEPS = ['plan', 'viajeros', 'revision', 'pago', 'poliza'];
const COVERAGE_ORDER = ['Gastos médicos en el extranjero', 'Repatriación o traslado sanitario', 'Cancelación del viaje', 'Robo, pérdida o daños del equipaje', 'Retraso del equipaje (más de 12 h)', 'Retraso del vuelo (más de 6 h)', 'Responsabilidad civil privada', 'Accidentes (fallecimiento o invalidez)'];
const STEP_OF = { quoted: 'plan', plan_selected: 'viajeros', travelers_set: 'revision', reviewed: 'revision', terms_accepted: 'pago', paid: 'poliza' };
let viewStep = null; // paso al que vuelve la persona al pulsar en la ruta
let product = null;
let lastRenderedStep = null;
let loadingSummary = false;

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
  box.textContent = [e.message, e.how_to_fix].filter(Boolean).join(' ');
  if (['age_not_insurable', 'destination_excluded', 'trip_too_long', 'residence_not_supported'].includes(e.code)) {
    box.append(' ');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'human-link';
    b.dataset.openHuman = 'no_asegurable';
    b.textContent = 'Pide que te llame una persona';
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
  form.destination.value = order.trip.destinations.map((d) => d.name).join(', ');
  form.start_date.value = order.trip.start_date;
  form.end_date.value = order.trip.end_date;
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
      try {
        const data = await api.quote({
          destinations: form.destination.value.split(',').map((s) => s.trim()).filter(Boolean),
          start_date: form.start_date.value,
          end_date: form.end_date.value,
          travelers: ages.map((a) => ({ age: Number(a) })),
        });
        viewStep = null;
        store.apply(data, 'quote', { by: 'web' });
        $('#compra').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (err) {
        showError(form, err);
      }
    });
  });
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
    <strong>${esc(t.destinations.map((d) => d.name).join(', '))}</strong>
    <span>${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}</span>
    <span>${t.days} días</span>
    <span>${n} ${n === 1 ? 'viajero' : 'viajeros'}</span>
    <span>${esc(t.zone_name)}</span>
    ${order.status === 'paid' ? '' : '<button class="btn-quiet edit" type="button" data-edit-trip>Cambiar el viaje</button>'}`;
  $('[data-edit-trip]')?.addEventListener('click', () => {
    fillQuoteForm(order);
    $('#cotizar').scrollIntoView({ behavior: 'smooth' });
    $('#q-destination').focus({ preventScroll: true });
  });
}

function renderPlans(order) {
  const coverages = store.state.coverages;
  const grid = $('#plans-grid');
  grid.innerHTML = '';
  if (!$('#plans-help')) {
    const help = document.createElement('p');
    help.id = 'plans-help';
    help.className = 'plans-help';
    help.innerHTML = '¿No sabes cuál elegir o tienes una enfermedad previa? <button type="button" class="human-link" data-open-human="dudas_coberturas">Te llama una persona</button>';
    grid.after(help);
  }
  for (const id of ['esencial', 'completo', 'total']) {
    const p = order.quote.plans[id];
    const meta = product?.plans.find((x) => x.id === id);
    const covs = coverages?.[id] ?? meta?.coverages ?? [];
    const missing = meta?.not_included ?? [];
    const perPerson = p.per_traveler.length > 1 ? `${eur(p.total_eur / p.per_traveler.length)} por persona de media` : `${eur(p.total_eur / order.trip.days)} al día`;
    const el = document.createElement('article');
    el.className = `plan${meta?.recommended ? ' is-recommended' : ''}${order.plan === id ? ' is-selected' : ''}`;
    el.innerHTML = `
      <span class="plan-flag${meta?.recommended ? '' : ' is-empty'}">Recomendado</span>
      <h3>${esc(p.name)}</h3>
      <p class="plan-tagline">${esc(meta?.description ?? '')}</p>
      <p class="plan-price">${eur(p.total_eur)}</p>
      <p class="plan-price-note">Total para ${p.per_traveler.length === 1 ? '1 viajero' : `${p.per_traveler.length} viajeros`}, impuestos incluidos. ${perPerson}.${p.group_discount_pct ? ` Incluye ${p.group_discount_pct} % de descuento de grupo.` : ''}</p>
      <ul class="plan-list">
        ${COVERAGE_ORDER.map((name) => {
          const c = covs.find((x) => x.coverage === name || (name.startsWith('Gastos médicos') && x.coverage.startsWith('Gastos médicos')));
          if (!c) return missing.includes(name) ? `<li class="is-missing"><span>${esc(shortName(name))}</span><span>No incluido</span></li>` : '';
          return `<li><span>${esc(shortName(c.coverage))}</span><span>${esc(c.limit)}${c.deductible !== 'Sin franquicia' ? ` <small>(franquicia ${esc(c.deductible)})</small>` : ''}</span></li>`;
        }).join('')}
      </ul>
      ${p.available ? '' : `<p class="plan-unavailable">${esc(p.unavailable_reason)}</p>`}
      <button class="${order.plan === id ? 'btn-primary' : 'btn-secondary'}" type="button" data-plan="${id}" ${p.available ? '' : 'disabled'}>${order.plan === id ? `${esc(p.name)} elegido` : `Elegir ${esc(p.name)}`}</button>`;
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
  const msg = err instanceof ApiFailure ? [err.body.error.message, err.body.error.how_to_fix].filter(Boolean).join(' ') : err.message;
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
      return `<div class="traveler-row">
        <div class="field"><label for="t-name-${i}">Viajero ${i + 1}: nombre y apellidos</label><input id="t-name-${i}" data-t-name autocomplete="${i === 0 ? 'name' : 'off'}" value="${esc(t?.full_name ?? '')}" required></div>
        <div class="field"><label for="t-age-${i}">Edad</label><input id="t-age-${i}" data-t-age type="number" min="0" max="84" value="${esc(age)}" required></div>
        <div class="field"><label for="t-doc-${i}">DNI, NIE o pasaporte <span class="optional">(opcional)</span></label><input id="t-doc-${i}" data-t-doc value="${esc(t?.document_id ?? '')}"></div>
      </div>`;
    })
    .join('');
  const firstName = $('[data-t-name]', list);
  const syncHolder = () => {
    if ($('#holder-travels').checked && firstName && (!firstName.value || firstName.dataset.mirrored === '1')) {
      firstName.value = form.holder_name.value;
      firstName.dataset.mirrored = '1';
    }
  };
  form.holder_name.oninput = syncHolder;
  firstName.oninput = () => (firstName.dataset.mirrored = '0');
}

function initTravelersForm() {
  const form = $('#travelers-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    showError(form, null);
    const order = store.state.order;
    const rows = $$('.traveler-row', form);
    const payload = {
      holder: { full_name: form.holder_name.value.trim(), email: form.holder_email.value.trim(), phone: form.holder_phone.value.trim() || undefined },
      travelers: rows.map((r) => ({
        full_name: $('[data-t-name]', r).value.trim(),
        age: Number($('[data-t-age]', r).value),
        document_id: $('[data-t-doc]', r).value.trim() || undefined,
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
    <dl class="summary-grid">
      <div><dt>Plan</dt><dd>${esc(s.plan.name)}</dd></div>
      <div><dt>Destino</dt><dd>${esc(s.trip.destinations)}</dd></div>
      <div><dt>Fechas</dt><dd>${fmtDate(s.trip.start_date)} – ${fmtDate(s.trip.end_date)} (${s.trip.days} días)</dd></div>
      <div><dt>Póliza a nombre de</dt><dd>${esc(s.holder.full_name)}<br><span class="optional">${esc(s.holder.email)}</span></dd></div>
    </dl>
    <table class="mini-table"><thead><tr><th>Asegurado</th><th>Edad</th><th class="num">Precio</th></tr></thead><tbody>
      ${s.insured.map((t) => `<tr><td>${esc(t.full_name)}</td><td>${t.age}</td><td class="num">${eur(t.price_eur)}</td></tr>`).join('')}
    </tbody></table>
    <table class="mini-table"><thead><tr><th>Cobertura</th><th class="num">Límite por persona</th><th class="num">Franquicia</th></tr></thead><tbody>
      ${s.coverages.map((c) => `<tr><td>${esc(c.coverage)}</td><td class="num">${esc(c.limit)}</td><td class="num">${esc(c.deductible)}</td></tr>`).join('')}
    </tbody></table>
    <div class="terms-box">
      <strong>Condiciones (versión ${esc(s.terms.version)})</strong>
      <ul>${s.terms.key_points.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
      <p style="margin-top:8px"><a href="/condiciones" target="_blank" rel="noopener">Leer las condiciones completas</a></p>
    </div>
    <div class="summary-total"><span>Total, impuestos incluidos</span><span>${esc(s.total_text)}</span></div>
    <form id="terms-form" class="actions" novalidate>
      <label class="check"><input type="checkbox" name="accept" ${accepted ? 'checked disabled' : ''}> He leído y acepto las condiciones</label>
      <button class="btn-primary" type="submit">${accepted ? 'Ir al pago' : 'Aceptar y pagar'}</button>
      <p class="form-error" role="alert" hidden></p>
    </form>`;
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

function renderPay(order) {
  $('#pay-button').textContent = `Pagar ${eur(order.total_eur)}`;
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
        const data = await api.pay(order.quote_id, { amount_eur: order.total_eur, card_number: form.card_number.value, user_confirmation: `Pulsó el botón Pagar (${eur(order.total_eur)}) en la web` });
        viewStep = null;
        form.reset();
        store.apply(data, 'paid', { by: 'web' });
        $('#compra').scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        showError(form, err);
      }
    });
  });
}

function emailPill(email) {
  if (email.status === 'sent') return `<span class="status-pill ok">Enviada a ${esc(email.to)}</span>`;
  if (email.status === 'simulated') return `<span class="status-pill warn">Envío simulado a ${esc(email.to)} (servidor sin email configurado)</span>`;
  if (email.status === 'pending') return `<span class="status-pill warn">Enviando a ${esc(email.to)}…</span>`;
  return `<span class="status-pill bad">No se ha podido enviar a ${esc(email.to)}</span>`;
}

function renderPolicy(order) {
  const sheet = $('#policy-sheet');
  const p = order.policy;
  const plan = order.quote.plans[order.plan];
  sheet.innerHTML = `
    <div class="policy-hero">
      <p>Póliza emitida${order.channel === 'agente_ia' ? ' por tu asistente de IA' : ''}</p>
      <p class="policy-number">${esc(p.policy_number)}</p>
      ${emailPill(p.email)}
    </div>
    <dl class="summary-grid">
      <div><dt>Plan</dt><dd>${esc(plan.name)}</dd></div>
      <div><dt>Destino</dt><dd>${esc(order.trip.destinations.map((d) => d.name).join(', '))}</dd></div>
      <div><dt>Fechas</dt><dd>${fmtDate(order.trip.start_date)} – ${fmtDate(order.trip.end_date)}</dd></div>
      <div><dt>Asegurados</dt><dd>${order.travelers.map((t) => esc(t.full_name)).join('<br>')}</dd></div>
      <div><dt>Pagado</dt><dd>${eur(plan.total_eur)} <span class="optional">(prueba)</span></dd></div>
    </dl>
    <div class="actions">
      <a class="btn-primary" href="${esc(p.pdf_url)}" target="_blank" rel="noopener">Descargar la póliza (PDF)</a>
      <button class="btn-secondary" type="button" data-new-quote>Cotizar otro viaje</button>
      <button class="human-link" type="button" data-open-human="siniestro">¿Problemas en el viaje? Te llama una persona</button>
    </div>
    <form class="resend" id="resend-form" novalidate>
      <div class="field"><label for="r-email">¿No te ha llegado? Reenvíala</label><input id="r-email" type="email" value="${esc(order.holder.email)}"></div>
      <button class="btn-secondary" type="submit">Reenviar</button>
      <p class="form-error" role="alert" hidden></p>
    </form>`;
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
    return;
  }
  if (reason === 'activity') return;
  section.hidden = false;
  if (extra.by === 'agent') viewStep = null;
  const step = currentStep(order);
  renderRoute(order, step);
  renderTripLine(order);
  $('.agent-notice').hidden = !(state.agentDriving && order.status !== 'paid');
  for (const s of STEPS) $(`#step-${s}`).hidden = s !== step;
  if (step === 'plan') renderPlans(order);
  if (step === 'viajeros') renderTravelers(order);
  if (step === 'revision') renderReview(order);
  if (step === 'pago') renderPay(order);
  if (step === 'poliza') renderPolicy(order);
  if (extra.by === 'agent' && step !== lastRenderedStep) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    'Cancelación del viaje': 'Lo que no recuperes si cancelas por una causa justificada.',
    'Robo, pérdida o daños del equipaje': 'Tus cosas, si se pierde o roban la maleta.',
    'Retraso del equipaje (más de 12 h)': 'Compras básicas mientras llega tu maleta.',
    'Retraso del vuelo (más de 6 h)': 'Un importe fijo para gastos durante la espera.',
    'Responsabilidad civil privada': 'Si sin querer causas daños a otra persona.',
    'Accidentes (fallecimiento o invalidez)': 'Indemnización por invalidez permanente o fallecimiento.',
  };
  $('#coverage-table').innerHTML = `
    <thead><tr><th scope="col">Cobertura</th>${plans.map((p) => `<th scope="col" class="${p.recommended ? 'is-recommended' : ''}">${esc(p.name)}</th>`).join('')}</tr></thead>
    <tbody>${names
      .map((n) => `<tr><th scope="row">${esc(n)}<small>${esc(plain[n] ?? '')}</small></th>${plans
        .map((p) => {
          const c = p.coverages.find((x) => x.coverage === n);
          const cls = p.recommended ? 'is-recommended' : '';
          if (!c) return `<td class="${cls} is-missing">No incluido</td>`;
          return `<td class="${cls}">${esc(c.limit)}${c.deductible !== 'Sin franquicia' ? `<br><small>Franquicia ${esc(c.deductible)}</small>` : ''}</td>`;
        })
        .join('')}</tr>`)
      .join('')}
      <tr><th scope="row">Edad máxima</th>${plans.map((p) => `<td class="${p.recommended ? 'is-recommended' : ''}">${p.max_age} años</td>`).join('')}</tr>
    </tbody>`;
  $('#exclusions-list').innerHTML = product.main_exclusions.map((e) => `<li>${esc(e)}</li>`).join('');
}

async function loadDestinations() {
  try {
    const res = await fetch('/api/destinations');
    const { destinations } = await res.json();
    $('#destinations').innerHTML = destinations.map((d) => `<option value="${esc(d.name)}"></option>`).join('');
  } catch {
    /* el campo funciona igual sin sugerencias */
  }
}

async function restoreOrder() {
  const m = location.pathname.match(/^\/poliza\/([A-Z0-9-]+)$/i);
  try {
    if (m) {
      const data = await api.policy(m[1]);
      store.apply(data, 'restore', { by: 'web' });
      return;
    }
    const id = store.savedQuoteId();
    if (id) {
      const data = await api.getQuote(id);
      store.apply(data, 'restore', { by: 'web' });
      fillQuoteForm(data.order);
    }
  } catch {
    store.reset();
  }
}

async function main() {
  store.subscribe(render);
  initQuoteForm();
  initTravelersForm();
  initPayForm();
  initHumanDialog();
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
