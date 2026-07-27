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
