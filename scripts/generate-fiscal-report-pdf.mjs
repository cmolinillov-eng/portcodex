#!/usr/bin/env node
/**
 * Genera el PDF del informe fiscal desde la ruta de impresión.
 *
 * NO añade ninguna dependencia: usa el Playwright que ya está en las
 * devDependencies del proyecto para los tests end-to-end. Es una herramienta de
 * verificación y de generación por lotes, no la vía por la que el usuario
 * obtiene su PDF —esa es imprimir desde el navegador, y no necesita nada.
 *
 * Uso:
 *   node scripts/generate-fiscal-report-pdf.mjs                       (preview)
 *   node scripts/generate-fiscal-report-pdf.mjs --url http://…  --out x.pdf
 *
 * Requiere el servidor de desarrollo levantado.
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const url = arg("url", "http://localhost:3000/preview/informe-fiscal");
const out = resolve(arg("out", "release-evidence/informe-fiscal.pdf"));

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const page = await browser.newPage();

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(m.text());
});
page.on("pageerror", (e) => problems.push(String(e)));

console.log(`→ ${url}`);
const response = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
if (!response || !response.ok()) {
  throw new Error(`La ruta respondió ${response ? response.status() : "sin respuesta"}`);
}

// Las fuentes tienen que estar resueltas ANTES de medir: si la página se
// pagina con la familia de reserva, el alto fijo de fila no coincide y las
// hojas se descuadran.
await page.evaluate(() => document.fonts.ready);

const sheets = await page.locator(".sheet").count();
if (sheets === 0) throw new Error("No se ha pintado ninguna hoja: ¿ha fallado la ruta?");

// Comprobación de desbordamiento: cada hoja tiene alto fijo y `overflow:hidden`,
// así que un contenido que no cabe NO rompe la página — desaparece en silencio,
// que es peor. Se mide aquí para que no pase inadvertido.
//
// Dos medidas, porque miden cosas distintas:
//   1. si la hoja desborda su propia caja
//   2. si el contenido invade la banda del pie, que es lo que de verdad pasa
//      cuando la cuenta de filas por página se queda corta: la última fila se
//      superpone a la numeración en vez de desaparecer
const overflowing = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll(".sheet").forEach((s, i) => {
    const box = s.scrollHeight - s.clientHeight;
    const foot = s.querySelector(".foot");
    const live = s.querySelector(".live");
    let intoFooter = 0;
    if (foot && live) {
      const bottoms = Array.from(live.querySelectorAll("*")).map((e) => e.getBoundingClientRect().bottom);
      const lowest = bottoms.length ? Math.max(...bottoms) : 0;
      intoFooter = lowest - foot.getBoundingClientRect().top;
    }
    if (box > 1 || intoFooter > 1) out.push({ page: i + 1, box, intoFooter: Math.round(intoFooter) });
  });
  return out;
});

await mkdir(dirname(out), { recursive: true });
await page.pdf({
  path: out,
  format: "A4",
  printBackground: true, // los tintes de banda y los filos son información
  // Los márgenes los pone el documento, no el diálogo: cada hoja lleva su
  // propio relleno, incluido el margen de encuadernación.
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true,
});

await browser.close();

console.log(`✓ ${out}`);
console.log(`  hojas maquetadas: ${sheets}`);
if (overflowing.length > 0) {
  console.error(`✗ HOJAS QUE DESBORDAN (contenido recortado o encima del pie):`);
  for (const r of overflowing) {
    console.error(`    página ${r.page}: caja +${r.box} px · invade el pie +${r.intoFooter} px`);
  }
  process.exitCode = 1;
}
if (problems.length > 0) {
  console.error(`✗ errores de consola:`);
  for (const p of problems) console.error(`    ${p}`);
  process.exitCode = 1;
}
