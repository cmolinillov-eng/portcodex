# PortCodex — Brief del dashboard

Documento para rediseñar la aplicación desde cero con Claude Design. Recoge
**qué información existe** y **con qué reglas debe presentarse**. El diseño
actual no es referencia: se parte de blanco.

Las bases de marca (color, tipografía, ritmo, prohibiciones) están en
`LANDING-BRIEF.md`, Parte 1. Se aplican igual aquí.

---

# PARTE 1 — QUÉ ESTÁ MAL HOY

Diagnóstico del panel actual, para no repetirlo.

1. **Cajas anidadas hasta tres niveles.** Tarjeta dentro de tarjeta dentro de
   panel. Es la firma del dashboard de plantilla. Las plataformas serias usan
   **filas, filos finos y espacio**, no contenedores.
2. **Cifras en monoespaciada.** Un patrimonio en fuente de terminal se lee como
   consola de servidor. Ningún banco lo hace.
3. **Mayúsculas con tracking abierto** en cada etiqueta. Estética técnica que la
   identidad prohíbe expresamente.
4. **Sin protagonista único.** El patrimonio compite con un gráfico circular del
   mismo peso, que además repite en su centro un dato ya visible al lado.
5. **Espacio gastado en ceros.** Categorías al 0,00 % ocupando lo mismo que las
   que tienen dinero.
6. **Iconos sin etiqueta.** Seis acciones que solo se descubren pulsando.
7. **Dos barras laterales distintas** (general y fiscal) para la misma
   aplicación: hace pensar que son dos productos.
8. **Redundancia**: el panel «en vivo» repite el contenido de las tablas.

**Lo que sí funciona y hay que conservar: los DATOS.** La información
disponible —TWR, drawdown, depositado frente a valor, rendimiento separado en
cobrado/sin reclamar/sin usar, trazabilidad fiscal por casilla AEAT— es más rica
que la de la mayoría de plataformas del sector. El problema nunca fue **qué** se
muestra, sino **cómo**.

---

# PARTE 2 — INVENTARIO DE INFORMACIÓN

Todo lo que existe hoy y debe seguir existiendo. Agrupado por naturaleza, no por
pantalla.

## A · Cabecera patrimonial

| Dato | Ejemplo | Notas |
|---|---|---|
| Valor total del patrimonio | `11.191,30 US$` | **La cifra protagonista** |
| Variación total | `−6,32 %` · `−754,89 US$` | Porcentaje y absoluto |
| Total depositado | `11.946 US$` | Capital aportado desde fuera |
| Rendimiento generado (harvest) | `432 US$` | Total cobrado |
| — sin reclamar | `28,02 US$` | Sigue en el protocolo |
| — cobrado sin reinvertir | `0,00 US$` | Parado en la wallet |
| P&L | `−6,32 %` · `−755 US$` | |
| Fecha de precios | `28/7/2026, 13:30:09` | Antigüedad del dato |
| Cliente y gestor | `M Fita` · `Carlos Molinillo` | |

## B · Composición de la cartera

Cuatro categorías con valor y porcentaje: **Wallet (HODL)**, **Liquidity
Pools**, **Staking**, **Lending**. Hoy: 49,35 % / 50,65 % / 0 % / 0 %.

## C · Evolución histórica

| Dato | Ejemplo |
|---|---|
| Serie de valor total | línea |
| Serie de total depositado | línea de referencia |
| Rangos | 7D · 30D · 90D · Todo |
| TWR (Time-Weighted Return) | `+45,85 %` |
| Máxima caída pico a valle | `−10,68 %` |
| P&L del periodo | `4.417,62 US$` · `36,98 %` |
| Nº de snapshots | `27` |
| Detalle por fecha | valor, depositado y P&L de ese día |

## D · Posiciones

Estado de lectura: `11.085,83 US$ · 14 posiciones · 28/7/2026, 13:38:19` y si es
automática.

Por sección (Liquidity Pools, Hold, Staking, Lending), con subtotal y recuento.

