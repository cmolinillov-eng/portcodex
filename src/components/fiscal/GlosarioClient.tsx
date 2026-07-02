"use client";

import { useMemo, useState } from "react";
import { Search, BookOpen } from "lucide-react";

type GlosarioCategory =
  | "Categoría fiscal"
  | "Base imponible"
  | "Método de cálculo"
  | "Casillas IRPF"
  | "Modelos AEAT"
  | "Conceptos DeFi"
  | "Billeteras";

interface GlosarioTerm {
  term: string;
  category: GlosarioCategory;
  definition: string;
  example?: string;
  source?: string;
}

const TERMS: GlosarioTerm[] = [
  // ─── Categoría fiscal ──────────────────────────────────────────────────
  {
    term: "Ganancia patrimonial por transmisión",
    category: "Categoría fiscal",
    definition:
      "Diferencia positiva entre el valor de transmisión y el coste de adquisición (FIFO) cuando vendes cripto a fiat o pagas con cripto. Tributa en la base del ahorro.",
    example: "Vendes 0,5 BTC comprados por 8.000 € a 15.000 €: ganancia de 7.000 € en la base del ahorro.",
    source: "Art. 33-34 LIRPF",
  },
  {
    term: "Ganancia patrimonial por permuta",
    category: "Categoría fiscal",
    definition:
      "Intercambio de una cripto por otra (swap, aportar/retirar liquidez). Hacienda lo considera permuta: tributa la diferencia entre el valor de mercado de lo entregado y su coste de adquisición.",
    example: "Cambias ETH (coste 1.000 €) por SOL valorados en 1.800 €: ganancia de 800 € aunque no toques fiat.",
    source: "Criterio DGT · Art. 37.1.h LIRPF",
  },
  {
    term: "Pérdida patrimonial",
    category: "Categoría fiscal",
    definition:
      "Resultado negativo de una transmisión o permuta. Es compensable con ganancias de la base del ahorro del mismo ejercicio y, con límites, en los 4 años siguientes.",
    example: "Vendes una cripto comprada por 2.000 € a 1.200 €: pérdida de 800 € compensable.",
    source: "Art. 48-49 LIRPF",
  },
  {
    term: "Rendimiento de capital mobiliario (RCM)",
    category: "Categoría fiscal",
    definition:
      "Renta obtenida por ceder capital a terceros: intereses de lending, recompensas de staking y farming. Tributa en la base del ahorro por su valor en EUR al recibirlo.",
    example: "Recibes 0,1 ETH de staking valorados en 250 €: 250 € de RCM en la base del ahorro.",
    source: "Art. 25.2 LIRPF",
  },
  {
    term: "Ganancia en base general (airdrop / fork)",
    category: "Categoría fiscal",
    definition:
      "Cripto recibida gratis sin transmisión previa (airdrops, hard forks). Tributa por su valor de mercado al recibirla, pero en la base general (tarifa progresiva), no en la del ahorro.",
    example: "Recibes un airdrop valorado en 500 €: 500 € a integrar en la base general.",
    source: "Criterio DGT V0999-18",
  },
  {
    term: "Rendimiento del trabajo / actividad",
    category: "Categoría fiscal",
    definition:
      "Cripto cobrada como salario (rendimiento del trabajo) o como pago profesional/empresarial (actividad económica). Tributa en la base general por su valor en EUR.",
    example: "Cobras 1.000 € en USDC por un servicio profesional: rendimiento de actividad económica.",
    source: "Art. 17 y 27 LIRPF",
  },
  {
    term: "Operación no imponible",
    category: "Categoría fiscal",
    definition:
      "Movimientos que no generan hecho imponible: compras con fiat, transferencias entre tus propias billeteras, approves/firmas, depósitos y retiradas de lending. Solo crean o mueven trazabilidad.",
    example: "Mover 1 ETH de tu hardware wallet a un exchange propio no tributa.",
  },

  // ─── Base imponible ────────────────────────────────────────────────────
  {
    term: "Base del ahorro",
    category: "Base imponible",
    definition:
      "Parte de la base imponible donde tributan las ganancias/pérdidas por transmisión y permuta, los RCM y los derivados. Tipos progresivos del 19 % al 28 % (ejercicio 2024-2025).",
    source: "Art. 66 LIRPF",
  },
  {
    term: "Base general",
    category: "Base imponible",
    definition:
      "Parte de la base donde tributan los rendimientos del trabajo, de actividad económica y las ganancias no derivadas de transmisión (airdrops, forks). Tarifa general progresiva.",
    source: "Art. 63 LIRPF",
  },

  // ─── Método de cálculo ─────────────────────────────────────────────────
  {
    term: "FIFO (First In, First Out)",
    category: "Método de cálculo",
    definition:
      "Para calcular la ganancia, se considera que las primeras unidades compradas son las primeras en venderse. Es el método obligatorio para criptomonedas homogéneas en España.",
    example: "Si compraste 1 BTC a 8.000 € y luego otro a 20.000 €, al vender 1 BTC se usa el coste de 8.000 €.",
    source: "Art. 37.2 LIRPF",
  },
  {
    term: "Coste de adquisición (cost basis)",
    category: "Método de cálculo",
    definition:
      "Importe en EUR por el que adquiriste el activo, incluyendo comisiones. Es lo que se resta del valor de transmisión para obtener la ganancia o pérdida.",
  },
  {
    term: "Valor de transmisión",
    category: "Método de cálculo",
    definition:
      "Importe en EUR que recibes (o valor de mercado de lo que recibes en una permuta) al disponer del activo. Menos el coste de adquisición da la ganancia/pérdida.",
  },

  // ─── Casillas IRPF ─────────────────────────────────────────────────────
  {
    term: "Casillas 1800-1814",
    category: "Casillas IRPF",
    definition:
      "Ganancias y pérdidas patrimoniales por transmisión de elementos patrimoniales (incluye cripto). Se integran en la base del ahorro del Modelo 100.",
    source: "Modelo 100 IRPF",
  },
  {
    term: "Casilla 0304",
    category: "Casillas IRPF",
    definition:
      "Ganancias patrimoniales que NO derivan de transmisión (airdrops, forks). Se integran en la base general.",
    source: "Modelo 100 IRPF",
  },
  {
    term: "Casillas 0027-0033",
    category: "Casillas IRPF",
    definition:
      "Rendimientos de capital mobiliario por cesión a terceros de capitales propios: staking, lending, farming. Base del ahorro.",
    source: "Modelo 100 IRPF",
  },
  {
    term: "Casillas 0003-0018 / 0224-0233",
    category: "Casillas IRPF",
    definition:
      "Rendimientos del trabajo (0003-0018) y de actividades económicas (0224-0233) cobrados en cripto. Base general.",
    source: "Modelo 100 IRPF",
  },

  // ─── Modelos AEAT ──────────────────────────────────────────────────────
  {
    term: "Modelo 100",
    category: "Modelos AEAT",
    definition:
      "La declaración de la renta (IRPF). Donde se declaran ganancias, pérdidas y rendimientos derivados de tus operaciones con cripto a lo largo del año.",
    source: "AEAT",
  },
  {
    term: "Modelo 721",
    category: "Modelos AEAT",
    definition:
      "Declaración informativa de criptomonedas custodiadas en el extranjero. Obligatorio si el valor total en proveedores NO residentes en España supera 50.000 € a 31 de diciembre.",
    example: "Si a 31/12 tienes 60.000 € en un exchange extranjero, debes presentar el Modelo 721.",
    source: "Orden HFP/886/2023",
  },
  {
    term: "Modelo 172 / 173",
    category: "Modelos AEAT",
    definition:
      "Declaraciones informativas que presentan los exchanges y custodios residentes en España sobre saldos y operaciones de sus usuarios. No las presenta el contribuyente.",
    source: "AEAT",
  },

  // ─── Conceptos DeFi ────────────────────────────────────────────────────
  {
    term: "Liquidity Pool (LP)",
    category: "Conceptos DeFi",
    definition:
      "Depósito de un par de tokens en un protocolo (Uniswap, Orca…) a cambio de un LP token. Aportar y retirar liquidez se tratan como permutas a efectos fiscales.",
    example: "Depositas ETH + USDC en un pool: es una permuta de ambos tokens por el LP token.",
  },
  {
    term: "Staking",
    category: "Conceptos DeFi",
    definition:
      "Bloquear cripto para validar una red Proof-of-Stake a cambio de recompensas. Las recompensas son RCM por su valor en EUR al recibirlas; el unstake del principal no tributa.",
  },
  {
    term: "Lending / Borrowing",
    category: "Conceptos DeFi",
    definition:
      "Prestar cripto a un protocolo a cambio de interés (RCM), o tomarla prestada dejando colateral. El depósito y la retirada del principal no tributan; solo el interés cobrado.",
  },
  {
    term: "Harvest (recolectar recompensas)",
    category: "Conceptos DeFi",
    definition:
      "Reclamar las recompensas acumuladas de farming o staking. Genera RCM por el valor en EUR de lo recolectado en ese momento.",
  },
  {
    term: "Derivados (perpetuos / futuros)",
    category: "Conceptos DeFi",
    definition:
      "Contratos cuyo valor deriva de un subyacente. El resultado al cerrar la posición (PnL) y el funding tributan como ganancia/pérdida en la base del ahorro.",
  },

  // ─── Billeteras ────────────────────────────────────────────────────────
  {
    term: "Billetera centralizada (CEX)",
    category: "Billeteras",
    definition:
      "Exchange o bróker que custodia tus claves (Binance, Coinbase, Revolut). Implica un custodio; si es extranjero cuenta para el Modelo 721. Suelen reportar a la AEAT (172/173).",
  },
  {
    term: "Billetera descentralizada (autocustodia)",
    category: "Billeteras",
    definition:
      "Tú controlas las claves: hardware wallet, hot wallet, DEX, smart contract wallet. No hay custodio externo y no aplica el Modelo 721, pero la trazabilidad es 100 % tu responsabilidad.",
  },
];

