// «Quiero que me llame una persona»: formulario en un diálogo, con el contexto de la compra en curso.
import { api, store } from './core.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let dialog;

function open(reason) {
  const form = $('#human-form', dialog);
  form.hidden = false;
  $('#human-done', dialog).hidden = true;
  $('.form-error', form).hidden = true;
  const holder = store.state.order?.holder;
  if (holder && !form.full_name.value) form.full_name.value = holder.full_name;
  if (holder?.phone && !form.phone.value) form.phone.value = holder.phone;
  if (reason) form.reason.value = reason;
  dialog.showModal();
  (form.full_name.value ? form.phone : form.full_name).focus();
}

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
      <p class="sheet-help">Alguien del equipo te llama y te ayuda con tu caso. Verá lo que ya has hecho en la web, así que no tendrás que repetirlo.</p>
      <div class="field"><label for="cb-name">Nombre</label><input id="cb-name" name="full_name" autocomplete="name" required></div>
      <div class="field-row">
        <div class="field"><label for="cb-phone">Teléfono</label><input id="cb-phone" name="phone" type="tel" autocomplete="tel" placeholder="600 123 456" required></div>
        <div class="field"><label for="cb-time">Cuándo te viene bien</label>
          <select id="cb-time" name="preferred_time"><option value="cuanto_antes">Cuanto antes</option><option value="manana_manana">Mañana por la mañana</option><option value="manana_tarde">Mañana por la tarde</option></select></div>
      </div>
      <div class="field"><label for="cb-reason">Para qué</label>
        <select id="cb-reason" name="reason">
          <option value="dudas_coberturas">Dudas sobre coberturas o qué plan elegir</option>
          <option value="enfermedad_previa">Tengo una enfermedad previa o tratamiento</option>
          <option value="no_asegurable">Mi caso no encaja (edad, destino o duración)</option>
          <option value="siniestro">Tengo un problema durante el viaje</option>
          <option value="otro">Otro motivo</option>
        </select></div>
      <div class="field"><label for="cb-summary">Cuéntanos algo más <span class="optional">(opcional)</span></label><textarea id="cb-summary" name="summary" rows="2"></textarea></div>
      <label class="check"><input type="checkbox" name="user_agreed"> Acepto que Escala me llame para este tema</label>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions"><button class="btn-primary" type="submit">Pedir que me llamen</button></div>
    </form>
    <div id="human-done" class="dialog-body" hidden aria-live="polite"></div>`;
  document.body.append(dialog);

  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog || ev.target.closest('[data-close]')) dialog.close();
  });
  document.addEventListener('click', (ev) => {
    const trigger = ev.target.closest('[data-open-human]');
    if (!trigger) return;
    ev.preventDefault();
    open(trigger.dataset.openHuman || null);
  });

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
        quote_id: store.state.order?.quote_id,
        email: store.state.order?.holder?.email,
      });
      form.hidden = true;
      const done = $('#human-done', dialog);
      done.hidden = false;
      done.innerHTML = `
        <p class="human-ok">Listo, ${esc(cb.full_name.split(' ')[0])}. Te llamamos ${esc(cb.when)} al ${esc(cb.phone)}.</p>
        <p>Tu número de solicitud es <strong>${esc(cb.ticket)}</strong>.${cb.context_attached ? ' La persona que te llame verá tu cotización.' : ''}</p>
        <p class="optional">Demo: en realidad no te va a llamar nadie.</p>
        <div class="actions"><button class="btn-secondary" type="button" data-close>Cerrar</button></div>`;
      $('[data-close]', done).focus();
    } catch (e) {
      const body = e.body?.error;
      err.textContent = body ? [body.message, body.how_to_fix].filter(Boolean).join(' ') : e.message;
      err.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}
