# PortCodex — Brief de la landing

Documento para alimentar a Claude Design. Define **qué** dice la página y **con
qué reglas**; el diseño se resuelve después sobre esta base.

---

# PARTE 1 — BASES DE MARCA (pegar tal cual)

## Dirección visual

**Institutional Editorial.** 65 % institución financiera · 20 % composición
editorial · 15 % producto tecnológico.

Principio rector: **tecnología invisible**. La tecnología se percibe por la
calidad de la información y de la interfaz, nunca por una estética tecnológica
evidente. La sofisticación procede del orden, el espacio y la tipografía.

## Color

```
FONDO
Obsidian          #070B12   fondo general
Deep Navy         #0C1420   bandas y paneles
Elevated Navy     #111C2B   tarjetas
Surface           #162232   controles, tarjetas interiores

MARCA
Institutional Blue #2F6BFF  ÚNICO color de marca — acciones, enlaces, gráficos
Blue Hover        #4B7DFF
Blue Soft         #172A52   fondos de chip y navegación activa
Codex Cyan        #18BFD0   acento EXCEPCIONAL — sincronización, datos en vivo

SEMÁNTICOS (solo estado, nunca decoración)
Positivo          #19B77A   ganancias, confirmaciones
Negativo          #F0646F   pérdidas, errores
Advertencia       #F0A43C   avisos fiscales

TEXTO
Principal         #F3F6FA
Secundario        #A5B1C2
Terciario         #7D8B9E
Slate             #475467   SOLO filos y elementos — nunca texto
```

**Proporción:** 70 % fondos oscuros · 20 % textos y neutros · 8 % azul · 2 % cian.

**Tres reglas que no se saltan:**
1. El azul de marca **se rellena, no se escribe**. Como tinta usa `#8AA8FF`.
2. Sobre el relleno azul, **blanco puro** (`#FFFFFF`) — es la única excepción a
   «nunca blanco puro», y es por contraste medido.
3. El **verde nunca es color de acción**. Solo resultados positivos.

## Tipografía

**Public Sans** para todo. **IBM Plex Mono** solo en direcciones de wallet,
hashes e identificadores — jamás en titulares, claims ni botones.

```
Titular       600 · 56px · line-height 1.02 · letter-spacing -0.035em
Título página 600 · 30px · 1.1  · -0.025em
Título sección 600 · 21px · 1.2 · -0.015em
Cuerpo        400 · 15px · 1.5  · -0.005em
Botones/nav   500 · 14px ·      · -0.01em
```

Cifras: `font-variant-numeric: tabular-nums lining-nums`. Formato español:
`11.188,67 US$`.

**Radios:** 6 controles · 8 botones · 10 tarjetas · 12 paneles · 14 modales.

## Prohibido

Ondas de puntos · partículas · redes de nodos · rejillas futuristas · neón ·
resplandores azules · hologramas · degradados azul-cian · fondos espaciales ·
monedas 3D · robots · cerebros digitales · estética hacker · estética de IA ·
tipografía monoespaciada decorativa · mayúsculas con tracking abierto ·
promesas de rentabilidad.

## Voz

Institución financiera contemporánea que domina la tecnología pero **no necesita
demostrarlo**. Clara, serena, precisa, pedagógica.

Evitar en titulares: *blockchain, on-chain, DeFi, Web3, protocolos*. Usar cuando
aporten precisión, nunca como reclamo.

> ❌ «Tecnología blockchain para gestionar todas tus posiciones on-chain»
> ✅ «Una visión clara y consolidada de tu patrimonio digital»

---

# PARTE 2 — QUÉ VENDE ESTA PÁGINA

## El diferenciador real

Casi todos los competidores **muestran saldos**. PortCodex **lleva la
contabilidad**: registra cada operación, calcula el rendimiento real, traslada
el coste de adquisición y deja la información fiscal preparada.

Esa es la frase que debe quedar: **no es un visor de carteras, es un libro de
cuentas que se escribe solo.**

## El argumento, en una línea

Tienes el patrimonio repartido entre wallets, redes y protocolos. Sabes lo que
tienes, pero no lo que has ganado de verdad, ni lo que debes declarar.
PortCodex lo lee, lo ordena y lo explica.

## A quién le habla

Gestores patrimoniales y sus clientes, inversores con posiciones repartidas,
asesores fiscales, family offices. Gente que ya tiene el dinero: no hay que
convencerla de invertir, sino de **entender lo que ya tiene**.

---

