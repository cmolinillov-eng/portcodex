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
    └── (Söhne, cuando se licencie — ver abajo)
```

## Pendiente de aportar

1. **`brand-board.png`** — guarda aquí la imagen del tablero de marca. Es la
   referencia maestra de la que salen todas las piezas.
2. **Los SVG del logo.** El propio plan (§7) lo dice: *"el símbolo definitivo
   deberá redibujarse vectorialmente; la imagen generada representa una
   dirección conceptual, no debe utilizarse como archivo final de marca."*
   Hasta que existan los vectores, la aplicación no usa ningún logo de imagen.
3. **Söhne** (Klim Type Foundry, licencia comercial). No está en Google Fonts
   y no puede instalarse sin licencia. Cuando la tengas, deja los `.woff2` en
   `fonts/` y actívala en `src/app/layout.tsx`, donde queda el punto de enganche
   documentado. Mientras tanto, titulares e interfaz van en **Inter**.

## Reglas que no se negocian

- El nombre se escribe **PortCodex** (dos mayúsculas internas). Nunca
  PORTCODEX, portcodex ni Port Codex.
- Una sola tinta. Sin degradados, sin sombras, sin resplandores.
- No colorear "Port" y "Codex" de forma distinta.
- El descriptor *Inteligencia patrimonial para activos digitales* **no** forma
  parte inseparable del logo: fuera de barra lateral, favicon y navegación.
- Área de seguridad alrededor equivalente a la altura de la "P".
- Por debajo de 120 px de ancho, solo el símbolo.
