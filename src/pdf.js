// Genera la póliza en PDF (A4) con la identidad de Escala.
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coveragesFor, formatEur, EXCLUSIONS, TERMS_VERSION } from './catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(here, '..', 'public', 'fonts');
const C = { ink: '#15233F', signal: '#FFC629', paper: '#F5F7F4', grey: '#4A5468', line: '#D5DAD3', ok: '#1E7F4F' };

const fmtDate = (iso) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export function renderPolicyPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 16, left: 48, right: 48 }, info: { Title: `Póliza ${order.policy.number} (demo)`, Author: 'Escala (demo)' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('display', path.join(FONTS, 'overpass-latin-800-normal.woff'));
    doc.registerFont('body', path.join(FONTS, 'overpass-latin-400-normal.woff'));
    doc.registerFont('bold', path.join(FONTS, 'overpass-latin-700-normal.woff'));

    const W = doc.page.width;
    const L = 48;
    const R = W - 48;
    const plan = order.quote.plans[order.plan];

    // Marca de agua
    doc.save();
    doc.rotate(-30, { origin: [W / 2, doc.page.height / 2] });
    doc.font('display').fontSize(120).fillColor(C.ink).fillOpacity(0.05).text('DEMO', 0, doc.page.height / 2 - 70, { width: W, align: 'center' });
    doc.restore();
    doc.fillOpacity(1);

    // Banda de demo
    doc.rect(0, 0, W, 26).fill(C.ink);
    doc.font('bold').fontSize(10).fillColor(C.signal).text('Demo — no es un seguro real. Este documento no tiene validez.', L, 8, { width: R - L, align: 'center' });

    // Cabecera con logotipo (ruta con escala)
    const y0 = 50;
    doc.lineWidth(3).strokeColor(C.ink).moveTo(L, y0 + 14).lineTo(L + 44, y0 + 14).stroke();
    doc.circle(L, y0 + 14, 5).fill(C.ink);
    doc.circle(L + 44, y0 + 14, 5).fill(C.ink);
    doc.circle(L + 22, y0 + 14, 6).fillAndStroke(C.signal, C.ink);
    doc.font('display').fontSize(26).fillColor(C.ink).text('escala', L + 56, y0 - 2);
    doc.font('body').fontSize(10).fillColor(C.grey).text('Seguro de viaje claro, humano y listo para IA', L + 57, y0 + 28);

    doc.font('bold').fontSize(9).fillColor(C.grey).text('Número de póliza', 360, y0, { width: R - 360, align: 'right' });
    doc.font('display').fontSize(17).fillColor(C.ink).text(order.policy.number, 360, y0 + 12, { width: R - 360, align: 'right' });
    doc.font('body').fontSize(9).fillColor(C.grey).text(`Emitida el ${fmtDate(order.policy.issued_at)} · Canal: ${order.channel === 'agente_ia' ? 'agente de IA (WebMCP)' : 'web'}`, 300, y0 + 34, { width: R - 300, align: 'right' });

    let y = 112;
    const section = (title) => {
      y += 10;
      doc.font('display').fontSize(12).fillColor(C.ink).text(title, L, y);
      y += 18;
      doc.lineWidth(1).strokeColor(C.line).moveTo(L, y).lineTo(R, y).stroke();
      y += 8;
    };
    const row = (label, value, opts = {}) => {
      doc.font('bold').fontSize(9.5).fillColor(C.grey).text(label, L, y, { width: 150 });
      doc.font(opts.bold ? 'bold' : 'body').fontSize(10).fillColor(C.ink).text(value, L + 155, y, { width: R - L - 155 });
      y = Math.max(doc.y, y + 14) + 3;
    };

    // Plan y viaje
    doc.roundedRect(L, y, R - L, 58, 6).fill(C.paper);
    doc.font('bold').fontSize(9).fillColor(C.grey).text('Plan', L + 14, y + 10);
    doc.font('display').fontSize(20).fillColor(C.ink).text(plan.name, L + 14, y + 22);
    doc.font('bold').fontSize(9).fillColor(C.grey).text('Destino', L + 150, y + 10);
    doc.font('bold').fontSize(11).fillColor(C.ink).text(order.trip.destinations.map((d) => d.name).join(', '), L + 150, y + 24, { width: 170 });
    doc.font('body').fontSize(8.5).fillColor(C.grey).text(order.trip.zone_name, L + 150, y + 39, { width: 170 });
    doc.font('bold').fontSize(9).fillColor(C.grey).text('Fechas de cobertura', L + 335, y + 10);
    doc.font('bold').fontSize(11).fillColor(C.ink).text(`${fmtDate(order.trip.start_date)} – ${fmtDate(order.trip.end_date)}`, L + 335, y + 24);
    doc.font('body').fontSize(8.5).fillColor(C.grey).text(`${order.trip.days} días, ambos incluidos`, L + 335, y + 39);
    y += 70;

    section('Tomador');
    row('Nombre', order.holder.full_name);
    row('Email', order.holder.email);
    if (order.holder.phone) row('Teléfono', order.holder.phone);

    section('Asegurados');
    doc.font('bold').fontSize(9).fillColor(C.grey);
    doc.text('Nombre', L, y).text('Edad', L + 240, y).text('Documento', L + 300, y).text('Prima', R - 80, y, { width: 80, align: 'right' });
    y += 15;
    order.travelers.forEach((t, i) => {
      doc.font('body').fontSize(10).fillColor(C.ink);
      doc.text(t.full_name, L, y, { width: 230 }).text(String(t.age), L + 240, y).text(t.document_id || '—', L + 300, y);
      doc.text(formatEur(plan.per_traveler[i]?.price_eur ?? 0), R - 80, y, { width: 80, align: 'right' });
      y += 16;
    });

    section('Coberturas, límites y franquicias');
    doc.font('bold').fontSize(9).fillColor(C.grey);
    doc.text('Cobertura', L, y).text('Límite por asegurado', L + 290, y).text('Franquicia', R - 90, y, { width: 90, align: 'right' });
    y += 15;
    coveragesFor(order.plan, order.trip.zone).forEach((c, i) => {
      if (i % 2 === 0) doc.rect(L - 4, y - 3, R - L + 8, 17).fill(C.paper);
      doc.font('body').fontSize(10).fillColor(C.ink).text(c.name, L, y, { width: 280 });
      doc.font('bold').text(c.limit_text, L + 290, y);
      doc.font('body').text(c.deductible_eur ? formatEur(c.deductible_eur, 0) : 'Sin franquicia', R - 90, y, { width: 90, align: 'right' });
      y += 17;
    });

    section('Prima y pago');
    row('Prima neta', formatEur(plan.net_premium_eur));
    row('Impuestos (IPS 8 %)', formatEur(plan.taxes_eur));
    if (plan.group_discount_pct) row('Descuento de grupo', `${plan.group_discount_pct} % aplicado`);
    row('Total pagado', formatEur(plan.total_eur), { bold: true });
    row('Medio de pago', `Tarjeta de prueba terminada en ${order.payment.card_last4} (sin cobro real)`);

    section('Qué no cubre (principales exclusiones)');
    doc.font('body').fontSize(9).fillColor(C.ink);
    EXCLUSIONS.forEach((e) => {
      doc.text(`•  ${e}`, L, y, { width: R - L });
      y = doc.y + 2;
    });

    // Pie: asistencia y aviso
    const fy = doc.page.height - 112;
    doc.roundedRect(L, fy, R - L, 50, 6).fill(C.signal);
    doc.font('display').fontSize(12).fillColor(C.ink).text('Asistencia 24 horas', L + 14, fy + 9);
    doc.font('body').fontSize(9.5).text('En un viaje real llamarías a este teléfono. En la demo es ficticio: +34 900 000 000.', L + 14, fy + 27, { width: R - L - 28 });
    doc.font('body').fontSize(7.5).fillColor(C.grey).text(
      `Condiciones generales ${TERMS_VERSION}. Escala es una marca inventada para una prueba técnica: no es una aseguradora, no está registrada en la DGSFP y este documento no da derecho a ninguna prestación.`,
      L, fy + 58, { width: R - L, align: 'center' }
    );
    doc.end();
  });
}