Por posición:
- Activo o par · wallet de origen · red
- Estado de contabilización
- Saldo por token
- **Depositado** (editable a mano)
- **Valor actual**
- Asignación sobre el total
- Protocolo
- **Rendimiento**: sin reclamar y cobrado *(pools/staking)*
- **P&L / ROI**: porcentaje e importe *(hold)*
- En pools: rango de precios y si está dentro
- En lending: salud del préstamo

## E · Operaciones detectadas pendientes

Operaciones leídas en cadena que aún no están contabilizadas: tipo, par,
importe, fecha, wallet y la acción de asignarlas o descartarlas.

*(Con la automatización actual esta bandeja está vacía casi siempre: debe
aparecer **solo cuando hay algo**, nunca como sección fija.)*

## F · Actividad

Historial de operaciones contabilizadas: fecha, tipo, activos, protocolo, valor
y la posibilidad de deshacer.

## G · Fiscal

**Resumen del ejercicio**
- Ejercicio y nº de operaciones: `2026 · 52 operaciones`
- **Base del ahorro**: `161,37 €` — ganancias de transmisión/permuta + RCM
- **Base general**: `0,00 €` — airdrops, forks, salario, actividad
- Desglose por casilla del Modelo 100: casilla, categoría, nº operaciones,
  importe agregado y nota explicativa
- Modelo 721 (criptomonedas en exchanges extranjeros)

**Operaciones con detalle fiscal**
Fecha, operación, activos, protocolo, valor en euros y categoría fiscal
(*RCM staking · GP permuta · Pérdida patrimonial · Movimiento LP · No
imponible*). Con filtros por wallet y categoría, búsqueda y exportación.

**Glosario** de términos fiscales.

## H · Transversal

Cambio de divisa (US$ / €), actualizar lectura, exportar, historial, capturar
snapshot, alta de operación manual, gestión de wallets, cambio de portfolio
(para gestores) y cierre de sesión.

---

# PARTE 3 — ESTRUCTURA NUEVA

## Decisión 1 · Una sola navegación

Hoy hay dos barras laterales. Se unifican en **una**, siempre igual:

```
Resumen        ·  el patrimonio de un vistazo
Posiciones     ·  qué tengo y dónde
Actividad      ·  qué ha pasado
Fiscal         ·  qué debo declarar
     Resumen del ejercicio
     Operaciones
     Glosario
Informes       ·  exportar
```

Abajo: cliente activo, gestor y salida. Para gestores, el selector de cartera va
**arriba**, no escondido.

## Decisión 2 · Un solo protagonista por pantalla

En Resumen manda **el valor del patrimonio**. Nada compite con él: ni un gráfico
circular del mismo tamaño, ni cuatro tarjetas iguales alrededor.

## Decisión 3 · Menos cajas, más filas

Las tablas **no van envueltas en tarjetas**. Cabecera discreta, filas separadas
por un filo de 1 px, hover muy sutil. Como Bloomberg, Fidelity o Kraken: el dato
manda, el contenedor desaparece.

---

## PANTALLA 1 · RESUMEN

**Banda superior** (sobre el fondo, sin tarjeta)

```
Patrimonio total
11.191,30 US$                              ← 56-64 px, Public Sans 600
−754,89 US$   −6,32 %                      ← debajo, más pequeño
Precios actualizados hace 8 minutos        ← terciario
```

A la derecha, en la misma banda y con **menos peso**: Depositado · Rendimiento ·
P&L. Tres cifras en fila, separadas por filos verticales finos. **Sin tarjetas.**

**Composición**

En vez del gráfico circular: **una barra horizontal apilada** de ancho completo,
y debajo la leyenda en fila con valor y porcentaje.

Es más legible, ocupa menos, se lee de izquierda a derecha como el texto y
resulta más editorial. **Las categorías al 0 % no aparecen** (o van en una línea
de texto al final: *«Sin posiciones en Staking ni Lending»*).