const CATEGORIES: GlosarioCategory[] = [
  "Categoría fiscal",
  "Base imponible",
  "Método de cálculo",
  "Casillas IRPF",
  "Modelos AEAT",
  "Conceptos DeFi",
  "Billeteras",
];

export function GlosarioClient() {
  const [activeCategory, setActiveCategory] = useState<GlosarioCategory | "todas">("todas");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TERMS.filter((t) => {
      if (activeCategory !== "todas" && t.category !== activeCategory) return false;
      if (q) {
        const hay = `${t.term} ${t.definition} ${t.example ?? ""} ${t.source ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeCategory, query]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-7 py-7">
      {/* Buscador */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar término, concepto o casilla…"
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--void-surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[rgba(230,193,115,0.55)] focus:outline-none"
        />
      </div>

      {/* Filtros de categoría */}
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label="Todas"
          active={activeCategory === "todas"}
          onClick={() => setActiveCategory("todas")}
        />
        {CATEGORIES.map((c) => (
          <CategoryChip key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
        ))}
      </div>

      {/* Términos */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] px-5 py-12 text-center text-sm text-[var(--muted)]">
          No hay términos que coincidan con la búsqueda.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <article
              key={t.term}
              className="rounded-2xl border border-[var(--line)] bg-[var(--void-surface)] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <BookOpen className="h-4 w-4 text-[#E6C173]" />
                  {t.term}
                </h3>
                <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--void-elevated)] px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                  {t.category}
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--muted)]">{t.definition}</p>
              {t.example ? (
                <p className="mt-3 rounded-lg border border-[rgba(230,193,115,0.18)] bg-[rgba(230,193,115,0.06)] px-3 py-2 text-xs leading-relaxed text-[var(--brand-soft)]">
                  <span className="font-medium text-[#E6C173]">Ejemplo · </span>
                  {t.example}
                </p>
              ) : null}
              {t.source ? (
                <p className="mt-2.5 text-[11px] uppercase tracking-wide text-[var(--muted)]/80">
                  Fuente · {t.source}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        Definiciones orientativas para entender la trazabilidad de tus movimientos. Las casillas del Modelo 100
        cambian de numeración cada ejercicio. No constituye asesoramiento fiscal.
      </p>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-[rgba(230,193,115,0.5)] bg-[rgba(230,193,115,0.14)] text-[#E6C173]"
          : "border-[var(--line)] bg-[var(--void-surface)] text-[var(--muted)] hover:border-[rgba(230,193,115,0.3)]"
      }`}
    >
      {label}
    </button>
  );
}
