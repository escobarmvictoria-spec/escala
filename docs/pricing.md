# Metodología de precios de Escala

Escala es una demo: estos precios no son una tarifa actuarial, pero están pensados para que un cliente que compare con Heymondo, IATI o InterMundial vea cifras de mercado.

## Fórmula

```
precio por viajero = (base[zona][plan] + tarifa_diaria[zona][plan] × días) × factor_edad
total              = suma de viajeros × (1 − 10 % si viajan 3 o más)
```

- **Días**: de la salida a la vuelta, ambos incluidos. A partir del día 32, la tarifa diaria se multiplica por 0,75 (los viajes largos son más baratos por día en todo el mercado). Máximo 90 días.
- **Zona**: España; Europa y ribera mediterránea; resto del mundo; EE. UU. y Canadá. Con varios destinos se aplica la zona más cara.
- **Edad**: 0-17 años ×0,6 · 18-64 ×1,0 · 65-74 ×1,5 · 75-84 ×2,2. El plan Esencial llega hasta 69 años; a partir de 85 años no se ofrece cobertura.
- **Impuestos**: el precio es final e incluye el IPS (8 %). En la póliza se desglosa prima neta e impuesto.

| Zona | Esencial (base + €/día) | Completo | Total |
|---|---|---|---|
| España | 7 + 0,70 | 9 + 1,10 | 14 + 1,60 |
| Europa | 11 + 1,25 | 14 + 1,90 | 24 + 2,30 |
| Resto del mundo | 18 + 2,30 | 22 + 3,80 | 32 + 4,45 |
| EE. UU. y Canadá | 18 + 3,35 | 34 + 3,90 | 38 + 5,60 |

## Cómo se calibró

Dos rondas, con IA y verificación propia:

1. **Precios publicados.** Con ayuda de Claude se reunieron 41 precios publicados en artículos comparativos (Capture the Atlas, diciembre de 2025; Japonpedia, septiembre de 2026) de Heymondo, IATI, InterMundial, Mapfre y Chapka: Europa (4 y 30 días), EE. UU. (7, 15 y 20 días) y Japón (7, 15 y 30 días). Con ellos se fijó una primera tarifa (error medio del 9,6 %).
2. **Verificación cotizando a mano.** El 7/11/2026 Victoria cotizó tres viajes en heymondo.es, iatiseguros.com e intermundial.es: Italia 8 días (1 adulto), Japón 8 días (2 adultos) y EE. UU. 11 días (1 adulto). Son 26 precios. Ninguna web pide la edad para cotizar: el precio es el de un adulto estándar, que en Escala es la tarifa base (18-64 años).
3. **Hallazgo:** con la primera tarifa, Escala quedaba muy por debajo del mercado actual: −7 % en Italia, −13 % en Japón y −24 % en EE. UU. (error medio del 16 %). Los precios habían subido respecto a los artículos de 2025, sobre todo en EE. UU.
4. **Recalibración.** Se reajustó la base y la tarifa diaria dando más peso a las cotizaciones de hoy (triple que a los artículos), con el objetivo de quedar algo por debajo de la mediana del mercado y manteniendo el orden lógico (EE. UU. ≥ resto del mundo ≥ Europa ≥ España; Esencial < Completo < Total). España no cambia: no había cotizaciones nuevas.
5. Cada producto se compara con el plan de Escala equivalente por coberturas: asistencia básica o intermedia (Heymondo Esencial y Tranquilidad, IATI Escapadas y Estándar, InterMundial Totaltravel mini) → **Esencial**; gama media-alta (Heymondo Top, InterMundial Totaltravel) → **Completo**; gama alta (Heymondo Premium, IATI Estrella, InterMundial Totaltravel premium) → **Total**. IATI Mochilero no se usa: es un seguro de aventura sin equivalente.
6. `npm run calibrate` repite la comparación con la tarifa actual; `npm run calibrate -- --md` imprime la tabla de abajo.

**Resultado:** frente a las 26 cotizaciones de hoy, error medio del **9,2 %** y desviación mediana del **−4 %** (Escala, un poco más barata que el mercado: comparable, sin regalar margen). Frente a los artículos antiguos la tarifa queda ahora por encima (+15 % de mediana), lo esperable si el mercado subió desde entonces.

## Decisiones defendibles

