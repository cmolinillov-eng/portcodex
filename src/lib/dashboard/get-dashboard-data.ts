import { unstable_noStore as noStore } from "next/cache";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getViewerAccess, type ViewerRole } from "@/lib/auth/viewer-access";
import type { DefiPosition, LendingDetails, PortfolioSummary, PositionSection, QuickAction } from "@/types/portfolio";
import {
  calculateHealthFactor,
  calculateLiquidationPrices,
  calculateLtv,
  calculateMaxLtv,
} from "@/lib/lending/thresholds";
import { getUsdToEurRate } from "@/lib/fx/usd-eur";
import { computePortfolioValuation, type ValuationTx } from "@/lib/portfolio/valuation";

export type ViewerPermissions = {
  role: ViewerRole;
  isSuperAdmin: boolean;
  canOperate: boolean;
  canDeletePosition: boolean;
  canRefreshPrices: boolean;
};

export type DashboardData = {
  summary: PortfolioSummary;
  sections: PositionSection[];
  actions: QuickAction[];
  harvestByPosition: HarvestPositionSummary[];
  recentActivity: RecentActivityItem[];
  pricesBySymbol: Record<string, number>;
  pricesLastUpdatedAt: string | null;
  pricesAreStale: boolean;
  /** Tipos de cambio relativos al USD (1 USD = fxRates.eur EUR). */
  fxRates: {
    eur: number;
  };
  viewer: ViewerPermissions;
  portfolioContext: {
    portfolioId: string;
    portfolioName: string;
    ownerName: string;
    ownerEmail: string;
    managerName: string | null;
    managerEmail: string | null;
  } | null;
};

export type HarvestPositionSummary = {
  key: string;
  portfolioId: string;
  protocol: string;
  positionId: string;
  harvestedUsd: number;
  pendingUsd: number;
  pendingByToken: Array<{ tokenSymbol: string; amount: number }>;
};

export type RecentActivityItem = {
  transactionDate: string;
  type: string;
  /**
   * De qué operación del gestor viene la fila. Un rebalanceo se escribe como
   * una retirada y un depósito normales: sin esta marca, la actividad reciente
   * lo enseñaba como si el cliente hubiera sacado dinero y hecho otra
   * aportación —dos hechos que no han ocurrido—.
   */
  movementOrigin: "harvest_reinvest" | "rebalance" | "standard";
  operationGroupId: string;
  /** Portfolio dueño de la operación; necesario para deshacerla con permisos. */
  portfolioId: string;
  /** reason de metadata (deleted/rebalanced/auto_closed/manual_edit…) para decidir si es deshacible. */
  reason: string;
  protocol: string;
  positionId: string;
  positionType: string;
  tokenInSymbol: string;
  tokenInAmount: number;
  tokenOutSymbol: string;
  tokenOutAmount: number;
  spotPrice: number;
};

type DefiPositionAnalyticsRow = {
  portfolio_id: string | null;
  token_symbol: string | null;
  protocol: string | null;
  position_id: string | null;
  position_type: string | null;
  current_balance: string | number | null;
  average_entry_price: string | number | null;
  total_harvested: string | number | null;
  is_active: boolean | null;
};

type CachedPriceRow = {
  token_symbol: string | null;
  price: string | number | null;
  last_updated: string | null;
};

type LendingTransactionRow = {
  portfolio_id: string | null;
  position_id: string | null;
  protocol: string | null;
  type: string | null;
  position_type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
};

type LpMetadata = {
  tokenA: string;
  tokenB: string;
  rangeLower: number;
  rangeUpper: number;
  entryPriceRatio: number;
  isCorrelated: boolean;
};

type LpMetadataRow = {
  portfolio_id: string | null;
  position_id: string | null;
  protocol: string | null;
  metadata: unknown;
  notes: string | null;
  transaction_date: string | null;
};

type PortfolioTransactionRow = {
  portfolio_id: string | null;
  protocol: string | null;
  position_id: string | null;
  type: string | null;
  position_type: string | null;
  transaction_date: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
  metadata: unknown;
  notes: string | null;
};

type RecentActivityRow = {
  portfolio_id?: string | null;
  transaction_date: string | null;
  type: string | null;
  operation_group_id?: string | null;
  metadata: unknown;
  notes: string | null;
  protocol: string | null;
  position_id: string | null;
  position_type: string | null;
  token_in_symbol: string | null;
  token_in_amount: string | number | null;
  token_out_symbol: string | null;
  token_out_amount: string | number | null;
  spot_price: string | number | null;
};

type ProfileRoleRow = {
  role: ViewerRole | null;
};

type PortfolioIdRow = {
  id: string | null;
};

type ProfileReference = {
  full_name: string | null;
  email: string | null;
};

type PortfolioContextRow = {
  id: string | null;
  name: string | null;
  owner: ProfileReference | ProfileReference[] | null;
  manager: ProfileReference | ProfileReference[] | null;
};

const quickActions: QuickAction[] = [
  { key: "deposit", label: "Depositar" },
  { key: "withdraw", label: "Retirar" },
  { key: "swap", label: "Swap" },
];

const sectionTitleByKey: Record<PositionSection["key"], string> = {
  wallet: "Wallet (HODL)",
  lending: "Lending Protocols",
  liquidity_pools: "Liquidity Pools",
  staking: "Staking",
};

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatUsdLabel(value: number): string {
  return `${value.toLocaleString("es-ES", { maximumFractionDigits: 2 })}\u00A0US$`;
}

function formatTokenAmounts(tokenAmounts: Record<string, number>): string {
  return Object.entries(tokenAmounts)
    .filter(([, amount]) => amount > 0)
    .map(([symbol, amount]) => `${amount.toLocaleString("en-US")} ${symbol}`)
    .join(" + ");
}

function normalizePositionType(positionType: string | null): string {
  return (positionType ?? "Hold").trim();
}

function positionCompositeKey(portfolioId: string, protocol: string, positionId: string): string {
  return `${portfolioId.trim()}::${protocol.trim().toLowerCase()}::${positionId.trim()}`;
}

function mapCategory(positionType: string): PositionSection["key"] {
  const normalized = positionType.toLowerCase();
  if (normalized.includes("lending")) return "lending";
  if (normalized.includes("staking")) return "staking";
  if (normalized.includes("lp") || normalized.includes("liquidity")) return "liquidity_pools";
  return "wallet";
}

function calculateRoiPercent(currentPrice: number, averageEntryPrice: number): number {
  if (averageEntryPrice <= 0) return 0;
  return ((currentPrice - averageEntryPrice) / averageEntryPrice) * 100;
}

function isLiquidityPoolPosition(positionType: string): boolean {
  const normalized = positionType.toLowerCase();
  return normalized.includes("lp") || normalized.includes("liquidity");
}

function calculateImpermanentLossPercent(currentPrice: number, averageEntryPrice: number): number | null {
  if (averageEntryPrice <= 0 || currentPrice <= 0) return null;
  const p = currentPrice / averageEntryPrice;
  if (p <= 0) return null;
  const il = (2 * (Math.sqrt(p) / (1 + p))) - 1;
  return il * 100;
}

function calculateImpermanentLossFromRatio(priceRatio: number): number | null {
  if (!Number.isFinite(priceRatio) || priceRatio <= 0) return null;
  const il = (2 * (Math.sqrt(priceRatio) / (1 + priceRatio))) - 1;
  return il * 100;
}

function normalizeLpMetadata(candidate: unknown): LpMetadata | null {
  try {
    const parsed = candidate as {
      lp?: {
        tokenA?: string;
        tokenB?: string;
        rangeLower?: number;
        rangeUpper?: number;
        entryPriceRatio?: number;
        isCorrelated?: boolean;
      };
    };
    const lp = parsed.lp;
    if (!lp?.tokenA || !lp?.tokenB) return null;
    const isCorrelated = lp.isCorrelated === true;
    const rangeLower = Number(lp.rangeLower ?? 0);
    const rangeUpper = Number(lp.rangeUpper ?? 0);
    const entryPriceRatio = Number(lp.entryPriceRatio ?? 0);
    // Correlated pools don't need valid range/ratio
    if (!isCorrelated && (rangeLower < 0 || rangeUpper <= 0 || rangeUpper <= rangeLower || entryPriceRatio <= 0)) return null;
    return {
      tokenA: lp.tokenA.toUpperCase(),
      tokenB: lp.tokenB.toUpperCase(),
      rangeLower,
      rangeUpper,
      entryPriceRatio,
      isCorrelated,
    };
  } catch {
    return null;
  }
}

