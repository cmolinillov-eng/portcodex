import type {
  DefiPosition,
  PortfolioSummary,
  PositionSection,
} from "@/types/portfolio";

/**
 * Generador de HTML para el reporte PDF del portfolio.
 *
 * Se renderiza dentro de un iframe oculto y se imprime con
 * window.print() — el navegador devuelve un PDF nativo (texto vectorial,
 * seleccionable, sin imágenes embebidas).
 *
 * Toda la información usada aquí ya está en memoria del dashboard,
 * por lo que la generación es inmediata y no requiere roundtrip extra.
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

// ---------- Helpers de formato ----------

function fmtUsd(value: number, opts?: { signed?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  const sign = opts?.signed && value > 0 ? "+" : "";
  return (
    sign +
    value.toLocaleString("es-ES", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtPct(value: number, opts?: { signed?: boolean }): string {
  if (!Number.isFinite(value)) return "—";
  const sign = opts?.signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function fmtPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString("es-ES", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (value >= 0.01) return value.toLocaleString("es-ES", { maximumFractionDigits: 4 });
  return value.toLocaleString("es-ES", { maximumFractionDigits: 6 });
}

function fmtAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("es-ES", { maximumFractionDigits: 4 });
  return value.toLocaleString("es-ES", { maximumFractionDigits: 6 });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Color de paleta ----------

const TOKEN_PALETTE = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316",
  "#a855f7", "#14b8a6",
];

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

// ---------- Bloques de contenido ----------

function buildHeader(input: ReportInput): string {
  const ctx = input.portfolioContext;
  const portfolioName = ctx?.portfolioName?.trim() || "Portfolio";
  const clientName = ctx?.clientName?.trim();
  const dateStr = input.generatedAt.toLocaleString("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `
    <header class="report-header">
      <div class="header-main">
        <h1>${escapeHtml(portfolioName)}</h1>
        ${clientName ? `<p class="header-client">${escapeHtml(clientName)}</p>` : ""}
      </div>
      <div class="header-meta">
        <p class="header-date">${escapeHtml(dateStr)}</p>
        <p class="header-tag">Reporte de portfolio</p>
      </div>
    </header>
  `;
}

function buildSummary(input: ReportInput): string {
  const s = input.summary;
  const pnlClass = s.pnlUsd >= 0 ? "positive" : "negative";
  const realizedClass = s.totalRealizedPnl >= 0 ? "positive" : "negative";

  return `
    <section class="card">
      <h2>Resumen ejecutivo</h2>
      <div class="metric-grid">
        <div class="metric">
          <p class="metric-label">Valor actual</p>
          <p class="metric-value">${fmtUsd(s.totalValueUsd)}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Total depositado</p>
          <p class="metric-value">${fmtUsd(s.totalDepositedUsd)}</p>
        </div>
        <div class="metric">
          <p class="metric-label">P&amp;L no realizado</p>
          <p class="metric-value ${pnlClass}">${fmtUsd(s.pnlUsd, { signed: true })}</p>
          <p class="metric-sub ${pnlClass}">${fmtPct(s.pnlPercent, { signed: true })}</p>
        </div>
        <div class="metric">
          <p class="metric-label">P&amp;L realizado</p>
          <p class="metric-value ${realizedClass}">${fmtUsd(s.totalRealizedPnl, { signed: true })}</p>
        </div>
        <div class="metric">
          <p class="metric-label">Harvest acumulado</p>
          <p class="metric-value">${fmtUsd(s.totalHarvestUsd)}</p>
        </div>
      </div>
    </section>
  `;
}

function buildCompositionByCategory(input: ReportInput): string {
  const totalsByCategory = input.sections.map((sec) => ({
    key: sec.key,
    label: SECTION_LABELS[sec.key] ?? sec.title,
    color: SECTION_COLORS[sec.key] ?? "#6b7280",
    value: sec.positions.reduce((acc, p) => acc + Math.max(0, p.currentValue), 0),
    count: sec.positions.length,
  })).filter((row) => row.value > 0);

  const total = totalsByCategory.reduce((acc, r) => acc + r.value, 0);
  if (total === 0) return "";

  const withPct = totalsByCategory.map((r) => ({ ...r, pct: (r.value / total) * 100 }));

  // SVG donut
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const segments = withPct.map((r) => {
    const len = (r.pct / 100) * circ;
    const seg = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${r.color}" stroke-width="22" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
    offset += len;
    return seg;
  }).join("");
  const donut = `
    <svg width="140" height="140" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#f3f4f6" stroke-width="22" />
      ${segments}
      <circle cx="80" cy="80" r="28" fill="#ffffff" />
      <text x="80" y="84" text-anchor="middle" font-size="14" font-weight="600" fill="#111827">${fmtUsd(total).replace("US$", "$")}</text>
    </svg>
  `;

  const legend = withPct
    .sort((a, b) => b.value - a.value)
    .map((r) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${r.color}"></span>
        <span class="legend-label">${escapeHtml(r.label)}</span>
        <span class="legend-pct">${fmtPct(r.pct)}</span>
        <span class="legend-value">${fmtUsd(r.value)}</span>
      </div>
    `).join("");

  return `
    <section class="card">
      <h2>Composición por categoría</h2>
      <div class="composition-row">
        <div class="composition-donut">${donut}</div>
        <div class="composition-legend">${legend}</div>
      </div>
    </section>
  `;
}

function buildCompositionByStrategy(input: ReportInput): string {
  const map = new Map<string, number>();
  let untaggedValue = 0;
  let total = 0;
  for (const section of input.sections) {
    for (const pos of section.positions) {
      const value = Math.max(0, pos.currentValue);
      if (value <= 0) continue;
      total += value;
      const tag = pos.strategyTag?.trim();
      if (!tag) untaggedValue += value;
      else map.set(tag, (map.get(tag) ?? 0) + value);
    }
  }
  if (map.size === 0) return ""; // nada etiquetado → no incluir sección

  const palette = ["#7c3aed", "#3b82f6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
  const rows = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, value], idx) => ({
      tag, value, pct: (value / total) * 100, color: palette[idx % palette.length],
    }));

  // Donut
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  const segs = rows.map((r) => {
    const len = (r.pct / 100) * circ;
    const seg = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${r.color}" stroke-width="22" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
    offset += len;
    return seg;
  }).join("");
  // Segmento untagged en gris
  let untaggedSeg = "";
  if (untaggedValue > 0) {
    const pct = (untaggedValue / total) * 100;
    const len = (pct / 100) * circ;
    untaggedSeg = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="22" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)" />`;
  }
  const donut = `
    <svg width="140" height="140" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="${radius}" fill="none" stroke="#f3f4f6" stroke-width="22" />
      ${segs}
      ${untaggedSeg}
      <circle cx="80" cy="80" r="28" fill="#ffffff" />
    </svg>
  `;
  const legend = rows.map((r) => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${r.color}"></span>
      <span class="legend-label">${escapeHtml(r.tag)}</span>
      <span class="legend-pct">${fmtPct(r.pct)}</span>
      <span class="legend-value">${fmtUsd(r.value)}</span>
    </div>
  `).join("") + (untaggedValue > 0 ? `
    <div class="legend-row" style="opacity:0.6">
      <span class="legend-dot" style="background:#e5e7eb"></span>
      <span class="legend-label">Sin etiqueta</span>
      <span class="legend-pct">${fmtPct((untaggedValue / total) * 100)}</span>
      <span class="legend-value">${fmtUsd(untaggedValue)}</span>
    </div>
  ` : "");

  return `
    <section class="card">
      <h2>Composición por estrategia</h2>
      <div class="composition-row">
        <div class="composition-donut">${donut}</div>
        <div class="composition-legend">${legend}</div>
      </div>
    </section>
  `;
}

function buildCompositionByToken(input: ReportInput): string {
  const tokenMap = new Map<string, number>();
  for (const section of input.sections) {
    for (const position of section.positions) {
      if (position.valueBreakdown.length > 0) {
        for (const part of position.valueBreakdown) {
          const sym = part.tokenSymbol.trim().toUpperCase();
          if (!sym || part.valueUsd <= 0) continue;
          tokenMap.set(sym, (tokenMap.get(sym) ?? 0) + part.valueUsd);
        }
      }
    }
  }
  const total = Array.from(tokenMap.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return "";

  const rows = Array.from(tokenMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12) // limit visible
    .map(([token, value], idx) => ({
      token,
      value,
      pct: (value / total) * 100,
      color: TOKEN_PALETTE[idx % TOKEN_PALETTE.length],
    }));

  const tableRows = rows.map((r) => `
    <tr>
      <td><span class="legend-dot" style="background:${r.color}"></span>${escapeHtml(r.token)}</td>
      <td class="num">${fmtUsd(r.value)}</td>
      <td class="num">${fmtPct(r.pct)}</td>
    </tr>
  `).join("");

  return `
    <section class="card">
      <h2>Composición por token</h2>
      <table class="data-table">
        <thead>
          <tr><th>Token</th><th class="num">Valor</th><th class="num">Distribución</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>
  `;
}

function buildPositionsBySection(input: ReportInput): string {
  const blocks = input.sections
    .filter((sec) => sec.positions.length > 0)
    .map((sec) => {
      const color = SECTION_COLORS[sec.key] ?? "#6b7280";
      const isLending = sec.key === "lending";

      const rows = sec.positions.map((pos) => {
        const deposited =
          pos.costBasisUsd !== null && Number.isFinite(pos.costBasisUsd)
            ? pos.costBasisUsd
            : pos.averageEntryPrice * pos.currentBalance;
        const pnl = pos.currentValue - deposited;
        const roiClass = pos.roiPercent >= 0 ? "positive" : "negative";

        if (isLending && pos.lendingDetails) {
          const d = pos.lendingDetails;
          const hf = pos.healthFactor;
          const hfClass = pos.healthStatus === "critical" ? "negative" : pos.healthStatus === "warning" ? "warning" : "positive";
          return `
            <tr>
              <td>${escapeHtml(pos.tokenSymbol)}</td>
              <td>${escapeHtml(pos.protocol)}</td>
              <td class="num">${fmtUsd(d.totalCollateralUsd)}</td>
              <td class="num">${fmtUsd(d.totalDebtUsd)}</td>
              <td class="num">${fmtUsd(d.netValueUsd)}</td>
              <td class="num">${fmtPct(d.ltv * 100)} / ${fmtPct(d.maxLtv * 100)}</td>
              <td class="num ${hfClass}">${hf === null ? "—" : hf.toFixed(2)}</td>
            </tr>
          `;
        }

        return `
          <tr>
            <td>${escapeHtml(pos.tokenSymbol)}</td>
            <td>${escapeHtml(pos.protocol)}</td>
            <td class="num">${fmtAmount(pos.currentBalance)}</td>
            <td class="num">${fmtUsd(pos.averageEntryPrice)}</td>
            <td class="num">${fmtUsd(deposited)}</td>
            <td class="num">${fmtUsd(pos.currentValue)}</td>
            <td class="num ${roiClass}">${fmtUsd(pnl, { signed: true })} (${fmtPct(pos.roiPercent, { signed: true })})</td>
          </tr>
        `;
      }).join("");

      const headers = isLending
        ? `<tr><th>Par</th><th>Protocolo</th><th class="num">Colateral</th><th class="num">Deuda</th><th class="num">Neto</th><th class="num">LTV / Máx</th><th class="num">HF</th></tr>`
        : `<tr><th>Token</th><th>Protocolo</th><th class="num">Balance</th><th class="num">Entrada</th><th class="num">Depositado</th><th class="num">Valor</th><th class="num">P&amp;L / ROI</th></tr>`;

      return `
        <section class="card section-block">
          <h2 style="border-left-color:${color}">${escapeHtml(SECTION_LABELS[sec.key] ?? sec.title)} <span class="section-count">(${sec.positions.length})</span></h2>
          <table class="data-table">
            <thead>${headers}</thead>
            <tbody>${rows}</tbody>
          </table>
        </section>
      `;
    }).join("");

  return blocks;
}

function buildLendingRisksSection(input: ReportInput): string {
  const lending = input.sections.find((s) => s.key === "lending");
  if (!lending || lending.positions.length === 0) return "";

  const positionsWithRisk = lending.positions.filter(
    (p) => p.lendingDetails && p.lendingDetails.liquidationRisks.some((r) => r.dropPercent !== null && r.dropPercent < 50),
  );
  if (positionsWithRisk.length === 0) return "";

  const rows = positionsWithRisk.flatMap((pos) => {
    const details = pos.lendingDetails!;
    return details.liquidationRisks
      .filter((r) => r.dropPercent !== null)
      .map((r) => {
        const drop = r.dropPercent ?? 0;
        const cls = drop < 0 ? "negative" : drop < 10 ? "negative" : drop < 25 ? "warning" : "neutral";
        return `
          <tr>
            <td>${escapeHtml(pos.protocol)}</td>
            <td>${escapeHtml(r.tokenSymbol)}</td>
            <td class="num">${fmtPrice(r.currentPrice)}</td>
            <td class="num">${fmtPrice(r.liquidationPrice ?? 0)}</td>
            <td class="num ${cls}">${drop < 0 ? `${drop.toFixed(1)}%` : `−${drop.toFixed(1)}%`}</td>
          </tr>
        `;
      });
  }).join("");

  if (!rows) return "";

  return `
    <section class="card">
      <h2>Distancia a liquidación</h2>
      <p class="card-sub">Precio al que cada activo de colateral llevaría el HF a 1.0, asumiendo el resto constante.</p>
      <table class="data-table">
        <thead>
          <tr><th>Protocolo</th><th>Token</th><th class="num">Precio actual</th><th class="num">Precio liquidación</th><th class="num">Margen</th></tr>
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
          <td class="num ${cls}">${p.healthFactor === null ? "—" : p.healthFactor.toFixed(2)}</td>
          <td>${escapeHtml(action)}</td>
        </tr>
      `;
    }).join("");

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
        <td>${escapeHtml(fmtDate(tx.transactionDate))}</td>
        <td>${escapeHtml(tx.protocol || "—")}</td>
        <td>${escapeHtml(desc)}</td>
      </tr>
    `;
  }).join("");

  return `
    <section class="card section-block">
      <h2>Actividad reciente</h2>
      <table class="data-table">
        <thead><tr><th style="width:140px">Fecha</th><th style="width:120px">Protocolo</th><th>Movimiento</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function describeTransaction(tx: ReportInput["recentActivity"][number]): string {
  const inLabel = tx.tokenInAmount > 0 ? `${fmtAmount(tx.tokenInAmount)} ${tx.tokenInSymbol}` : "";
  const outLabel = tx.tokenOutAmount > 0 ? `${fmtAmount(tx.tokenOutAmount)} ${tx.tokenOutSymbol}` : "";
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
  const date = input.generatedAt.toLocaleString("es-ES");
  return `
    <footer class="report-footer">
      <p>Generado el ${escapeHtml(date)} · Datos calculados a partir del histórico de transacciones registrado.</p>
      <p class="disclaimer">Este reporte es informativo. Los precios spot son de referencia (CoinGecko) y pueden no coincidir con los del intercambio donde liquidases las posiciones. El Health Factor usa los liquidation thresholds de Aave V3 como referencia conservadora — el protocolo real puede usar parámetros distintos.</p>
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
  .metric-sub { font-size: 10px; margin-top: 2px; }
  .positive { color: #047857; }
  .negative { color: #b91c1c; }
  .warning  { color: #b45309; }
  .neutral  { color: #374151; }

  .composition-row { display: flex; gap: 24px; align-items: center; }
  .composition-donut { flex-shrink: 0; }
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
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte Portfolio</title>
  <style>${CSS}</style>
</head>
<body>
  ${buildHeader(input)}
  ${buildSummary(input)}
  ${buildAlertsSection(input)}
  ${buildCompositionByCategory(input)}
  ${buildCompositionByStrategy(input)}
  ${buildCompositionByToken(input)}
  ${buildPositionsBySection(input)}
  ${buildLendingRisksSection(input)}
  ${buildRecentActivity(input)}
  ${buildFooter(input)}
</body>
</html>`;
}
