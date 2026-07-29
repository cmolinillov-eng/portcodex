# Maquetas de referencia — Claude Design

Los ocho HTML generados con Claude Design, tal cual se exportan. **No se sirven
ni se despliegan**: son la referencia de la que se implementa.

Están fuera de `public/` a propósito, para que no acaben accesibles en la web.

## Qué debe haber aquí

```
design/
├── 01-resumen.dc.html
├── 02-cartera.dc.html
├── 03-movimientos.dc.html
├── 04-fiscalidad.dc.html
├── 05-informes.dc.html
├── 06-acceso.dc.html
├── 07-administracion.dc.html
└── 08-editar-usuario.dc.html
```

Los nombres numerados son para que el orden de lectura coincida con el de
implementación. Si los exportas con su nombre original, tampoco pasa nada.

## Para qué sirven

De aquí salen los valores EXACTOS que no se pueden deducir de una imagen:
anchos de columna, espaciados, tamaños de fuente por elemento, alturas de fila.
Implementar mirando solo capturas obliga a estimar, y estimar es lo que hace que
el resultado "se parezca" en vez de "ser" el diseño aprobado.

El brief de cada pantalla está en `public/brand/DASHBOARD-BRIEF.md`.

---

## Sistema REAL extraído de las maquetas

Medido sobre los ocho HTML. **Manda esto sobre lo escrito en el brief**: es lo
que se aprobó mirándolo.

### Escala tipográfica realmente usada

| px | Uso | Frecuencia |
|---|---|---|
| 60 | Cifra de patrimonio (Resumen) | 1 |
| 46 | Titular de Acceso | 1 |
| 31 | Cifra de cabecera de pantalla | 4 |
| 17-21 | Títulos de sección | ~10 |
| **13** | **Texto base y celdas de tabla** | **248** |
| **12** | **Etiquetas y secundario** | **166** |
| **11** | **Terciario, notas al pie** | **119** |
| 9-10 | Micro-etiquetas | ~47 |

Ojo: el cuerpo real es **13 px**, no 15 como decía el brief. Y hay mucho 11-12:
es una interfaz **densa**, como corresponde a una herramienta de trabajo diaria.

### Pesos
Solo tres: **400** (cuerpo) · **500** (etiquetas, navegación, celdas) ·
**600** (cifras y títulos). El 500 es el más usado.

### Espaciado
Base de 4 px pero con valores intermedios frecuentes (5, 7, 9, 13, 14). Los
huecos entre elementos relacionados son **7-12 px**; entre bloques, **20-28 px**.

### Medidas de página
- Ancho de contenido: **1240 px**
- Margen lateral: **64 px**
- Altura de la barra de navegación: **56 px**
- Filo estándar: `1px solid rgba(148,163,184,0.12)`

### Colores por frecuencia
`#7D8B9E` (244) y `#A5B1C2` (165) dominan: la interfaz es mayoritariamente
**texto secundario y terciario**. El azul de marca aparece solo **31 veces** en
ocho pantallas — la contención funciona.

Aparecen también los colores de token (`#2775CA` USDC, `#14F195` Solana): son
los logos, y es la excepción consciente.

### Símbolo del logo
Las maquetas usan un monograma **C + P** simplificado (dos trazos y un cuadro
cian), más legible a 22 px que el registro abierto del tablero de marca. Está en
`01-resumen.html`, primeras líneas. **Decidir cuál es el oficial** antes de
implementar el componente de marca.