function parseLpMetadata(metadata: unknown, notes: string | null): LpMetadata | null {
  const fromMetadata = normalizeLpMetadata(metadata);
  if (fromMetadata) return fromMetadata;
  if (!notes) return null;

  try {
    const parsedNotes = JSON.parse(notes);
    return normalizeLpMetadata(parsedNotes);
  } catch {
    return null;
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function getMetadataFlag(
  metadata: unknown,
  notes: string | null,
  key: "reason" | "source" | "sourcePositionId" | "sourceProtocol",
): string | null {
  const fromMetadata = parseJsonObject(metadata);
  if (fromMetadata && typeof fromMetadata[key] === "string") {
    return String(fromMetadata[key]);
  }
  const fromNotes = parseJsonObject(notes);
  if (fromNotes && typeof fromNotes[key] === "string") {
    return String(fromNotes[key]);
  }
  return null;
}

function getMetadataNumber(
  metadata: unknown,
  notes: string | null,
  key: "depositedDelta",
): number | null {
  const fromMetadata = parseJsonObject(metadata);
  if (fromMetadata && typeof fromMetadata[key] === "number" && Number.isFinite(fromMetadata[key])) {
    return Number(fromMetadata[key]);
  }
  const fromNotes = parseJsonObject(notes);
  if (fromNotes && typeof fromNotes[key] === "number" && Number.isFinite(fromNotes[key])) {
    return Number(fromNotes[key]);
  }
  return null;
}

/**
 * Legs de la permuta implícita de una reinversión on-chain
 * (metadata.swapLegs, ver src/app/api/onchain/events/route.ts): parte del
 * harvest se vendió dentro de la misma tx para comprar el otro token de la
 * cesta. Para el pending del harvest, lo vendido sale y lo comprado entra.
 */
type ReinvestSwapLeg = { soldSymbol: string; soldAmount: number; boughtSymbol: string; boughtAmount: number };
function getSwapLegs(metadata: unknown, notes: string | null): ReinvestSwapLeg[] {
  const obj = parseJsonObject(metadata) ?? parseJsonObject(notes);
  const raw = obj?.swapLegs;
  if (!Array.isArray(raw)) return [];
  const legs: ReinvestSwapLeg[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const leg = item as Record<string, unknown>;
    if (
      typeof leg.soldSymbol === "string" &&
      typeof leg.boughtSymbol === "string" &&
      typeof leg.soldAmount === "number" && Number.isFinite(leg.soldAmount) && leg.soldAmount > 0 &&
      typeof leg.boughtAmount === "number" && Number.isFinite(leg.boughtAmount) && leg.boughtAmount > 0
    ) {
      legs.push({
        soldSymbol: leg.soldSymbol.trim().toUpperCase(),
        soldAmount: leg.soldAmount,
        boughtSymbol: leg.boughtSymbol.trim().toUpperCase(),
        boughtAmount: leg.boughtAmount,
      });
    }
  }
  return legs;
}

function isMissingColumnError(message: string, column: string): boolean {
  return message.toLowerCase().includes(column.toLowerCase());
}

function readProfileReference(
  value: ProfileReference | ProfileReference[] | null,
): ProfileReference | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function displayName(profile: ProfileReference | null): string {
  if (!profile) return "";
  const fullName = (profile.full_name ?? "").trim();
  if (fullName.length > 0) return fullName;
  return (profile.email ?? "").trim();
}

function normalizeViewerRole(role: string | null | undefined): ViewerRole {
  if (role === "admin" || role === "cliente" || role === "autonomo") return role;
  return "autonomo";
}

async function fetchPortfolioIdsForTargetUser(targetUserId: string): Promise<string[]> {
  const client = getSupabaseServiceClient() ?? getSupabaseServerClient();

  const profileQuery = await client
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .maybeSingle();

  if (profileQuery.error) return [];
  const role = normalizeViewerRole(((profileQuery.data ?? null) as ProfileRoleRow | null)?.role);

  if (role === "admin") {
    const [ownedQuery, managedQuery] = await Promise.all([
      client.from("portfolios").select("id").eq("owner_id", targetUserId),
      client.from("portfolios").select("id").eq("manager_id", targetUserId),
    ]);
    const ids = new Set<string>();
    for (const row of (ownedQuery.data ?? []) as PortfolioIdRow[]) {
      if (row.id) ids.add(row.id);
    }
    for (const row of (managedQuery.data ?? []) as PortfolioIdRow[]) {
      if (row.id) ids.add(row.id);
    }
    return Array.from(ids);
  }

  const ownQuery = await client.from("portfolios").select("id").eq("owner_id", targetUserId);
  if (ownQuery.error) return [];
  return ((ownQuery.data ?? []) as PortfolioIdRow[])
    .map((row) => row.id ?? "")
    .filter((id) => id.length > 0);
}

async function fetchPortfolioContexts(portfolioIds: string[]): Promise<
  Array<{
    portfolioId: string;
    portfolioName: string;
    ownerName: string;
    ownerEmail: string;
    managerName: string | null;
    managerEmail: string | null;
  }>
> {
  if (portfolioIds.length === 0) return [];

  const fetchWithClient = async (useService: boolean) => {
    const client = useService ? (getSupabaseServiceClient() ?? getSupabaseServerClient()) : getSupabaseServerClient();
    return client
      .from("portfolios")
      .select("id, name, owner:profiles!owner_id(full_name, email), manager:profiles!manager_id(full_name, email)")
      .in("id", portfolioIds);
  };

  const primary = await fetchWithClient(false);
  let rows = (primary.data ?? []) as PortfolioContextRow[];
  let queryError = primary.error;

  if ((queryError || rows.length === 0) && getSupabaseServiceClient()) {
    const fallback = await fetchWithClient(true);
    rows = (fallback.data ?? []) as PortfolioContextRow[];
    queryError = fallback.error;
  }

  if (queryError) {
    throw new Error(`Error consultando contexto de portfolios: ${queryError.message}`);
  }

  return rows
    .map((row) => {
      const owner = readProfileReference(row.owner);
      const manager = readProfileReference(row.manager);
      const portfolioId = (row.id ?? "").trim();
      if (!portfolioId) return null;
      return {
        portfolioId,
        portfolioName: (row.name ?? "").trim() || "Portfolio",
        ownerName: displayName(owner),
        ownerEmail: (owner?.email ?? "").trim(),
        managerName: displayName(manager) || null,
        managerEmail: (manager?.email ?? "").trim() || null,
      };
    })
    .filter((row): row is {
      portfolioId: string;
      portfolioName: string;
      ownerName: string;
      ownerEmail: string;
      managerName: string | null;
      managerEmail: string | null;
    } => row !== null);
}

async function fetchLivePositions(allowedPortfolioIds: string[]): Promise<DefiPositionAnalyticsRow[]> {
  if (allowedPortfolioIds.length === 0) return [];

  const publicClient = getSupabaseServerClient();
  const publicQuery = await publicClient
    .from("defi_positions_analytics")
    .select(
      "portfolio_id, token_symbol, protocol, position_id, position_type, current_balance, average_entry_price, total_harvested, is_active",
    )
    .in("portfolio_id", allowedPortfolioIds)
    .eq("is_active", true);

  if (publicQuery.error) {
    throw new Error(`Error consultando defi_positions_analytics: ${publicQuery.error.message}`);
  }

  const publicRows = (publicQuery.data ?? []) as DefiPositionAnalyticsRow[];
  if (publicRows.length > 0) return publicRows;

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return publicRows;

  const serviceQuery = await serviceClient
    .from("defi_positions_analytics")
    .select(
      "portfolio_id, token_symbol, protocol, position_id, position_type, current_balance, average_entry_price, total_harvested, is_active",
    )
    .in("portfolio_id", allowedPortfolioIds)
    .eq("is_active", true);

  if (serviceQuery.error) {
    throw new Error(`Error consultando defi_positions_analytics con service role: ${serviceQuery.error.message}`);
  }

  return (serviceQuery.data ?? []) as DefiPositionAnalyticsRow[];
}

async function fetchCachedPrices(): Promise<{
  pricesBySymbol: Map<string, number>;
  pricesLastUpdatedAt: string | null;
  pricesAreStale: boolean;
}> {
  const publicClient = getSupabaseServerClient();
  const query = await publicClient.from("cached_prices").select("token_symbol, price, last_updated");

  const mapRows = (rows: CachedPriceRow[]): {
    pricesBySymbol: Map<string, number>;
    pricesLastUpdatedAt: string | null;
    pricesAreStale: boolean;
  } => {
    let latestMillis = 0;
    const pricesBySymbol = rows.reduce((map, row) => {
      const symbol = (row.token_symbol ?? "").toUpperCase();
      if (!symbol) return map;
      map.set(symbol, toNumber(row.price));
      const millis = row.last_updated ? Date.parse(row.last_updated) : 0;
      if (Number.isFinite(millis) && millis > latestMillis) {
        latestMillis = millis;
      }
      return map;
    }, new Map<string, number>());
    const pricesLastUpdatedAt = latestMillis > 0 ? new Date(latestMillis).toISOString() : null;
    const pricesAreStale = latestMillis > 0 ? Date.now() - latestMillis > 10 * 60 * 1000 : true;
    return { pricesBySymbol, pricesLastUpdatedAt, pricesAreStale };
  };

  if (!query.error && query.data) {
    const publicMapped = mapRows(query.data as CachedPriceRow[]);
    if (publicMapped.pricesBySymbol.size > 0) {
      return publicMapped;
    }
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    throw new Error(`Error consultando cached_prices: ${query.error?.message ?? "No disponible"}`);
  }

  const serviceQuery = await serviceClient.from("cached_prices").select("token_symbol, price, last_updated");
  if (serviceQuery.error) {
    throw new Error(`Error consultando cached_prices con service role: ${serviceQuery.error.message}`);
  }

  return mapRows((serviceQuery.data ?? []) as CachedPriceRow[]);
}

async function fetchLendingTransactions(allowedPortfolioIds: string[]): Promise<LendingTransactionRow[]> {
  if (allowedPortfolioIds.length === 0) return [];

  const publicClient = getSupabaseServerClient();
  const publicQuery = await publicClient
    .from("transactions")
    .select("portfolio_id, position_id, protocol, type, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount")
    .in("portfolio_id", allowedPortfolioIds)
    .in("type", ["lending_supply", "lending_borrow", "lending_withdraw", "withdrawal"])
    .is("deleted_at", null);
  const publicData = (publicQuery.data ?? null) as LendingTransactionRow[] | null;
  const publicError = publicQuery.error;

  if (!publicError && publicData && publicData.length > 0) {
    return publicData;
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return [];

  const serviceQuery = await serviceClient
    .from("transactions")
    .select("portfolio_id, position_id, protocol, type, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount")
    .in("portfolio_id", allowedPortfolioIds)
    .in("type", ["lending_supply", "lending_borrow", "lending_withdraw", "withdrawal"])
    .is("deleted_at", null);
  const serviceData = (serviceQuery.data ?? null) as LendingTransactionRow[] | null;
  const serviceError = serviceQuery.error;

  if (serviceError) {
    throw new Error(`Error consultando transacciones lending: ${serviceError.message}`);
  }

  return serviceData ?? [];
}

async function fetchLpMetadataRows(allowedPortfolioIds: string[]): Promise<LpMetadataRow[]> {
  if (allowedPortfolioIds.length === 0) return [];

  const publicClient = getSupabaseServerClient();
  const publicQuery = await publicClient
    .from("transactions")
    .select("portfolio_id, position_id, protocol, metadata, notes, transaction_date")
    .in("portfolio_id", allowedPortfolioIds)
    .eq("type", "lp_deposit")
    .is("deleted_at", null);
  const publicData = (publicQuery.data ?? null) as LpMetadataRow[] | null;
  const publicError = publicQuery.error;

  if (!publicError && publicData && publicData.length > 0) {
    return publicData;
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return [];

  const serviceQuery = await serviceClient
    .from("transactions")
    .select("portfolio_id, position_id, protocol, metadata, notes, transaction_date")
    .in("portfolio_id", allowedPortfolioIds)
    .eq("type", "lp_deposit")
    .is("deleted_at", null);
  const serviceData = (serviceQuery.data ?? null) as LpMetadataRow[] | null;
  const serviceError = serviceQuery.error;

  if (serviceError) {
    throw new Error(`Error consultando metadata LP: ${serviceError.message}`);
  }

  return serviceData ?? [];
}

async function fetchPortfolioTransactions(portfolioIds: string[]): Promise<PortfolioTransactionRow[]> {
  /*
   * El ORDEN es parte del cálculo, no una comodidad.
   *
   * Estas filas se recorren acumulando saldo: cada depósito suma y cada retirada
   * resta. Se pedían SIN `.order(...)`, y Postgres no promete ningún orden — el
   * que salga depende del plan de la consulta. Si una retirada se procesa antes
   * que los depósitos que la respaldan, el saldo se va en negativo, la línea
   * `if (entry.balance < 0) entry.balance = 0` lo recorta en silencio, y el
   * importe de esa retirada se PIERDE: los depósitos posteriores quedan como
   * saldo que ya no existe.
   *
   * Medido en una cartera real: una retirada de 33,41 SOL se aplicaba sobre un
   * acumulado de 2,74, se recortaba a cero, y la posición acababa enseñando
   * 30,68 SOL —unos 2.230 US$— cuando el saldo verdadero era 0,0186 SOL. La
   * lectura on-chain, la vista de analítica y el motor canónico coincidían en el
   * valor bueno; solo esta función lo inventaba.
   *
   * Mismo orden que usa `computeTraceability` para el FIFO: fecha y, a igualdad,
   * id — porque dos operaciones del mismo instante también necesitan un
   * desempate estable, o el resultado cambia entre dos cargas iguales.
   */
  if (portfolioIds.length === 0) return [];

  const publicClient = getSupabaseServerClient();
  const publicQuery = await publicClient
    .from("transactions")
    .select("portfolio_id, protocol, position_id, type, position_type, transaction_date, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes")
    .in("portfolio_id", portfolioIds)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true });
  const publicData = (publicQuery.data ?? null) as PortfolioTransactionRow[] | null;
  const publicError = publicQuery.error;

  if (!publicError && publicData && publicData.length > 0) {
    return publicData;
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return [];

  const serviceQuery = await serviceClient
    .from("transactions")
    .select("portfolio_id, protocol, position_id, type, position_type, transaction_date, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price, metadata, notes")
    .in("portfolio_id", portfolioIds)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: true })
    .order("id", { ascending: true });
  const serviceData = (serviceQuery.data ?? null) as PortfolioTransactionRow[] | null;
  const serviceError = serviceQuery.error;

  if (serviceError) {
    throw new Error(`Error consultando transacciones del portfolio: ${serviceError.message}`);
  }

  return serviceData ?? [];
}

async function fetchRecentActivityRows(allowedPortfolioIds: string[], limit = 100): Promise<RecentActivityRow[]> {
  if (allowedPortfolioIds.length === 0) return [];

  const publicClient = getSupabaseServerClient();
  const publicQuery = await publicClient
    .from("transactions")
    .select(
      "portfolio_id, transaction_date, type, operation_group_id, metadata, notes, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price",
    )
    .in("portfolio_id", allowedPortfolioIds)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  const publicFallbackQuery =
    publicQuery.error &&
    (isMissingColumnError(publicQuery.error.message, "deleted_at") ||
      isMissingColumnError(publicQuery.error.message, "operation_group_id"))
      ? await publicClient
          .from("transactions")
          .select(
            "portfolio_id, transaction_date, type, metadata, notes, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price",
          )
          .in("portfolio_id", allowedPortfolioIds)
          .order("transaction_date", { ascending: false })
          .limit(limit)
      : null;
  const publicData = (publicFallbackQuery?.data ?? publicQuery.data) as RecentActivityRow[] | null;
  const publicError = publicFallbackQuery?.error ?? publicQuery.error;

  if (!publicError && publicData && publicData.length > 0) {
    return publicData;
  }

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) return [];

  const serviceQuery = await serviceClient
    .from("transactions")
    .select(
      "portfolio_id, transaction_date, type, operation_group_id, metadata, notes, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price",
    )
    .in("portfolio_id", allowedPortfolioIds)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  const serviceFallbackQuery =
    serviceQuery.error &&
    (isMissingColumnError(serviceQuery.error.message, "deleted_at") ||
      isMissingColumnError(serviceQuery.error.message, "operation_group_id"))
      ? await serviceClient
          .from("transactions")
          .select(
            "portfolio_id, transaction_date, type, metadata, notes, protocol, position_id, position_type, token_in_symbol, token_in_amount, token_out_symbol, token_out_amount, spot_price",
          )
          .in("portfolio_id", allowedPortfolioIds)
          .order("transaction_date", { ascending: false })
          .limit(limit)
      : null;
  const serviceData = (serviceFallbackQuery?.data ?? serviceQuery.data) as RecentActivityRow[] | null;
  const serviceError = serviceFallbackQuery?.error ?? serviceQuery.error;

  if (serviceError) {
    throw new Error(`Error consultando actividad reciente: ${serviceError.message}`);
  }

  return serviceData ?? [];
}

