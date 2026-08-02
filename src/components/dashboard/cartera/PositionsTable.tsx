"use client";

import { useState, type ReactNode } from "react";
import { TokenAvatars } from "./TokenAvatar";
import { RiskBar } from "./RiskBar";

/**
 * Tabla de posiciones de la Cartera.
 *
 * **Las cuatro categorías comparten la MISMA rejilla**, incluso Hold, que solo
 * usa cinco de las seis columnas y deja la última vacía. No es un descuido: es
 * lo que permite recorrer la página en vertical y comparar el «Valor actual» de
 * un pool con el de un hold sin que la vista tenga que reajustarse en cada
 * sección.
 *
 * Cada fila **centra su contenido verticalmente**. Es la regla que salva la
 * tabla de lending, cuya celda de colateral y deuda mide cinco líneas mientras
 * las demás miden dos: alineadas por la primera línea, la fila se rompe.
 */

/** Rejilla única de la Cartera. Los mínimos por columna son lo que impide que
 *  una cifra larga invada a la siguiente. */
const GRID =
  "212px minmax(120px,1fr) minmax(92px,1fr) minmax(92px,1fr) minmax(100px,1fr) minmax(150px,1.1fr)";
const COLUMN_GAP = 12;

/** Par de cifras de una columna de rendimiento: importe y qué es ese importe.
 *  Van en la MISMA línea porque el ancho no da para apilarlas. */
export interface YieldEntry {
  value: string;
  /** «sin reclamar», «cobrado», «generado», «pagado». */
  label: string;
  /** El primero pesa más: es lo que todavía está en juego. */
  strong?: boolean;
}

export interface CarteraPosition {
  key: string;
  /** Uno o dos: un hold trae uno, un pool o un lending traen dos. */
  symbols: string[];
  name: string;
  /** «Solana · Kamino (ORCA)». Red primero, plataforma después. */
  venue: string;
  /** Rango de precios en pools, factor de salud en lending. */
  risk?: { position: number; label: string; atRisk?: boolean };
  /** Saldos por token. En lending se ignora: manda `lending`. */
  balances: string[];
  /** Solo lending. Colateral y deuda SEPARADOS y etiquetados: confundirlos hace
   *  creer al cliente que tiene un 48 % más de lo que tiene. */
  lending?: { collateral: string[]; debt: string[] };
  deposited: string;
  currentValue: string;
  pnl: string;
  pnlPercent: string;
  /**
   * Tres estados, no un booleano.
   *
   * Con un booleano, un P&L de CERO caía en «positivo» y se pintaba en verde de
   * ganancia: el cliente leía «he ganado» en una posición que no se ha movido.
   * Cero no es ganancia. La maqueta lo pinta en neutro.
   */
  pnlTone: "profit" | "loss" | "flat";
  yields?: YieldEntry[];
  /** Marca ámbar de excepción: dato dudoso, posición sin contabilizar… Solo se
   *  señala LO ANÓMALO; una insignia en todas las filas no informa de nada. */
  exception?: string;
  onEdit?: () => void;
}

export interface CarteraSectionData {
  key: string;
  title: string;
  total: string;
  /** «· 3 posiciones». */
  count: string;
  /** Las dos que cambian entre categorías. */
  balanceLabel: string;
  valueLabel: string;
  yieldLabel?: string;
  positions: CarteraPosition[];
}

export function PositionsTable({ section }: { section: CarteraSectionData }) {
  const headers = [
    "Activo",
    section.balanceLabel,
    "Depositado",
    section.valueLabel,
    "P&L",
    section.yieldLabel ?? "",
  ];

  return (
    <section>
      <div
        className="flex items-baseline gap-4"
        style={{
          marginTop: 52,
          paddingBottom: 12,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--text-lead)", fontWeight: 600 }}>{section.title}</h2>
        <span
          className="tabular-nums ml-auto"
          style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}
        >
          {section.total}
        </span>
        <span
          style={{ fontSize: "var(--text-label)", color: "var(--faint)", whiteSpace: "nowrap" }}
        >
          {section.count}
        </span>
      </div>

      <div
        className="grid pcx-grid pcx-grid-head"
        style={{
          ["--pcx-cols" as string]: GRID,
          columnGap: COLUMN_GAP,
          fontSize: "var(--text-label)",
          color: "var(--faint)",
          padding: "14px 0 10px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {headers.map((h, i) => (
          <span key={h || `c${i}`} style={{ textAlign: i === 0 ? "left" : "right" }}>
            {h}
          </span>
        ))}
      </div>

      {section.positions.map((p) => (
        <PositionRow
          key={p.key}
          position={p}
          valueLabel={section.valueLabel}
          yieldLabel={section.yieldLabel}
        />
      ))}
    </section>
  );
}

