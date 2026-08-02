import type { EvolutionPoint } from "@/components/dashboard/resumen/EvolutionChart";
import type { MovementRow } from "@/components/dashboard/resumen/RecentMovements";

/**
 * Datos de la maqueta aprobada (web/design/01-resumen.html), copiados tal cual.
 *
 * Sirven de patrón de comparación: si el componente pinta esto y no se ve como
 * la maqueta, el fallo está en el componente. Solo los usa /preview.
 */

const VALUES = [
  4120, 4380, 4210, 4650, 5020, 6720, 7180, 6960, 7540, 8320, 8010, 8740, 9210, 9480, 10120, 9860,
  10540, 10980, 11060, 11340, 11180, 11620, 12040, 12290, 12080, 11640, 11191.3,
];

const DEPOSITED = [
  4000, 4000, 4000, 4000, 4000, 6500, 6500, 6500, 6500, 8000, 8000, 8000, 8000, 8000, 9500, 9500,
  9500, 9500, 10800, 10800, 10800, 10800, 10800, 11946, 11946, 11946, 11946,
];

const LABELS = [
  "8 ene",
  "22 ene",
  "5 feb",
  "19 feb",
  "4 mar",
  "18 mar",
  "1 abr",
  "15 abr",
  "29 abr",
  "6 may",
  "13 may",
  "20 may",
  "27 may",
  "3 jun",
  "10 jun",
  "17 jun",
  "24 jun",
  "1 jul",
  "8 jul",
  "11 jul",
  "14 jul",
  "17 jul",
  "20 jul",
  "23 jul",
  "25 jul",
  "27 jul",
  "28 jul",
];

export const MOCK_EVOLUTION: EvolutionPoint[] = LABELS.map((label, i) => ({
  label,
  value: VALUES[i],
  deposited: DEPOSITED[i],
}));

export const MOCK_MOVEMENTS: MovementRow[] = [
  {
    id: "1",
    operation: "Harvest rewards",
    quantity: "18,9292",
    asset: "JTO",
    platform: "Kamino (METEORA)",
    network: "Solana",
    date: "27 jul · 09:41",
    amount: "+10,05 US$",
  },
  {
    id: "2",
    operation: "Añadir liquidez",
    quantity: "4.840,124",
    asset: "USDC",
    platform: "Kamino (ORCA)",
    network: "Solana",
    date: "26 jul · 17:12",
    amount: "−4.233,84 US$",
  },
  {
    id: "3",
    operation: "Retirada",
    quantity: "33,4055",
    asset: "SOL",
    platform: "Wallet",
    network: "Solana",
    date: "25 jul · 08:03",
    amount: "−2.259,14 US$",
  },
  {
    id: "4",
    operation: "Depósito",
    quantity: "19,9578",
    asset: "USDC",
    platform: "Wallet",
    network: "Solana",
    date: "24 jul · 12:47",
    amount: "+17,46 US$",
  },
  {
    id: "5",
    operation: "Harvest rewards",
    quantity: "19,8577",
    asset: "PYUSD",
    platform: "Kamino (ORCA)",
    network: "Solana",
    date: "22 jul · 19:25",
    amount: "+17,37 US$",
  },
];
