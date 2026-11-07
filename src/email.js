// Envío de la póliza por email.
// Proveedores: Brevo (API HTTP, recomendado), SMTP (nodemailer) o "outbox" (sin claves: guarda el email en data/outbox).
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { formatEur } from './catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => iso.slice(0, 10).split('-').reverse().join('/');

export function buildPolicyEmail(order, { baseUrl }) {
  const plan = order.quote.plans[order.plan];
  const pdfUrl = `${baseUrl}/api/policies/${order.policy.number}/pdf?token=${order.policy.pdf_token}`;
  const subject = `Tu póliza de viaje Escala ${order.policy.number} (demo, no es un seguro real)`;
  const destinations = order.trip.destinations.map((d) => d.name).join(', ');
  const insured = order.travelers.map((t) => esc(t.full_name)).join(', ');
  const text = [
    'Demo — no es un seguro real.',
    '',
    `Hola, ${order.holder.full_name.split(' ')[0]}:`,
    '',
    `Ya tienes tu póliza ${order.policy.number}. Va adjunta en PDF.`,
    `Plan: ${plan.name}`,
    `Destino: ${destinations}`,
    `Fechas: del ${fmtDate(order.trip.start_date)} al ${fmtDate(order.trip.end_date)} (${order.trip.days} días)`,
    `Asegurados: ${order.travelers.map((t) => t.full_name).join(', ')}`,
    `Total: ${formatEur(plan.total_eur)} (pago de prueba, no se ha cobrado nada)`,
    '',
    `Descarga: ${pdfUrl}`,
    '',
    'Escala es una marca inventada para una prueba técnica. No es una aseguradora y la póliza no tiene validez.',
  ].join('\n');
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F6F3EC;font-family:Arial,Helvetica,sans-serif;color:#19233F">
<div style="background:#19233F;color:#F2C75B;text-align:center;font-weight:bold;padding:10px 16px;font-size:14px">Demo — no es un seguro real</div>
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="font-size:28px;font-weight:800;letter-spacing:-0.8px;font-family:Manrope,Arial,Helvetica,sans-serif">escala</div>
  <p style="margin:2px 0 0;color:#4A536B;font-size:14px">Seguro de viaje que se entiende.</p>
  <h1 style="font-size:22px;margin:24px 0 8px">Ya tienes tu póliza, ${esc(order.holder.full_name.split(' ')[0])}.</h1>
  <p style="font-size:16px;line-height:1.5;margin:0 0 20px">Va adjunta en PDF. Guárdala en el móvil: si pasa algo durante el viaje, es lo primero que te pedirán. Que disfrutes del viaje.</p>
  <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;font-size:15px" cellpadding="10">
    <tr><td style="color:#4A536B;width:40%">Póliza</td><td style="font-weight:bold">${esc(order.policy.number)}</td></tr>
    <tr><td style="color:#4A536B">Plan</td><td style="font-weight:bold">${esc(plan.name)}</td></tr>
    <tr><td style="color:#4A536B">Destino</td><td>${esc(destinations)}</td></tr>
    <tr><td style="color:#4A536B">Fechas</td><td>${fmtDate(order.trip.start_date)} – ${fmtDate(order.trip.end_date)} (${order.trip.days} días)</td></tr>
    <tr><td style="color:#4A536B">Asegurados</td><td>${insured}</td></tr>
    <tr><td style="color:#4A536B">Total</td><td style="font-weight:bold">${esc(formatEur(plan.total_eur))} <span style="font-weight:normal;color:#4A536B">(pago de prueba)</span></td></tr>
  </table>
  <p style="margin:24px 0"><a href="${esc(pdfUrl)}" style="background:#F2C75B;color:#19233F;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:6px;display:inline-block">Descargar la póliza</a></p>
  <p style="font-size:13px;color:#4A536B;line-height:1.5">Escala es una marca inventada para una prueba técnica. No es una aseguradora, no se ha cobrado dinero y esta póliza no tiene validez.</p>
</div></body></html>`;
  return { subject, text, html, pdfUrl };
}

export function createMailer(env, { outboxDir }) {
  const provider = env.BREVO_API_KEY ? 'brevo' : env.SMTP_URL ? 'smtp' : 'outbox';
  const sender = { email: env.SENDER_EMAIL || 'no-reply@escala.demo', name: env.SENDER_NAME || 'Escala (demo)' };

  async function send({ to, toName, subject, text, html, attachment }) {
    if (provider === 'brevo') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            sender,
            to: [{ email: to, name: toName }],
            subject,
            textContent: text,
            htmlContent: html,
            ...(attachment ? { attachment: [{ name: attachment.name, content: attachment.content.toString('base64') }] } : {}),
            tags: ['escala-demo'],
          }),
          signal: controller.signal,
        });
        const body = await res.text();
        if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${body.slice(0, 300)}`);
        return { provider, message_id: JSON.parse(body).messageId ?? null };
      } finally {
        clearTimeout(timer);
      }
    }
    if (provider === 'smtp') {
      const transport = nodemailer.createTransport(env.SMTP_URL);
      const info = await transport.sendMail({
        from: `"${sender.name}" <${sender.email}>`,
        to,
        subject,
        text,
        html,
        attachments: attachment ? [{ filename: attachment.name, content: attachment.content }] : [],
      });
      return { provider, message_id: info.messageId };
    }
    // outbox: sin proveedor configurado, se guarda en disco para poder comprobarlo.
    fs.mkdirSync(outboxDir, { recursive: true });
    const base = path.join(outboxDir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify({ to, subject, text }, null, 2));
    fs.writeFileSync(`${base}.html`, html);
    if (attachment) fs.writeFileSync(`${base}-${attachment.name}`, attachment.content);
    return { provider, message_id: path.basename(base), note: 'Sin proveedor de email configurado: guardado en data/outbox.' };
  }

  return { provider, sender, send, teamAddress: env.TEAM_EMAIL || env.SENDER_EMAIL || null };
}