**Evolución**

El gráfico de valor frente a depositado, a ancho completo. Encima, a la derecha,
los rangos temporales. Debajo, las cuatro métricas —TWR, máxima caída, P&L,
snapshots— **en una fila de texto**, no en cuatro tarjetas.

*Este gráfico es la pieza más «financiera» de la aplicación: merece espacio y
calma.*

**Rendimiento ocioso** *(solo si hay algo)*

Una franja discreta: *«28,02 US$ generados sin reclamar»* con acción para
revisarlo. Si no hay nada pendiente, **no existe**.

**Últimos movimientos**

Cinco filas, sin tarjeta, con enlace a Actividad.

---

## PANTALLA 2 · POSICIONES

**Cabecera**
```
Posiciones
11.085,83 US$ en 14 posiciones · leído hace 3 minutos     [Actualizar] [Wallets]
```

**Bandeja de pendientes** — solo cuando hay algo. Franja ámbar sobria, arriba.

**Secciones** (Liquidity Pools · Hold · Staking · Lending)

Cada una con su título y subtotal en la misma línea:
`Liquidity Pools — 8.973,10 US$ · 3 posiciones`

Y su tabla, **sin tarjeta contenedora**:

| Columna | Alineación | Notas |
|---|---|---|
| Activo | izquierda | par o token en primera línea; wallet y red debajo, terciario |
| Saldo | derecha | cantidades por token |
| Depositado | derecha | editable, el lápiz solo al pasar por encima |
| Valor actual | derecha | **la columna con más peso** |
| P&L | derecha | importe y porcentaje, con signo y color |
| Rendimiento | derecha | sin reclamar / cobrado |
| Protocolo | izquierda | texto plano, sin chip |
| Estado | — | solo si algo **no** está contabilizado |

**Dos reglas importantes:**
- **Quitar la columna de asignación.** Es un porcentaje redundante con la
  composición del resumen y roba espacio a lo que importa.
- **El estado «contabilizada» no se muestra si es lo normal.** Solo se señala la
  excepción. Hoy todas las filas llevan una insignia verde que no informa de
  nada.

En pools, el rango de precios va como **una barra fina bajo el nombre del par**,
con un punto marcando la posición actual. Sin números salvo al pasar por encima.

---

## PANTALLA 3 · ACTIVIDAD

Historial completo. Filtros arriba (wallet, tipo, fechas, búsqueda).

Tabla: fecha · operación · activos · protocolo · valor · categoría fiscal.

**Agrupada por día**, con la fecha como separador de sección — no repetida en
cada fila. Es lo que hacen los extractos bancarios y se lee mucho mejor.

Acción de deshacer accesible pero discreta: aparece al pasar por encima de la
fila.

---

## PANTALLA 4 · FISCAL

**Resumen del ejercicio**

Selector de año arriba, con el nº de operaciones al lado.

Las dos bases, **una junto a otra, sin tarjetas**, separadas por un filo
vertical:

```
Base del ahorro                    Base general
161,37 €                           0,00 €
Ganancias de transmisión y         Airdrops, forks, salario
permuta, rendimientos de capital    y actividad económica
```

Debajo, el desglose por casilla como tabla limpia: casilla · categoría · nº de
operaciones · importe · nota.

**El Modelo 721** como bloque aparte al final.

**Aviso permanente al pie**, en terciario: *«Cálculo orientativo. No sustituye
el criterio de un asesor fiscal.»*

**Operaciones fiscales**

Igual que Actividad, con la categoría fiscal destacada y los filtros por
categoría.

---

# PARTE 4 — CÓMO SE PRESENTAN LAS CIFRAS

Es lo que más distingue a una plataforma financiera seria.

**Tipografía:** Public Sans con `tabular-nums lining-nums`. **Nunca
monoespaciada** — esa queda para direcciones de wallet y hashes.