function PositionRow({
  position: p,
  valueLabel,
  yieldLabel,
}: {
  position: CarteraPosition;
  /** Se pasan para que la ficha de móvil pueda etiquetar cada dato: apilada,
   *  la cabecera de columna desaparece y sin etiqueta el número queda huérfano. */
  valueLabel: string;
  yieldLabel?: string;
}) {
  // El lápiz de edición y el detalle del rango solo aparecen al pasar por
  // encima: en reposo son ruido en 17 filas, y al apuntar son justo lo que se
  // busca.
  const [hovered, setHovered] = useState(false);
  const pnlColor =
    p.pnlTone === "profit" ? "var(--profit)" : p.pnlTone === "loss" ? "var(--loss)" : "var(--muted)";
  // En una posición plana el porcentaje baja un escalón más: no hay nada que
  // destacar, y dos tonos neutros distintos dicen «esto no se ha movido».
  const pnlPercentColor = p.pnlTone === "flat" ? "var(--faint)" : pnlColor;

  return (
    <div
      className="grid pcx-grid"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ["--pcx-cols" as string]: GRID,
        columnGap: COLUMN_GAP,
        alignItems: "center",
        padding: "18px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {/* Activo */}
      <div className="flex items-start" style={{ minWidth: 0, gap: 10 }}>
        <TokenAvatars symbols={p.symbols} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>{p.name}</div>
          {p.risk ? (
            <RiskBar
              position={p.risk.position}
              label={p.risk.label}
              hovered={hovered}
              atRisk={p.risk.atRisk}
            />
          ) : null}
          <div style={{ fontSize: "var(--text-meta)", color: "var(--faint)", marginTop: 6 }}>
            {p.venue}
          </div>
          {p.exception ? (
            <div style={{ fontSize: "var(--text-meta)", color: "var(--warn)", marginTop: 6 }}>
              {p.exception}
            </div>
          ) : null}
        </div>
      </div>

      {/* Saldo, o colateral y deuda en lending */}
      {p.lending ? (
        <div className="text-right" data-label="Colateral y deuda" style={{ whiteSpace: "nowrap" }}>
          <GroupLabel>Colateral</GroupLabel>
          {p.lending.collateral.map((line, i) => (
            <div
              key={line}
              className="tabular-nums"
              style={{ fontSize: "var(--text-body)", marginTop: i === 0 ? 4 : 5 }}
            >
              {line}
            </div>
          ))}
          {/* La deuda se separa MÁS de lo normal y va en rojo con signo: pegada
              al colateral se leería como parte de él. */}
          <div style={{ marginTop: 16 }}>
            <GroupLabel>Deuda</GroupLabel>
          </div>
          {p.lending.debt.map((line) => (
            <div
              key={line}
              className="tabular-nums"
              style={{
                fontSize: "var(--text-body)",
                fontWeight: 500,
                color: "var(--loss)",
                marginTop: 4,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-right" data-label="Saldo" style={{ whiteSpace: "nowrap" }}>
          {p.balances.map((b, i) => (
            <div
              key={b}
              className="tabular-nums"
              style={{ fontSize: "var(--text-body)", marginTop: i === 0 ? 0 : 6 }}
            >
              {b}
            </div>
          ))}
        </div>
      )}

      {/* Depositado, con el lápiz de corrección al pasar por encima */}
      <div
        className="flex items-baseline justify-end"
        data-label="Depositado"
        style={{ gap: 7, whiteSpace: "nowrap" }}
      >
        {/* Se renderiza SIEMPRE y se descubre con el ratón o con el foco. Con
            `hovered && …` no existía en el DOM, así que no se alcanzaba con el
            tabulador en ninguna de las 17 filas, y al aparecer empujaba la cifra
            de al lado. Es el patrón que ya usa la tabla de Movimientos. */}
        {p.onEdit ? (
          <button
            type="button"
            onClick={p.onEdit}
            aria-label={`Corregir el depositado de ${p.name}`}
            className="focus-visible:opacity-100"
            style={{
              fontSize: "var(--text-meta)",
              color: "var(--faint)",
              cursor: "pointer",
              opacity: hovered ? 1 : 0,
            }}
          >
            ✎
          </button>
        ) : null}
        <span className="tabular-nums" style={{ fontSize: "var(--text-body)" }}>
          {p.deposited}
        </span>
      </div>

      {/* Valor actual, o valor neto en lending */}
      <span
        className="tabular-nums text-right"
        data-label={valueLabel}
        style={{ fontSize: "var(--text-body)", whiteSpace: "nowrap" }}
      >
        {p.currentValue}
      </span>

      {/* P&L. Va en TODAS las posiciones, también en los pools: antes los pools
          solo enseñaban rendimiento y ocultaban que JITOSOL/SOL perdía un 23 %. */}
      <div className="text-right" data-label="P&L" style={{ whiteSpace: "nowrap" }}>
        <div
          className="tabular-nums"
          style={{ fontSize: "var(--text-body)", fontWeight: 500, color: pnlColor }}
        >
          {p.pnl}
        </div>
        <div
          className="tabular-nums"
          style={{ fontSize: "var(--text-label)", color: pnlPercentColor, marginTop: 6 }}
        >
          {p.pnlPercent}
        </div>
      </div>

      {/* Rendimiento o interés. Vacío en Hold: la columna existe igual para que
          la rejilla no cambie entre secciones. */}
      <div className="text-right" data-label={p.yields?.length ? yieldLabel : undefined}>
        {(p.yields ?? []).map((y, i) => (
          <div
            key={y.label}
            className="flex items-baseline justify-end"
            style={{ gap: 7, whiteSpace: "nowrap", marginTop: i === 0 ? 0 : 6 }}
          >
            <span
              className="tabular-nums"
              style={{
                fontSize: "var(--text-body)",
                color: y.strong ? "var(--foreground)" : "var(--muted)",
              }}
            >
              {y.value}
            </span>
            <span style={{ fontSize: "var(--text-meta)", color: "var(--faint)" }}>{y.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: "var(--text-meta)", color: "var(--faint)", whiteSpace: "nowrap" }}>
      {children}
    </div>
  );
}
