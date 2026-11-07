// Almacenamiento mínimo en un fichero JSON (suficiente para una demo de un solo proceso).
import fs from 'node:fs';
import path from 'node:path';

export function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  let db = { orders: {}, policies: {}, callbacks: {} };
  if (fs.existsSync(file)) {
    try {
      db = { callbacks: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (e) {
      console.error('[store] db.json corrupto, se renombra y se empieza de cero', e.message);
      fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
    }
  }
  function save() {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }
  return {
    dir,
    getOrder: (id) => db.orders[id] || null,
    putOrder(order) {
      order.updated_at = new Date().toISOString();
      db.orders[order.id] = order;
      if (order.policy) db.policies[order.policy.number] = order.id;
      save();
      return order;
    },
    orderIdForPolicy: (number) => db.policies[number] || null,
    allOrders: () => Object.values(db.orders),
    getCallback: (id) => db.callbacks[id] || null,
    putCallback(cb) {
      db.callbacks[cb.id] = cb;
      save();
      return cb;
    },
    allCallbacks: () => Object.values(db.callbacks),
  };
}
