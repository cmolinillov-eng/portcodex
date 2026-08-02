# Cómo se lleva una maqueta a código

Documento de trabajo. Lo lee cualquiera —persona o agente— antes de implementar
una de las ocho pantallas de `web/design/`.

## Regla número uno: la maqueta manda

Las medidas se **leen del HTML**, no se estiman a ojo ni se sacan del brief.

```bash
sed -n '60,120p' web/design/02-cartera.html
```

El brief decía cuerpo de 15 px. El real son 13 px, con 119 usos de 11 px. Cuando
brief y maqueta discrepan, gana la maqueta: es lo que se aprobó mirándolo.

Las maquetas se dibujaron dentro de un lienzo de **1240 px exactos**
(`<doc-page content-width="1240px">`). En código eso lo resuelven `TopNav` y
`PageShell`; no lo repitas a mano.

**Dos excepciones donde el código se aparta de la maqueta a conciencia**, porque
las maquetas se contradicen entre sí y el producto tiene que ser uno solo:

- **Margen lateral: 48 px, no 64.** Resumen usa 64 y las otras seis usan 48
  (Cartera mezcla 64 en la barra con 48 en el contenido, que es un descuadre
  suyo). Gana 48. Si el margen cambiara al navegar, la página daría un salto
  entre secciones.
- **Interlineado `normal`, no el 1.5 de Tailwind.** Las maquetas no fijan
  `line-height`. El preflight sí, y engordaba cada fila un 25 % — una fila de
  movimientos medía 89 px contra los 58 de la maqueta. Lo corrige la clase
  **`.pcx-screen`**, que va en el `<div>` raíz de cada pantalla nueva. **Ponla
  siempre**; sin ella tu pantalla saldrá un 25 % más alta que su maqueta.

## Verificar antes de dar nada por hecho

Existe `/preview`, que pinta las pantallas con los datos exactos de la maqueta y
**sin sesión**. Es el banco de pruebas: si el componente pinta esos datos y no se
ve como la maqueta, el fallo está en el componente.

1. `preview_start` con `{name: "portcodex-dev"}`, y navega a `/preview/<pantalla>`.
2. Compara contra la maqueta abriéndola en otra pestaña:
   `file:///…/web/design/0X-….html`.
3. Mide con `javascript_tool` (`getBoundingClientRect`, `getComputedStyle`) en vez
   de fiarte de la captura: a 800 px de ancho la captura engaña con los colores.
4. `npx tsc --noEmit` y `npx eslint <tus archivos>` antes de dar por terminado.

Los avisos de `dashboard-client.tsx`, `DashboardHeader.tsx`,
`StrategyComposition.tsx` y `currency-context.tsx` son **previos**, no tuyos.

## Piezas que ya existen — úsalas, no las repitas

| Pieza | Dónde | Para qué |
|---|---|---|
| `TopNav` | `components/shell/TopNav.tsx` | Barra superior. `basePath` para gestor vs cliente. |
| `PageShell`, `DataProvenance` | `components/shell/PageShell.tsx` | Ancho de página y pie de procedencia. |
| `Section`, `SectionHeading` | `components/shell/SectionHeading.tsx` | Título + nota de contexto + controles. |
| `DataTable`, `DataRow`, `Cell`, `AmountCell`, `StackedCell` | `components/dashboard/DataTable.tsx` | Todas las tablas. Sin tarjeta contenedora. |
| `StackedShareBar`, `SeriesSwatch`, `rankColor` | `components/dashboard/StackedShareBar.tsx` | Barras de reparto. |
| `PortCodexLogo` | `components/brand/portcodex-logo.tsx` | Único sitio desde el que se pinta la marca. |

Los colores, tamaños y radios salen de los tokens de `app/globals.css`
(`--text-body`, `--faint`, `--line`, `--profit`…). **Nunca cablees un
hexadecimal** salvo que la maqueta use uno que no tiene token — y en ese caso,
añade el token.

## Escala tipográfica real