**Jerarquía por escala, no por color:**
```
Patrimonio total        56-64 px   600
Cifra de sección        30-32 px   600
Cifra en tabla          15-16 px   500
Etiqueta                13 px      500   ← caja normal, NO mayúsculas
```

**Alineación:** todas las cifras a la **derecha**; los textos a la izquierda. En
una columna numérica, la coma decimal debe caer siempre en el mismo sitio.

**El símbolo de moneda pesa menos que la cifra:** más pequeño o en color
secundario. El número manda.

**Los decimales se subordinan:** `11.191,`**`30`**`US$` — parte entera con más
peso. Ya se hace y está bien.

**Signo siempre visible:** `−754,89 US$` y `+6,40 US$`. El color **acompaña**,
pero el signo es quien informa: nadie debe depender del rojo para saber que
perdió.

**Formato español:** punto de millar, coma decimal.

---

# PARTE 5 — REGLAS DE COMPOSICIÓN

1. **Las tablas no van dentro de tarjetas.** Título, filo, filas. Punto.
2. **Filos, no cajas.** 1 px, `rgba(148,163,184,0.12)`. Si dos bloques se
   distinguen por espacio, no necesitan borde.
3. **Etiquetas en caja normal.** Ni mayúsculas ni tracking abierto.
4. **Un acento por pantalla.** Si el botón principal es azul, los iconos de esa
   pantalla no lo son.
5. **El verde solo para resultados positivos.** Jamás para acciones,
   navegación ni estados de «correcto».
6. **Iconos con etiqueta.** Nada de barras de iconos que hay que adivinar.
7. **Densidades distintas.** La cabecera respira; la tabla es densa. Todo con
   el mismo aire es lo que hace que parezca plantilla.
8. **Nada al 0 % ocupa sitio.** Lo vacío se resume en una línea de texto o
   desaparece.
9. **Sin gráficos decorativos.** Cada gráfico responde una pregunta o sobra.
10. **Estados vacíos escritos.** Qué ha pasado, qué significa, qué hacer.

---

# PARTE 6 — MOVIMIENTO

Se mueve **el dato**, nunca el decorado.

**Sí:** el gráfico de evolución se dibuja al cargar (una vez) · las cifras
cuentan al actualizarse tras una lectura · la fila resaltada muy sutilmente al
pasar por encima · transiciones de 200 ms.

**No:** contadores en cada visita · gráficos circulares animándose en bucle ·
elementos que pulsan · fondos con movimiento · paralaje.

Respetar `prefers-reduced-motion`.

---

# PARTE 7 — REFERENCIAS

| Plataforma | Qué tomar |
|---|---|
| **Fidelity / BlackRock** | Densidad de datos sin ruido. Tablas largas y legibles, cero decoración |
| **Revolut** | La cifra principal enorme y sola. Jerarquía brutal entre lo primero y lo demás |
| **Coinbase** | Limpieza y estados vacíos bien resueltos |
| **Kraken / Bybit** | Tablas densas y profesionales, alineación numérica impecable |
| **Robinhood** | El gráfico de evolución como pieza central y tranquila |

**Qué NO tomar:** de Binance y Bybit, su saturación de color y sus tablas
apretadas hasta lo ilegible — son plataformas de *trading*, y esto es
*patrimonio*. El ritmo debe ser más pausado.

---

# PARTE 8 — CÓMO PEDIRLO

**Pantalla a pantalla, no todo de golpe.** Empezar por **Resumen**: fija la
cabecera, la composición y las cifras, y el resto hereda.

Frase a incluir en cada petición:

> Dashboard financiero institucional. Tablas sin tarjetas contenedoras,
> jerarquía por espacio y filos finos, cifras en Public Sans tabular alineadas
> a la derecha, etiquetas en caja normal sin mayúsculas ni tracking. Una sola
> cifra protagonista por pantalla. Sin gráficos decorativos ni iconos sin
> etiqueta.

**Contrastar cada propuesta con la Parte 5.** Si incumple tres reglas o más,
pedir otra en lugar de conformarse.
