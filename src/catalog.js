// Catálogo de producto: planes, coberturas, zonas y destinos.
// Todo es ficticio: Escala es una demo y no es un seguro real.

export const TERMS_VERSION = 'ESC-CG-2026.11';
export const IPS_RATE = 0.08; // Impuesto sobre Primas de Seguros (incluido en el precio final)
export const MAX_DAYS = 90;
export const MAX_TRAVELERS = 6;
export const MAX_AGE = 84;
export const QUOTE_TTL_MINUTES = 120;
export const MAX_DAYS_IN_ADVANCE = 365;

export const PLANS = [
  {
    id: 'esencial',
    name: 'Esencial',
    tagline: 'Lo imprescindible si te pones enfermo o tienes un accidente.',
    max_age: 69,
    recommended: false,
  },
  {
    id: 'completo',
    name: 'Completo',
    tagline: 'Gastos médicos altos, cancelación y equipaje. El que elige la mayoría.',
    max_age: MAX_AGE,
    recommended: true,
  },
  {
    id: 'total',
    name: 'Total',
    tagline: 'Para viajes largos, caros o a destinos con sanidad muy cara.',
    max_age: MAX_AGE,
    recommended: false,
  },
];

// limit: importe máximo por asegurado y siniestro. null = no incluido. 'ilimitado' = sin tope.
export const COVERAGES = [
  {
    id: 'medical',
    name: 'Gastos médicos en el extranjero',
    plain: 'Médico, hospital, medicinas y urgencias si te pones enfermo o te lesionas durante el viaje.',
    limits: { esencial: 150000, completo: 1000000, total: 5000000 },
    limits_espana: { esencial: 3000, completo: 6000, total: 10000 },
    deductible: { esencial: 75, completo: 0, total: 0 },
  },
  {
    id: 'repatriation',
    name: 'Repatriación o traslado sanitario',
    plain: 'Te llevamos a casa o al hospital adecuado si es necesario por motivos médicos.',
    limits: { esencial: 'ilimitado', completo: 'ilimitado', total: 'ilimitado' },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'cancellation',
    name: 'Cancelación del viaje',
    plain: 'Te devolvemos lo que no puedas recuperar si cancelas por una causa justificada (enfermedad, accidente, fallecimiento de un familiar y otras de la lista).',
    limits: { esencial: null, completo: 1500, total: 5000 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'baggage',
    name: 'Robo, pérdida o daños del equipaje',
    plain: 'Pagamos tus cosas si la aerolínea pierde la maleta o te la roban.',
    limits: { esencial: 500, completo: 1500, total: 3000 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'baggage_delay',
    name: 'Retraso del equipaje (más de 12 h)',
    plain: 'Compras de primera necesidad si tu maleta llega tarde.',
    limits: { esencial: null, completo: 150, total: 300 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'flight_delay',
    name: 'Retraso del vuelo (más de 6 h)',
    plain: 'Un importe fijo para gastos si tu vuelo sale con más de 6 horas de retraso.',
    limits: { esencial: null, completo: 100, total: 250 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'liability',
    name: 'Responsabilidad civil privada',
    plain: 'Si causas daños a otra persona o a sus cosas sin querer.',
    limits: { esencial: 30000, completo: 60000, total: 120000 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
  {
    id: 'accident',
    name: 'Accidentes (fallecimiento o invalidez)',
    plain: 'Una indemnización si un accidente durante el viaje causa invalidez permanente o fallecimiento.',
    limits: { esencial: null, completo: 30000, total: 60000 },
    deductible: { esencial: 0, completo: 0, total: 0 },
  },
];

export const EXCLUSIONS = [
  'Enfermedades que ya tenías antes de contratar y no estaban estables.',
  'Deportes de riesgo y competiciones (salvo que se contrate una ampliación, no disponible en la demo).',
  'Viajes a países con recomendación de no viajar del Ministerio de Asuntos Exteriores.',
  'Daños causados bajo los efectos del alcohol o drogas.',
  'Viajes que empiezan fuera de España: Escala es para residentes en España.',
];

export const ZONES = {
  espana: { id: 'espana', name: 'España' },
  europa: { id: 'europa', name: 'Europa y ribera mediterránea' },
  mundo: { id: 'mundo', name: 'Resto del mundo (sin EE. UU. ni Canadá)' },
  usa_canada: { id: 'usa_canada', name: 'EE. UU. y Canadá' },
};
export const ZONE_ORDER = ['espana', 'europa', 'mundo', 'usa_canada'];

// ISO 3166-1 alfa-2 + Kosovo (XK).
const ISO = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'
).split(' ');

// Europa geográfica + países ribereños del Mediterráneo (criterio habitual en el mercado español).
const EUROPA = new Set(
  ('AD AL AT AX BA BE BG CH CY CZ DE DK EE FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO ' +
    'PL PT RO RS SE SI SJ SK SM VA XK TR MA DZ TN EG IL PS LB').split(' ')
);
const USA_CANADA = new Set('US CA PR VI GU AS MP UM'.split(' '));

// Lista simplificada para la demo, inspirada en las recomendaciones de viaje del Ministerio de Asuntos Exteriores.
export const EXCLUDED = new Set('AF BY KP LY ML RU SO SS SY UA YE'.split(' '));

const namesEs = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' });
const namesEn = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function zoneOf(code) {
  if (code === 'ES') return 'espana';
  if (USA_CANADA.has(code)) return 'usa_canada';
  if (EUROPA.has(code)) return 'europa';
  return 'mundo';
}

export function countryName(code) {
  return namesEs.of(code) || code;
}

// Alias útiles: nombres coloquiales, ciudades frecuentes y regiones.
const ALIASES = {
  'eeuu': 'US', 'ee uu': 'US', 'usa': 'US', 'us': 'US', 'estados unidos de america': 'US', 'america': 'US',
  'uk': 'GB', 'inglaterra': 'GB', 'escocia': 'GB', 'gales': 'GB', 'gran bretana': 'GB', 'england': 'GB', 'scotland': 'GB', 'great britain': 'GB',
  'holanda': 'NL', 'holland': 'NL', 'chequia': 'CZ', 'republica checa': 'CZ', 'czech republic': 'CZ',
  'corea': 'KR', 'corea del sur': 'KR', 'south korea': 'KR', 'emiratos': 'AE', 'emiratos arabes': 'AE', 'uae': 'AE',
  'rusia': 'RU', 'birmania': 'MM', 'costa de marfil': 'CI', 'vaticano': 'VA', 'turquia': 'TR', 'turkiye': 'TR',
  // ciudades e islas
  'tokio': 'JP', 'tokyo': 'JP', 'kioto': 'JP', 'kyoto': 'JP', 'osaka': 'JP',
  'nueva york': 'US', 'new york': 'US', 'nyc': 'US', 'miami': 'US', 'los angeles': 'US', 'san francisco': 'US', 'las vegas': 'US', 'chicago': 'US', 'orlando': 'US', 'hawai': 'US', 'hawaii': 'US', 'boston': 'US', 'washington': 'US',
  'toronto': 'CA', 'montreal': 'CA', 'vancouver': 'CA',
  'londres': 'GB', 'london': 'GB', 'edimburgo': 'GB', 'edinburgh': 'GB', 'manchester': 'GB',
  'paris': 'FR', 'niza': 'FR', 'roma': 'IT', 'rome': 'IT', 'milan': 'IT', 'florencia': 'IT', 'venecia': 'IT', 'napoles': 'IT', 'sicilia': 'IT', 'cerdena': 'IT',
  'lisboa': 'PT', 'lisbon': 'PT', 'oporto': 'PT', 'porto': 'PT', 'madeira': 'PT', 'azores': 'PT',
  'berlin': 'DE', 'munich': 'DE', 'amsterdam': 'NL', 'bruselas': 'BE', 'brussels': 'BE', 'praga': 'CZ', 'prague': 'CZ', 'viena': 'AT', 'vienna': 'AT',
  'budapest': 'HU', 'dublin': 'IE', 'reikiavik': 'IS', 'reykjavik': 'IS', 'oslo': 'NO', 'copenhague': 'DK', 'estocolmo': 'SE', 'zurich': 'CH', 'ginebra': 'CH', 'geneva': 'CH',
  'varsovia': 'PL', 'cracovia': 'PL', 'atenas': 'GR', 'athens': 'GR', 'santorini': 'GR', 'mykonos': 'GR', 'estambul': 'TR', 'istanbul': 'TR', 'capadocia': 'TR',
  'marrakech': 'MA', 'marrakesh': 'MA', 'tanger': 'MA', 'el cairo': 'EG', 'cairo': 'EG',
  'cancun': 'MX', 'riviera maya': 'MX', 'ciudad de mexico': 'MX', 'mexico city': 'MX', 'tulum': 'MX',
  'punta cana': 'DO', 'la habana': 'CU', 'havana': 'CU', 'buenos aires': 'AR', 'bariloche': 'AR', 'lima': 'PE', 'cusco': 'PE', 'machu picchu': 'PE',
  'bogota': 'CO', 'medellin': 'CO', 'santiago de chile': 'CL', 'rio de janeiro': 'BR', 'sao paulo': 'BR', 'montevideo': 'UY',
  'bangkok': 'TH', 'phuket': 'TH', 'bali': 'ID', 'dubai': 'AE', 'abu dabi': 'AE', 'pekin': 'CN', 'beijing': 'CN', 'shanghai': 'CN', 'seul': 'KR', 'seoul': 'KR',
  'singapur': 'SG', 'hanoi': 'VN', 'delhi': 'IN', 'nueva delhi': 'IN', 'sidney': 'AU', 'sydney': 'AU', 'melbourne': 'AU',
  'nueva zelanda': 'NZ', 'maldivas': 'MV', 'zanzibar': 'TZ', 'ciudad del cabo': 'ZA', 'cape town': 'ZA',
  'madrid': 'ES', 'barcelona': 'ES', 'mallorca': 'ES', 'ibiza': 'ES', 'menorca': 'ES', 'tenerife': 'ES', 'gran canaria': 'ES', 'canarias': 'ES', 'islas canarias': 'ES', 'baleares': 'ES', 'sevilla': 'ES', 'valencia': 'ES',
};

// Regiones: el cliente puede decir "Europa" o "Sudeste asiático" sin concretar país.
const REGION_ALIASES = {
  'europa': 'europa', 'europe': 'europa', 'schengen': 'europa', 'zona schengen': 'europa', 'mediterraneo': 'europa',
  'mundo': 'mundo', 'worldwide': 'mundo', 'world': 'mundo', 'todo el mundo': 'mundo', 'asia': 'mundo', 'sudeste asiatico': 'mundo',
  'africa': 'mundo', 'latinoamerica': 'mundo', 'sudamerica': 'mundo', 'south america': 'mundo', 'centroamerica': 'mundo',
  'caribe': 'mundo', 'oceania': 'mundo', 'oriente medio': 'mundo', 'middle east': 'mundo',
  'norteamerica': 'usa_canada', 'north america': 'usa_canada',
};

const index = new Map();
for (const code of ISO) {
  index.set(normalize(code), code);
  const es = namesEs.of(code);
  const en = namesEn.of(code);
  if (es) index.set(normalize(es), code);
  if (en) index.set(normalize(en), code);
}
for (const [k, v] of Object.entries(ALIASES)) index.set(normalize(k), v);

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Devuelve { code, name, zone } | { region, zone, name } | { error, suggestions }
export function resolveDestination(input) {
  const raw = String(input ?? '').trim();
  const key = normalize(raw);
  if (!key) return { error: 'empty', suggestions: [] };
  if (REGION_ALIASES[key]) {
    const zone = REGION_ALIASES[key];
    return { region: true, code: null, name: raw, zone };
  }
  const code = index.get(key);
  if (code) return { code, name: countryName(code), zone: zoneOf(code) };
  // Sugerencias por cercanía de texto
  const scored = [];
  for (const [k, c] of index) {
    if (k.length < 3) continue;
    const dist = levenshtein(key, k);
    if (dist <= Math.max(2, Math.floor(key.length / 4))) scored.push([dist, c]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  const suggestions = [...new Set(scored.map(([, c]) => `${countryName(c)} (${c})`))].slice(0, 3);
  return { error: 'unknown', suggestions };
}

export function planById(id) {
  const key = normalize(id);
  return PLANS.find((p) => p.id === key || normalize(p.name) === key) || null;
}

export function coveragesFor(planId, zone) {
  return COVERAGES.filter((c) => c.limits[planId] !== null).map((c) => {
    const limit = zone === 'espana' && c.limits_espana ? c.limits_espana[planId] : c.limits[planId];
    return {
      id: c.id,
      name: c.name,
      limit_eur: limit === 'ilimitado' ? null : limit,
      limit_text: limit === 'ilimitado' ? 'Ilimitado' : formatEur(limit, 0),
      deductible_eur: c.deductible[planId],
      plain: c.plain,
    };
  });
}

export function formatEur(n, decimals = 2) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: 'always',
  }).format(n);
}

export function destinationList() {
  return ISO.filter((c) => !EXCLUDED.has(c) && namesEs.of(c))
    .map((code) => ({ code, name: countryName(code), zone: zoneOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