# PARTE 3 — ESTRUCTURA DE LA PÁGINA

Nueve secciones, con scroll. Cada una responde a una pregunta.

---

## 1 · APERTURA — «¿qué es esto?»

**Titular**
> Tu patrimonio digital, bien explicado.

*Alternativas:* «Una visión clara de tu patrimonio digital» · «Todas tus
posiciones. Una única lectura».

**Entradilla**
> PortCodex reúne tus posiciones, mantiene la contabilidad al día y anticipa el
> impacto fiscal de cada operación.

**Acciones:** `Solicitar acceso` (relleno azul) · `Ver cómo funciona` (terciario).

**Pie de sección:** Claridad · Control · Trazabilidad

**Movimiento:** ninguno decorativo. Si acaso, la interfaz real del producto
entrando desde abajo, en reposo. Nada de fondos animados.

**Referencia:** BlackRock — titular enorme, muchísimo aire, cero adorno.

---

## 2 · EL PROBLEMA — «¿por qué me importa?»

**Título**
> El patrimonio está repartido. La información, también.

**Cuerpo**
> Cada wallet cuenta una parte. Cada protocolo, otra. Y ninguna suma el total,
> ni distingue lo que has ganado de lo que solo has movido de sitio.

**Tres apuntes** (frases cortas, con un dato o un icono lineal):
- Saldos en varias redes que nunca se suman solos.
- Rendimiento y capital mezclados en la misma cifra.
- Operaciones sin registrar cuando llega la declaración.

**Movimiento:** los tres apuntes aparecen escalonados al entrar en pantalla.
Desplazamiento mínimo, sin rebote.

**Referencia:** Coinbase — el problema en una frase, sin dramatizar.

---

## 3 · LA LECTURA — «¿cómo lo resuelve?»

**Título**
> Se conecta, lee y ordena. Sin que tengas que apuntar nada.

**Tres pasos numerados:**

**01 · Conectas tus wallets**
Solo lectura. PortCodex nunca puede mover fondos.

**02 · Lee tus posiciones**
Wallets, pools de liquidez, staking y préstamos, en varias redes.

**03 · Mantiene el libro al día**
Cada aportación, retirada, rendimiento y cierre queda registrado en su sitio.

**Movimiento:** los tres pasos se encadenan al hacer scroll. **Esta es la
sección donde sí conviene mover algo**: una línea fina azul que recorre los tres
pasos según avanzas. Sobria, no decorativa.

**Referencia:** Revolut — pasos numerados grandes, mucho espacio entre ellos.

---

## 4 · EL PRODUCTO — «enséñamelo»

**Título**
> El patrimonio, en una sola pantalla.

**Contenido:** captura **real** del dashboard. Sin marco de navegador falso, sin
perspectiva 3D, sin sombras exageradas. Un filo fino y ya.

Alrededor, tres o cuatro llamadas señalando piezas reales:
- Valor total y su evolución
- Reparto por tipo de posición
- P&L separado del capital aportado
- Rendimiento pendiente de reinvertir

**Movimiento:** aquí es donde **el producto se mueve**, no el fondo. Las cifras
cuentan hasta su valor al entrar en pantalla; el gráfico se dibuja de izquierda
a derecha. Una vez. Sin bucles.

**Referencia:** Robinhood — el producto ocupa el centro y es el héroe.

---

## 5 · LA CONTABILIDAD — «esto es lo que nadie más hace»

**La sección más importante de la página.**

**Título**
> No solo ve tus posiciones. Lleva tus cuentas.

**Cuerpo**
> Un visor de carteras te dice cuánto tienes. PortCodex registra cómo has
> llegado hasta ahí: qué aportaste, qué rindió, qué movimiento fue solo un
> cambio de sitio y cuál fue una operación real.

**Cuatro piezas** (tarjetas sobrias, título + una línea):
- **Capital y rendimiento, separados.** El dinero que metes no se confunde con
  lo que genera.
- **Los movimientos internos no inflan las cifras.** Pasar de una posición a
  otra cambia el sitio, no el patrimonio.
- **El coste de adquisición viaja.** Cuando rotas una posición, su base
  contable la acompaña.
- **Cierres detectados solos.** Al cerrar una posición, el capital vuelve a su
  wallet y el libro lo refleja.

**Movimiento:** una animación pequeña y clara — dos columnas, *Capital* y
*Rendimiento*, que se separan. Es un concepto abstracto: merece una explicación
visual, no un adorno.

**Referencia:** BlackRock/Aladdin — explicar algo complejo con tipografía y
orden, no con ilustraciones.

