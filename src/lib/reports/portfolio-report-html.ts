import type {
  DefiPosition,
  PortfolioSummary,
  PositionSection,
} from "@/types/portfolio";
import {
  longDateTime,
  money,
  percent,
  plainNumber,
  sharePercent,
  shortDateTime,
  signedMoney,
  signedPercent,
  tokenAmount,
  unitPrice,
} from "@/lib/format/figures";

/**
 * Generador de HTML para el INFORME PATRIMONIAL.
 *
 * Se renderiza dentro de un iframe oculto y se imprime con
 * window.print() — el navegador devuelve un PDF nativo (texto vectorial,
 * seleccionable, sin imágenes embebidas).
 *
 * Toda la información usada aquí ya está en memoria del dashboard,
 * por lo que la generación es inmediata y no requiere roundtrip extra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DOS REGLAS QUE ESTE DOCUMENTO NO PUEDE ROMPER
 *
 * 1. UNA sola cifra de patrimonio. El documento tenía dos: el resumen ejecutivo
 *    imprimía `summary.totalValueUsd` (la lectura ON-CHAIN) y las composiciones
 *    sumaban el valor CONTABLE de las posiciones. En M Fita eso eran 11.133,98
 *    US$ arriba y 18.126,89 US$ dos párrafos más abajo, sin una palabra que
 *    dijera por qué. Manda la lectura on-chain, porque es la que responde a
 *    «cuánto tengo» — la misma decisión que ya tomó la Cartera.
 *
 * 2. Lo que no cuadra se DICE. Las composiciones siguen sumando lo que suman;
 *    cuando no llegan al patrimonio —o lo superan— el documento imprime cuánto
 *    falta y qué se sabe de esa diferencia. Un informe que calla un descuadre de
 *    siete mil dólares es peor que uno que lo enseña sin saber explicarlo.
 *
 * NINGÚN número se formatea aquí. Todos salen de `lib/format/figures`: es lo que
 * garantiza que el informe y las pantallas escriban «5.486,02 US$» y «+3,36 %»
 * de la misma manera, en español, y no «5486,02 $» y «+3.36%».
 * ────────────────────────────────────────────────────────────────────────────
 */

export type ReportInput = {
  summary: PortfolioSummary;
  sections: PositionSection[];
  recentActivity: Array<{
    transactionDate: string;
    type: string;
    protocol: string;
    positionType: string;
    tokenInSymbol: string;
    tokenInAmount: number;
    tokenOutSymbol: string;
    tokenOutAmount: number;
  }>;
  portfolioContext: {
    portfolioName: string | null;
    clientName: string | null;
  } | null;
  generatedAt: Date;
};

/** Medio céntimo hacia arriba ya se imprime; por debajo, la diferencia no existe. */
const CENTIMO = 0.01;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Base de coste: cuándo hay rentabilidad que calcular ----------

/**
 * La base de coste de una posición, o `null` si no la hay.
 *
 * Solo vale `costBasisUsd`, que es lo que el núcleo calcula desde el histórico
 * de transacciones. Antes, cuando venía a null, el informe la FABRICABA
 * multiplicando `averageEntryPrice × currentBalance`. Eso metía en la columna
 * «Depositado» un número que no había depositado nadie, y en las posiciones
 * agregadas —donde las dos cifras valen 0 a propósito— imprimía 0,00 US$ como
 * si el cliente hubiera entrado gratis.
 */
function baseDeCoste(p: DefiPosition): number | null {
  const base = Number(p.costBasisUsd);
  return Number.isFinite(base) && base > 0 ? base : null;
}

/**
 * A partir de aquí la base NO sostiene un porcentaje de rentabilidad.
 *
 * No es una manía de redondeo: es que el denominador no cubre la posición. En
 * M Fita hay un hold de 5.899,78 US$ en USDC con una base registrada de 305,88
 * US$ (+1.828,81 %) y otro de 1.084,82 US$ en USDS con base de 1,32 US$
 * (+81.804,58 %). Un stablecoin no se multiplica por 819: lo que falta es
 * histórico —posiciones adoptadas sin declarar el saldo inicial—, así que el
 * porcentaje no mide una ganancia, mide el agujero de la base.
 *
 * El umbral es relativo al valor de la posición porque el problema también lo
 * es: una base que no llega al 10 % de lo que hay hoy implicaría un +900 %, y
 * ninguna de las posiciones medidas con ese perfil había ganado nada.
 */
const BASE_MINIMA_SOBRE_VALOR = 0.1;

function baseSostieneRentabilidad(base: number | null, valorActual: number): boolean {
  if (base === null) return false;
  const valor = Number.isFinite(valorActual) ? Math.abs(valorActual) : 0;
  return base >= valor * BASE_MINIMA_SOBRE_VALOR;
}

// ---------- Totales del documento ----------

/**
 * Los totales se calculan UNA vez y los usan todos los bloques. Cualquier cifra
 * que el documento presente como «el total» sale de aquí; si un bloque necesita
 * otra base, la nombra en su propio subtítulo.
 */
