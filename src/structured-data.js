// Datos estructurados (schema.org, JSON-LD) de la portada, generados con el catálogo y el motor de tarifa:
// buscadores y agentes leen qué se vende, a quién, con qué coberturas, cuánto cuesta y qué preguntas se responden.
import { PLANS, COVERAGES, MAX_DAYS, MAX_AGE, formatEur } from './catalog.js';
import { priceTrip } from './pricing.js';

const clean = (html) => html.replace(/<button[^>]*>.*?<\/button>/gs, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();

export function structuredData(indexHtml, baseUrl) {
  const example = priceTrip({ zone: 'europa', days: 7, travelers: [{ age: 35 }] });
  const org = {
    '@type': 'Organization',
    '@id': `${baseUrl}/#org`,
    name: 'Escala (demo)',
    url: `${baseUrl}/`,
    logo: `${baseUrl}/favicon.svg`,
    slogan: 'Seguro de viaje que se entiende.',
    description: 'Marca inventada para una prueba técnica. No es una aseguradora ni un mediador: no se cobra dinero y las pólizas no tienen validez.',
  };
  const keyLimits = (planId) =>
    COVERAGES.filter((c) => c.limits[planId] !== null)
      .map((c) => `${c.name}: ${c.limits[planId] === 'ilimitado' ? 'ilimitado' : formatEur(c.limits[planId], 0)}`)
      .join('; ');
  const service = {
    '@type': 'Service',
    '@id': `${baseUrl}/#seguro-de-viaje`,
    name: 'Escala, seguro de viaje (demo)',
    serviceType: 'Seguro de viaje',
    provider: { '@id': `${baseUrl}/#org` },
    areaServed: { '@type': 'Country', name: 'España' },
    audience: { '@type': 'Audience', audienceType: `Residentes en España, viajes desde España de hasta ${MAX_DAYS} días, de 0 a ${MAX_AGE} años` },
    termsOfService: `${baseUrl}/condiciones`,
    subjectOf: { '@type': 'DigitalDocument', name: 'Ficha de información del producto (formato IPID)', url: `${baseUrl}/ficha-producto.pdf`, encodingFormat: 'application/pdf' },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Planes',
      itemListElement: PLANS.map((p) => ({
        '@type': 'Offer',
        name: `Plan ${p.name}`,
        description: `${p.tagline} ${keyLimits(p.id)}.`,
        url: `${baseUrl}/#coberturas`,
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: example.plans[p.id].total_eur,
          priceCurrency: 'EUR',
          valueAddedTaxIncluded: true,
          description: 'Precio de ejemplo: una semana en Europa, una persona de 35 años, impuestos incluidos. El precio depende del destino, los días y la edad.',
        },
      })),
    },
  };
  const faqs = [...indexHtml.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/gs)].map(([, q, a]) => ({
    '@type': 'Question',
    name: clean(q),
    acceptedAnswer: { '@type': 'Answer', text: clean(a) },
  }));
  const site = { '@type': 'WebSite', '@id': `${baseUrl}/#web`, url: `${baseUrl}/`, name: 'Escala', inLanguage: 'es-ES', publisher: { '@id': `${baseUrl}/#org` } };
  const graph = [org, site, service, ...(faqs.length ? [{ '@type': 'FAQPage', mainEntity: faqs }] : [])];
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
}
