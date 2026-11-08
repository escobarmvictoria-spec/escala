// Póliza de ejemplo («Ver una póliza de ejemplo»): el mismo PDF que recibe un cliente, generado con el
// motor real de compra y datos ficticios, para que se vea antes de comprar qué documento llega.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from './store.js';
import { createOrderService } from './orders.js';
import { renderPolicyPdf } from './pdf.js';

let cache = null;
const plusDays = (d) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
};

export async function samplePolicyPdf() {
  if (cache) return cache;
  const svc = createOrderService({
    store: createStore(fs.mkdtempSync(path.join(os.tmpdir(), 'escala-ejemplo-'))),
    issuePolicy: (o) => ({ number: 'ESC-EJEMPLO', issued_at: new Date().toISOString(), pdf_token: 'ejemplo', email: { status: 'sent', to: o.holder.email } }),
    sendPolicyEmail: async () => {},
  });
  const holder = { full_name: 'Lucía Martín (ejemplo)', email: 'lucia.martin@example.com' };
  const o = svc.createQuote({ destinations: ['Roma'], start_date: plusDays(30), end_date: plusDays(36), travelers: [{ age: 35 }], departure_country: 'ES' }, 'web');
  svc.selectPlan(o.id, 'completo', 'web');
  svc.setTravelers(o.id, { holder, travelers: [{ full_name: holder.full_name, age: 35 }] }, 'web');
  const { order, summary } = svc.review(o.id, 'web');
  svc.acceptTerms(o.id, { accepted: true, review_token: order.review.token, terms_version: summary.terms.version }, 'web');
  const paid = await svc.pay(o.id, { amount_eur: summary.total_eur, card_number: '4242424242424242', user_confirmation: 'Ejemplo: «Sí, acepto las condiciones»' }, 'web');
  cache = await renderPolicyPdf(paid.order);
  return cache;
}