type TotalesDelDocumento = {
  /** Patrimonio: la lectura on-chain. LA cifra del documento. */
  patrimonio: number;
  /** Lo que suman las posiciones contabilizadas. */
  sumaPosiciones: number;
  /** patrimonio − sumaPosiciones. Positivo: falta por repartir; negativo: sobra. */
  hueco: number;
  /** Rendimiento generado y todavía no recogido: la explicación habitual del hueco. */
  sinReclamar: number;
  huecoLoExplicaElSinReclamar: boolean;
  /** Sobre qué se reparten los porcentajes de las composiciones. */
  baseDeReparto: number;
  /** Trozo que completa las composiciones hasta el patrimonio (0 si no procede). */
  residuo: number;
  residuoEtiqueta: string;
  /** Cómo se llama `baseDeReparto`. Ninguna cifra del documento va sin nombre. */
  etiquetaDeLaBase: string;
  /** Total depositado declarado por el resumen. */
  depositadoDeclarado: number;
  /** Suma de las bases que el documento imprime fila a fila. */
  baseImpresa: number;
  /** baseImpresa − depositadoDeclarado. */
  huecoDepositado: number;
  posiciones: DefiPosition[];
};

function calcularTotales(input: ReportInput): TotalesDelDocumento {
  const posiciones = input.sections.flatMap((s) => s.positions);
  const sumaPosiciones = posiciones.reduce(
    (acc, p) => acc + (Number.isFinite(p.currentValue) ? p.currentValue : 0),
    0,
  );

  const lectura = Number(input.summary.totalValueUsd);
  // Sin lectura on-chain (cartera nueva, aún sin snapshot) manda la contable:
  // es preferible a encabezar el informe con un cero que no es cierto.
  const patrimonio = Number.isFinite(lectura) && lectura > 0 ? lectura : sumaPosiciones;
  const hueco = patrimonio - sumaPosiciones;

  const sinReclamar =
    Number(input.summary.totalUnclaimedUsd || 0) + Number(input.summary.totalPendingHarvestUsd || 0);
  const huecoLoExplicaElSinReclamar = hueco > CENTIMO && Math.abs(hueco - sinReclamar) < CENTIMO;

  // Cuando la lectura on-chain va POR ENCIMA de las posiciones, el trozo que
  // falta se pinta como una porción más y las composiciones cierran en el
  // patrimonio. Cuando va por debajo no hay porción que añadir —no se puede
  // dibujar un trozo negativo—, así que el reparto se hace sobre las posiciones
  // y cada composición dice sobre qué está repartiendo.
  const residuo = hueco > CENTIMO ? hueco : 0;
  const baseDeReparto = residuo > 0 ? patrimonio : sumaPosiciones;

  const baseImpresa = posiciones.reduce((acc, p) => acc + (baseDeCoste(p) ?? 0), 0);
  const depositadoDeclarado = Number(input.summary.totalDepositedUsd) || 0;

  return {
    patrimonio,
    sumaPosiciones,
    hueco,
    sinReclamar,
    huecoLoExplicaElSinReclamar,
    baseDeReparto,
    residuo,
    residuoEtiqueta: huecoLoExplicaElSinReclamar
      ? "Rendimientos sin reclamar"
      : "Diferencia con la lectura on-chain",
    etiquetaDeLaBase: residuo > 0 || Math.abs(hueco) < CENTIMO ? "Patrimonio" : "Suma de posiciones",
    depositadoDeclarado,
    baseImpresa,
    huecoDepositado: baseImpresa - depositadoDeclarado,
    posiciones,
  };
}

/** El subtítulo que lleva cada composición: sobre qué se está repartiendo. */
function subtituloDeReparto(t: TotalesDelDocumento): string {
  if (t.residuo > 0) {
    return `Reparto del patrimonio: ${money(t.patrimonio)}. Incluye ${money(t.residuo)} que la lectura on-chain ve y las posiciones todavía no recogen (${t.huecoLoExplicaElSinReclamar ? "rendimientos sin reclamar" : "diferencia sin asignar"}).`;
  }
  if (t.hueco < -CENTIMO) {
    return `Reparto de las posiciones contabilizadas: ${money(t.sumaPosiciones)}, que superan en ${money(Math.abs(t.hueco))} el patrimonio leído on-chain (${money(t.patrimonio)}). Mientras esa diferencia no se resuelva, los porcentajes son de reparto, no de patrimonio.`;
  }
  return `Reparto del patrimonio: ${money(t.patrimonio)}.`;
}

// ---------- Color de paleta ----------

const TOKEN_PALETTE = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316",
  "#a855f7", "#14b8a6",
];

/** Gris para todo lo que no es una posición: el residuo y el «otros». */
const COLOR_RESIDUO = "#d1d5db";

const SECTION_LABELS: Record<string, string> = {
  wallet: "Hold (Wallet)",
  staking: "Staking",
  lending: "Lending",
  liquidity_pools: "Liquidity Pools",
};

const SECTION_COLORS: Record<string, string> = {
  wallet: "#3b82f6",
  staking: "#8b5cf6",
  lending: "#f59e0b",
  liquidity_pools: "#10b981",
};

// ---------- Piezas reutilizables ----------

type FilaDeReparto = { label: string; value: number; color: string };

