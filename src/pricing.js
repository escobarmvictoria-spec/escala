// Motor de tarifa de Escala.
// Precio por persona = (base + tarifa_diaria × días) × factor_edad, con descuento de grupo.
// Calibrado contra cotizaciones reales de Heymondo, IATI e InterMundial (ver docs/pricing.md).

import { PLANS, ZONES, MAX_DAYS, MAX_AGE, IPS_RATE } from './catalog.js';

// [base €, € por día] por zona y plan. Precio final con impuestos incluidos.
export const RATES = {
  espana: { esencial: [7, 0.7], completo: [9, 1.1], total: [14, 1.6] },
  europa: { esencial: [9.5, 1.1], completo: [13, 1.9], total: [25, 2.6] },
  mundo: { esencial: [15, 2.0], completo: [20, 3.5], total: [30, 4.4] },
  usa_canada: { esencial: [15, 2.55], completo: [22, 3.8], total: [30, 5.0] },
};

export const LONG_TRIP_THRESHOLD = 31; // a partir del día 32, la tarifa diaria baja
export const LONG_TRIP_FACTOR = 0.75;
export const GROUP_MIN = 3;
export const GROUP_DISCOUNT = 0.1;

export const AGE_BANDS = [
  { min: 0, max: 17, factor: 0.6, label: 'Menores (0-17)' },
  { min: 18, max: 64, factor: 1.0, label: 'Adultos (18-64)' },
  { min: 65, max: 74, factor: 1.5, label: 'Seniors (65-74)' },
  { min: 75, max: MAX_AGE, factor: 2.2, label: 'Seniors (75-84)' },
];

export function ageFactor(age) {
  const band = AGE_BANDS.find((b) => age >= b.min && age <= b.max);
  return band ? band.factor : null;
}

const r2 = (n) => Math.round(n * 100) / 100;

export function basePrice(zone, planId, days) {
  const [base, daily] = RATES[zone][planId];
  const normalDays = Math.min(days, LONG_TRIP_THRESHOLD);
  const longDays = Math.max(0, days - LONG_TRIP_THRESHOLD);
  return base + daily * normalDays + daily * LONG_TRIP_FACTOR * longDays;
}

// travelers: [{ age }]
export function priceTrip({ zone, days, travelers }) {
  if (!RATES[zone]) throw new Error(`Zona desconocida: ${zone}`);
  if (!(days >= 1 && days <= MAX_DAYS)) throw new Error(`Duración fuera de rango: ${days}`);
  const groupDiscount = travelers.length >= GROUP_MIN ? GROUP_DISCOUNT : 0;
  const plans = {};
  for (const plan of PLANS) {
    const ineligible = travelers.filter((t) => t.age > plan.max_age);
    const lines = travelers.map((t, i) => {
      const base = basePrice(zone, plan.id, days);
      const factor = ageFactor(t.age);
      const gross = base * factor;
      const price = r2(gross * (1 - groupDiscount));
      return { traveler: i + 1, age: t.age, age_factor: factor, price_eur: price };
    });
    const total = r2(lines.reduce((s, l) => s + l.price_eur, 0));
    const net = r2(total / (1 + IPS_RATE));
    plans[plan.id] = {
      plan: plan.id,
      name: plan.name,
      available: ineligible.length === 0,
      unavailable_reason: ineligible.length
        ? `El plan ${plan.name} solo admite viajeros de hasta ${plan.max_age} años.`
        : null,
      total_eur: total,
      per_traveler: lines,
      net_premium_eur: net,
      taxes_eur: r2(total - net),
      group_discount_pct: groupDiscount * 100,
      price_per_day_eur: r2(total / days),
    };
  }
  return { zone, zone_name: ZONES[zone].name, days, plans };
}
