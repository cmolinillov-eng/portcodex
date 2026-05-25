"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { PositionSection, DefiPosition } from "@/types/portfolio";
import { useMoneyFormatters } from "../utils/currency-context";

/**
 * Banner de alertas de Health Factor.
 *
 * Recorre todas las posiciones de lending y muestra una tarjeta con las
 * que están en estado `warning` (HF ≤ 2.2) o `critical` (HF < 1.5).
 * Si no hay ninguna, no renderiza nada.
 *
 * La severidad del banner es la peor entre las alertas individuales.
 *
 * Click en una alerta → scroll a la sección de lending del dashboard.
 */
export function HealthFactorAlertBanner({ sections }: { sections: PositionSection[] }) {
  const { fmtMoney: currency } = useMoneyFormatters();
  const lendingSection = sections.find((s) => s.key === "lending");
  if (!lendingSection) return null;

  const alerts = lendingSection.positions
    .filter((p) => p.healthStatus === "warning" || p.healthStatus === "critical")
    .sort((a, b) => (a.healthFactor ?? 99) - (b.healthFactor ?? 99));

  if (alerts.length === 0) return null;

  const hasCritical = alerts.some((a) => a.healthStatus === "critical");

  const tone = hasCritical
    ? {
        border: "rgba(239,68,68,0.55)",
        bg: "rgba(239,68,68,0.10)",
        text: "text-red-300",
        title: "text-red-200",
        Icon: ShieldAlert,
        heading: alerts.length === 1
          ? "Posición de lending en riesgo crítico de liquidación"
          : `${alerts.length} posiciones de lending en riesgo crítico`,
      }
    : {
        border: "rgba(245,158,11,0.5)",
        bg: "rgba(245,158,11,0.08)",
        text: "text-amber-200",
        title: "text-amber-100",
        Icon: AlertTriangle,
        heading: alerts.length === 1
          ? "Posición de lending con Health Factor bajo"
          : `${alerts.length} posiciones de lending con Health Factor bajo`,
      };

  const Icon = tone.Icon;

  const scrollToLending = () => {
    const el = document.getElementById("dashboard-section-lending");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const suggestAction = (position: DefiPosition): string => {
    const hf = position.healthFactor;
    if (hf === null) return "";
    if (hf < 1.0) return "Liquidación inminente — añadir colateral o repagar deuda YA.";
    if (hf < 1.2) return "Añadir colateral o repagar parte de la deuda urgentemente.";
    if (hf < 1.5) return "Considera reducir apalancamiento — buffer muy estrecho.";
    return "Vigilar: caída moderada podría tocar el umbral crítico.";
  };

  return (
    <section
      className="mb-5 rounded-2xl border px-4 py-3 backdrop-blur-md animate-fade-up"
      style={{ borderColor: tone.border, backgroundColor: tone.bg }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className="shrink-0 rounded-full p-2"
          style={{ backgroundColor: tone.border }}
        >
          <Icon className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold ${tone.title}`}>{tone.heading}</h3>
          <ul className="mt-2 space-y-1.5">
            {alerts.slice(0, 5).map((position) => {
              const hf = position.healthFactor;
              const hfLabel = hf === null ? "—" : hf.toFixed(2);
              const netLabel = position.lendingDetails
                ? ` · Neto ${currency(position.lendingDetails.netValueUsd)}`
                : "";
              const severityDot = position.healthStatus === "critical" ? "bg-red-400" : "bg-amber-400";
              return (
                <li key={`${position.portfolioId}-${position.positionId}`} className={`flex items-start gap-2 text-xs ${tone.text}`}>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="leading-snug">
                      <span className="font-semibold text-[var(--foreground)]">{position.protocol}</span>
                      <span className="text-[var(--muted)]"> · {position.tokenSymbol}</span>
                      <span className="ml-2 inline-flex items-center rounded-full bg-black/30 px-1.5 py-0.5 text-[10px] font-mono">
                        HF {hfLabel}
                      </span>
                      <span className="text-[var(--muted)]">{netLabel}</span>
                    </p>
                    <p className="text-[11px] opacity-80">{suggestAction(position)}</p>
                  </div>
                </li>
              );
            })}
            {alerts.length > 5 ? (
              <li className={`text-[11px] ${tone.text} opacity-80`}>
                +{alerts.length - 5} más…
              </li>
            ) : null}
          </ul>
          <div className="mt-3">
            <button
              type="button"
              onClick={scrollToLending}
              className="text-[11px] font-medium underline-offset-2 hover:underline"
              style={{ color: tone.border }}
            >
              Ver detalle de posiciones lending →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