| Token | px | Dónde |
|---|---|---|
| `--text-hero` | 60 | Patrimonio total. Solo en Resumen. |
| `--text-display` | 46 | Cifra de cabecera de otras pantallas. |
| `--text-page` | 31 | |
| `--text-section` | 17 | Cifras destacadas de panel lateral. |
| `--text-lead` | 15 | Títulos de sección (`h2`), cifras de red. |
| `--text-body` | 13 | **El cuerpo.** Filas de tabla, navegación. |
| `--text-label` | 12 | Etiquetas, notas de contexto, cabeceras de tabla. |
| `--text-meta` | 11 | Segunda línea de celda, ejes, pie de procedencia. |
| `--text-micro` | 9 | Casi nada. |

## Reglas de diseño que costó afinar

Salieron de iterar contra el cliente. Aplícalas desde el principio.

1. **Contenido centrado VERTICALMENTE** en celdas cuando la fila tiene alturas
   desiguales (`DataRow align="center"`). Es lo que salva la fila de lending,
   que mide 5 líneas mientras las demás miden 2. Con celdas de una línea,
   `baseline`.
2. **Ninguna columna invade a la siguiente.** El hueco lo fija la maqueta y varía
   por pantalla — medido: **Resumen 20 px, Cartera 12 px, Movimientos 24 px**.
   Lo que no varía es que las columnas lleven un ancho MÍNIMO
   (`minmax(92px, 1fr)`) que impide el choque cuando una cifra se alarga.
   Compruébalo midiendo, no mirando.
3. **Texto a la izquierda, cifras a la derecha.** Las cuatro tablas comparten la
   MISMA rejilla en las columnas comunes.
4. **Decimales según el valor de la unidad**: 2 en stablecoins, hasta 6 solo
   cuando la unidad lo exige (`0,025986 BTC`). **Nunca ceros de relleno.**
5. **Etiqueta y valor en la misma línea** cuando el ancho aprieta
   (`17,35 US$ sin reclamar`).
6. **Una sola cifra protagonista por pantalla.** En Resumen manda el patrimonio
   (60 px); en las demás la cabecera es menor (46 px).
7. **Tablas sin tarjeta contenedora.** Título, filo, filas.
8. **Categorías vacías se resuelven en UNA línea de texto** en la nota del
   encabezado, no ocupando una tabla a cero.
9. **Solo se señala la EXCEPCIÓN.** Las insignias que aparecen en todas las filas
   no informan. Lo anómalo, en ámbar.
10. **Categoría fiscal como TEXTO, no como chip de color.** Trece chips
    convierten la tabla en un semáforo. «No imponible» en terciario.
11. **Movimientos agrupados por día**, con la fecha como separador de grupo, no
    repetida en cada fila. Como un extracto bancario.
12. **En lending, colateral y deuda SEPARADOS**, etiqueta encima de cada grupo y
    la deuda en rojo con signo. Confundirlos hace creer al cliente que tiene un
    48 % más de lo que tiene. «Valor actual» es «Valor neto».
13. **Barra de riesgo bajo el nombre del activo**: rango de precios en pools,
    factor de salud en lending. Misma convención: *si hay barra, es riesgo*.
14. **Todas las posiciones muestran P&L, también los pools.**

## Color: lo que está prohibido

- El **azul de marca** (`--accent-primary`) **nunca** significa rentabilidad
  positiva. Eso es `--profit`.
- El **cian** (`--accent-secondary`) está reservado a sincronización y datos en
  vivo. El punto que late en la cabecera es el ÚNICO elemento animado del
  producto.
- **Nunca blanco puro**, salvo texto sobre el relleno azul (`--text-on-accent`):
  ahí es el único que pasa el AA.
- `--slate` es color de ELEMENTO (filos, series de gráfico), no de texto: como
  tinta da 2,6:1.
- **Nada de monoespaciada en las cifras.** IBM Plex Mono es solo para wallets,
  hashes e identificadores. Las cifras van en Public Sans con `tabular-nums`.
- Queda **derogado** el verde `#6FAE8F` y sus `rgba(111,174,143,…)`. Si te lo
  encuentras en un archivo que tocas, cámbialo por el token.