---

## 6 · LO FISCAL — «¿y Hacienda?»

**Título**
> La información fiscal, preparada antes de que la necesites.

**Cuerpo**
> Cada operación queda clasificada según su tratamiento. Consulta el resultado
> del ejercicio en cualquier momento del año, no en abril.

**Puntos:**
- Ganancias y pérdidas calculadas por FIFO, en euros al cambio del día.
- Rendimientos y permutas identificados según su naturaleza.
- Resumen por casillas del Modelo 100.
- Exportación para tu asesor.

**Tono:** prudente. Informa, **no promete** ni asusta. Nada de «no tengas
sorpresas con Hacienda».

**Aviso obligatorio, en pequeño:** *PortCodex organiza la información fiscal de
tus operaciones. No sustituye el criterio de un asesor.*

**Movimiento:** ninguno. Esta sección debe sentirse un documento.

---

## 7 · PARA GESTORES — «yo llevo carteras de otros»

**Título**
> Varias carteras. Un solo sitio.

**Cuerpo**
> Supervisa las carteras que gestionas, cada una con su propia lectura,
> contabilidad e informes. Tus clientes acceden solo a la suya.

**Puntos:** perfiles diferenciados · informes por cliente · trazabilidad de cada
operación.

**Referencia:** BlackRock — hablar a profesionales sin bajar el registro.

---

## 8 · CONFIANZA — «¿me puedo fiar?»

**Título**
> Solo lectura. Siempre.

**Cuatro garantías:**
- **PortCodex nunca puede mover tus fondos.** Solo lee direcciones públicas.
- **Sin claves privadas.** No se piden, no se guardan, no hacen falta.
- **Tus datos son tuyos.** Cada cartera está aislada de las demás.
- **Todo movimiento es trazable.** Cada apunte enlaza con su operación real.

**Sin usar el miedo como argumento.** Es una afirmación de solidez, no una
advertencia.

**Referencia:** Coinbase — la seguridad como sección propia, en positivo.

---

## 9 · CIERRE

**Titular**
> Empieza por saber exactamente qué tienes.

**Acción:** `Solicitar acceso`

**Pie:** logo · descriptor · aviso legal · privacidad · contacto.

---

# PARTE 4 — MOVIMIENTO: LA REGLA

Se mueve **el producto**, nunca el decorado.

**Sí:**
- Cifras que cuentan hasta su valor, una vez, al entrar en pantalla.
- Gráficos que se dibujan al aparecer.
- Contenido que entra con un desplazamiento corto y se para.
- Una línea fina de progreso en la sección de pasos.
- Transiciones de 200-300 ms, sin rebote.

**No:**
- Fondos animados, partículas, ondas, degradados en movimiento.
- Elementos que se repiten en bucle.
- Paralaje pronunciado.
- Nada que siga moviéndose mientras se lee.

Todo debe respetar `prefers-reduced-motion`.

---

# PARTE 5 — QUÉ TOMAR DE CADA REFERENCIA

| Referencia | Qué copiar | Qué NO copiar |
|---|---|---|
| **BlackRock** | Autoridad institucional, titulares enormes, aire, la información como protagonista | Su frialdad; PortCodex explica más |
| **Coinbase** | Estructura limpia por secciones, la seguridad como bloque propio, lenguaje sencillo | Su color y su tono de consumo masivo |
| **Robinhood** | Cifras grandes como elemento visual, el producto de héroe | Su ligereza; aquí se gestiona patrimonio |
| **Revolut** | Tipografía con carácter, pasos numerados, ritmo al bajar | Sus bloques de color saturado y el brillo premium |

**El punto de equilibrio:** la sobriedad de BlackRock con la claridad de
Coinbase. Si dudas entre impresionar y explicar, **explica**.

---

# PARTE 6 — REGLAS DE COMPOSICIÓN

- Ancho útil **1200 px**, párrafos que no pasen de **68 caracteres**.
- Espaciado en escala de 4 px. Entre secciones, **96-128 px**.
- **Pocos elementos por pantalla.** Si una sección tiene más de una idea,
  divídela.
- Jerarquía por **superficie y espacio**, no por bordes. No todas las tarjetas
  necesitan filo.
- Las cifras mandan por **escala y posición**, nunca por efectos.
- Alineación a la izquierda salvo en la apertura y el cierre.
- Separadores finos (1 px) en lugar de cajas.
- Un solo acento por pantalla: si hay dos azules compitiendo, sobra uno.
