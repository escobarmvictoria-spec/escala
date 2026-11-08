// Ficha de información del producto, con la estructura del IPID (documento de información sobre el producto
// de seguro, Reglamento de Ejecución (UE) 2017/1469): las mismas preguntas, en el mismo orden y en un máximo
// de dos páginas. Se genera con los datos del catálogo, así que no puede contradecir a la web ni a la póliza.
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS, COVERAGES, EXCLUSIONS, ZONES, MAX_DAYS, MAX_TRAVELERS, MAX_AGE, TERMS_VERSION, IPS_RATE, formatEur } from './catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(here, '..', 'public', 'fonts');
const C = { ink: '#19233F', signal: '#F2C75B', paper: '#F6F3EC', grey: '#4A536B', line: '#DCD6C8', teal: '#2F7D70', tealSoft: '#E4F1EE', red: '#B3261E' };

const limitText = (v) => (v === null ? '—' : v === 'ilimitado' ? 'Ilimitado' : formatEur(v, 0));

export function renderProductSheet() {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 30, left: 44, right: 44 }, info: { Title: 'Ficha de información del producto: Escala, seguro de viaje (demo)', Author: 'Escala (demo)' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('display', path.join(FONTS, 'manrope-latin-800-normal.woff'));
    doc.registerFont('body', path.join(FONTS, 'inter-latin-400-normal.woff'));
    doc.registerFont('bold', path.join(FONTS, 'inter-latin-600-normal.woff'));

    const W = doc.page.width;
    const L = 44;
    const R = W - 44;
    const band = () => {
      doc.rect(0, 0, W, 22).fill(C.ink);
      doc.font('bold').fontSize(9).fillColor(C.signal).text('Demo — no es un seguro real. Escala es una marca inventada para una prueba técnica.', L, 7, { width: R - L, align: 'center' });
    };
    band();
    doc.on('pageAdded', band);

    // Cabecera: isotipo de la ruta y títulos del IPID
    const y0 = 40;
    const k = 0.62;
    const P = (x, y) => [L + x * k, y0 + y * k];
    doc.lineWidth(4 * k).lineCap('round').strokeColor(C.ink).moveTo(...P(8, 37)).bezierCurveTo(...P(17, 37), ...P(17, 11), ...P(40, 11)).stroke();
    doc.circle(...P(8, 37), 5 * k).fill(C.ink);
    doc.circle(...P(40, 11), 5 * k).fill(C.ink);
    doc.lineWidth(3 * k).circle(...P(18.75, 24), 6.5 * k).fillAndStroke(C.signal, C.ink);
    doc.font('display').fontSize(20).fillColor(C.ink).text('escala', L + 36, y0 + 4);
    doc.font('display').fontSize(15).text('Seguro de viaje', 250, y0, { width: R - 250, align: 'right' });
    doc.font('body').fontSize(9).fillColor(C.grey).text('Documento de información sobre el producto de seguro', 250, y0 + 19, { width: R - 250, align: 'right' });

    let y = y0 + 44;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(C.line).stroke();
    y += 8;
    doc.font('bold').fontSize(9).fillColor(C.ink).text('Compañía: ', L, y, { continued: true }).font('body').text('ninguna. En un producto real figuraría aquí la entidad aseguradora y su clave de registro en la Dirección General de Seguros y Fondos de Pensiones.', { width: R - L });
    y = doc.y + 3;
    doc.font('bold').text('Producto: ', L, y, { continued: true }).font('body').text(`Escala, seguro de viaje. Planes Esencial, Completo y Total. Condiciones ${TERMS_VERSION}.`, { width: R - L });
    y = doc.y + 6;
    doc.font('body').fontSize(8.5).fillColor(C.grey).text('Este documento resume las coberturas y exclusiones principales. La información precontractual y contractual completa está en las condiciones de contratación (escala/condiciones) y en la póliza. Demo: no hay aseguradora detrás, no se cobra dinero y las pólizas no tienen validez.', L, y, { width: R - L });
    y = doc.y + 10;

    const heading = (text, color = C.ink, mark = null) => {
      if (y > doc.page.height - 110) {
        doc.addPage();
        y = 40;
      }
      if (mark) {
        // Iconos dibujados (como en el IPID): ✓ se asegura, ✕ no se asegura, ! restricciones.
        const cx = L + 7;
        const cy = y + 7;
        doc.circle(cx, cy, 7).fill(color);
        doc.lineWidth(1.6).lineCap('round').strokeColor(mark === '!' ? C.ink : '#ffffff');
        if (mark === 'ok') doc.moveTo(cx - 3.2, cy).lineTo(cx - 0.8, cy + 2.6).lineTo(cx + 3.4, cy - 2.6).stroke();
        if (mark === 'no') doc.moveTo(cx - 2.6, cy - 2.6).lineTo(cx + 2.6, cy + 2.6).moveTo(cx + 2.6, cy - 2.6).lineTo(cx - 2.6, cy + 2.6).stroke();
        if (mark === '!') {
          doc.moveTo(cx, cy - 3.6).lineTo(cx, cy + 0.8).stroke();
          doc.circle(cx, cy + 3.4, 0.9).fill(C.ink);
        }
      }
      doc.font('display').fontSize(11.5).fillColor(C.ink).text(text, L + (mark ? 20 : 0), y);
      y = doc.y + 4;
    };
    const ensure = (h) => {
      if (y + h > doc.page.height - 40) {
        doc.addPage();
        y = 40;
      }
    };
    const para = (text) => {
      ensure(doc.font('body').fontSize(9).heightOfString(text, { width: R - L }));
      doc.font('body').fontSize(9).fillColor(C.ink).text(text, L, y, { width: R - L, lineGap: 1.5 });
      y = doc.y + 8;
    };
    const bullets = (items) => {
      for (const it of items) {
        ensure(doc.font('body').fontSize(9).heightOfString(`•  ${it}`, { width: R - L - 4 }));
        doc.font('body').fontSize(9).fillColor(C.ink).text(`•  ${it}`, L + 4, y, { width: R - L - 4, lineGap: 1.5 });
        y = doc.y + 2;
      }
      y += 6;
    };

    heading('¿En qué consiste este tipo de seguro?');
    para(`Seguro de asistencia en viaje para residentes en España, en viajes que empiezan en España, de hasta ${MAX_DAYS} días y con hasta ${MAX_TRAVELERS} viajeros por póliza. Cubre la asistencia médica y la repatriación durante el viaje y, según el plan, la cancelación, el equipaje, los retrasos, la responsabilidad civil y los accidentes.`);

    heading('¿Qué se asegura?', C.teal, 'ok');
    // Tabla de coberturas por plan (límites por persona asegurada y siniestro)
    const cols = [L, L + 238, L + 330, L + 422];
    const colW = [230, 88, 88, R - cols[3]];
    doc.rect(L, y, R - L, 18).fill(C.paper);
    doc.font('bold').fontSize(8.5).fillColor(C.ink);
    ['Cobertura (límite por persona y siniestro)', ...PLANS.map((p) => p.name)].forEach((t, i) => doc.text(t, cols[i] + 4, y + 5, { width: colW[i] - 8, align: i ? 'right' : 'left' }));
    y += 18;
    for (const c of COVERAGES) {
      const rowH = 17;
      doc.font('body').fontSize(8.5).fillColor(C.ink).text(c.name, cols[0] + 4, y + 4, { width: colW[0] - 8 });
      PLANS.forEach((p, i) => {
        const v = c.limits[p.id];
        doc.font(v === null ? 'body' : 'bold').fillColor(v === null ? C.grey : C.ink).text(v === null ? 'No incluido' : limitText(v), cols[i + 1] + 4, y + 4, { width: colW[i + 1] - 8, align: 'right' });
      });
      y += rowH;
      doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(C.line).stroke();
    }
    const med = COVERAGES.find((c) => c.id === 'medical');
    y += 5;
    doc.font('body').fontSize(8).fillColor(C.grey).text(`En viajes por España, el límite de gastos médicos es de ${PLANS.map((p) => `${formatEur(med.limits_espana[p.id], 0)} (${p.name})`).join(', ')}, porque la persona asegurada tiene acceso a la sanidad pública. Asistencia telefónica 24 horas en todos los planes.`, L, y, { width: R - L });
    y = doc.y + 10;

    heading('¿Qué no está asegurado?', C.red, 'no');
    bullets(EXCLUSIONS);

    heading('¿Existen restricciones en lo que respecta a la cobertura?', C.signal, '!');
    bullets([
      `Franquicia: el plan Esencial tiene ${formatEur(med.deductible.esencial, 0)} de franquicia en gastos médicos por siniestro. Completo y Total no tienen franquicia.`,
      `Edad: de 0 a ${MAX_AGE} años; el plan Esencial, hasta ${PLANS.find((p) => p.id === 'esencial').max_age} años.`,
      `Duración máxima del viaje: ${MAX_DAYS} días. Máximo ${MAX_TRAVELERS} viajeros por póliza.`,
      'La cancelación del viaje solo cubre las causas de la lista cerrada de las condiciones (enfermedad grave, accidente u hospitalización, fallecimiento de un familiar, despido y otras). Si contratas más de 7 días después de tu primera reserva, cubre desde 72 horas tras la contratación.',
    ]);

    heading('¿Dónde estoy cubierto?');
    bullets(Object.values(ZONES).map((z) => z.name).concat('La zona la fija el destino del viaje; si hay varios destinos, se aplica la zona más cara.'));

    heading('¿Cuáles son mis obligaciones?');
    bullets([
      'Dar datos veraces al contratar: destino, fechas, edad y nombre de cada viajero.',
      'Ante cualquier incidencia durante el viaje, llamar al teléfono de asistencia 24 horas (en la demo, ficticio) y conservar facturas e informes.',
      'Pagar el precio antes del inicio del viaje.',
    ]);

    heading('¿Cuándo y cómo tengo que efectuar los pagos?');
    para(`Pago único al contratar, con tarjeta. El precio es final e incluye el Impuesto sobre las Primas de Seguros (${Math.round(IPS_RATE * 100)} %). En la demo solo se aceptan tarjetas de prueba y no se cobra dinero.`);

    heading('¿Cuándo comienza y finaliza la cobertura?');
    para('Desde la fecha de salida hasta la de vuelta indicadas en la póliza, ambas incluidas. La cobertura de cancelación (Completo y Total) protege desde la contratación hasta el inicio del viaje.');

    heading('¿Cómo puedo rescindir el contrato?');
    para('Puedes desistir en los 14 días naturales siguientes a la contratación, siempre que el viaje no haya empezado. La póliza termina sin necesidad de aviso en la fecha de vuelta.');

    doc.font('body').fontSize(7.5).fillColor(C.grey).text(`Escala, seguro de viaje que se entiende. Ficha generada a partir del catálogo de la web (${TERMS_VERSION}).`, L, y, { width: R - L });
    doc.end();
  });
}
