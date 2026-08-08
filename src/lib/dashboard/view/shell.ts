import { getSupabaseServiceClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { getPortfolioSnapshots } from "@/lib/snapshots/capture";
import { buildSnapshotSeries, type SnapshotPoint } from "@/lib/snapshots/metrics";
import type { EvolutionPoint } from "@/components/dashboard/resumen/EvolutionChart";
import { timeAgoShort, shortDate, shortDateTime, plural } from "@/lib/format/figures";

/**
 * Datos que rodean a las pantallas: de dónde salen las cifras y cuándo se
 * leyeron por última vez.
 *
 * En un producto que lee solo, esto no es adorno: una cifra sin fecha de
 * lectura no es un dato, es una suposición. Por eso todas las pantallas llevan
 * el bloque de sincronización arriba y el pie de procedencia abajo.
 */

export interface SyncInfo {
  walletsLabel: string;
  syncedLabel: string;
  /** Para el pie de procedencia. */
  walletCount: number;
  networkCount: number;
  lastSyncIso: string | null;
  /** Una lectura vieja deja de ser una lectura. */
  isStale: boolean;
}

/** A partir de esto, lo que se enseña ya no describe la cartera de hoy. */
const STALE_HOURS = 12;

export async function getSyncInfo(portfolioId: string): Promise<SyncInfo> {
  const db = getSupabaseServiceClient() ?? getSupabaseServerClient();

  const [{ data: wallets }, { data: cache }] = await Promise.all([
    // Solo las ACTIVAS. Una wallet desactivada no está conectada, y contarla
    // hacía que una cartera sin ninguna wallet activa dijera «3 wallets
    // conectadas · 0 posiciones» —tres conectadas que no leen nada—, que es
    // justo la contradicción que delata que el número está mal.
    db
      .from("portfolio_wallets")
      .select("chain_kind")
      .eq("portfolio_id", portfolioId)
      .eq("is_active", true),
    db.from("onchain_cache").select("updated_at").eq("portfolio_id", portfolioId),
  ]);

  const walletCount = wallets?.length ?? 0;
  const networkCount = new Set((wallets ?? []).map((w) => String(w.chain_kind))).size;

  // La lectura más RECIENTE de todas las fuentes: si Kamino se leyó hace una
  // hora, la cartera se ha mirado hace una hora, aunque otra fuente lleve días.
  const timestamps = (cache ?? [])
    .map((c) => Date.parse(String(c.updated_at)))
    .filter((t) => Number.isFinite(t));
  const lastSync = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  const ageHours = lastSync ? (Date.now() - Date.parse(lastSync)) / 3600000 : Infinity;

  return {
    walletsLabel: `${plural(walletCount, "wallet", "wallets")} · ${plural(networkCount, "red", "redes")}`,
    syncedLabel: lastSync ? `Sincronizado ${timeAgoShort(lastSync)}` : "Sin lecturas todavía",
    walletCount,
    networkCount,
    lastSyncIso: lastSync,
    // Sin ninguna wallet activa NO hay nada que pueda estar viejo: quedaría una
    // caché de hace días de wallets que ya no se leen. Avisar de que «hay que
    // volver a sincronizar» una cartera vacía es pedirle al gestor que refresque
    // la nada. Lo que falta es AÑADIR una wallet, y de eso avisa el vacío.
    isStale: walletCount > 0 && ageHours > STALE_HOURS,
  };
}

/** Pie de procedencia: quién dice esto y desde cuándo. */
export function provenanceLine(sync: SyncInfo, positionsLabel: string): string {
  // Con la HORA, no solo el día. Un producto que lee solo tiene que decir
  // cuándo leyó, y «28 jul» a las nueve de la noche no distingue una lectura de
  // hace diez minutos de una de esta mañana. Es lo que piden las dos maquetas
  // que llevan pie: «última lectura 28 jul, 13:43».
  // Sin ninguna wallet conectada, la fecha de la última lectura habla de unas
  // wallets que ya no están: mejor invitar a añadir una que exhibir una fecha
  // vieja que no corresponde a lo que hay ahora.
  if (sync.walletCount === 0) {
    return "Sin wallets conectadas · añade una para empezar a leer saldos y posiciones";
  }
  const read = sync.lastSyncIso
    ? `última lectura ${shortDateTime(sync.lastSyncIso)}`
    : "sin lecturas registradas";
  return `${plural(sync.walletCount, "wallet conectada", "wallets conectadas")} · ${positionsLabel} · ${read}`;
}

/** Serie del gráfico de evolución, ya en el formato que pinta el componente. */
export async function getEvolution(portfolioId: string): Promise<{
  points: EvolutionPoint[];
  twr: number | null;
  maxDrawdown: number | null;
  snapshotCount: number;
  raw: SnapshotPoint[];
}> {
  const db = getSupabaseServiceClient() ?? getSupabaseServerClient();
  const snapshots = await getPortfolioSnapshots(db, portfolioId, { limit: 365 });
  const { points, metrics } = buildSnapshotSeries(snapshots);

  return {
    points: points.map((p) => ({
      label: shortDate(p.date),
      value: p.value,
      deposited: p.deposited,
    })),
    twr: metrics.twr,
    maxDrawdown: metrics.maxDrawdown,
    snapshotCount: metrics.totalDays,
    raw: points,
  };
}