- **Base + tarifa diaria** en lugar de tramos de días: es como se comporta el mercado (un coste fijo de emisión y asistencia más un coste que crece con la exposición) y es fácil de explicar.
- **Esencial con franquicia de 75 €**: permite un precio de entrada competitivo sin recortar la cobertura médica por debajo de 150.000 €.
- **EE. UU. y Canadá aparte**: la sanidad allí es mucho más cara; el mercado español separa esa zona o la encarece.
- **Descuento de grupo del 10 %** (Heymondo aplica un 15 % a familias): suficiente para premiar el viaje en grupo sin regalar margen.

## Cotizaciones de referencia

Fuentes de los artículos: [Capture the Atlas, Europa](https://capturetheatlas.com/es/seguro-de-viaje-a-europa/) (11/12/2025), [Capture the Atlas, EE. UU.](https://capturetheatlas.com/es/seguro-de-viaje-a-estados-unidos/) (11/12/2025) y [Japonpedia](https://japonpedia.com/cuanto-vale-seguro-viaje-japon/) (17/09/2026). Cotizaciones de Victoria: capturas de las webs de Heymondo, IATI e InterMundial del 7/11/2026, salida ese mismo día. Precios totales del viaje.

| Fuente | Zona | Días | Viajeros | Producto de mercado | Mercado | Plan Escala | Escala | Diferencia |
|---|---|---:|---:|---|---:|---|---:|---:|
| artículo | europa | 4 | 1 | Heymondo Solo Asistencia | 10.59 € | esencial | 16.00 € | +51 % |
| artículo | europa | 4 | 1 | Heymondo Tranquilidad | 14.71 € | esencial | 16.00 € | +9 % |
| artículo | europa | 4 | 1 | Heymondo Tranquilidad + cancelación | 17.25 € | completo | 21.60 € | +25 % |
| artículo | europa | 4 | 1 | Heymondo Top | 23.73 € | completo | 21.60 € | -9 % |
| artículo | europa | 4 | 1 | Heymondo Premium | 32.48 € | total | 33.20 € | +2 % |
| artículo | europa | 4 | 1 | Heymondo Premium + cancelación | 39.19 € | total | 33.20 € | -15 % |
| artículo | europa | 30 | 1 | Heymondo Solo Asistencia | 35.04 € | esencial | 48.50 € | +38 % |
| artículo | europa | 30 | 1 | Heymondo Tranquilidad | 44.05 € | esencial | 48.50 € | +10 % |
| artículo | europa | 30 | 1 | Heymondo Tranquilidad + cancelación | 52.46 € | completo | 71.00 € | +35 % |
| artículo | europa | 30 | 1 | Heymondo Top | 70.70 € | completo | 71.00 € | +0 % |
| artículo | europa | 30 | 1 | Heymondo Top + cancelación | 88.96 € | completo | 71.00 € | -20 % |
| artículo | europa | 30 | 1 | Heymondo Premium | 97.28 € | total | 93.00 € | -4 % |
| artículo | europa | 30 | 1 | Heymondo Premium + cancelación | 108.44 € | total | 93.00 € | -14 % |
| artículo | usa_canada | 7 | 1 | Heymondo Esencial | 26.39 € | esencial | 41.45 € | +57 % |
| artículo | usa_canada | 7 | 1 | Heymondo Tranquilidad | 30.69 € | esencial | 41.45 € | +35 % |
| artículo | usa_canada | 7 | 1 | Heymondo Top | 49.00 € | completo | 61.30 € | +25 % |
| artículo | usa_canada | 7 | 1 | Heymondo Premium | 61.14 € | total | 77.20 € | +26 % |
| artículo | usa_canada | 15 | 1 | Heymondo Esencial | 45.43 € | esencial | 68.25 € | +50 % |
| artículo | usa_canada | 15 | 1 | Heymondo Tranquilidad | 53.09 € | esencial | 68.25 € | +29 % |
| artículo | usa_canada | 15 | 1 | Heymondo Top | 80.17 € | completo | 92.50 € | +15 % |
| artículo | usa_canada | 15 | 1 | Heymondo Premium | 105.65 € | total | 122.00 € | +15 % |
| artículo | usa_canada | 20 | 1 | Heymondo Esencial | 54.55 € | esencial | 85.00 € | +56 % |
| artículo | usa_canada | 20 | 1 | Heymondo Tranquilidad | 63.82 € | esencial | 85.00 € | +33 % |
| artículo | usa_canada | 20 | 1 | IATI Estándar | 69.16 € | esencial | 85.00 € | +23 % |
| artículo | usa_canada | 20 | 1 | InterMundial Total Travel Mini | 81.63 € | esencial | 85.00 € | +4 % |
| artículo | usa_canada | 20 | 1 | Heymondo Tranquilidad + cancelación | 80.00 € | completo | 112.00 € | +40 % |
| artículo | usa_canada | 20 | 1 | IATI Estándar + cancelación | 91.72 € | completo | 112.00 € | +22 % |
| artículo | usa_canada | 20 | 1 | InterMundial Total Travel Mini + cancelación | 91.56 € | completo | 112.00 € | +22 % |
| artículo | usa_canada | 20 | 1 | Heymondo Top | 97.40 € | completo | 112.00 € | +15 % |
| artículo | usa_canada | 20 | 1 | Heymondo Premium | 124.22 € | total | 150.00 € | +21 % |
| artículo | usa_canada | 20 | 1 | Mapfre Segurviajes Total | 127.97 € | total | 150.00 € | +17 % |
| artículo | mundo | 7 | 1 | Heymondo Top | 49.13 € | completo | 48.60 € | -1 % |
| artículo | mundo | 7 | 1 | IATI Estrella | 53.79 € | total | 63.15 € | +17 % |
| artículo | mundo | 7 | 1 | InterMundial Totaltravel Premium | 63.25 € | total | 63.15 € | -0 % |
| artículo | mundo | 15 | 1 | Heymondo Top | 76.16 € | completo | 79.00 € | +4 % |
| artículo | mundo | 15 | 1 | IATI Estrella | 94.65 € | total | 98.75 € | +4 % |
| artículo | mundo | 15 | 1 | InterMundial Totaltravel Premium | 107.00 € | total | 98.75 € | -8 % |
| artículo | mundo | 30 | 1 | Heymondo Top | 142.50 € | completo | 136.00 € | -5 % |
| artículo | mundo | 30 | 1 | IATI Estrella | 154.20 € | total | 165.50 € | +7 % |
| artículo | mundo | 30 | 1 | InterMundial Totaltravel Premium | 171.21 € | total | 165.50 € | -3 % |
| artículo | mundo | 15 | 1 | Gama básica (IATI Estándar, Mondo Esencial), unos 3 €/día | 45.00 € | esencial | 52.50 € | +17 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | Heymondo Tranquilidad | 23.53 € | esencial | 21.00 € | -11 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | Heymondo Top | 30.50 € | completo | 29.20 € | -4 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | Heymondo Premium | 40.77 € | total | 42.40 € | +4 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | IATI Escapadas | 22.20 € | esencial | 21.00 € | -5 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | IATI Estándar | 24.85 € | esencial | 21.00 € | -15 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | InterMundial Totaltravel mini | 19.53 € | esencial | 21.00 € | +8 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | InterMundial Totaltravel | 30.22 € | completo | 29.20 € | -3 % |
| Victoria, 7/11/2026 | europa | 8 | 1 | InterMundial Totaltravel premium | 46.60 € | total | 42.40 € | -9 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | Heymondo Esencial | 62.82 € | esencial | 72.80 € | +16 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | Heymondo Tranquilidad | 78.00 € | esencial | 72.80 € | -7 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | Heymondo Top | 118.78 € | completo | 104.80 € | -12 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | Heymondo Premium | 140.24 € | total | 135.20 € | -4 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | IATI Estándar | 80.17 € | esencial | 72.80 € | -9 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | IATI Estrella | 153.25 € | total | 135.20 € | -12 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | InterMundial Totaltravel mini | 71.28 € | esencial | 72.80 € | +2 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | InterMundial Totaltravel | 99.98 € | completo | 104.80 € | +5 % |
| Victoria, 7/11/2026 | mundo | 8 | 2 | InterMundial Totaltravel premium | 140.76 € | total | 135.20 € | -4 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | Heymondo Esencial | 42.29 € | esencial | 54.85 € | +30 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | Heymondo Tranquilidad | 57.00 € | esencial | 54.85 € | -4 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | Heymondo Top | 79.48 € | completo | 76.90 € | -3 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | Heymondo Premium | 101.82 € | total | 99.60 € | -2 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | IATI Estándar | 58.03 € | esencial | 54.85 € | -5 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | IATI Estrella | 111.78 € | total | 99.60 € | -11 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | InterMundial Totaltravel mini | 69.21 € | esencial | 54.85 € | -21 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | InterMundial Totaltravel | 83.26 € | completo | 76.90 € | -8 % |
| Victoria, 7/11/2026 | usa_canada | 11 | 1 | InterMundial Totaltravel premium | 134.99 € | total | 99.60 € | -26 % |
