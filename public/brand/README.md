# Activos de marca — PortCodex

Carpeta única de la que se toman **siempre** el logo y sus variantes. Nada de
logos sueltos en componentes ni copias en otras rutas.

Al estar bajo `public/`, cualquier archivo aquí se sirve tal cual:
`/brand/logo/portcodex-symbol.svg`, por ejemplo.

## Qué debe vivir aquí

```
public/brand/
├── brand-board.png            ← el tablero de marca (referencia visual maestra)
├── logo/
│   ├── portcodex-lockup.svg           símbolo + PortCodex          (versión principal)
│   ├── portcodex-lockup-descriptor.svg  + descriptor               (versión corporativa)
│   ├── portcodex-symbol.svg           solo símbolo                 (versión reducida)
│   ├── portcodex-mono-light.svg       monocroma sobre oscuro
│   ├── portcodex-mono-dark.svg        monocroma sobre claro
│   ├── app-icon.svg                   icono de aplicación
│   └── favicon.svg
└── fonts/
    └── (vacía: Public Sans e IBM Plex Mono vienen de Google Fonts)
```

## Pendiente de aportar

1. **`brand-board.png`** — guarda aquí la imagen del tablero de marca. Es la
   referencia maestra de la que salen todas las piezas.
2. **Los SVG del logo.** El propio plan (§7) lo dice: *"el símbolo definitivo
   deberá redibujarse vectorialmente; la imagen generada representa una
   dirección conceptual, no debe utilizarse como archivo final de marca."*
   Hasta que existan los vectores, la aplicación no usa ningún logo de imagen.
3. **Tipografías**: nada pendiente. Public Sans (marca y producto) e IBM Plex
   Mono (solo datos técnicos) se cargan desde Google Fonts en
   `src/app/layout.tsx`. La carpeta `fonts/` queda por si algún día entra una
   fuente con licencia propia.

## Reglas que no se negocian

- El nombre se escribe **PortCodex** (dos mayúsculas internas). Nunca
  PORTCODEX, portcodex ni Port Codex.
- Una sola tinta. Sin degradados, sin sombras, sin resplandores.
- No colorear "Port" y "Codex" de forma distinta.
- El descriptor *Inteligencia patrimonial para activos digitales* **no** forma
  parte inseparable del logo: fuera de barra lateral, favicon y navegación.
- Área de seguridad alrededor equivalente a la altura de la "P".
- Por debajo de 120 px de ancho, solo el símbolo.

## Cómo se pinta la marca en la aplicación

Siempre desde `src/components/brand/portcodex-logo.tsx`. Ninguna página compone
el nombre a mano — así el kerning, la caja y el color viajan juntos y no vuelve
a colarse un "PORTCODEX" o un "Portcodex".

```tsx
<PortCodexLogo variant="principal" tone="sobre-oscuro" size={22} />
```

**Variantes** (por orden de preferencia): `principal` (símbolo + nombre, sin
descriptor) · `simbolo` (cuando la marca ya se reconoce) · `corporativo`
(+ descriptor, solo en material explicativo).

**Tintas:** `sobre-oscuro` · `sobre-claro` · `mono-claro` · `mono-oscuro` ·
`azul`. La monocromática no depende del acento cian.

Cuando exista `logo/portcodex-symbol.svg`, basta con rellenar el componente
`Symbol` de ese archivo: toda la aplicación lo hereda de golpe.

## El logo sobre fotografía

El plan permite fotografía (arquitectura, materiales, entornos financieros) pero
no decía qué hacer con la marca encima. Sin regla, alguien acabará poniendo el
azul sobre una imagen con poco contraste.

**Sobre fotografía, siempre monocromo blanco** (`tone="mono-claro"`), nunca la
versión azul. Si la zona de la imagen es clara o muy movida, se asienta el logo
sobre un rectángulo obsidiana con opacidad — nunca una sombra ni un resplandor
alrededor de las letras.

## Contrastes medidos (WCAG 2.1)

No son estimaciones: están calculados contra las cuatro superficies del sistema.

| Tinta | Obsidiana | Tarjeta #162232 | Veredicto |
|---|---|---|---|
| Texto principal `#F3F6FA` | 18,2:1 | 14,8:1 | AAA |
| Secundario `#A5B1C2` | 9,1:1 | 7,4:1 | AA |
| Terciario `#7D8B9E` | 5,7:1 | 4,6:1 | AA |
| **Slate `#475467`** | **2,6:1** | **2,1:1** | ❌ **nunca como texto** |
| **Azul marca `#2F6BFF`** | **4,4:1** | **3,6:1** | ⚠️ **solo relleno, no tinta** |
| Azul claro `#8AA8FF` | 8,6:1 | 7,0:1 | AA — este es el azul para TEXTO |
| Positivo `#19B77A` | 7,6:1 | 6,2:1 | AA |
| Negativo `#F0646F` | 6,3:1 | 5,2:1 | AA |

**Tres reglas que salen de la tabla:**
1. **Slate es color de elemento, no de tinta**: filos, separadores y series
   neutras de gráfico. Para texto secundario, `--muted`.
2. **El azul de marca se rellena, no se escribe.** Como tinta usa `--brand-soft`
   `#8AA8FF`.
3. **Sobre el relleno azul, blanco puro.** Es la única excepción a "nunca blanco
   puro": da 4,50:1 —el AA exacto— y `#F3F6FA` se quedaría en 4,15:1, que no
   pasa. Está en el token `--text-on-accent`.

El terciario se aclaró de `#718096` a `#7D8B9E`: el valor original caía a 4,0:1
sobre las tarjetas, justo donde viven fechas y metadatos, que son texto pequeño.

## Ritmo (escala de espaciado)

La identidad no definía espaciado, y en un producto denso en datos pesa tanto
como el color. Está en `globals.css` como `--space-1` … `--space-12` (base 4 px),
más `--measure-text` (68ch), `--measure-lead` (52ch) y `--shell-max` (1200px)
para que las líneas no se estiren sin límite.

## Nota sobre lo subido (27/07)

En `referencias/` hay seis **mockups de rótulo luminoso** y el tablero de marca.
Son material de presentación, **no activos de marca**: llevan el fondo gris
incrustado y un halo azul de neón que el propio plan prohíbe (§16-17). Sirven
para enseñar la marca en una propuesta; nunca para la aplicación.

`logo/` sigue vacía a la espera del **SVG del símbolo**, que es lo único que
falta para que la marca aparezca en el producto.
