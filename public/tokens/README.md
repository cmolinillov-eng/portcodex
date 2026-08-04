# Logos de token

Los distintivos de las posiciones (`components/dashboard/cartera/TokenAvatar.tsx`)
pintan el logo real del token cuando existe un fichero aquí, y el círculo tintado
con iniciales cuando no.

## Por qué viven en el repositorio y no en un CDN

Si cada navegador pidiera los iconos a un tercero (CoinGecko, Jupiter, cualquier
`.../assets/<mint>.png`), ese tercero vería **qué tokens tiene cada cliente**: la
secuencia de peticiones de un navegador es la composición de una cartera. Es una
fuga de datos de cliente, no un detalle de rendimiento. Empaquetados evitan además
las imágenes rotas y la dependencia de que el CDN siga vivo dentro de tres años.

Por eso el componente **no** consulta el sistema de ficheros ni prueba a cargar y
esperar: lleva una lista explícita de símbolos con logo. Un fichero que falte cae
al círculo de iniciales *antes* de pedirse, no después de fallar.

## De dónde sale cada uno

Ninguno es un binario descargado. Están **redibujados aquí** a partir de la
geometría publicada de cada marca, en un lienzo de 24×24 con el círculo de color
a sangre, para que la silueta y el tamaño sean idénticos al respaldo de iniciales.

| Fichero | Marca | Origen del dibujo |
|---|---|---|
| `btc.svg` | Bitcoin | Símbolo ₿ blanco inclinado 14° sobre círculo `#F7931A`. El logotipo de Bitcoin es de dominio público (liberado por su autor original en bitcointalk, 2010). |
| `eth.svg` | Ethereum | Rombo/octaedro de seis caras de la Ethereum Foundation, con sus opacidades (1 / .6 / .2), sobre `#627EEA`. Geometría del logomark oficial reescalada al lienzo. |
| `weth.svg` | Wrapped Ether | Idéntico a `eth.svg`. WETH es ether envuelto y las listas de tokens le asignan el mismo rombo; darle una marca propia sería inventarla. |
| `sol.svg` | Solana | Las tres barras del logomark de Solana Foundation con su degradado oficial `#9945FF → #14F195`. |
| `usdc.svg` | USDC (Circle) | Círculo `#2775CA`, anillo interior y símbolo `$`, según el logomark de Circle. |
| `usdt.svg` | Tether | Símbolo ₮ —travesaño, asta y elipse— en blanco sobre `#26A17B`. |

Uso **identificativo**: sirven para que el cliente reconozca el activo que tiene,
que es exactamente el uso que las guías de marca de estos proyectos permiten sin
licencia. No se usan para sugerir patrocinio ni relación con PortCodex.

## Qué NO está aquí, y por qué

`PYUSD`, `USDS`, `HYPE`, `JITOSOL`, `JTO`, `CBBTC`, `WBTC`, `KMNO`, `MET`,
`DRIFT`, `BONK`.

De ninguno se pudo partir de una geometría de marca contrastada, y **un logo
aproximado es peor que ningún logo**: afirma una identidad equivocada. Todos
caen al círculo tintado con iniciales, que es el comportamiento correcto, no una
avería. Añadir cualquiera de ellos es meter el SVG aquí con su fila en esta tabla
y su símbolo en `TOKEN_LOGOS` (`TokenAvatar.tsx`).

## Reglas para añadir uno

1. Nombre = símbolo en minúscula (`sol.svg`), el mismo que produce
   `normalizeSymbol()` en `TokenAvatar.tsx` pasado a minúsculas.
2. Lienzo `viewBox="0 0 24 24"` con **círculo de color a sangre** (`r="12"`). El
   fondo del producto es obsidiana `#070B12`: un logo monocromo oscuro sin su
   círculo desaparecería. El círculo lo resuelve dentro del propio fichero.
3. Sin `<script>`, sin referencias externas, sin fuentes: el texto se dibuja como
   trazado o no se dibuja (la CSP del proyecto y el tamaño a 22 px lo exigen).
4. Dar de alta el símbolo en `TOKEN_LOGOS` y añadir su fila arriba.
