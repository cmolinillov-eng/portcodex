import type { CasillaRow } from "@/components/dashboard/fiscalidad/CasillaBreakdown";

/**
 * Datos de la maqueta 04-fiscalidad.html, literales.
 *
 * Las categorías y las casillas NO están inventadas: salen del vocabulario real
 * de `lib/tax/aeat-mapping.ts` («RCM staking» → 0027-0033, «GP permuta» y
 * «Pérdida patrimonial» → 1800-1814). Si la pantalla se conecta a datos reales,
 * los rótulos ya coinciden.
 */
export const CASILLA_ROWS: CasillaRow[] = [
  {
    id: "rcm-staking",
    casilla: "0027-0033",
    category: "RCM staking",
    operations: 15,
    amountEur: 373.59,
    concept: "Rendimiento de capital mobiliario por cesión a terceros",
  },
  {
    id: "perdida-patrimonial",
    casilla: "1800-1814",
    category: "Pérdida patrimonial",
    operations: 4,
    amountEur: -225.62,
    concept: "Pérdida compensable en la base del ahorro",
  },
  {
    id: "gp-permuta",
    casilla: "1800-1814",
    category: "GP permuta",
    operations: 2,
    amountEur: 13.4,
    concept: "Permuta cripto-cripto. Base del ahorro, criterio de la DGT",
  },
];

/** 373,59 − 225,62 + 13,40 = 161,37 €, que es la base del ahorro de la cabecera. */
export const CASILLA_TOTAL = { operations: 21, amountEur: 161.37 };