## Rampas neutras

- **Estrategias** (`--section-wallet/lending/staking/lp`): tono FIJO por
  estrategia. Son cuatro y el conjunto está cerrado. Si dependiera del orden,
  una categoría cambiaría de color al abrirse otra y el cliente lo leería como
  un cambio real.
- **Redes** (`rankColor(i)`): por RANGO, de mayor a menor peso. El conjunto es
  abierto y no cabe inventar un tono cada vez que se añade una red.

Ninguna de las dos usa azul ni cian: en la barra de composición competirían con
la cifra de patrimonio y con la línea del gráfico.

## Datos

`getDashboardData()` (`lib/dashboard/get-dashboard-data.ts`) es el **núcleo
financiero**. Devuelve `summary`, `sections`, `harvestByPosition`,
`recentActivity`, `pricesBySymbol`, `fxRates`, `viewer`, `portfolioContext`.

**No se toca su lógica al implementar diseño.** Si una cifra sale mal, es un
error de contabilidad y se arregla aparte, con su propia verificación. La
invariante que debe cumplirse siempre:

> Total Depositado == Σ deposited de todas las posiciones

El formateo vive en `lib/format/figures.ts`. No formatees a mano en cada
componente: los decimales tienen reglas (punto 4) y deben ser iguales en las
ocho pantallas.

---

## Pantallas estrechas — decidido el 2026-07-30

Las ocho maquetas se dibujaron a 1240 px fijos y no cubren el móvil. La decisión
de producto fue: **el cliente entra desde el móvil y desde el ordenador**, así
que todo lo que ve un cliente se adapta; lo que solo ve un gestor, no.

### La regla

**Una fila deja de ser una fila y pasa a ser una FICHA.** Las columnas no se
estrechan hasta romperse: se reapilan, y cada dato recupera la etiqueta que en
escritorio vive en la cabecera de la tabla. Una tabla de seis columnas
comprimida a 390 px no se lee; seis pares de «etiqueta: valor», sí.

Dos cortes, no cinco: **< 900 px** ficha · **≥ 900 px** tabla.

### Cómo se hace, con estilos en línea

Los componentes están escritos con `style={{…}}`, que **no admite media
queries**. El mecanismo:

```tsx
<div className="grid pcx-grid" style={{ ["--pcx-cols" as string]: GRID }}>
  <span data-label="Depositado">…</span>
</div>
```

El componente declara su rejilla de escritorio en `--pcx-cols` y `globals.css`
decide qué hacer en estrecho. `data-label` es lo que la celda enseña al
apilarse. **Un solo mecanismo para las cuatro tablas y para las filas de
Informes** — si te ves escribiendo una regla nueva para una tabla concreta,
párate: probablemente basta con `pcx-grid`.

Clases de apoyo: `pcx-grid-head` (cabecera que desaparece),
`pcx-stack-narrow` (dos bloques que se apilan), `pcx-cols-narrow` (rejilla a una
columna), `pcx-hero-figure` (la cifra grande encoge), `pcx-nav-inner` (las cinco
secciones bajan a su propia línea).

### Excepciones deliberadas

- **Administración y Editar usuario** no se adaptan. Nadie cambia los permisos
  de un usuario desde el móvil, y fingir que sí es trabajo tirado.
- **`/preview/informe-fiscal` NO se adapta y es correcto.** La hoja mide 794 px
  porque son 210 mm a 96 dpi: es un A4. Un documento de papel se desplaza en el
  móvil como en cualquier visor de PDF. Si alguien lo «arregla», romperá la
  paginación del informe.

### Cuidado con el servidor de desarrollo

`next dev` puede quedarse con `globals.css` **congelado**: los cambios nuevos no
llegan al navegador y las medidas salen buenas contra una hoja vieja. Si una
regla está en el fichero pero no en el navegador, reinicia el servidor antes de
seguir depurando. Para comprobarlo:

```js
[...document.styleSheets].flatMap(h => [...h.cssRules])  // ¿está tu clase?
```
