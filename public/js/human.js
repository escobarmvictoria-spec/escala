// «Quiero que me llame una persona»: formulario en un diálogo, con el contexto de la compra en curso.
import { api, store, humanError } from './core.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let dialog;
let openedFromQuote = false;

const REASON_TEXT = {
  dudas_coberturas: 'Dudas sobre coberturas o qué plan elegir',
  enfermedad_previa: 'Tengo una enfermedad previa o tratamiento',
  no_asegurable: 'Mi caso no encaja (destino o duración)',
  siniestro: 'Tengo un problema durante el viaje',
  otro: 'Otro motivo',
};

// Qué contexto se adjunta: la cotización en curso o, si el cotizador la rechazó, el viaje que intentó cotizar.
function contextNow() {
  const attempt = store.state.attempt;
  if (attempt) return { kind: 'intento', trip_attempt: attempt };
  const order = store.state.order;
  if (order?.quote_id && order.status !== 'paid') return { kind: 'cotizacion', quote_id: order.quote_id };
  return null;
}

function applyReason(form) {
  const reason = form.reason.value;
  const travel = reason === 'siniestro';
  $('#cb-reason-text', dialog).textContent = REASON_TEXT[reason] ?? REASON_TEXT.otro;
  $('#cb-assist', dialog).hidden = !travel;
  const note = $('#cb-context', dialog);
  note.hidden = travel || !note.textContent;
  $$('[data-callback-only]', form).forEach((el) => (el.hidden = travel));
  // Para preexistencias no pedimos texto libre: los detalles médicos se tratan en la llamada.
  $('#cb-summary-field', dialog).hidden = travel || reason === 'enfermedad_previa';
  if (reason === 'enfermedad_previa') form.summary.value = '';
}

function open(reason) {
  const form = $('#human-form', dialog);
  form.hidden = false;
  $('#human-done', dialog).hidden = true;
  $('.form-error', form).hidden = true;
  const holder = store.state.order?.holder;
  if (holder && !form.full_name.value) form.full_name.value = holder.full_name;
  if (holder?.phone && !form.phone.value) form.phone.value = holder.phone;
  form.reason.value = reason && REASON_TEXT[reason] ? reason : 'dudas_coberturas';
  // Con motivo conocido se muestra como texto; el selector queda a un clic («Cambiar motivo»).
  $('#cb-reason-show', dialog).hidden = !reason;
  $('#cb-reason-field', dialog).hidden = Boolean(reason);
  const ctx = contextNow();
  const note = $('#cb-context', dialog);
  note.textContent = ctx?.kind === 'cotizacion' ? 'Incluiremos tu cotización en la solicitud.' : ctx?.kind === 'intento' ? 'Incluiremos los datos del viaje que intentaste cotizar.' : '';
  note.hidden = !ctx;
  openedFromQuote = Boolean(ctx) && !$('#compra')?.hidden;
  applyReason(form);
  dialog.showModal();
  (form.full_name.value ? form.phone : form.full_name).focus();
}