/**
 * Anillo de reparto. Solo entran las porciones POSITIVAS: un trozo negativo no
 * se puede dibujar, y estirarlo hasta el cero convertiría una deuda en una
 * porción de patrimonio. Las filas negativas se quedan en la leyenda, con su
 * cifra, que es donde sí se pueden leer.
 */
function donut(rows: FilaDeReparto[], base: number): string {
  const positivas = rows.filter((r) => r.value > 0);
  const dibujable = positivas.reduce((acc, r) => acc + r.value, 0);
  const escala = base > 0 ? base : dibujable;
  if (escala <= 0) return "";

  const radius = 46;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const segments = positivas
    .map((r) => {
      const len = (r.value / escala) * circ;
      const seg = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${r.color}" stroke-width="22" stroke-dasharray="${len} ${Math.max(0, circ - len)}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
      offset += len;
      return seg;
    })
    .join("");

  return `
    <svg width="140" height="140" viewBox="0 0 160 160" role="img" aria-hidden="true">
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#f3f4f6" stroke-width="22" />
      ${segments}
      <circle cx="80" cy="80" r="28" fill="#ffffff" />
    </svg>
  `;
}

/**
 * Leyenda del anillo. El porcentaje se calcula sobre la base que el bloque haya
 * declarado en su subtítulo — nunca sobre otra cosa.
 */
