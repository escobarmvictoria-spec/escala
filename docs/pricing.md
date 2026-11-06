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
| Europa | 9,5 + 1,10 | 13 + 1,90 | 25 + 2,60 |
| Resto del mundo | 15 + 2,00 | 20 + 3,50 | 30 + 4,40 |
| EE. UU. y Canadá | 15 + 2,55 | 22 + 3,80 | 30 + 5,00 |

## Cómo se calibró

1. Recogí 41 cotizaciones publicadas de Heymondo, IATI, InterMundial, Mapfre y Chapka para un adulto residente en España: Europa (4 y 30 días), EE. UU. (7, 15 y 20 días) y Japón (7, 15 y 30 días). Fuentes en `scripts/market-data.json`.
2. Emparejé cada producto con el plan de Escala equivalente por coberturas: asistencia básica → **Esencial**; asistencia + cancelación o gama media-alta (Heymondo Top) → **Completo**; gama alta (Heymondo Premium, IATI Estrella, InterMundial Totaltravel Premium) → **Total**.
3. Ajusté base y tarifa diaria por zona y plan para que la desviación mediana quedara cerca de 0 y se mantuviera el orden lógico (EE. UU. ≥ resto del mundo ≥ Europa ≥ España en cualquier duración).
4. `npm run calibrate` repite la comparación con la tarifa actual.

**Resultado:** error absoluto medio del 9,6 %. Desviación mediana por zona y plan entre −9 % y +9 %. Completo queda un poco por debajo de Heymondo Top en viajes largos al resto del mundo: es una decisión de posicionamiento (el plan recomendado tiene que ser competitivo donde más se compara).

## Decisiones defendibles

- **Base + tarifa diaria** en lugar de tramos de días: es como se comporta el mercado (un coste fijo de emisión y asistencia más un coste que crece con la exposición) y es fácil de explicar.
- **Esencial con franquicia de 75 €**: permite un precio de entrada competitivo sin recortar la cobertura médica por debajo de 150.000 €.
- **EE. UU. y Canadá aparte**: la sanidad allí es mucho más cara; el mercado español separa esa zona o la encarece.
- **Descuento de grupo del 10 %** (Heymondo aplica un 15 % a familias): suficiente para premiar el viaje en grupo sin regalar margen.

## Cotizaciones de referencia

Fuentes: [Capture the Atlas, Europa](https://capturetheatlas.com/es/seguro-de-viaje-a-europa/) (actualizada el 11/12/2025), [Capture the Atlas, EE. UU.](https://capturetheatlas.com/es/seguro-de-viaje-a-estados-unidos/) (11/12/2025) y [Japonpedia](https://japonpedia.com/cuanto-vale-seguro-viaje-japon/) (17/09/2026).

| Zona | Días | Producto de mercado | Mercado | Plan Escala | Escala | Diferencia |
|---|---:|---|---:|---|---:|---:|
| europa | 4 | Heymondo Solo Asistencia | 10.59 € | esencial | 13.90 € | +31 % |
| europa | 4 | Heymondo Tranquilidad | 14.71 € | esencial | 13.90 € | -6 % |
| europa | 4 | Heymondo Tranquilidad + cancelación | 17.25 € | completo | 20.60 € | +19 % |
| europa | 4 | Heymondo Top | 23.73 € | completo | 20.60 € | -13 % |
| europa | 4 | Heymondo Premium | 32.48 € | total | 35.40 € | +9 % |
| europa | 4 | Heymondo Premium + cancelación | 39.19 € | total | 35.40 € | -10 % |
| europa | 30 | Heymondo Solo Asistencia | 35.04 € | esencial | 42.50 € | +21 % |
| europa | 30 | Heymondo Tranquilidad | 44.05 € | esencial | 42.50 € | -4 % |
| europa | 30 | Heymondo Tranquilidad + cancelación | 52.46 € | completo | 70.00 € | +33 % |
| europa | 30 | Heymondo Top | 70.70 € | completo | 70.00 € | -1 % |
| europa | 30 | Heymondo Top + cancelación | 88.96 € | completo | 70.00 € | -21 % |
| europa | 30 | Heymondo Premium | 97.28 € | total | 103.00 € | +6 % |
| europa | 30 | Heymondo Premium + cancelación | 108.44 € | total | 103.00 € | -5 % |
| usa_canada | 7 | Heymondo Esencial | 26.39 € | esencial | 32.85 € | +24 % |
| usa_canada | 7 | Heymondo Tranquilidad | 30.69 € | esencial | 32.85 € | +7 % |
| usa_canada | 7 | Heymondo Top | 49.00 € | completo | 48.60 € | -1 % |
| usa_canada | 7 | Heymondo Premium | 61.14 € | total | 65.00 € | +6 % |
| usa_canada | 15 | Heymondo Esencial | 45.43 € | esencial | 53.25 € | +17 % |
| usa_canada | 15 | Heymondo Tranquilidad | 53.09 € | esencial | 53.25 € | +0 % |
| usa_canada | 15 | Heymondo Top | 80.17 € | completo | 79.00 € | -1 % |
| usa_canada | 15 | Heymondo Premium | 105.65 € | total | 105.00 € | -1 % |
| usa_canada | 20 | Heymondo Esencial | 54.55 € | esencial | 66.00 € | +21 % |
| usa_canada | 20 | Heymondo Tranquilidad | 63.82 € | esencial | 66.00 € | +3 % |
| usa_canada | 20 | IATI Estándar | 69.16 € | esencial | 66.00 € | -5 % |
| usa_canada | 20 | InterMundial Total Travel Mini | 81.63 € | esencial | 66.00 € | -19 % |
| usa_canada | 20 | Heymondo Tranquilidad + cancelación | 80.00 € | completo | 98.00 € | +23 % |
| usa_canada | 20 | IATI Estándar + cancelación | 91.72 € | completo | 98.00 € | +7 % |
| usa_canada | 20 | InterMundial Total Travel Mini + cancelación | 91.56 € | completo | 98.00 € | +7 % |
| usa_canada | 20 | Heymondo Top | 97.40 € | completo | 98.00 € | +1 % |
| usa_canada | 20 | Heymondo Premium | 124.22 € | total | 130.00 € | +5 % |
| usa_canada | 20 | Mapfre Segurviajes Total | 127.97 € | total | 130.00 € | +2 % |
| mundo | 7 | Heymondo Top | 49.13 € | completo | 44.50 € | -9 % |
| mundo | 7 | IATI Estrella | 53.79 € | total | 60.80 € | +13 % |
| mundo | 7 | InterMundial Totaltravel Premium | 63.25 € | total | 60.80 € | -4 % |
| mundo | 15 | Heymondo Top | 76.16 € | completo | 72.50 € | -5 % |
| mundo | 15 | IATI Estrella | 94.65 € | total | 96.00 € | +1 % |
| mundo | 15 | InterMundial Totaltravel Premium | 107.00 € | total | 96.00 € | -10 % |
| mundo | 30 | Heymondo Top | 142.50 € | completo | 125.00 € | -12 % |
| mundo | 30 | IATI Estrella | 154.20 € | total | 162.00 € | +5 % |
| mundo | 30 | InterMundial Totaltravel Premium | 171.21 € | total | 162.00 € | -5 % |
| mundo | 15 | Gama básica (IATI Estándar, Mondo Esencial), unos 3 €/día | 45.00 € | esencial | 45.00 € | +0 % |