const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function initHumanDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'human-dialog';
  dialog.setAttribute('aria-labelledby', 'human-title');
  dialog.innerHTML = `
    <div class="dialog-head">
      <h2 id="human-title">Te llama una persona</h2>
      <button type="button" class="drawer-close" data-close aria-label="Cerrar">×</button>
    </div>
    <form id="human-form" class="dialog-body" novalidate>
      <p class="sheet-help">Alguien del equipo te llama para ayudarte antes de contratar, de 9:00 a 21:00.</p>
      <p class="cb-reason-show" id="cb-reason-show"><span><span class="optional">Motivo:</span> <strong id="cb-reason-text"></strong></span> <button type="button" class="human-link" data-change-reason>Cambiar motivo</button></p>
      <div class="field" id="cb-reason-field"><label for="cb-reason">Para qué</label>
        <select id="cb-reason" name="reason">
          <option value="dudas_coberturas">${REASON_TEXT.dudas_coberturas}</option>
          <option value="enfermedad_previa">${REASON_TEXT.enfermedad_previa}</option>
          <option value="no_asegurable">${REASON_TEXT.no_asegurable}</option>
          <option value="siniestro">${REASON_TEXT.siniestro}</option>
          <option value="otro">${REASON_TEXT.otro}</option>
        </select></div>
      <div class="cb-assist" id="cb-assist" hidden>
        <p><strong>Consulta el teléfono de asistencia en tu póliza.</strong> Si ya estás de viaje y tienes un problema, llama a la asistencia 24 horas: te atienden a cualquier hora.</p>
        <p class="cb-phone">+34 900 000 000 <span class="optional">(ficticio en la demo)</span></p>
        <a class="human-link" href="/#asistencia" data-close>Ver asistencia durante el viaje</a>
      </div>
      <div class="field" data-callback-only><label for="cb-name">Nombre</label><input id="cb-name" name="full_name" autocomplete="name" required></div>
      <div class="field" data-callback-only><label for="cb-phone">Teléfono</label><input id="cb-phone" name="phone" type="tel" autocomplete="tel" placeholder="600 123 456" required></div>
      <div class="field" data-callback-only><label for="cb-time">Cuándo te viene bien <span class="optional">(opcional)</span></label>
        <select id="cb-time" name="preferred_time"><option value="sin_preferencia">Sin preferencia</option><option value="cuanto_antes">Cuanto antes</option><option value="manana_manana">Mañana por la mañana</option><option value="manana_tarde">Mañana por la tarde</option></select></div>
      <div class="field" id="cb-summary-field"><label for="cb-summary">Cuéntanos algo más <span class="optional">(opcional)</span></label><textarea id="cb-summary" name="summary" rows="2"></textarea></div>
      <p class="cb-context" id="cb-context" hidden></p>
      <label class="check" data-callback-only><input type="checkbox" name="user_agreed"> Acepto que Escala me llame para este tema</label>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions" data-callback-only><button class="btn-primary" type="submit">Pedir que me llamen</button><p class="optional cb-demo">Solicitud de prueba. No recibirás una llamada real.</p></div>
    </form>
    <div id="human-done" class="dialog-body" hidden aria-live="polite"></div>`;
  document.body.append(dialog);

  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog || ev.target.closest('[data-close]')) dialog.close();
    if (ev.target.closest('[data-change-reason]')) {
      $('#cb-reason-show', dialog).hidden = true;
      $('#cb-reason-field', dialog).hidden = false;
      $('#cb-reason', dialog).focus();
    }
    if (ev.target.closest('[data-back-to-quote]')) {
      dialog.close();
      $('#compra')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('[data-open-human]');
    if (!trigger) return;
    ev.preventDefault();
    open(trigger.dataset.openHuman || null);
  });
  $('#cb-reason', dialog).addEventListener('change', () => applyReason($('#human-form', dialog)));

  const form = $('#human-form', dialog);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = $('.form-error', form);
    err.hidden = true;
    if (!form.user_agreed.checked) {
      err.textContent = 'Marca que aceptas que te llamemos.';
      err.hidden = false;
      return;
    }
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const { callback: cb } = await api.callback({
        full_name: form.full_name.value.trim(),
        phone: form.phone.value.trim(),
        preferred_time: form.preferred_time.value,
        reason: form.reason.value,
        summary: form.summary.value.trim() || undefined,
        user_agreed: true,
        ...(contextNow()?.kind === 'cotizacion' ? { quote_id: contextNow().quote_id } : {}),
        ...(contextNow()?.kind === 'intento' ? { trip_attempt: contextNow().trip_attempt } : {}),
        email: store.state.order?.holder?.email,
      });
      form.hidden = true;
      const done = $('#human-done', dialog);
      done.hidden = false;
      done.innerHTML = `
        <p class="human-ok">Solicitud de prueba registrada</p>
        <p>Número de solicitud: <strong>${esc(cb.ticket)}</strong>. En un caso real, te llamaríamos ${esc(cb.when)} al ${esc(cb.phone)}.</p>
        ${cb.context_kind === 'cotizacion' ? '<p>Hemos incluido tu cotización en la solicitud.</p>' : cb.context_kind === 'intento' ? '<p>Hemos incluido los datos del viaje que intentaste cotizar.</p>' : ''}
        <div class="actions">${openedFromQuote ? '<button class="btn-primary" type="button" data-back-to-quote>Volver a mi cotización</button>' : ''}<button class="btn-secondary" type="button" data-close>Cerrar</button></div>`;
      $('[data-back-to-quote], [data-close]', done).focus();
    } catch (e) {
      err.textContent = humanError(e);
      err.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