function leyenda(rows: FilaDeReparto[], base: number): string {
  return rows
    .map(
      (r) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${r.color}"></span>
        <span class="legend-label">${escapeHtml(r.label)}</span>
        <span class="legend-pct">${base > 0 && r.value > 0 ? sharePercent((r.value / base) * 100) : "—"}</span>
        <span class="legend-value">${money(r.value)}</span>
      </div>
    `,
    )
    .join("");
}

function bloqueDeComposicion(
  titulo: string,
  subtitulo: string,
  rows: FilaDeReparto[],
  base: number,
  etiquetaBase: string,
): string {
  if (rows.length === 0) return "";
  return `
    <section class="card">
      <h2>${escapeHtml(titulo)}</h2>
      <p class="card-sub">${escapeHtml(subtitulo)}</p>
      <div class="composition-row">
        <div class="composition-donut">
          ${donut(rows, base)}
          <p class="donut-caption">${money(base)}</p>
          <p class="donut-label">${escapeHtml(etiquetaBase)}</p>
        </div>
        <div class="composition-legend">${leyenda(rows, base)}</div>
      </div>
    </section>
  `;
}

// ---------- Bloques de contenido ----------

function buildHeader(input: ReportInput): string {
  const ctx = input.portfolioContext;
  const portfolioName = ctx?.portfolioName?.trim() || "Portfolio";
  const clientName = ctx?.clientName?.trim();

  return `
    <header class="report-header">
      <div class="header-main">
        <h1>${escapeHtml(portfolioName)}</h1>
        ${clientName ? `<p class="header-client">${escapeHtml(clientName)}</p>` : ""}
      </div>
      <div class="header-meta">
        <p class="header-date">${escapeHtml(longDateTime(input.generatedAt.toISOString()))}</p>
        <p class="header-tag">Informe patrimonial</p>
      </div>
    </header>
  `;
}

function buildSummary(input: ReportInput, t: TotalesDelDocumento): string {
  const s = input.summary;
  const pnlClass = s.pnlUsd >= 0 ? "positive" : "negative";
  const realizedClass = s.totalRealizedPnl >= 0 ? "positive" : "negative";
  // Sin capital depositado no hay porcentaje de rentabilidad: la división sería
  // por cero y el núcleo devuelve 0, que se leería como «ni ganas ni pierdes».
  const pnlPct = t.depositadoDeclarado > 0 ? signedPercent(s.pnlPercent) : "—";

  const subValor =
    Math.abs(t.hueco) < CENTIMO
      ? "Lectura on-chain"
      : `Lectura on-chain · las posiciones suman ${money(t.sumaPosiciones)}`;

  return `
    <section class="card">
      <h2>Resumen ejecutivo</h2>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Valor actual</p>
          <p class="metric-value">${money(t.patrimonio)}</p>
          <p class="metric-sub">${escapeHtml(subValor)}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Total depositado</p>
          <p class="metric-value">${money(t.depositadoDeclarado)}</p>
        </div>
        <div class="metric">
          <p class="metric-label">P&amp;L no realizado</p>
          <p class="metric-value ${pnlClass}">${signedMoney(s.pnlUsd)}</p>
          <p class="metric-sub ${pnlClass}">${pnlPct}</p>
        </div>
        <div class="metric">
          <p class="metric-label">P&amp;L realizado</p>
          <p class="metric-value ${realizedClass}">${signedMoney(s.totalRealizedPnl)}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Harvest acumulado</p>
          <p class="metric-value">${money(s.totalHarvestUsd)}</p>
        </div>
      </div>
    </section>
  `;
}

/**
 * Conciliación: las dos diferencias que el documento arrastra, con su importe y
 * lo que se sabe de cada una.
 *
 * Existe porque las dos son REALES y medidas, no un residuo de redondeo:
 *
 *  · Valor. La lectura on-chain y la suma de posiciones no coinciden. En M Fita
 *    la contable va 6.992,90 US$ por encima; en FITA, 1.404,01 US$.
 *
 *  · Depositado. La suma de las bases que se imprimen fila a fila no coincide
 *    con el Total depositado. La causa está medida: el total global descuenta de
 *    una posición más de lo que llegó a depositarse y su base queda en NEGATIVO
 *    (en M Fita, −50,60 US$ en el pool de Kamino/Raydium, cuya fila imprime
 *    +38,57 US$: 89,17 US$ de diferencia; en FITA, −664,50 US$ en el hold de
 *    USDC frente a los +1.370,06 US$ de su fila: 2.034,56 US$). Ninguna fila
 *    puede enseñar una base negativa, así que la diferencia no se reparte.
 *
 * Si algún día las dos cuadran, el bloque desaparece solo.
 */
function buildConciliacion(t: TotalesDelDocumento): string {
  const filas: string[] = [];

  if (Math.abs(t.hueco) >= CENTIMO) {
    const explicacion = t.huecoLoExplicaElSinReclamar
      ? "Son rendimientos generados y todavía no recogidos: la cadena ya los ve y el libro aún no los ha imputado a ninguna posición."
      : t.hueco > 0
        ? "La cadena ve más de lo que las posiciones registran. No se afirma de qué es mientras no se pueda comprobar."
        : "Las posiciones registran más de lo que la cadena ve. Hasta resolverlo, la cifra que manda es la lectura on-chain.";
    filas.push(`
      <tr>
        <td>Valor</td>
        <td class="num">${money(t.patrimonio)}</td>
        <td class="num">${money(t.sumaPosiciones)}</td>
        <td class="num ${t.hueco >= 0 ? "positive" : "negative"}">${signedMoney(t.hueco)}</td>
        <td>${escapeHtml(explicacion)}</td>
      </tr>
    `);
  }

  if (Math.abs(t.huecoDepositado) >= CENTIMO) {
    const explicacion =
      t.huecoDepositado > 0
        ? "Las bases impresas suman más que el total. El total global descuenta de alguna posición más de lo que llegó a depositarse —su base queda en negativo— y una fila no puede enseñar una base negativa."
        : "El total incluye capital que ninguna fila enseña: base de posiciones que ya no están vivas en el informe.";
    filas.push(`
      <tr>
        <td>Depositado</td>
        <td class="num">${money(t.depositadoDeclarado)}</td>
        <td class="num">${money(t.baseImpresa)}</td>
        <td class="num ${t.huecoDepositado >= 0 ? "positive" : "negative"}">${signedMoney(t.huecoDepositado)}</td>
        <td>${escapeHtml(explicacion)}</td>
      </tr>
    `);
  }

  if (filas.length === 0) return "";

  return `
    <section class="card">
      <h2>Conciliación</h2>
      <p class="card-sub">Lo que el resumen declara frente a lo que suman las tablas de este mismo informe. Se publica en vez de cuadrarlo a la fuerza: la diferencia es un dato, no una errata de presentación.</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="num">Declarado</th>
            <th class="num">Suma de las tablas</th>
            <th class="num">Diferencia</th>
            <th>Qué se sabe</th>
          </tr>
        </thead>
        <tbody>${filas.join("")}</tbody>
      </table>
    </section>
  `;
}

function buildCompositionByCategory(input: ReportInput, t: TotalesDelDocumento): string {
  const rows: FilaDeReparto[] = input.sections
    .map((sec) => ({
      label: SECTION_LABELS[sec.key] ?? sec.title,
      color: SECTION_COLORS[sec.key] ?? "#6b7280",
      value: sec.positions.reduce(
        (acc, p) => acc + (Number.isFinite(p.currentValue) ? p.currentValue : 0),
        0,
      ),
    }))
    .filter((row) => Math.abs(row.value) >= CENTIMO)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return "";
  if (t.residuo > 0) {
    rows.push({ label: t.residuoEtiqueta, value: t.residuo, color: COLOR_RESIDUO });
  }

  return bloqueDeComposicion(
    "Composición por categoría",
    subtituloDeReparto(t),
    rows,
    t.baseDeReparto,
    t.etiquetaDeLaBase,
  );
}

function buildCompositionByStrategy(input: ReportInput, t: TotalesDelDocumento): string {
  const map = new Map<string, number>();
  let sinEtiqueta = 0;
  for (const pos of t.posiciones) {
    const value = Number.isFinite(pos.currentValue) ? pos.currentValue : 0;
    if (Math.abs(value) < CENTIMO) continue;
    const tag = pos.strategyTag?.trim();
    if (!tag) sinEtiqueta += value;
    else map.set(tag, (map.get(tag) ?? 0) + value);
  }
  if (map.size === 0) return ""; // nada etiquetado → no incluir sección

  const palette = ["#7c3aed", "#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
  const rows: FilaDeReparto[] = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, value], idx) => ({ label: tag, value, color: palette[idx % palette.length] }));

  if (Math.abs(sinEtiqueta) >= CENTIMO) {
    rows.push({ label: "Sin etiqueta", value: sinEtiqueta, color: "#e5e7eb" });
  }
  if (t.residuo > 0) {
    rows.push({ label: t.residuoEtiqueta, value: t.residuo, color: COLOR_RESIDUO });
  }

  return bloqueDeComposicion(
    "Composición por estrategia",
    subtituloDeReparto(t),
    rows,
    t.baseDeReparto,
    t.etiquetaDeLaBase,
  );
}

/** Cuántos tokens caben antes de que la tabla deje de informar y empiece a llenar. */
const MAX_TOKENS_VISIBLES = 12;

function buildCompositionByToken(input: ReportInput, t: TotalesDelDocumento): string {
  const tokenMap = new Map<string, number>();
  let desglosado = 0;
  let hayNetoDeLending = false;

  for (const position of t.posiciones) {
    for (const part of position.valueBreakdown) {
      const sym = part.tokenSymbol.trim().toUpperCase();
      const valor = Number(part.valueUsd);
      if (!sym || !Number.isFinite(valor) || Math.abs(valor) < CENTIMO) continue;
      // `amount: null` marca las entradas SINTÉTICAS de lending: el símbolo es
      // compuesto («USDC/WETH») y la cifra es el neto (colateral − deuda). No es
      // un token, así que se etiqueta como lo que es en vez de colarlo entre los
      // demás como si el cliente tuviera un token llamado «USDC/WETH».
      const esNeto = part.amount === null;
      if (esNeto) hayNetoDeLending = true;
      const label = esNeto ? `${sym} (neto de lending)` : sym;
      tokenMap.set(label, (tokenMap.get(label) ?? 0) + valor);
      desglosado += valor;
    }
  }
  if (tokenMap.size === 0) return "";

  const ordenados = Array.from(tokenMap.entries()).sort((a, b) => b[1] - a[1]);
  const visibles = ordenados.slice(0, MAX_TOKENS_VISIBLES);
  const resto = ordenados.slice(MAX_TOKENS_VISIBLES);

  const rows: FilaDeReparto[] = visibles.map(([token, value], idx) => ({
    label: token,
    value,
    color: TOKEN_PALETTE[idx % TOKEN_PALETTE.length],
  }));

  // Lo que no cabe se agrupa, nunca se tira: recortar la lista sin decirlo
  // dejaba la tabla sumando menos que las demás sin ninguna señal.
  if (resto.length > 0) {
    rows.push({
      label: `Otros (${resto.length})`,
      value: resto.reduce((acc, [, v]) => acc + v, 0),
      color: COLOR_RESIDUO,
    });
  }

  // El desglose por token de una posición debería sumar su valor. Si no llega,
  // la diferencia se nombra en lugar de dejar que la tabla cierre más baja que
  // la de categorías sin explicación.
  const sinDesglose = t.sumaPosiciones - desglosado;
  if (Math.abs(sinDesglose) >= CENTIMO) {
    rows.push({ label: "Sin desglosar por token", value: sinDesglose, color: COLOR_RESIDUO });
  }
  if (t.residuo > 0) {
    rows.push({ label: t.residuoEtiqueta, value: t.residuo, color: COLOR_RESIDUO });
  }

  const nota = hayNetoDeLending
    ? " Las posiciones de lending entran por su valor NETO (colateral − deuda), bajo el par que las forma: no hay una cantidad de token que corresponda a esa cifra."
    : "";

  const tableRows = rows
    .map(
      (r) => `
    <tr>
      <td><span class="legend-dot" style="background:${r.color}"></span>${escapeHtml(r.label)}</td>
      <td class="num">${money(r.value)}</td>
      <td class="num">${t.baseDeReparto > 0 && r.value > 0 ? sharePercent((r.value / t.baseDeReparto) * 100) : "—"}</td>
    </tr>
  `,
    )
    .join("");

  return `
    <section class="card">
      <h2>Composición por token</h2>
      <p class="card-sub">${escapeHtml(subtituloDeReparto(t) + nota)}</p>
      <table class="data-table">
        <thead>
          <tr><th>Token</th><th class="num">Valor</th><th class="num">Distribución</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr><td>${escapeHtml(t.etiquetaDeLaBase)}</td><td class="num">${money(t.baseDeReparto)}</td><td class="num">${sharePercent(100)}</td></tr>
        </tfoot>
      </table>
    </section>
  `;
}

/**
 * El SALDO de una posición: cantidades de token, nunca dólares con el ticker
 * pegado.
 *
 * `currentBalance` no sirve: en una posición agregada vale 0 a propósito, y con
 * él el informe imprimía «Balance 0» en un LP de 7.939,30 US$. El desglose real
 * está en `valueBreakdown[].amount` y, en lending, en collateral/debt.
 */
function saldoDeLaPosicion(p: DefiPosition): string {
  const conCantidad = p.valueBreakdown.filter(
    (v): v is typeof v & { amount: number } => typeof v.amount === "number" && v.amount !== 0,
  );
  if (conCantidad.length > 0) {
    return conCantidad
      .map((v) => `${tokenAmount(v.amount)} ${escapeHtml(v.tokenSymbol)}`)
      .join("<br />");
  }

  const colateral = p.collateralBreakdown.map((c) => `${tokenAmount(c.amount)} ${escapeHtml(c.tokenSymbol)}`);
  const deuda = p.debtBreakdown.map((d) => `−${tokenAmount(Math.abs(d.amount))} ${escapeHtml(d.tokenSymbol)}`);
  if (colateral.length > 0 || deuda.length > 0) return [...colateral, ...deuda].join("<br />");

  const balance = Number(p.currentBalance);
  if (Number.isFinite(balance) && balance !== 0) {
    return `${tokenAmount(balance)} ${escapeHtml(p.tokenSymbol)}`;
  }
  return "—";
}

function buildPositionsBySection(input: ReportInput): string {
  let hayBaseCorta = false;

  const blocks = input.sections
    .filter((sec) => sec.positions.length > 0)
    .map((sec) => {
      const color = SECTION_COLORS[sec.key] ?? "#6b7280";
      const isLending = sec.key === "lending";

      const rows = sec.positions
        .map((pos) => {
          const base = baseDeCoste(pos);
          const valor = Number.isFinite(pos.currentValue) ? pos.currentValue : 0;

          if (isLending && pos.lendingDetails) {
            const d = pos.lendingDetails;
            const hf = pos.healthFactor;
            const hfClass =
              pos.healthStatus === "critical" ? "negative" : pos.healthStatus === "warning" ? "warning" : "positive";
            return `
            <tr>
              <td>
                ${escapeHtml(pos.tokenSymbol)}
                <span class="cell-sub">${saldoDeLaPosicion(pos)}</span>
              </td>
              <td>${escapeHtml(pos.protocol)}</td>
              <td class="num">${money(d.totalCollateralUsd)}</td>
              <td class="num">${money(d.totalDebtUsd)}</td>
              <td class="num">${money(d.netValueUsd)}</td>
              <td class="num">${base === null ? "—" : money(base)}</td>
              <td class="num">${percent(d.ltv * 100)} / ${percent(d.maxLtv * 100)}</td>
              <td class="num ${hfClass}">${hf === null || !Number.isFinite(hf) ? "—" : plainNumber(hf)}</td>
            </tr>
          `;
          }

          // El P&L y el ROI se calculan con los DOS números que la fila imprime
          // —base y valor—, para que el lector pueda rehacer la resta. Sin base
          // que los sostenga no se imprime ni uno ni otro: un «+5.593,90 US$
          // (+1.828,81 %)» en un stablecoin no es una ganancia, es una base que
          // falta.
          const hayRentabilidad = baseSostieneRentabilidad(base, valor);
          if (base !== null && !hayRentabilidad) hayBaseCorta = true;
          const pnl = hayRentabilidad ? valor - (base as number) : 0;
          const roi = hayRentabilidad ? (pnl / (base as number)) * 100 : 0;
          const roiClass = !hayRentabilidad ? "neutral" : pnl >= 0 ? "positive" : "negative";

          return `
          <tr>
            <td>${escapeHtml(pos.tokenSymbol)}</td>
            <td>${escapeHtml(pos.protocol)}</td>
            <td class="num">${saldoDeLaPosicion(pos)}</td>
            <td class="num">${unitPrice(pos.averageEntryPrice)}</td>
            <td class="num">${base === null ? "—" : `${money(base)}${hayRentabilidad ? "" : " *"}`}</td>
            <td class="num">${money(valor)}</td>
            <td class="num ${roiClass}">${hayRentabilidad ? `${signedMoney(pnl)} (${signedPercent(roi)})` : "—"}</td>
          </tr>
        `;
        })
        .join("");

      const sumaValor = sec.positions.reduce(
        (acc, p) => acc + (Number.isFinite(p.currentValue) ? p.currentValue : 0),
        0,
      );

      // Las columnas de dinero SUMAN al pie. Es lo que permite comprobar el
      // informe sin calculadora: cada sección cierra, y la conciliación explica
      // lo que separa esas sumas de las cifras del resumen.
      const foot = isLending
        ? `
          <tr>
            <td colspan="2">Total ${escapeHtml(SECTION_LABELS[sec.key] ?? sec.title)}</td>
            <td class="num">${money(sec.positions.reduce((acc, p) => acc + (p.lendingDetails?.totalCollateralUsd ?? 0), 0))}</td>
            <td class="num">${money(sec.positions.reduce((acc, p) => acc + (p.lendingDetails?.totalDebtUsd ?? 0), 0))}</td>
            <td class="num">${money(sumaValor)}</td>
            <td class="num">${money(sec.positions.reduce((acc, p) => acc + (baseDeCoste(p) ?? 0), 0))}</td>
            <td></td>
            <td></td>
          </tr>`
        : `
          <tr>
            <td colspan="4">Total ${escapeHtml(SECTION_LABELS[sec.key] ?? sec.title)}</td>
            <td class="num">${money(sec.positions.reduce((acc, p) => acc + (baseDeCoste(p) ?? 0), 0))}</td>
            <td class="num">${money(sumaValor)}</td>
            <td></td>
          </tr>`;

      const headers = isLending
        ? `<tr><th>Par</th><th>Protocolo</th><th class="num">Colateral</th><th class="num">Deuda</th><th class="num">Neto</th><th class="num">Depositado</th><th class="num">LTV / Máx</th><th class="num">HF</th></tr>`
        : `<tr><th>Token</th><th>Protocolo</th><th class="num">Saldo</th><th class="num">Precio de entrada</th><th class="num">Depositado</th><th class="num">Valor</th><th class="num">P&amp;L / ROI</th></tr>`;

      return `
        <section class="card section-block">
          <h2 style="border-left-color:${color}">${escapeHtml(SECTION_LABELS[sec.key] ?? sec.title)} <span class="section-count">(${sec.positions.length})</span></h2>
          <table class="data-table">
            <thead>${headers}</thead>
            <tbody>${rows}</tbody>
            <tfoot>${foot}</tfoot>
          </table>
        </section>
      `;
    })
    .join("");

  const nota = hayBaseCorta
    ? `<p class="footnote">(*) La base registrada no cubre la posición, así que no sostiene ni P&amp;L ni rentabilidad: las dos columnas quedan en «—». Es lo que pasa con una posición adoptada sin declarar su saldo inicial — el capital está, pero su coste no se ha registrado entero.</p>`
    : "";

  return blocks + nota;
}

function buildLendingRisksSection(input: ReportInput): string {
  const lending = input.sections.find((s) => s.key === "lending");
  if (!lending || lending.positions.length === 0) return "";

  const positionsWithRisk = lending.positions.filter(
    (p) => p.lendingDetails && p.lendingDetails.liquidationRisks.some((r) => r.dropPercent !== null && r.dropPercent < 50),
  );
  if (positionsWithRisk.length === 0) return "";

  const rows = positionsWithRisk
    .flatMap((pos) => {
      const details = pos.lendingDetails!;
      return details.liquidationRisks
        .filter((r) => r.dropPercent !== null)
        .map((r) => {
          const drop = r.dropPercent ?? 0;
          const cls = drop < 10 ? "negative" : drop < 25 ? "warning" : "neutral";
          // El margen se escribe como lo que tiene que pasar: el precio ha de
          // CAER un tanto por ciento. De ahí el signo cambiado.
          return `
          <tr>
            <td>${escapeHtml(pos.protocol)}</td>
            <td>${escapeHtml(r.tokenSymbol)}</td>
            <td class="num">${unitPrice(r.currentPrice)}</td>
            <td class="num">${r.liquidationPrice === null ? "—" : unitPrice(r.liquidationPrice)}</td>
            <td class="num ${cls}">${signedPercent(-drop)}</td>
          </tr>
        `;
        });
    })
    .join("");

  if (!rows) return "";

  return `
    <section class="card">
      <h2>Distancia a liquidación</h2>
      <p class="card-sub">Precio al que cada activo de colateral llevaría el factor de salud a 1,00, asumiendo el resto constante.</p>
      <table class="data-table">
        <thead>
          <tr><th>Protocolo</th><th>Token</th><th class="num">Precio actual</th><th class="num">Precio de liquidación</th><th class="num">Margen</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function buildAlertsSection(input: ReportInput): string {
  const lending = input.sections.find((s) => s.key === "lending");
  if (!lending) return "";
  const alerts = lending.positions.filter((p) => p.healthStatus === "warning" || p.healthStatus === "critical");
  if (alerts.length === 0) return "";

  const rows = alerts
    .sort((a, b) => (a.healthFactor ?? 99) - (b.healthFactor ?? 99))
    .map((p) => {
      const cls = p.healthStatus === "critical" ? "negative" : "warning";
      const action =
        p.healthFactor === null ? "—"
        : p.healthFactor < 1.0 ? "Liquidación inminente — actuar YA"
        : p.healthFactor < 1.2 ? "Añadir colateral o repagar deuda"
        : p.healthFactor < 1.5 ? "Reducir apalancamiento"
        : "Vigilar";
      return `
        <tr>
          <td>${escapeHtml(p.protocol)}</td>
          <td>${escapeHtml(p.tokenSymbol)}</td>
          <td class="num ${cls}">${p.healthFactor === null || !Number.isFinite(p.healthFactor) ? "—" : plainNumber(p.healthFactor)}</td>
          <td>${escapeHtml(action)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="card alert-card">
      <h2>⚠ Alertas activas</h2>
      <table class="data-table">
        <thead>
          <tr><th>Protocolo</th><th>Par</th><th class="num">HF</th><th>Acción sugerida</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function buildRecentActivity(input: ReportInput): string {
  const items = input.recentActivity.slice(0, 15);
  if (items.length === 0) return "";

  const rows = items.map((tx) => {
    const desc = describeTransaction(tx);
    return `
      <tr>
        <td>${escapeHtml(shortDateTime(tx.transactionDate))}</td>
        <td>${escapeHtml(tx.protocol || "—")}</td>
        <td>${escapeHtml(desc)}</td>
      </tr>
    `;
  }).join("");

  return `
    <section class="card section-block">
      <h2>Actividad reciente</h2>
      <table class="data-table">
        <thead><tr><th style="width:120px">Fecha</th><th style="width:120px">Protocolo</th><th>Movimiento</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function describeTransaction(tx: ReportInput["recentActivity"][number]): string {
  const inLabel = tx.tokenInAmount > 0 ? `${tokenAmount(tx.tokenInAmount)} ${tx.tokenInSymbol}` : "";
  const outLabel = tx.tokenOutAmount > 0 ? `${tokenAmount(tx.tokenOutAmount)} ${tx.tokenOutSymbol}` : "";
  switch (tx.type) {
    case "deposit": return `Depósito ${inLabel}`;
    case "withdrawal": return `Retiro ${outLabel}`;
    case "staking_deposit": return `Stake ${inLabel}`;
    case "staking_withdrawal": return `Unstake ${outLabel}`;
    case "lp_deposit": return `LP add ${inLabel}`;
    case "lp_withdraw": return `LP remove ${outLabel}`;
    case "lending_supply": return `Aportar colateral ${inLabel}`;
    case "lending_withdraw": return `Retirar colateral ${outLabel}`;
    case "lending_borrow": return `Pedir prestado ${inLabel}`;
    case "harvest": return `Harvest ${inLabel}`;
    case "rebalance_transfer": return outLabel && inLabel ? `Rebalance ${outLabel} → ${inLabel}` : `Rebalance`;
    case "position_closed": return `Cierre de posición`;
    case "lending_adjust": return `Ajuste lending`;
    default: return tx.type;
  }
}

function buildFooter(input: ReportInput): string {
  return `
    <footer class="report-footer">
      <p>Generado el ${escapeHtml(longDateTime(input.generatedAt.toISOString()))} · El valor actual es la lectura on-chain; el depositado y el P&amp;L salen del histórico de transacciones registrado.</p>
      <p class="disclaimer">Este informe es informativo. Los precios spot son de referencia (CoinGecko) y pueden no coincidir con los del intercambio donde liquidases las posiciones. El factor de salud usa los liquidation thresholds de Aave V3 como referencia conservadora — el protocolo real puede usar parámetros distintos.</p>
    </footer>
  `;
}

// ---------- CSS ----------

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #111827;
    background: #fff;
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
  }
  h1, h2, h3 { margin: 0; font-weight: 600; }
  h1 { font-size: 22px; letter-spacing: -0.02em; }
  h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1f2937;
    padding-left: 8px;
    border-left: 3px solid #6b7280;
    margin-bottom: 10px;
  }
  h2 .section-count { font-size: 11px; color: #6b7280; font-weight: 500; }
  p { margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    font-weight: 600;
    color: #6b7280;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 6px 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody td {
    padding: 6px 8px;
    border-bottom: 1px solid #f3f4f6;
    font-size: 11px;
  }
  tbody tr:last-child td { border-bottom: none; }
  tfoot td {
    padding: 6px 8px;
    border-top: 1px solid #e5e7eb;
    font-weight: 600;
    font-size: 11px;
  }
  .cell-sub { display: block; color: #6b7280; font-size: 10px; margin-top: 2px; }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #111827;
    padding-bottom: 10px;
    margin-bottom: 18px;
  }
  .header-client { color: #6b7280; font-size: 12px; margin-top: 2px; }
  .header-meta { text-align: right; }
  .header-date { font-size: 11px; color: #374151; }
  .header-tag {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    background: #111827;
    color: #fff;
    border-radius: 999px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .card-sub { color: #6b7280; font-size: 10px; margin-bottom: 8px; }
  .alert-card { border-color: #fca5a5; background: #fef2f2; }
  .footnote { color: #6b7280; font-size: 9px; margin: -4px 0 12px 2px; }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
  }
  .metric-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    margin-bottom: 3px;
  }
  .metric-value { font-size: 15px; font-weight: 600; }
  .metric-sub { font-size: 9px; margin-top: 2px; color: #6b7280; }
  .positive { color: #047857; }
  .negative { color: #b91c1c; }
  .warning  { color: #b45309; }
  .neutral  { color: #6b7280; }
  .metric-sub.positive { color: #047857; }
  .metric-sub.negative { color: #b91c1c; }

  .composition-row { display: flex; gap: 24px; align-items: center; }
  .composition-donut { flex-shrink: 0; text-align: center; }
  .donut-caption {
    font-size: 11px;
    font-weight: 600;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }
  .donut-label {
    font-size: 9px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .composition-legend { flex: 1; display: grid; gap: 5px; }
  .legend-row {
    display: grid;
    grid-template-columns: 14px 1fr auto auto;
    gap: 8px;
    align-items: center;
    font-size: 11px;
  }
  .legend-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    margin-right: 6px;
    vertical-align: middle;
  }
  .legend-pct { color: #6b7280; font-variant-numeric: tabular-nums; }
  .legend-value { font-weight: 600; font-variant-numeric: tabular-nums; }

  .section-block { page-break-inside: auto; }

  .report-footer {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    color: #6b7280;
    font-size: 9px;
  }
  .report-footer .disclaimer { margin-top: 4px; font-style: italic; }
`;

// ---------- Entry point ----------

export function buildPortfolioReportHtml(input: ReportInput): string {
  const totales = calcularTotales(input);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Informe patrimonial</title>
  <style>${CSS}</style>
</head>
<body>
  ${buildHeader(input)}
  ${buildSummary(input, totales)}
  ${buildConciliacion(totales)}
  ${buildAlertsSection(input)}
  ${buildCompositionByCategory(input, totales)}
  ${buildCompositionByStrategy(input, totales)}
  ${buildCompositionByToken(input, totales)}
  ${buildPositionsBySection(input)}
  ${buildLendingRisksSection(input)}
  ${buildRecentActivity(input)}
  ${buildFooter(input)}
</body>
</html>`;
}