type PositionTagRow = {
  portfolio_id: string;
  protocol: string;
  position_id: string;
  strategy_tag: string;
};

/**
 * Lee los strategy tags asignados a las posiciones del usuario.
 * Si la tabla position_tags todavía no existe (phase20 no aplicada),
 * devuelve [] silenciosamente para no romper el dashboard.
 */
async function fetchPositionTags(allowedPortfolioIds: string[]): Promise<PositionTagRow[]> {
  if (allowedPortfolioIds.length === 0) return [];
  const serviceClient = getSupabaseServiceClient();
  const client = serviceClient ?? getSupabaseServerClient();
  const query = await client
    .from("position_tags")
    .select("portfolio_id, protocol, position_id, strategy_tag")
    .in("portfolio_id", allowedPortfolioIds);
  if (query.error) {
    // 42P01 = undefined_table → tabla no creada aún
    const code = (query.error as { code?: string }).code;
    const message = query.error.message ?? "";
    if (code === "42P01" || /position_tags.*does not exist/i.test(message)) {
      return [];
    }
    if (process.env.NODE_ENV !== "production") {
      console.warn("fetchPositionTags warning:", query.error);
    }
    return [];
  }
  return (query.data ?? []) as PositionTagRow[];
}

type DepositOverrideRow = {
  portfolio_id: string;
  protocol: string | null;
  position_id: string | null;
  deposited_override_usd: number | null;
  /** Cuándo se fijó el override (phase28). Los flujos POSTERIORES a esta fecha
   *  se suman al override — sin esto, la cifra quedaba congelada ante aportes
   *  o retiradas posteriores. null (override antiguo/columna sin migrar) =
   *  comportamiento anterior (valor fijo). */
  deposited_override_set_at: string | null;
};

/**
 * Overrides manuales del depositado (position_links.deposited_override_usd):
 * el gestor corrige la base de una posición cuya base derivada de
 * transacciones sabe incorrecta (p.ej. posición pre-app enlazada a eventos
 * reales). Si la columna no existe aún (migración phase27 pendiente),
 * devuelve [] silenciosamente.
 */
/**
 * Valor de cada posición SEGÚN LA CADENA, cruzando `position_links` con el
 * último snapshot on-chain.
 *
 * La clave del mapa es la de la posición CONTABLE, para que quien la consulte no
 * tenga que saber nada de identificadores on-chain. El valor incluye lo «sin
 * reclamar»: está en la posición, generado y sin recoger, y la cabecera del
 * producto ya lo cuenta — dejarlo fuera aquí volvería a descuadrar las dos
 * cifras, que es justo lo que esto evita.
 *
 * Devuelve un mapa VACÍO ante cualquier fallo: sin lectura de cadena, cada
 * posición se queda con su valor de libro y marcada como tal. Es preferible una
 * cifra contable declarada a una mezcla silenciosa.
 */
async function fetchOnchainValueByPosition(
  allowedPortfolioIds: string[],
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  if (allowedPortfolioIds.length === 0) return mapa;

  try {
    const client = getSupabaseServiceClient() ?? getSupabaseServerClient();

    const [enlaces, snapshots] = await Promise.all([
      client
        .from("position_links")
        .select("portfolio_id, protocol, position_id, onchain_id")
        .in("portfolio_id", allowedPortfolioIds),
      client
        .from("onchain_cache")
        .select("portfolio_id, positions")
        .in("portfolio_id", allowedPortfolioIds)
        .eq("source", "snapshot"),
    ]);

    if (enlaces.error || snapshots.error) return mapa;

    // Valor por identificador on-chain, acotado a su cartera: dos carteras
    // podrían tener leído el mismo pool y no deben mezclarse.
    const valorPorOnchainId = new Map<string, number>();
    for (const fila of snapshots.data ?? []) {
      const carteraId = String((fila as { portfolio_id: string }).portfolio_id);
      const leidas =
        ((fila as { positions?: { positions?: Array<{ id?: string; valueUsd?: number | null; unclaimedUsd?: number | null }> } })
          .positions?.positions) ?? [];
      for (const p of leidas) {
        if (!p?.id) continue;
        const valor = Number(p.valueUsd ?? 0) + Number(p.unclaimedUsd ?? 0);
        if (!Number.isFinite(valor)) continue;
        valorPorOnchainId.set(`${carteraId}::${p.id}`, valor);
      }
    }

    for (const enlace of (enlaces.data ?? []) as Array<{
      portfolio_id: string;
      protocol: string | null;
      position_id: string | null;
      onchain_id: string | null;
    }>) {
      if (!enlace.onchain_id || !enlace.position_id || !enlace.protocol) continue;
      const valor = valorPorOnchainId.get(`${enlace.portfolio_id}::${enlace.onchain_id}`);
      if (valor === undefined) continue;
      mapa.set(
        positionCompositeKey(enlace.portfolio_id, enlace.protocol, enlace.position_id),
        valor,
      );
    }
  } catch {
    /* sin cadena: cada posición se queda con su valor de libro, y marcada */
  }

  return mapa;
}

async function fetchDepositOverrides(allowedPortfolioIds: string[]): Promise<DepositOverrideRow[]> {
  if (allowedPortfolioIds.length === 0) return [];
  const serviceClient = getSupabaseServiceClient();
  const client = serviceClient ?? getSupabaseServerClient();
  const query = await client
    .from("position_links")
    .select("portfolio_id, protocol, position_id, deposited_override_usd, deposited_override_set_at")
    .in("portfolio_id", allowedPortfolioIds)
    .not("deposited_override_usd", "is", null);
  if (!query.error) return (query.data ?? []) as DepositOverrideRow[];

  // Columna set_at sin migrar (phase28 pendiente): reintenta sin ella —
  // los overrides siguen funcionando como valor fijo.
  const legacy = await client
    .from("position_links")
    .select("portfolio_id, protocol, position_id, deposited_override_usd")
    .in("portfolio_id", allowedPortfolioIds)
    .not("deposited_override_usd", "is", null);
  if (legacy.error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("fetchDepositOverrides warning:", legacy.error);
    }
    return [];
  }
  return ((legacy.data ?? []) as Omit<DepositOverrideRow, "deposited_override_set_at">[]).map((r) => ({
    ...r,
    deposited_override_set_at: null,
  }));
}

export async function getDashboardData(options?: {
  targetUserId?: string;
  targetPortfolioId?: string;
}): Promise<DashboardData> {
  noStore();

  const access = await getViewerAccess();
  const viewer: ViewerPermissions = {
    role: access.role,
    isSuperAdmin: access.isSuperAdmin,
    canOperate: access.canOperate,
    canDeletePosition: access.canDeletePosition,
    canRefreshPrices: access.canRefreshPrices,
  };
  const targetUserId = (options?.targetUserId ?? "").trim();
  const targetPortfolioId = (options?.targetPortfolioId ?? "").trim();
  if (targetUserId && !access.canManageRoles) {
    throw new Error("No autorizado para consultar portfolios de otros usuarios.");
  }
  if (
    targetPortfolioId &&
    !access.canManageRoles &&
    !access.allowedPortfolioIds.includes(targetPortfolioId)
  ) {
    throw new Error("No autorizado para consultar portfolios de otros usuarios.");
  }

  /*
   * Sin cartera declarada se sirve UNA, no todas.
   *
   * Antes el último caso usaba `access.allowedPortfolioIds` entero, así que se
   * traían las posiciones de TODAS las carteras a las que el viewer tiene
   * acceso. El nombre que se pinta arriba, en cambio, sale de
   * `portfolioContext`, que elige UNA. Resultado: un gestor con seis clientes
   * veía las posiciones de los seis sumadas bajo el nombre de uno solo —una
   * cartera con una posición en base de datos pintaba cuarenta y cinco—, con el
   * patrimonio, el P&L y la composición correspondientemente inflados.
   *
   * A un cliente con una sola cartera nunca le afectó: su lista tiene un
   * elemento. Le afectaba al gestor, que es quien mira varias.
   *
   * Se acota a la primera, que es exactamente la que `portfolioContext` iba a
   * nombrar: así el rótulo y los datos hablan de lo mismo. Quien quiera otra la
   * pide por `targetPortfolioId`, que es lo que ya hacen todas las pantallas de
   * administración.
   */
  const allowedPortfolioIds = targetPortfolioId
    ? [targetPortfolioId]
    : targetUserId
      ? await fetchPortfolioIdsForTargetUser(targetUserId)
      : access.allowedPortfolioIds.slice(0, 1);

  const [rows, cachedPrices, lendingTransactions, lpMetadataRows, recentActivityRows, portfolioContexts, positionTagRows, onchainValueByPosition, usdToEurRate, depositOverrideRows] = await Promise.all([
    fetchLivePositions(allowedPortfolioIds),
    fetchCachedPrices(),
    fetchLendingTransactions(allowedPortfolioIds),
    fetchLpMetadataRows(allowedPortfolioIds),
    fetchRecentActivityRows(allowedPortfolioIds),
    fetchPortfolioContexts(allowedPortfolioIds),
    fetchPositionTags(allowedPortfolioIds),
    fetchOnchainValueByPosition(allowedPortfolioIds),
    getUsdToEurRate(),
    fetchDepositOverrides(allowedPortfolioIds),
  ]);

  // Map (portfolio_id, protocol, position_id) → strategy_tag para lookup rápido.
  const positionTagByKey = new Map<string, string>();
  for (const tag of positionTagRows) {
    const key = positionCompositeKey(tag.portfolio_id, tag.protocol, tag.position_id);
    positionTagByKey.set(key, tag.strategy_tag);
  }

  const portfolioIds = Array.from(new Set(rows.map((row) => row.portfolio_id ?? "").filter((id) => id.length > 0)))
    .filter((id) => access.isSuperAdmin || allowedPortfolioIds.includes(id));
  const portfolioTransactions = await fetchPortfolioTransactions(portfolioIds);

  // Build set of position keys that have at least one active (non-deleted) transaction.
  // Excluimos los marcadores position_closed: una posición cuya única transacción
  // activa es su propio snapshot de cierre está CERRADA, no activa. Si la contáramos
  // aquí, el borrado manual (que soft-borra las txns y deja solo el position_closed)
  // haría "revivir" la posición en el dashboard con sus balances de la vista.
  const activePositionKeys = new Set<string>();
  for (const tx of portfolioTransactions) {
    if ((tx.type ?? "").trim() === "position_closed") continue;
    if (tx.portfolio_id && tx.position_id) {
      activePositionKeys.add(positionCompositeKey(tx.portfolio_id, tx.protocol ?? "Wallet", tx.position_id));
    }
  }

  // Filter out positions from the view that have no active transactions (soft-deleted)
  const filteredRows = rows.filter((row) => {
    if (!row.portfolio_id || !row.position_id) return false;
    return activePositionKeys.has(positionCompositeKey(row.portfolio_id, row.protocol ?? "Wallet", row.position_id));
  });

  const lendingMetrics = lendingTransactions.reduce(
    (acc, row) => {
      if (!row.position_id) return acc;
      const key = positionCompositeKey(row.portfolio_id ?? "", row.protocol ?? "Wallet", row.position_id);
      if (!acc[key]) {
        acc[key] = {
          collateralUsd: 0,
          debtUsd: 0,
          collateralByToken: {} as Record<string, number>,
          debtByToken: {} as Record<string, number>,
        };
      }

      const inSymbol = (row.token_in_symbol ?? "").toUpperCase();
      const outSymbol = (row.token_out_symbol ?? "").toUpperCase();
      const inAmount = toNumber(row.token_in_amount);
      const outAmount = toNumber(row.token_out_amount);
      const isLegacyLendingWithdrawal =
        row.type === "withdrawal" && normalizePositionType(row.position_type).toLowerCase().includes("lending");

      if (row.type === "lending_supply") {
        if (inSymbol) {
          acc[key].collateralUsd += inAmount * (cachedPrices.pricesBySymbol.get(inSymbol) ?? 0);
          acc[key].collateralByToken[inSymbol] = (acc[key].collateralByToken[inSymbol] ?? 0) + inAmount;
        }
        if (outSymbol) {
          acc[key].collateralUsd -= outAmount * (cachedPrices.pricesBySymbol.get(outSymbol) ?? 0);
          acc[key].collateralByToken[outSymbol] = (acc[key].collateralByToken[outSymbol] ?? 0) - outAmount;
        }
      }

      if (row.type === "lending_borrow") {
        if (inSymbol) {
          acc[key].debtUsd += inAmount * (cachedPrices.pricesBySymbol.get(inSymbol) ?? 0);
          acc[key].debtByToken[inSymbol] = (acc[key].debtByToken[inSymbol] ?? 0) + inAmount;
        }
        if (outSymbol) {
          acc[key].debtUsd -= outAmount * (cachedPrices.pricesBySymbol.get(outSymbol) ?? 0);
          acc[key].debtByToken[outSymbol] = (acc[key].debtByToken[outSymbol] ?? 0) - outAmount;
        }
      }

      if (row.type === "lending_withdraw" || isLegacyLendingWithdrawal) {
        if (outSymbol) {
          acc[key].collateralUsd -= outAmount * (cachedPrices.pricesBySymbol.get(outSymbol) ?? 0);
          acc[key].collateralByToken[outSymbol] = (acc[key].collateralByToken[outSymbol] ?? 0) - outAmount;
        }
        if (inSymbol) {
          acc[key].collateralUsd += inAmount * (cachedPrices.pricesBySymbol.get(inSymbol) ?? 0);
          acc[key].collateralByToken[inSymbol] = (acc[key].collateralByToken[inSymbol] ?? 0) + inAmount;
        }
      }

      return acc;
    },
    {} as Record<
      string,
      {
        collateralUsd: number;
        debtUsd: number;
        collateralByToken: Record<string, number>;
        debtByToken: Record<string, number>;
      }
    >,
  );

  const lpMetadataByPosition = lpMetadataRows.reduce(
    (acc, row) => {
      if (!row.position_id) return acc;
      const key = positionCompositeKey(row.portfolio_id ?? "", row.protocol ?? "Wallet", row.position_id);
      const parsed = parseLpMetadata(row.metadata, row.notes);
      if (!parsed) return acc;

      const current = acc[key];
      if (!current) {
        acc[key] = {
          metadata: parsed,
          at: row.transaction_date ? Date.parse(row.transaction_date) : 0,
        };
        return acc;
      }

      const nextDate = row.transaction_date ? Date.parse(row.transaction_date) : 0;
      if (nextDate >= current.at) {
        acc[key] = { metadata: parsed, at: nextDate };
      }

      return acc;
    },
    {} as Record<string, { metadata: LpMetadata; at: number }>,
  );

  // Compute accurate balance and avg entry price from active transactions (not VIEW).
  // Importante: las withdrawals usan token_out_symbol (token_in_symbol viene null),
  // por lo que el símbolo de la clave depende del tipo de operación.
  const txBalanceByTokenPosition = new Map<
    string,
    {
      balance: number;
      costUsd: number;
      depositedAmount: number;
      /** Cuánto saldo se ha recortado por quedar en negativo. > 0 significa que
       *  las cuentas de esa posición no cuadran: ver el recorte más abajo. */
      descuadre?: number;
    }
  >();
  /**
   * Cuánto saldo se ha tenido que recortar en una posición por quedar negativo.
   *
   * Suma el descuadre de TODOS los tokens de la posición, porque la clave del
   * acumulador lleva el símbolo al final y un pool tiene dos.
   */
  const descuadreDeLaPosicion = (posKey: string): number => {
    let total = 0;
    for (const [k, v] of txBalanceByTokenPosition) {
      if (k.startsWith(`${posKey}::`)) total += v.descuadre ?? 0;
    }
    return total;
  };

  /** Cantidad suelta, sin ceros de relleno. No usa `figures.ts` porque este
   *  módulo es el NÚCLEO y no debe depender de la capa de presentación. */
  const tokenAmountPlano = (n: number): string =>
    n.toLocaleString("es-ES", { maximumFractionDigits: 6 });

  // Posiciones con al menos una transacción de capital (in/out). Se anota AQUÍ,
  // con la clave canónica de posición, no recortando después la clave del
  // acumulador: esa clave lleva el símbolo al final
  // (`cartera::protocolo::posición::SÍMBOLO`), así que partirla por el primer
  // "::" devolvía solo el UUID de la cartera y el conjunto no casaba NUNCA con
  // lo que se le preguntaba más abajo. La guarda existía y no guardaba nada.
  const positionsWithTxCoverage = new Set<string>();
  const capitalInSet = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
  const capitalOutSet = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);
  for (const tx of portfolioTransactions) {
    const txType = (tx.type ?? "").trim();
    const inAmount = toNumber(tx.token_in_amount);
    const outAmount = toNumber(tx.token_out_amount);
    const inSymbol = (tx.token_in_symbol ?? "").toUpperCase();
    const outSymbol = (tx.token_out_symbol ?? "").toUpperCase();
    const spotPrice = toNumber(tx.spot_price);
    const portfolioId = tx.portfolio_id ?? "";
    const protocol = (tx.protocol ?? "Wallet").trim();
    const positionId = tx.position_id ?? "";
    if (!positionId) continue;

    const isIn = capitalInSet.has(txType);
    const isOut = capitalOutSet.has(txType);
    if (!isIn && !isOut) continue;

    // Salida del harvest pendiente arrastrado en un rebalanceo: esos tokens
    // NUNCA entraron en el balance de la posición (las filas `harvest` no
    // suman aquí, viven en `harvestByPosition.pendingByToken`). Restarlos del
    // balance del pool era restar dos veces: una del pendiente —que sí toca— y
    // otra del capital del pool, que se comía balance y cost basis reales
    // cuando el token de recompensa coincidía con uno del par.
    const balanceReason = getMetadataFlag(tx.metadata, tx.notes, "reason");
    const balanceSource = getMetadataFlag(tx.metadata, tx.notes, "source");
    if (balanceReason === "rebalance_harvest_out" || balanceSource === "rebalance_harvest_out") continue;

    const symbol = isIn ? inSymbol : outSymbol;
    if (!symbol) continue;

    const posKey = positionCompositeKey(portfolioId, protocol, positionId);
    positionsWithTxCoverage.add(posKey);
    const tpKey = `${posKey}::${symbol}`;
    if (!txBalanceByTokenPosition.has(tpKey)) {
      txBalanceByTokenPosition.set(tpKey, { balance: 0, costUsd: 0, depositedAmount: 0 });
    }
    const entry = txBalanceByTokenPosition.get(tpKey)!;

    if (isIn) {
      entry.balance += inAmount;
      entry.costUsd += inAmount * spotPrice;
      entry.depositedAmount += inAmount;
    } else {
      // Withdrawal: reducir pro-rata costUsd y depositedAmount para mantener
      // el average entry price del balance restante invariante.
      // (1 BTC depositado a 60k, sacar 0.5 → balance=0.5, costUsd=30k, avgPrice=60k)
      if (entry.balance > 0 && outAmount > 0) {
        const fraction = Math.min(1, outAmount / entry.balance);
        entry.costUsd -= entry.costUsd * fraction;
        entry.depositedAmount -= entry.depositedAmount * fraction;
      }
      entry.balance -= outAmount;
      /*
       * Un saldo negativo NO es un número que haya que redondear: es la señal de
       * que las cuentas de esa posición no cuadran —falta un depósito por
       * registrar, o sobra una retirada—. Recortarlo a cero en silencio lo
       * convierte en lo contrario de una señal: el importe sobrante desaparece,
       * los movimientos siguientes se acumulan sobre una base falsa, y la
       * pantalla acaba enseñando un saldo que no existe con toda naturalidad.
       *
       * Se recorta igual, porque un saldo negativo tampoco se puede pintar; pero
       * se anota cuánto se ha perdido, y esa marca sube a la posición como
       * problema de calidad de dato. Prefiero una posición que avise de que no
       * cuadra a una que mienta con aplomo.
       */
      if (entry.balance < 0) {
        entry.descuadre = (entry.descuadre ?? 0) + Math.abs(entry.balance);
        entry.balance = 0;
      }
    }
  }

  // (`positionsWithTxCoverage` se llena en el bucle de arriba.) Para una
  // posición con transacciones de capital el balance es 100% transaccional: si
  // un token concreto NO tiene txData, ese token no es principal —típicamente
  // un residual de harvest que la vista defi_positions_analytics suma como
  // token_in—, así que su balance es 0 y no cae al viewBalance contaminado. Eso
  // es lo que hacía aparecer LPs con un tercer token.

  let positions: DefiPosition[] = filteredRows
    .filter((row) => row.is_active === true)
    .map<DefiPosition>((row) => {
      const tokenSymbol = (row.token_symbol ?? "").toUpperCase();
      const positionType = normalizePositionType(row.position_type);
      const viewBalance = toNumber(row.current_balance);
      const viewAvgPrice = toNumber(row.average_entry_price);

      // Use transaction-computed balance if available, otherwise fall back to view
      const positionKey = positionCompositeKey(row.portfolio_id ?? "", row.protocol ?? "Wallet", row.position_id ?? "");
      const tpKey = `${positionKey}::${tokenSymbol}`;
      const txData = txBalanceByTokenPosition.get(tpKey);
      const currentBalance = txData
        ? Math.max(0, txData.balance)
        : positionsWithTxCoverage.has(positionKey)
          ? 0
          : viewBalance;
      const averageEntryPrice = txData && txData.depositedAmount > 0
        ? txData.costUsd / txData.depositedAmount
        : viewAvgPrice;

      const livePrice = cachedPrices.pricesBySymbol.get(tokenSymbol) ?? 0;
      const currentPrice = livePrice > 0 ? livePrice : averageEntryPrice;
      const currentValue = currentBalance * currentPrice;
      const roiPercent = calculateRoiPercent(currentPrice, averageEntryPrice);
      const impermanentLossPercent = isLiquidityPoolPosition(positionType)
        ? calculateImpermanentLossPercent(currentPrice, averageEntryPrice)
        : null;
      const hodlEquivalentValue =
        impermanentLossPercent !== null
          ? currentValue / (1 + impermanentLossPercent / 100)
          : null;
      const impermanentLossValue =
        hodlEquivalentValue !== null ? currentValue - hodlEquivalentValue : null;
      const lendingKey = positionCompositeKey(row.portfolio_id ?? "", row.protocol ?? "Wallet", row.position_id ?? "");
      const lending = lendingMetrics[lendingKey];
      // Health Factor con liquidation thresholds por token (Aave V3 reference).
      // HF = Σ(colateral × precio × threshold) / Σ(deuda × precio)
      const healthFactor = lending
        ? (() => {
            const collateralBreakdownLocal = Object.entries(lending.collateralByToken)
              .filter(([, amt]) => amt > 0)
              .map(([sym, amt]) => ({
                symbol: sym,
                valueUsd: amt * (cachedPrices.pricesBySymbol.get(sym) ?? 0),
              }));
            const debtBreakdownLocal = Object.entries(lending.debtByToken)
              .filter(([, amt]) => amt > 0)
              .map(([sym, amt]) => ({
                symbol: sym,
                valueUsd: amt * (cachedPrices.pricesBySymbol.get(sym) ?? 0),
              }));
            return calculateHealthFactor(collateralBreakdownLocal, debtBreakdownLocal);
          })()
        : null;
      let healthStatus: DefiPosition["healthStatus"] = "na";
      if (healthFactor !== null) {
        if (healthFactor < 1.5) healthStatus = "critical";
        else if (healthFactor <= 2.2) healthStatus = "warning";
        else healthStatus = "safe";
      }

      return {
        portfolioId: row.portfolio_id ?? "",
        tokenSymbol,
        protocol: row.protocol ?? "Wallet",
        positionId: row.position_id ?? "",
        positionType,
        currentBalance,
        averageEntryPrice,
        currentPrice,
        currentValue,
        roiPercent,
        impermanentLossPercent,
        hodlEquivalentValue,
        impermanentLossValue,
        healthFactor,
        healthStatus,
        lpRangeStatus: "na",
        lpRangeLabel: null,
        currentPriceLabel: null,
        dataQualityIssue: null,
        isAggregatePosition: false,
        balanceLabel: null,
        // costBasisUsd real desde el histórico de transacciones (ya considera
        // withdrawals pro-rata gracias al fix C1). Antes era siempre null, lo
        // que provocaba ROI=0 en LPs agregados (mejora menor de la auditoría).
        costBasisUsd: txData && txData.costUsd > 0 ? txData.costUsd : null,
        totalHarvested: toNumber(row.total_harvested),
        isActive: row.is_active === true,
        // `amount` es el saldo ya calculado arriba; se expone junto al valor
        // para que la pantalla pueda enseñar la CANTIDAD de token y no dólares
        // con el ticker pegado.
        valueBreakdown: [{ tokenSymbol, valueUsd: currentValue, amount: currentBalance }],
        collateralBreakdown: [],
        debtBreakdown: [],
        lendingDetails: null,
        strategyTag: positionTagByKey.get(
          positionCompositeKey(row.portfolio_id ?? "", row.protocol ?? "Wallet", row.position_id ?? ""),
        ) ?? null,
      };
    })
    .filter((position) => position.tokenSymbol && position.currentBalance > 0);

  const positionTotalValue = positions.reduce(
    (acc, position) => {
      const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
      acc.set(key, (acc.get(key) ?? 0) + position.currentValue);
      return acc;
    },
    new Map<string, number>(),
  );

  positions = positions.map((position) => {
    if (!isLiquidityPoolPosition(position.positionType)) return position;

    const valueKey = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    const metadataKey = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    const lpEntry = lpMetadataByPosition[metadataKey];
    if (!lpEntry) return position;

    const meta = lpEntry.metadata;

    // Correlated pools: no IL calculation, no range status
    if (meta.isCorrelated) {
      return { ...position, lpRangeStatus: "correlated" as DefiPosition["lpRangeStatus"] };
    }

    const priceA = cachedPrices.pricesBySymbol.get(meta.tokenA) ?? 0;
    const priceB = cachedPrices.pricesBySymbol.get(meta.tokenB) ?? 0;
    if (priceA <= 0 || priceB <= 0 || meta.entryPriceRatio <= 0) return position;

    const currentRatio = priceA / priceB;
    const rangeLowerRatio = meta.rangeLower / meta.entryPriceRatio;
    const rangeUpperRatio = meta.rangeUpper / meta.entryPriceRatio;
    const ratioChange = currentRatio / meta.entryPriceRatio;
    const lpRangeStatus: DefiPosition["lpRangeStatus"] =
      ratioChange < rangeLowerRatio || ratioChange > rangeUpperRatio ? "out_of_range" : "in_range";

    // Si la posición está fuera de rango en un LP V3, el AMM ya no rebalancea:
    // queda 100% en un solo token, por lo que NO hay impermanent loss real.
    // El IL solo aplica mientras estamos dentro del rango y el AMM está activamente reequilibrando.
    if (lpRangeStatus === "out_of_range") {
      return { ...position, impermanentLossPercent: 0, lpRangeStatus };
    }

    const ilPercentFromPair = calculateImpermanentLossFromRatio(ratioChange);
    if (ilPercentFromPair === null) return { ...position, lpRangeStatus };

    const totalValue = positionTotalValue.get(valueKey) ?? 0;
    if (totalValue <= 0) return { ...position, impermanentLossPercent: ilPercentFromPair, lpRangeStatus };

    const ilFactor = 1 + ilPercentFromPair / 100;
    if (ilFactor <= 0) return { ...position, impermanentLossPercent: ilPercentFromPair, lpRangeStatus };

    const hodlTotal = totalValue / ilFactor;
    const ilTotal = totalValue - hodlTotal;
    const share = totalValue > 0 ? position.currentValue / totalValue : 0;

    return {
      ...position,
      impermanentLossPercent: ilPercentFromPair,
      hodlEquivalentValue: hodlTotal * share,
      impermanentLossValue: ilTotal * share,
      lpRangeStatus,
    };
  });

  // LP se presenta como una sola posición operativa (no una fila por token).
  const lpGroup = positions.reduce(
    (acc, position) => {
      if (!isLiquidityPoolPosition(position.positionType)) return acc;
      const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(position);
      return acc;
    },
    {} as Record<string, DefiPosition[]>,
  );

  const aggregatedLpPositions: DefiPosition[] = Object.values(lpGroup).map((group) => {
    if (group.length === 1) return group[0];

    const sample = group[0];
    const lpKey = positionCompositeKey(sample.portfolioId, sample.protocol, sample.positionId);
    const lpEntry = lpMetadataByPosition[lpKey];

    // Detección de LP corrupto: un LP NO puede tener más de 2 tokens distintos
    // con balance > 0. Si pasa, marcar como dataQualityIssue para que la UI
    // muestre el aviso y permita modificar/limpiar.
    const tokensWithBalance = group.filter((item) => item.currentBalance > 1e-9);
    const distinctTokensWithBalance = Array.from(new Set(tokensWithBalance.map((i) => i.tokenSymbol)));
    const hasCorruptedTokenCount = distinctTokensWithBalance.length > 2;

    // El nombre mostrado usa solo tokens con balance > 0 (esconde residuales a 0).
    // Si hay corrupción (>2 con balance), mostramos los tokens y dejamos el aviso.
    const tokenSymbols =
      distinctTokensWithBalance.length > 0
        ? distinctTokensWithBalance.join("/")
        : Array.from(new Set(group.map((item) => item.tokenSymbol))).join("/");
    const currentValue = group.reduce((sum, item) => sum + item.currentValue, 0);
    const costBasisUsd = group.reduce((sum, item) => sum + ((item.costBasisUsd ?? 0) > 0 ? (item.costBasisUsd ?? 0) : 0), 0);
    const roiPercent =
      costBasisUsd > 0 ? ((currentValue - costBasisUsd) / costBasisUsd) * 100 : 0;
    const totalHarvested = group.reduce((max, item) => Math.max(max, item.totalHarvested), 0);
    const hodlEquivalentValue = group.reduce(
      (sum, item) => sum + (item.hodlEquivalentValue ?? 0),
      0,
    );
    const impermanentLossValue = group.reduce(
      (sum, item) => sum + (item.impermanentLossValue ?? 0),
      0,
    );

    // Balance por token a partir de los datos actuales (stored balance × price)
    const balanceByToken: Record<string, number> = {};
    const valueByTokenRaw: Record<string, number> = {};
    for (const item of group) {
      balanceByToken[item.tokenSymbol] = (balanceByToken[item.tokenSymbol] ?? 0) + item.currentBalance;
      valueByTokenRaw[item.tokenSymbol] = (valueByTokenRaw[item.tokenSymbol] ?? 0) + item.currentValue;
    }

    let currentPriceLabel: string | null = null;
    let lpRangeLabel: string | null = null;
    let lpRangeStatus: DefiPosition["lpRangeStatus"] = sample.lpRangeStatus;

    // Por defecto: usar balances almacenados
    let finalBalanceByToken: Record<string, number> = { ...balanceByToken };
    let finalValueByToken: Record<string, number> = { ...valueByTokenRaw };

    if (lpEntry) {
      const meta = lpEntry.metadata;
      if (meta.isCorrelated) {
        lpRangeLabel = "Pool correlacionado";
        lpRangeStatus = "correlated";
        currentPriceLabel = null;
      } else {
        const priceA = cachedPrices.pricesBySymbol.get(meta.tokenA) ?? 0;
        const priceB = cachedPrices.pricesBySymbol.get(meta.tokenB) ?? 0;
        if (priceA > 0 && priceB > 0) {
          // Convención caro/barato: rango > 1, siempre precio caro ÷ precio barato
          const expensiveToken = priceA >= priceB ? meta.tokenA : meta.tokenB;
          const cheapToken = priceA >= priceB ? meta.tokenB : meta.tokenA;
          const expensivePrice = Math.max(priceA, priceB);
          const cheapPrice = Math.min(priceA, priceB);
          const ratio = expensivePrice / cheapPrice;

          // Normalizar rango a la misma dirección que el ratio (caro/barato).
          // Si el rango está almacenado en dirección inversa (barato/caro),
          // lo invertimos: [1/upper, 1/lower].
          let rangeLow = meta.rangeLower;
          let rangeHigh = meta.rangeUpper;
          const rangeNeedsInvert = ratio > 1 && rangeHigh < 1 && ratio / rangeHigh > 5;
          if (rangeNeedsInvert && rangeLow > 0 && rangeHigh > 0) {
            rangeLow = 1 / meta.rangeUpper;
            rangeHigh = 1 / meta.rangeLower;
          }

          lpRangeLabel = `Rango ${expensiveToken}/${cheapToken}: ${rangeLow.toLocaleString("en-US", {
            maximumFractionDigits: 4,
          })} - ${rangeHigh.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
          currentPriceLabel = `Actual ${expensiveToken}/${cheapToken}: ${ratio.toLocaleString("en-US", {
            maximumFractionDigits: 4,
          })}`;

          if (ratio > rangeHigh) {
            // Precio caro subió por encima del rango → 100% en el token barato
            lpRangeStatus = "out_of_range";
            finalBalanceByToken = {
              [expensiveToken]: 0,
              [cheapToken]: currentValue / cheapPrice,
            };
            finalValueByToken = {
              [expensiveToken]: 0,
              [cheapToken]: currentValue,
            };
          } else if (ratio < rangeLow) {
            // Precio caro cayó por debajo del rango → 100% en el token caro
            lpRangeStatus = "out_of_range";
            finalBalanceByToken = {
              [expensiveToken]: currentValue / expensivePrice,
              [cheapToken]: 0,
            };
            finalValueByToken = {
              [expensiveToken]: currentValue,
              [cheapToken]: 0,
            };
          } else {
            lpRangeStatus = "in_range";
          }
        } else {
          lpRangeLabel = `Rango ${meta.rangeLower.toLocaleString("en-US")} - ${meta.rangeUpper.toLocaleString("en-US")}`;
          lpRangeStatus = "na";
        }
      }
    } else {
      lpRangeLabel = "Rango no disponible (falta metadata LP)";
      lpRangeStatus = "na";
    }

    const balanceLabel = Object.entries(finalBalanceByToken)
      .map(([tokenSymbol, amount]) => `${amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${tokenSymbol}`)
      .join(" + ");
    // El valor Y la cantidad de cada token del par. Los dos salen de mapas ya
    // calculados (`finalValueByToken` / `finalBalanceByToken`, que el bloque de
    // rango de arriba deja en su estado definitivo): aquí no se calcula nada,
    // solo se exponen juntos. `balanceLabel` no sirve para la pantalla porque
    // viene formateado en en-US y unido con « + ».
    const valueBreakdown = Object.entries(finalValueByToken).map(([tokenSymbol, valueUsd]) => ({
      tokenSymbol,
      valueUsd,
      amount: finalBalanceByToken[tokenSymbol] ?? null,
    }));

    return {
      ...sample,
      tokenSymbol: tokenSymbols,
      currentBalance: 0,
      averageEntryPrice: 0,
      currentPrice: 0,
      currentValue,
      roiPercent,
      hodlEquivalentValue: hodlEquivalentValue > 0 ? hodlEquivalentValue : null,
      impermanentLossValue,
      lpRangeStatus,
      lpRangeLabel,
      currentPriceLabel,
      dataQualityIssue: hasCorruptedTokenCount
        ? `LP corrupto: ${distinctTokensWithBalance.length} tokens en una misma posición (${distinctTokensWithBalance.join(", ")}). Un pool solo puede tener 2 tokens. Modifica la posición indicando solo los 2 correctos — los huérfanos se limpiarán automáticamente.`
        : // Saldo recortado por quedar en negativo: las retiradas registradas
          // superan a los depósitos. El importe sobrante se pierde del cómputo,
          // así que la cifra de esta posición se queda POR ENCIMA de la real y
          // no hay forma de saber cuánto sin completar el histórico. Antes se
          // recortaba en silencio y la posición se pintaba como cualquier otra.
          descuadreDeLaPosicion(lpKey) > 1e-9
          ? `Las cuentas de esta posición no cuadran: hay ${tokenAmountPlano(descuadreDeLaPosicion(lpKey))} de retiradas sin depósito que las respalde. El saldo mostrado puede ser mayor que el real; falta histórico por registrar.`
          : null,
      isAggregatePosition: true,
      balanceLabel,
      costBasisUsd: costBasisUsd > 0 ? costBasisUsd : null,
      totalHarvested,
      valueBreakdown,
      collateralBreakdown: [],
      debtBreakdown: [],
      lendingDetails: null,
    };
  });

  const lpKeys = new Set(Object.keys(lpGroup));
  const nonLpPositions = positions.filter((position) => {
    if (!isLiquidityPoolPosition(position.positionType)) return true;
    const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    return !lpKeys.has(key);
  });

  positions = [...nonLpPositions, ...aggregatedLpPositions];

  const lendingGroup = positions.reduce(
    (acc, position) => {
      if (mapCategory(position.positionType) !== "lending") return acc;
      const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
      if (!acc[key]) acc[key] = [];
      acc[key].push(position);
      return acc;
    },
    {} as Record<string, DefiPosition[]>,
  );

  const buildLendingBreakdowns = (
    collateralByToken: Record<string, number>,
    debtByToken: Record<string, number>,
  ) => {
    const collateralBreakdown = Object.entries(collateralByToken)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, amount]) => ({
        tokenSymbol: symbol,
        amount,
        valueUsd: amount * (cachedPrices.pricesBySymbol.get(symbol) ?? 0),
      }));
    const debtBreakdown = Object.entries(debtByToken)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([symbol, amount]) => ({
        tokenSymbol: symbol,
        amount,
        valueUsd: amount * (cachedPrices.pricesBySymbol.get(symbol) ?? 0),
      }));
    return { collateralBreakdown, debtBreakdown };
  };

  const buildLendingDetails = (
    collateralBreakdown: Array<{ tokenSymbol: string; amount: number; valueUsd: number }>,
    debtBreakdown: Array<{ tokenSymbol: string; amount: number; valueUsd: number }>,
  ): LendingDetails | null => {
    if (collateralBreakdown.length === 0 && debtBreakdown.length === 0) return null;
    const totalCollateralUsd = collateralBreakdown.reduce((acc, c) => acc + c.valueUsd, 0);
    const totalDebtUsd = debtBreakdown.reduce((acc, d) => acc + d.valueUsd, 0);
    const ltv = calculateLtv(
      collateralBreakdown.map((c) => ({ valueUsd: c.valueUsd })),
      debtBreakdown.map((d) => ({ valueUsd: d.valueUsd })),
    );
    const maxLtv = calculateMaxLtv(
      collateralBreakdown.map((c) => ({ symbol: c.tokenSymbol, valueUsd: c.valueUsd })),
    );
    const liquidationRisks = calculateLiquidationPrices(
      collateralBreakdown.map((c) => ({ symbol: c.tokenSymbol, amount: c.amount, valueUsd: c.valueUsd })),
      debtBreakdown.map((d) => ({ valueUsd: d.valueUsd })),
    ).map((r) => ({
      tokenSymbol: r.symbol,
      currentPrice: r.currentPrice,
      liquidationPrice: r.liquidationPrice,
      dropPercent: r.dropPercent,
    }));
    return {
      ltv: ltv ?? 0,
      maxLtv: maxLtv ?? 0,
      ltvUtilization: maxLtv && maxLtv > 0 && ltv !== null ? ltv / maxLtv : 0,
      totalCollateralUsd,
      totalDebtUsd,
      netValueUsd: totalCollateralUsd - totalDebtUsd,
      liquidationRisks,
    };
  };

  const aggregatedLendingPositions: DefiPosition[] = Object.values(lendingGroup).map((group) => {
    const sample = group[0];
    const lendingKey = positionCompositeKey(sample.portfolioId, sample.protocol, sample.positionId);
    const lending = lendingMetrics[lendingKey];

    const collateralByToken = lending?.collateralByToken ?? {};
    const debtByToken = lending?.debtByToken ?? {};
    const { collateralBreakdown, debtBreakdown } = buildLendingBreakdowns(collateralByToken, debtByToken);

    // Single-position lending: recalculate currentValue with debt subtracted
    if (group.length === 1) {
      const collateralUsdSingle = collateralBreakdown.reduce((sum, item) => sum + item.valueUsd, 0) || (lending?.collateralUsd ?? group[0].currentValue);
      const debtUsdSingle = debtBreakdown.reduce((sum, item) => sum + item.valueUsd, 0) || (lending?.debtUsd ?? 0);
      const currentValueSingle = collateralUsdSingle - debtUsdSingle;
      return {
        ...group[0],
        currentValue: currentValueSingle,
        collateralBreakdown,
        debtBreakdown,
        lendingDetails: buildLendingDetails(collateralBreakdown, debtBreakdown),
      };
    }

    const collateralTokens = collateralBreakdown.map((item) => item.tokenSymbol);
    const debtTokens = debtBreakdown.map((item) => item.tokenSymbol);

    const primaryCollateralToken = collateralTokens[0] ?? group[0].tokenSymbol;
    const collateralPosition = group.find((item) => item.tokenSymbol === primaryCollateralToken) ?? group[0];
    const collateralUsd = collateralBreakdown.reduce((sum, item) => sum + item.valueUsd, 0) || (lending?.collateralUsd ?? group.reduce((sum, item) => sum + item.currentValue, 0));
    const debtUsd = debtBreakdown.reduce((sum, item) => sum + item.valueUsd, 0) || (lending?.debtUsd ?? 0);
    const currentValue = collateralUsd - debtUsd;
    const costBasisUsd = group.reduce((sum, item) => {
      const token = item.tokenSymbol.toUpperCase();
      if (!collateralTokens.includes(token)) return sum;
      return sum + (item.costBasisUsd ?? 0);
    }, 0);
    const roiPercent = costBasisUsd > 0 ? ((currentValue - costBasisUsd) / costBasisUsd) * 100 : 0;
    // Health Factor con thresholds por token (ver lib/lending/thresholds).
    const healthFactor = calculateHealthFactor(
      collateralBreakdown.map((c) => ({ symbol: c.tokenSymbol, valueUsd: c.valueUsd })),
      debtBreakdown.map((d) => ({ symbol: d.tokenSymbol, valueUsd: d.valueUsd })),
    );
    let healthStatus: DefiPosition["healthStatus"] = "na";
    if (healthFactor !== null) {
      if (healthFactor < 1.5) healthStatus = "critical";
      else if (healthFactor <= 2.2) healthStatus = "warning";
      else healthStatus = "safe";
    }

    const collateralLabel = formatTokenAmounts(collateralByToken);
    const debtLabel = formatTokenAmounts(debtByToken);
    const balanceLabel =
      collateralLabel && debtLabel
        ? `Colateral: ${collateralLabel} · Deuda: ${debtLabel}`
        : collateralLabel
          ? `Colateral: ${collateralLabel}`
          : debtLabel
            ? `Deuda: ${debtLabel}`
            : group
                .map((item) => `${item.currentBalance.toLocaleString("en-US")} ${item.tokenSymbol}`)
                .join(" + ");

    const tokenSymbol =
      collateralTokens.length > 0 && debtTokens.length > 0
        ? `${collateralTokens.join("/")} / ${debtTokens.join("/")}`
        : collateralTokens.length > 0
          ? collateralTokens.join("/")
          : debtTokens.length > 0
            ? debtTokens.join("/")
            : sample.tokenSymbol;

    return {
      ...sample,
      tokenSymbol,
      currentBalance: collateralPosition.currentBalance,
      averageEntryPrice: collateralPosition.averageEntryPrice,
      currentPrice: collateralPosition.currentPrice,
      currentValue,
      roiPercent,
      healthFactor,
      healthStatus,
      currentPriceLabel: null,
      isAggregatePosition: false,
      balanceLabel,
      costBasisUsd: costBasisUsd > 0 ? costBasisUsd : null,
      // `amount: null` a propósito: el símbolo es COMPUESTO («USDC / SOL») y el
      // valor es el neto (colateral − deuda). No hay ninguna cantidad de token
      // que corresponda a esa cifra, y fabricar una sería inventarse un saldo.
      // El desglose real de lending va en `collateralBreakdown`/`debtBreakdown`.
      valueBreakdown: [{ tokenSymbol: tokenSymbol || "LENDING", valueUsd: currentValue, amount: null }],
      collateralBreakdown,
      debtBreakdown,
      lendingDetails: buildLendingDetails(collateralBreakdown, debtBreakdown),
    };
  });

  const lendingKeys = new Set(Object.keys(lendingGroup));
  const nonLendingPositions = positions.filter((position) => {
    if (mapCategory(position.positionType) !== "lending") return true;
    const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    return !lendingKeys.has(key);
  });

  positions = [...nonLendingPositions, ...aggregatedLendingPositions];

  positions = positions.map((position) => {
    if (position.isAggregatePosition) return position;
    if (position.averageEntryPrice <= 0 || position.currentPrice <= 0) return position;

    const multiple = position.currentPrice / position.averageEntryPrice;
    if (multiple > 1000) {
      return {
        ...position,
        dataQualityIssue: "Precio medio inconsistente. Revisa spot_price histórico de tus transacciones.",
      };
    }

    return position;
  });

  const capitalInTypes = new Set(["deposit", "staking_deposit", "lp_deposit", "lending_supply"]);
  const capitalOutTypes = new Set(["withdrawal", "staking_withdrawal", "lp_withdraw", "lending_withdraw"]);

  let totalDepositedUsd = 0;
  let totalHarvestUsd = 0;
  const depositedByPosition = new Map<string, number>();
  // Flujos de capital POSTERIORES a la fecha en que se fijó un override de
  // depositado. El override sustituye la base en su momento; los aportes y
  // retiradas siguientes deben seguir moviéndola (override + flujos después).
  // Sin esto, el override congelaba la cifra para siempre.
  const overrideSetAtMs = new Map<string, number>();
  const depositedAfterOverride = new Map<string, number>();
  for (const row of depositOverrideRows) {
    const ts = Date.parse(row.deposited_override_set_at ?? "");
    if (!Number.isFinite(ts)) continue;
    overrideSetAtMs.set(positionCompositeKey(row.portfolio_id, row.protocol ?? "Wallet", row.position_id ?? ""), ts);
    overrideSetAtMs.set(positionCompositeKey("", row.protocol ?? "Wallet", row.position_id ?? ""), ts);
  }
  // ROTACIONES hold→posición pendientes de imputar al hold de ORIGEN, y el
  // índice de holds por (portfolio, símbolo) que las resuelve. Ver el bloque
  // que las aplica tras el bucle.
  const pendingRotations: Array<{
    portfolioId: string;
    symbol: string;
    valueUsd: number;
    date: string | null;
  }> = [];
  const holdKeysBySymbol = new Map<string, { full: string; fallback: string }>();
  // Parte del depositado que viene de la ADOPCIÓN (saldo inicial declarado al
  // dar de alta la posición). Es justo lo que un override corrige, así que
  // permite aplicarlo sin borrar los movimientos reales posteriores.
  const adoptedByPosition = new Map<string, number>();
  const addDeposited = (fullKey: string, fallbackKey: string, delta: number, txDate: string | null) => {
    depositedByPosition.set(fullKey, (depositedByPosition.get(fullKey) ?? 0) + delta);
    depositedByPosition.set(fallbackKey, (depositedByPosition.get(fallbackKey) ?? 0) + delta);
    const setAt = overrideSetAtMs.get(fullKey) ?? overrideSetAtMs.get(fallbackKey);
    if (setAt !== undefined) {
      const ts = Date.parse(txDate ?? "");
      if (Number.isFinite(ts) && ts > setAt) {
        depositedAfterOverride.set(fullKey, (depositedAfterOverride.get(fullKey) ?? 0) + delta);
        depositedAfterOverride.set(fallbackKey, (depositedAfterOverride.get(fallbackKey) ?? 0) + delta);
      }
    }
  };
  const harvestByPositionAcc: Record<
    string,
    {
      portfolioId: string;
      protocol: string;
      positionId: string;
      harvestedUsd: number;
      pendingByToken: Record<string, number>;
    }
  > = {};

  for (const tx of portfolioTransactions) {
    const txType = (tx.type ?? "").trim();
    const spotPrice = toNumber(tx.spot_price);
    const inAmount = toNumber(tx.token_in_amount);
    const outAmount = toNumber(tx.token_out_amount);
    const inSymbol = (tx.token_in_symbol ?? "").toUpperCase();
    const protocol = (tx.protocol ?? "Wallet").trim();
    const positionId = tx.position_id ?? "";
    const portfolioId = tx.portfolio_id ?? "";
    const positionKey = positionCompositeKey(portfolioId, protocol, positionId);
    const reason = getMetadataFlag(tx.metadata, tx.notes, "reason");
    const source = getMetadataFlag(tx.metadata, tx.notes, "source");
    const isHarvestReinvestInternal = reason === "harvest_reinvest" || source === "harvest_reinvest";
    // Rebalanceo: movimiento interno entre posiciones; no altera el total depositado.
    const isRebalanceTransfer = reason === "rebalance_transfer" || source === "rebalance_transfer";
    // Salida del harvest pendiente que se arrastra en un rebalance. Esos tokens
    // entraron como rendimiento (totalHarvestUsd), NUNCA como capital depositado,
    // así que su salida tampoco debe restar al Total Depositado ni al cost basis
    // de la posición origen. Se trata como movimiento interno.
    const isRebalanceHarvestOut = reason === "rebalance_harvest_out" || source === "rebalance_harvest_out";
    // VENTA DE RECOMPENSAS (harvest_sold): vender lo cobrado de un pool no es
    // capital que entra ni sale — ese valor ya se contó como rendimiento al
    // cobrarlo, así que sumarlo o restarlo del Depositado lo anularía. Es
    // interno para el capital, pero SÍ tributa como permuta (eso lo decide el
    // motor fiscal por `source: onchain_swap`, no esta bandera).
    const isHarvestSold = reason === "harvest_sold" || source === "harvest_sold";
    const isInternalMovement =
      isHarvestReinvestInternal || isRebalanceTransfer || isRebalanceHarvestOut || isHarvestSold;
    // ROTACIÓN de capital hold→posición: un depósito de LP/staking/lending
    // AUTO-INGERIDO (onchain_ingest) mueve fondos que YA entraron por un hold y
    // que ya cuentan en el Total Depositado; contarlo otra vez inflaría el total
    // en cada apertura de pool (el hold no emite su salida). Se trata como
    // interno: el capital "vive" en el hold a efectos de total. El CIERRE no
    // necesita cambio — su lp_withdraw (−) y la llegada al hold (+) ya se netean.
    // Solo el lado DEPÓSITO y solo onchain_ingest: onchain_adopt (baseline de
    // alta de cliente) y aportaciones externas SÍ cuentan.
    const isRotationDeposit =
      source === "onchain_ingest" &&
      (txType === "lp_deposit" || txType === "staking_deposit" || txType === "lending_supply");

    // Índice de holds por símbolo: el hold es el ORIGEN natural del capital que
    // rota a un pool/staking/lending de la misma wallet.
    if ((tx.position_type ?? "") === "Hold" && positionId) {
      const holdSymbol = (inSymbol || (tx.token_out_symbol ?? "").toUpperCase()).trim();
      if (holdSymbol) {
        const idx = `${portfolioId}|${holdSymbol}`;
        if (!holdKeysBySymbol.has(idx)) {
          holdKeysBySymbol.set(idx, {
            full: positionCompositeKey(portfolioId, protocol, positionId),
            fallback: positionCompositeKey("", protocol, positionId),
          });
        }
      }
    }

    if (txType === "harvest") {
      totalHarvestUsd += inAmount * spotPrice;
      if (portfolioId && positionId) {
        if (!harvestByPositionAcc[positionKey]) {
          harvestByPositionAcc[positionKey] = {
            portfolioId,
            protocol,
            positionId,
            harvestedUsd: 0,
            pendingByToken: {},
          };
        }
        harvestByPositionAcc[positionKey].harvestedUsd += inAmount * spotPrice;
        if (inSymbol) {
          harvestByPositionAcc[positionKey].pendingByToken[inSymbol] =
            (harvestByPositionAcc[positionKey].pendingByToken[inSymbol] ?? 0) + inAmount;
        }
      }
      continue;
    }

    if (txType === "lending_borrow") {
      // Pedir prestado = extraer capital: reduce el Total Depositado en el
      // principal recibido (token_in), igual que una retirada. Repagar
      // (token_out) lo restituye. Así pedir prestado es P&L-neutro por
      // construcción: el valor de la posición ya resta la deuda (a precio
      // actual) y el cost basis resta el principal (a precio de la operación).
      // Si la deuda es un token volátil que se aprecia, la diferencia entre
      // ambos precios aflora como pérdida real (correcto).
      const net = (outAmount - inAmount) * spotPrice; // <0 al pedir, >0 al repagar
      if (positionId) {
        const fullKey = positionCompositeKey(portfolioId, protocol, positionId);
        const fallbackKey = positionCompositeKey("", protocol, positionId);
        addDeposited(fullKey, fallbackKey, net, tx.transaction_date);
      }
      totalDepositedUsd += net;
      continue;
    }

    if (capitalInTypes.has(txType)) {
      const skipCapitalIn = isInternalMovement;
      if (!skipCapitalIn && positionId) {
        const fullKey = positionCompositeKey(portfolioId, protocol, positionId);
        const fallbackKey = positionCompositeKey("", protocol, positionId);
        addDeposited(fullKey, fallbackKey, inAmount * spotPrice, tx.transaction_date);
        // Saldo inicial declarado al adoptar: lo que un override corrige.
        if (source === "onchain_adopt") {
          const adoptDelta = inAmount * spotPrice;
          adoptedByPosition.set(fullKey, (adoptedByPosition.get(fullKey) ?? 0) + adoptDelta);
          adoptedByPosition.set(fallbackKey, (adoptedByPosition.get(fallbackKey) ?? 0) + adoptDelta);
        }
      }
      if (!skipCapitalIn) {
        totalDepositedUsd += inAmount * spotPrice;
      }
      // ROTACIÓN hold→posición: el capital SÍ se acredita al destino (arriba) —
      // antes se descartaba entero y la base se quedaba en el hold, dejando al
      // pool con un depositado corto y un ROI ficticio (un pool de stables
      // marcaba +155%). Para no inflar el total, se anota para DEBITARLO del
      // hold de origen tras el bucle: la base viaja, el total no cambia.
      if (isRotationDeposit && positionId && inSymbol) {
        pendingRotations.push({
          portfolioId,
          symbol: inSymbol,
          valueUsd: inAmount * spotPrice,
          date: tx.transaction_date,
        });
      }
      // Rebalance hereda el cost basis del origen sin afectar al total global.
      if (isRebalanceTransfer && positionId) {
        const depositedDelta = getMetadataNumber(tx.metadata, tx.notes, "depositedDelta");
        if (depositedDelta !== null) {
          const fullKey = positionCompositeKey(portfolioId, protocol, positionId);
          const fallbackKey = positionCompositeKey("", protocol, positionId);
          addDeposited(fullKey, fallbackKey, depositedDelta, tx.transaction_date);
        }
      }
      // Reinversión de harvest: descuenta la cantidad reinvertida del pending
      // de la posición de origen (no de la de destino).
      if (isHarvestReinvestInternal && inSymbol && inAmount > 0) {
        const srcPositionId = getMetadataFlag(tx.metadata, tx.notes, "sourcePositionId") ?? positionId;
        const srcProtocol = getMetadataFlag(tx.metadata, tx.notes, "sourceProtocol") ?? protocol;
        if (portfolioId && srcPositionId) {
          const srcKey = positionCompositeKey(portfolioId, srcProtocol, srcPositionId);
          if (!harvestByPositionAcc[srcKey]) {
            harvestByPositionAcc[srcKey] = {
              portfolioId,
              protocol: srcProtocol,
              positionId: srcPositionId,
              harvestedUsd: 0,
              pendingByToken: {},
            };
          }
          harvestByPositionAcc[srcKey].pendingByToken[inSymbol] =
            (harvestByPositionAcc[srcKey].pendingByToken[inSymbol] ?? 0) - inAmount;
          // Permuta implícita dentro de la reinversión: lo vendido sale del
          // pending y lo comprado entra (compensa que el depósito descuenta
          // el token comprado, que nunca se cobró en el harvest).
          for (const leg of getSwapLegs(tx.metadata, tx.notes)) {
            harvestByPositionAcc[srcKey].pendingByToken[leg.soldSymbol] =
              (harvestByPositionAcc[srcKey].pendingByToken[leg.soldSymbol] ?? 0) - leg.soldAmount;
            harvestByPositionAcc[srcKey].pendingByToken[leg.boughtSymbol] =
              (harvestByPositionAcc[srcKey].pendingByToken[leg.boughtSymbol] ?? 0) + leg.boughtAmount;
          }
        }
      }
      continue;
    }

    if (capitalOutTypes.has(txType)) {
      if (!isInternalMovement && positionId) {
        const fullKey = positionCompositeKey(portfolioId, protocol, positionId);
        const fallbackKey = positionCompositeKey("", protocol, positionId);
        addDeposited(fullKey, fallbackKey, -(outAmount * spotPrice), tx.transaction_date);
      }
      if (!isInternalMovement) {
        totalDepositedUsd -= outAmount * spotPrice;
      }
      // Rebalance descuenta cost basis del origen (depositedDelta viene negativo).
      if (isRebalanceTransfer && positionId) {
        const depositedDelta = getMetadataNumber(tx.metadata, tx.notes, "depositedDelta");
        if (depositedDelta !== null) {
          const fullKey = positionCompositeKey(portfolioId, protocol, positionId);
          const fallbackKey = positionCompositeKey("", protocol, positionId);
          addDeposited(fullKey, fallbackKey, depositedDelta, tx.transaction_date);
        }
      }
      // Harvest arrastrado al destino de un rebalance: sale del pending del
      // origen — su valor pasa a formar parte de la posición destino. Sin
      // este descuento se contaría DOBLE en totalValueUsd (valor en destino
      // + pending vivo en origen).
      // Idem cuando la recompensa se VENDE (harvest_sold): la salida se imputa
      // a la posición que la cobró, así que su pendiente debe descargarse — si
      // no, el pool seguiría mostrando eternamente como "por reinvertir" unos
      // tokens que ya no existen.
      if ((isRebalanceHarvestOut || isHarvestSold) && portfolioId && positionId) {
        const outSymbol = (tx.token_out_symbol ?? "").toUpperCase();
        if (outSymbol && outAmount > 0) {
          if (!harvestByPositionAcc[positionKey]) {
            harvestByPositionAcc[positionKey] = {
              portfolioId,
              protocol,
              positionId,
              harvestedUsd: 0,
              pendingByToken: {},
            };
          }
          harvestByPositionAcc[positionKey].pendingByToken[outSymbol] =
            (harvestByPositionAcc[positionKey].pendingByToken[outSymbol] ?? 0) - outAmount;
        }
      }
      // Nota: ya no usamos las withdrawals con reason=harvest_reinvest para descontar
      // el pending (el descuento se hace al registrar el depósito de reinversión).
      // Las filas legacy con ese reason serán eliminadas por migración SQL.
    }
  }

  // Contrapartida de las ROTACIONES hold→posición. El depósito de destino ya
  // sumó al total; aquí se resta del hold de ORIGEN (mismo portfolio y símbolo)
  // para que el total quede NEUTRO: la base solo cambia de sitio. Si no existe
  // hold de ese símbolo, el capital entró de fuera directamente a la posición y
  // debe seguir sumando al total (no se debita nada).
  for (const rot of pendingRotations) {
    const hold = holdKeysBySymbol.get(`${rot.portfolioId}|${rot.symbol}`);
    if (!hold) continue;
    addDeposited(hold.full, hold.fallback, -rot.valueUsd, rot.date);
    totalDepositedUsd -= rot.valueUsd;
  }

  // Overrides manuales del depositado: sustituyen la base derivada de la
  // posición y ajustan el Total Depositado global por la diferencia. Solo
  // aplican a posiciones vivas en el dashboard (un link huérfano no debe
  // inyectar base sin valor actual que la respalde). No tocan el patrimonio
  // (suma de valores actuales) ni el motor fiscal (FIFO sigue usando las
  // transacciones reales).
  {
    const livePositionKeys = new Set(
      positions.map((p) => positionCompositeKey(p.portfolioId, p.protocol, p.positionId)),
    );
    for (const row of depositOverrideRows) {
      const override = Number(row.deposited_override_usd);
      if (!Number.isFinite(override) || override <= 0) continue;
      const key = positionCompositeKey(row.portfolio_id, row.protocol ?? "Wallet", row.position_id ?? "");
      if (!livePositionKeys.has(key)) continue;
      const fallbackKey = positionCompositeKey("", row.protocol ?? "Wallet", row.position_id ?? "");
      const derived = depositedByPosition.get(key) ?? depositedByPosition.get(fallbackKey) ?? 0;
      // El override corrige el SALDO INICIAL declarado al adoptar la posición,
      // no toda su historia: los movimientos reales que la app ha registrado
      // después siguen contando encima. Antes se comparaba contra la fecha en
      // que se fijó el override, así que una operación REAL con fecha anterior
      // —pero descubierta después, como el cierre de un pool detectado luego en
      // la cadena— quedaba enmascarada y el depositado se inflaba (el cierre de
      // Orca de M Fita: la posición seguía marcando 2.500 $ ya cerrada).
      const adopted = adoptedByPosition.get(key) ?? adoptedByPosition.get(fallbackKey);
      let effective: number;
      if (adopted !== undefined) {
        // derived − adopted = todo lo ocurrido DESPUÉS del saldo inicial.
        effective = Math.max(0, override + (derived - adopted));
      } else {
        // Sin adopción, el override sustituye la base entera: solo se le suman
        // los flujos posteriores a fijarlo.
        const flowsAfter = depositedAfterOverride.get(key) ?? depositedAfterOverride.get(fallbackKey) ?? 0;
        effective = Math.max(0, override + flowsAfter);
      }
      totalDepositedUsd += effective - derived;
      depositedByPosition.set(key, effective);
      depositedByPosition.set(fallbackKey, effective);
    }
  }

  positions = positions.map((position) => {
    const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    const fallbackKey = positionCompositeKey("", position.protocol, position.positionId);
    const deposited = depositedByPosition.get(key) ?? depositedByPosition.get(fallbackKey) ?? 0;
    if (deposited <= 0) return position;
    const roiPercent = ((position.currentValue - deposited) / deposited) * 100;
    return {
      ...position,
      costBasisUsd: deposited,
      roiPercent,
    };
  });

  const harvestByPosition: HarvestPositionSummary[] = Object.values(harvestByPositionAcc).map((entry) => {
    const pendingByToken = Object.entries(entry.pendingByToken)
      .filter(([, amount]) => amount > 0)
      .map(([tokenSymbol, amount]) => ({ tokenSymbol, amount }));
    // El USD pendiente netea TODOS los tokens a precio de mercado, incluidos los
    // saldos negativos (p.ej. tras reinvertir un harvest en otra mezcla de tokens
    // el token reinvertido queda en negativo y debe descontar del pendiente).
    // pendingByToken solo lista los positivos porque es lo que se muestra/reinvierte.
    const pendingUsd = Math.max(
      0,
      Object.entries(entry.pendingByToken).reduce(
        (acc, [tokenSymbol, amount]) => acc + amount * (cachedPrices.pricesBySymbol.get(tokenSymbol) ?? 0),
        0,
      ),
    );
    return {
      key: `${entry.portfolioId}::${entry.protocol}::${entry.positionId}`,
      portfolioId: entry.portfolioId,
      protocol: entry.protocol,
      positionId: entry.positionId,
      harvestedUsd: entry.harvestedUsd,
      pendingUsd,
      pendingByToken,
    };
  });

  const harvestSummaryByPosition = harvestByPosition.reduce(
    (acc, entry) => {
      acc.set(positionCompositeKey(entry.portfolioId, entry.protocol, entry.positionId), {
        harvestedUsd: entry.harvestedUsd,
        pendingUsd: entry.pendingUsd,
      });
      return acc;
    },
    new Map<string, { harvestedUsd: number; pendingUsd: number }>(),
  );

  // El harvest pendiente SÍ debe incrementar el total del portfolio (es rendimiento ganado).
  // No lo restamos del currentValue: se suma aparte en el total global para mantener
  // coherencia entre la posición (capital invertido) y el rendimiento pendiente.
  const harvestAjustado = positions.map((position) => {
    const key = positionCompositeKey(position.portfolioId, position.protocol, position.positionId);
    const harvest = harvestSummaryByPosition.get(key);
    if (!harvest) return position;

    return {
      ...position,
      totalHarvested: harvest.harvestedUsd,
    };
  });

  /*
   * MANDA LA BILLETERA.
   *
   * Hasta aquí el valor de cada posición viene del libro: saldo contable por
   * precio. La cabecera, en cambio, sale del snapshot on-chain. Eran dos cifras
   * distintas para la misma pregunta —«cuánto tengo»— y las dos a la vista: el
   * Resumen decía una, la suma de las secciones otra, y la curva de evolución
   * una tercera.
   *
   * Decisión del dueño, y es la correcta: manda SIEMPRE lo que hay en la
   * billetera. El libro sirve para saber qué pagaste y qué debes declarar; para
   * saber cuánto tienes ahora mismo, la cadena es la autoridad.
   *
   * Cada posición contable enlazada a una lectura on-chain (`position_links`)
   * toma el valor de esa lectura. El depositado y el coste NO se tocan: son
   * historia contable y la cadena no los conoce.
   *
   * Lo que NO se hace es mezclar en silencio. Una posición sin enlace o sin
   * lectura conserva su valor de libro y queda MARCADA, para que la pantalla
   * pueda decir que esa cifra no viene de la cadena. Mezclar dos fuentes sin
   * distinguirlas es exactamente el problema que esto viene a resolver.
   */
  const adjustedPositions = harvestAjustado.map((position) => {
    const valorEnCadena = onchainValueByPosition.get(
      positionCompositeKey(position.portfolioId, position.protocol, position.positionId),
    );
    if (valorEnCadena === undefined) {
      return { ...position, valueSource: "libro" as const };
    }
    return { ...position, currentValue: valorEnCadena, valueSource: "cadena" as const };
  });

  const byCategory = adjustedPositions.reduce(
    (acc, position) => {
      const key = mapCategory(position.positionType);
      acc[key].push(position);
      return acc;
    },
    {
      wallet: [] as DefiPosition[],
      lending: [] as DefiPosition[],
      liquidity_pools: [] as DefiPosition[],
      staking: [] as DefiPosition[],
    },
  );

  const sections: PositionSection[] = (Object.keys(byCategory) as PositionSection["key"][])
    .map((key) => ({
      key,
      title: sectionTitleByKey[key],
      positions: byCategory[key],
    }))
    .filter((section) => section.positions.length > 0);

  const totalPendingHarvestUsd = harvestByPosition.reduce(
    (acc, entry) => acc + Math.max(0, entry.pendingUsd),
    0,
  );
  const accountingTotalValueUsd =
    adjustedPositions.reduce((acc, position) => acc + position.currentValue, 0) + totalPendingHarvestUsd;

  // ─── VALOR TOTAL DESDE EL SNAPSHOT ON-CHAIN (fuente de verdad de la vista) ──
  // En modo on-chain, lo que el cliente ve son las posiciones leídas de
  // blockchain + lo "sin reclamar". El valor de cabecera debe ser EXACTAMENTE
  // esa suma, no la contable, para que no diverja de las secciones ni cuente
  // dos veces el harvest ya cobrado (que vive en el saldo de la wallet on-chain
  // y por tanto ya está dentro de las posiciones). Si no hay snapshot (aún no
  // se ha leído on-chain), se cae a la cifra contable.
  let onchainTotalValueUsd: number | null = null;
  // Rendimiento generado que TODAVÍA no se ha movido, en dos estados:
  //  - sin reclamar: sigue dentro del protocolo (comisiones/recompensas vivas);
  //  - cobrado sin reinvertir: ya está en la wallet pero no se ha redesplegado.
  // Ambos YA cuentan en el patrimonio (el primero se suma aquí; el segundo son
  // tokens reales en la wallet), pero conviene verlos aparte: es dinero ocioso.
  let totalUnclaimedUsd = 0;
  try {
    const snapClient = getSupabaseServiceClient() ?? getSupabaseServerClient();
    const { data: snapRows } = await snapClient
      .from("onchain_cache")
      .select("positions")
      .in("portfolio_id", allowedPortfolioIds)
      .eq("source", "snapshot");
    let sum = 0;
    let hasAny = false;
    for (const row of snapRows ?? []) {
      const positions = (row.positions as { positions?: Array<{ valueUsd?: number | null; unclaimedUsd?: number | null }> })?.positions ?? [];
      for (const p of positions) {
        hasAny = true;
        const unclaimed = Number(p.unclaimedUsd ?? 0);
        sum += Number(p.valueUsd ?? 0) + unclaimed;
        if (Number.isFinite(unclaimed) && unclaimed > 0) totalUnclaimedUsd += unclaimed;
      }
    }
    if (hasAny) onchainTotalValueUsd = sum;
  } catch {
    /* sin snapshot: usar la cifra contable */
  }
  // "Cobrado y sin reinvertir" ya está calculado arriba: totalPendingHarvestUsd.

  const adjustedTotalValueUsd = onchainTotalValueUsd ?? accountingTotalValueUsd;

  // Compute realized P&L from position_closed snapshots
  let totalRealizedPnl = 0;
  for (const tx of portfolioTransactions) {
    const txType = ((tx.type ?? "") as string).trim();
    if (txType !== "position_closed") continue;
    const meta = tx.metadata as Record<string, unknown> | null;
    if (!meta || typeof meta !== "object") continue;
    const closure = meta.closure as Record<string, unknown> | undefined;
    if (!closure || typeof closure !== "object") continue;
    const pnl = Number(closure.realizedPnl ?? 0);
    if (Number.isFinite(pnl)) totalRealizedPnl += pnl;
  }

  const adjustedPnlUsd = adjustedTotalValueUsd - totalDepositedUsd + totalRealizedPnl;
  const adjustedPnlPercent = totalDepositedUsd > 0 ? (adjustedPnlUsd / totalDepositedUsd) * 100 : 0;

  // ─── CANDADO DE COHERENCIA (FASE 1) ─────────────────────────────────────
  // El MOTOR CANÓNICO (lib/portfolio/valuation) es la fuente única de verdad
  // que también alimenta la curva de evolución (capture.ts). El header de aquí
  // debe coincidir con él: si divergen, la curva y el header mostrarían números
  // distintos para lo mismo (el bug que FASE 1 elimina). En desarrollo se avisa
  // con detalle; el número mostrado sigue siendo el de las secciones visibles
  // (garantiza header == lista) para no exponer nunca una cifra contradictoria.
  try {
    const canonical = computePortfolioValuation(
      portfolioTransactions as unknown as ValuationTx[],
      (symbol: string) => cachedPrices.pricesBySymbol.get(symbol.toUpperCase()) ?? 0,
    );
    const tol = Math.max(1, accountingTotalValueUsd * 0.005);
    const valueDiff = Math.abs(canonical.totalValueUsd - accountingTotalValueUsd);
    const depDiff = Math.abs(canonical.totalDepositedUsd - totalDepositedUsd);
    if (process.env.NODE_ENV !== "production" && (valueDiff > tol || depDiff > tol)) {
      console.warn(
        `[coherencia] contable vs canónico divergen — valor: ${accountingTotalValueUsd.toFixed(2)} vs ${canonical.totalValueUsd.toFixed(2)} (Δ${valueDiff.toFixed(2)}); depositado: ${totalDepositedUsd.toFixed(2)} vs ${canonical.totalDepositedUsd.toFixed(2)} (Δ${depDiff.toFixed(2)}). Nota: el header muestra el total on-chain del snapshot, no esta cifra.`,
      );
    }
  } catch {
    /* el candado nunca debe tumbar el dashboard */
  }

  const summary: PortfolioSummary = {
    totalValueUsd: adjustedTotalValueUsd,
    totalDepositedUsd,
    pnlUsd: adjustedPnlUsd,
    pnlPercent: adjustedPnlPercent,
    totalHarvestUsd,
    totalRealizedPnl,
    totalUnclaimedUsd,
    totalPendingHarvestUsd,
  };

  const portfolioContextById = portfolioContexts.reduce(
    (acc, context) => {
      acc.set(context.portfolioId, context);
      return acc;
    },
    new Map<
      string,
      {
        portfolioId: string;
        portfolioName: string;
        ownerName: string;
        ownerEmail: string;
        managerName: string | null;
        managerEmail: string | null;
      }
    >(),
  );
  const selectedPortfolioContextId =
    targetPortfolioId ||
    (portfolioIds.length > 0 ? portfolioIds[0] : (allowedPortfolioIds[0] ?? ""));
  const portfolioContext =
    (selectedPortfolioContextId
      ? portfolioContextById.get(selectedPortfolioContextId) ?? null
      : null) ??
    (portfolioContexts[0] ?? null);

  const recentActivity: RecentActivityItem[] = recentActivityRows.map((tx) => {
    // El rebalanceo marca la entrada con `source` y la salida con `reason`.
    const activitySource = getMetadataFlag(tx.metadata, tx.notes, "source");
    const activityReason = getMetadataFlag(tx.metadata, tx.notes, "reason");
    const isRebalanceRow = [activitySource, activityReason].some(
      (flag) => flag === "rebalance_transfer" || flag === "rebalance_harvest_out",
    );
    return {
      transactionDate: tx.transaction_date ?? "",
      type: (tx.type ?? "").trim(),
      movementOrigin: activitySource === "harvest_reinvest"
        ? ("harvest_reinvest" as const)
        : isRebalanceRow
          ? ("rebalance" as const)
          : ("standard" as const),
      operationGroupId: (tx.operation_group_id ?? "").trim(),
      portfolioId: (tx.portfolio_id ?? "").trim(),
      reason: (activityReason ?? "").trim(),
      protocol: (tx.protocol ?? "Wallet").trim(),
      positionId: tx.position_id ?? "",
      positionType: normalizePositionType(tx.position_type),
      tokenInSymbol: (tx.token_in_symbol ?? "").toUpperCase(),
      tokenInAmount: toNumber(tx.token_in_amount),
      tokenOutSymbol: (tx.token_out_symbol ?? "").toUpperCase(),
      tokenOutAmount: toNumber(tx.token_out_amount),
      spotPrice: toNumber(tx.spot_price),
    };
  });

  return {
    summary,
    sections,
    actions: quickActions,
    harvestByPosition,
    recentActivity,
    pricesBySymbol: Object.fromEntries(cachedPrices.pricesBySymbol.entries()),
    pricesLastUpdatedAt: cachedPrices.pricesLastUpdatedAt,
    pricesAreStale: cachedPrices.pricesAreStale,
    fxRates: {
      eur: usdToEurRate,
    },
    viewer,
    portfolioContext,
  };
}
