"use client";

import { useEffect, useState } from "react";
import { Radio, RefreshCw, Wallet2, Sprout } from "lucide-react";
import {
  OnchainSections,
  tokenSetKey,
  protocolsMatch,
  kindMatchesType,
  type OnchainLinkRow,
} from "./OnchainSections";

export type LiveRange = { lower: number; upper: number; current: number; inRange: boolean };
export type LiveTokenAmount = { symbol: string; amount: number; valueUsd?: number | null };
export type LivePosition = {
  id: string;
  chain: string;
  protocol: string | null;
  kind: string;
  label: string;
  tokens?: LiveTokenAmount[];
  valueUsd: number | null;
  range: LiveRange | null;
  unclaimedUsd: number | null;
  walletLabel?: string | null;
  walletAddress?: string;
  meta?: Record<string, unknown>;
};
type LiveResult = { positions: LivePosition[]; warnings: string[]; syncedAt: string; cached?: boolean };

const usd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function shortAddr(a?: string) {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? "";
}

type WalletRow = { id: string; chain_kind: string; address: string; label: string | null; is_active: boolean };

const CHAIN_KIND_LABEL: Record<string, string> = { evm: "EVM", solana: "Solana", bitcoin: "Bitcoin" };

/** Gestor de las wallets del portfolio (añadir/activar). Solo managers. */
function WalletManager({ portfolioId }: { portfolioId: string }) {
  const [wallets, setWallets] = useState<WalletRow[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ chainKind: "evm", address: "", label: "" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wallet/manage?portfolioId=${encodeURIComponent(portfolioId)}`);
        const body = (await res.json()) as { wallets?: WalletRow[]; error?: string };
        if (!res.ok) throw new Error(body.error ?? "No se pudieron leer las wallets.");
        if (!cancelled) setWallets(body.wallets ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error leyendo wallets.");
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  async function addWallet() {
    if (!form.address.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, ...form }),
      });
      const body = (await res.json()) as { wallet?: WalletRow; error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo añadir.");
      setWallets((prev) => [...(prev ?? []), body.wallet!]);
      setForm({ chainKind: "evm", address: "", label: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error añadiendo wallet.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(w: WalletRow) {
    setError("");
    try {
      const res = await fetch("/api/wallet/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, walletId: w.id, isActive: !w.is_active }),
      });
      const body = (await res.json()) as { wallet?: WalletRow; error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo actualizar.");
      setWallets((prev) => (prev ?? []).map((x) => (x.id === w.id ? body.wallet! : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando wallet.");
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--line)] p-4">
      <p className="text-xs text-[var(--muted)] mb-3">
        Direcciones públicas que se leen de blockchain (solo lectura, nunca claves privadas).
      </p>
      {error ? <p className="text-xs text-rose-400 mb-2">{error}</p> : null}

      {(wallets ?? []).map((w) => (
        <div key={w.id} className="flex items-center justify-between gap-3 border-t border-[var(--line)] py-2 text-sm">
          <div className="min-w-0">
            <span className="text-[var(--foreground)]">{w.label ?? shortAddr(w.address)}</span>
            <span className="ml-2 whitespace-nowrap text-[10px] uppercase font-mono tracking-wider text-[var(--muted)]">
              · {CHAIN_KIND_LABEL[w.chain_kind] ?? w.chain_kind}
            </span>
            <div className="font-mono text-xs text-[var(--muted)] truncate" title={w.address}>{w.address}</div>
          </div>
          <button
            type="button"
            onClick={() => toggleActive(w)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] ${w.is_active
              ? "border-[rgba(111,174,143,0.35)] bg-[rgba(111,174,143,0.08)] text-emerald-300"
              : "border-[var(--line)] text-[var(--muted)]"}`}
          >
            {w.is_active ? "Activa" : "Inactiva"}
          </button>
        </div>
      ))}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Cadena
          <select
            value={form.chainKind}
            onChange={(e) => setForm((f) => ({ ...f, chainKind: e.target.value }))}
            className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="evm">EVM (Rabby…)</option>
            <option value="solana">Solana (Phantom…)</option>
            <option value="bitcoin">Bitcoin (Ledger…)</option>
          </select>
        </label>
        <label className="flex flex-1 min-w-[220px] flex-col gap-1 text-xs text-[var(--muted)]">
          Dirección pública
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder={form.chainKind === "bitcoin" ? "bc1…" : form.chainKind === "solana" ? "base58…" : "0x…"}
            className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 font-mono text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
          Label
          <input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Ledger (hold)"
            className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--foreground)]"
          />
        </label>
        <button
          type="button"
          onClick={addWallet}
          disabled={saving || !form.address.trim()}
          className="btn-secondary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {saving ? "Añadiendo…" : "Añadir"}
        </button>
      </div>
    </div>
  );
}

type EventToken = { symbol: string; amount: number; priceUsd: number | null; valueUsd: number | null };
type HarvestEvent = {
  id: string;
  kind?: string; // harvest | deposit | withdraw
  chain: string;
  protocol: string;
  label: string | null;
  tokens: EventToken[];
  value_usd: number | null;
  block_time: string | null;
  tx_hash: string | null;
  includes_principal: boolean;
  /** Enlace contable preexistente (position_links): viene preasignado. */
  link?: { protocol: string; position_id: string; position_type: string } | null;
};

const EVENT_KIND_LABEL: Record<string, string> = {
  harvest: "Harvest",
  deposit: "Depósito",
  withdraw: "Retirada",
  lending_supply: "+Colateral",
  lending_withdraw: "−Colateral",
  lending_borrow: "+Préstamo",
  lending_repay: "−Préstamo",
  transfer_in: "Entrada",
  transfer_out: "Salida",
};
const EVENT_ACTION_LABEL: Record<string, string> = {
  harvest: "Registrar harvest",
  deposit: "Registrar depósito",
  withdraw: "Registrar retirada",
  lending_supply: "Registrar colateral",
  lending_withdraw: "Registrar retirada",
  lending_borrow: "Registrar préstamo",
  lending_repay: "Registrar repago",
  transfer_in: "Registrar entrada",
  transfer_out: "Registrar salida",
};

export type ManualPositionRef = {
  protocol: string;
  positionId: string;
  positionType: string;
  label: string;
  /** Valor contable actual (para la conciliación on-chain ↔ contabilidad). */
  valueUsd?: number;
  /** Cost basis contable (columna DEPOSITADO de la vista on-chain). */
  depositedValue?: number;
  /** Yield cosechado acumulado (columna YIELD de la vista on-chain). */
  totalHarvested?: number;
  /** Par de tokens de la posición ("USDC/SOL") para el auto-enlace. */
  tokenSymbol?: string;
  /** Precio medio de entrada: para holds el depositado se prorratea por la
   *  cantidad real en la wallet (la contable puede tener más/menos saldo). */
  averageEntryPrice?: number;
};

/** Harvests detectados on-chain, pendientes de registrar en la contabilidad. */
function HarvestInbox({
  portfolioId,
  manualPositions,
}: {
  portfolioId: string;
  manualPositions: ManualPositionRef[];
}) {
  const [events, setEvents] = useState<HarvestEvent[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onchain/events?portfolioId=${encodeURIComponent(portfolioId)}`);
        const body = (await res.json()) as { events?: HarvestEvent[] };
        if (!cancelled && res.ok) setEvents(body.events ?? []);
      } catch { /* sin sección */ }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  if (!events.length) return null;

  async function act(ev: HarvestEvent, action: "ingest" | "dismiss") {
    setBusy(ev.id + action);
    setError("");
    try {
      const createNew = selection[ev.id] === "__new__";
      const sel = manualPositions.find((p) => `${p.protocol}::${p.positionId}` === selection[ev.id]);
      // Con enlace guardado (position_links) no hace falta elegir: va preasignado.
      if (action === "ingest" && !sel && !ev.link && !createNew) throw new Error("Elige la posición a la que pertenece la operación.");
      const res = await fetch("/api/onchain/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          eventId: ev.id,
          action,
          positionId: sel?.positionId,
          protocol: sel?.protocol,
          positionType: sel?.positionType,
          createNew,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo procesar.");
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error procesando el evento.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-[rgba(111,174,143,0.25)] bg-[rgba(111,174,143,0.04)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sprout className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          Operaciones detectadas on-chain ({events.length})
        </h3>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <p className="text-xs text-[var(--muted)] max-w-[70ch]">
          Operaciones que el sistema no pudo contabilizar solo (posición nueva sin enlace, o anteriores al enlace). Asigna la posición una vez — o elige &quot;Crear posición nueva&quot; — y a partir de ahí todo lo de esa posición se registra automáticamente.
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`¿Descartar los ${events.length} eventos pendientes? Úsalo solo si ya están contabilizados.`)) return;
            for (const ev of [...events]) await act(ev, "dismiss");
          }}
          disabled={busy !== ""}
          className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
        >
          Descartar todos
        </button>
      </div>
      {error ? <p className="text-xs text-rose-400 mb-2">{error}</p> : null}

      <div className="space-y-3">
        {events.map((ev) => (
          <div key={ev.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-sm">
            <div className="min-w-[180px]">
              <div className="font-medium text-[var(--foreground)]">
                <span className="mr-1.5 inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] uppercase tracking-wider text-emerald-300/90">
                  <span className="h-1 w-1 rounded-full bg-emerald-400/70" aria-hidden="true" />
                  {EVENT_KIND_LABEL[ev.kind ?? "harvest"] ?? ev.kind}
                </span>
                {ev.label ?? "?"} <span className="text-xs text-[var(--muted)]">· {ev.protocol} · {ev.chain}</span>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {ev.block_time ? new Date(ev.block_time).toLocaleString("es-ES") : "—"}
                {ev.includes_principal ? (
                  <span className="ml-2 text-amber-300">⚠️ incluye retirada de principal — revisar</span>
                ) : null}
                {ev.link ? (
                  <span className="ml-2 text-emerald-300">→ {ev.link.protocol} (enlazada)</span>
                ) : null}
              </div>
            </div>
            <div className="font-mono text-xs text-[var(--muted)]">
              {ev.tokens.map((t) => `${t.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${t.symbol}`).join(" + ")}
            </div>
            <div className="font-mono text-[var(--foreground)]">{usd(ev.value_usd)}</div>
            <div className="ml-auto flex items-center gap-2">
              {ev.link ? null : (
                <select
                  value={selection[ev.id] ?? ""}
                  onChange={(e) => setSelection((s) => ({ ...s, [ev.id]: e.target.value }))}
                  className="rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-xs text-[var(--foreground)] max-w-[220px]"
                >
                  <option value="">Posición destino…</option>
                  <option value="__new__">➕ Crear posición nueva (automática)</option>
                  {manualPositions.map((p) => (
                    <option key={`${p.protocol}::${p.positionId}`} value={`${p.protocol}::${p.positionId}`}>
                      {p.label}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => act(ev, "ingest")}
                disabled={busy !== "" || (!selection[ev.id] && !ev.link)}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                {busy === ev.id + "ingest" ? "Registrando…" : EVENT_ACTION_LABEL[ev.kind ?? "harvest"] ?? "Registrar"}
              </button>
              <button
                type="button"
                onClick={() => act(ev, "dismiss")}
                disabled={busy !== ""}
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type LinkRow = OnchainLinkRow;

export function OnchainLivePanel({
  portfolioId,
  canManage = false,
  manualPositions = [],
}: {
  portfolioId: string;
  canManage?: boolean;
  manualPositions?: ManualPositionRef[];
}) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LiveResult | null>(null);
  const [error, setError] = useState("");
  const [showWallets, setShowWallets] = useState(false);
  const [links, setLinks] = useState<LinkRow[] | null>(null);
  const [autoLinked, setAutoLinked] = useState<Set<string>>(new Set());

  // Enlaces on-chain ↔ contable (compartidos por secciones y conciliación).
  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onchain/links?portfolioId=${encodeURIComponent(portfolioId)}`);
        const body = (await res.json()) as { links?: LinkRow[] };
        if (!cancelled && res.ok) setLinks(body.links ?? []);
      } catch {
        if (!cancelled) setLinks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  // AUTO-ENLACE silencioso: casa cada posición on-chain con su contable por
  // protocolo + tipo + tokens (WETH≈ETH…). Sin intervención del usuario: el
  // enlace se guarda con auto_ingest y a partir de ahí todo fluye solo.
  useEffect(() => {
    if (!canManage || !data || links == null || !manualPositions.length) return;
    const linked = new Set(links.map((l) => l.onchain_id));
    const targets = data.positions.filter(
      (p) => (p.valueUsd ?? 0) >= 1 && !linked.has(p.id) && !autoLinked.has(p.id),
    );
    if (!targets.length) return;

    (async () => {
      const attempted = new Set(autoLinked);
      for (const p of targets) {
        attempted.add(p.id);
        const candidates = manualPositions.filter(
          (m) => kindMatchesType(p.kind, m.positionType) && (p.kind === "wallet" || protocolsMatch(p.protocol, m.protocol)),
        );
        const pKey = tokenSetKey(p.label);
        const byTokens = candidates.filter((m) => tokenSetKey(m.tokenSymbol ?? m.label) === pKey);
        // Único match por tokens → enlace directo; si no, único candidato del
        // mismo protocolo+tipo (holds requieren siempre el match por símbolo).
        const match = byTokens.length === 1 ? byTokens[0] : p.kind !== "wallet" && candidates.length === 1 ? candidates[0] : null;
        if (!match) continue;
        try {
          const res = await fetch("/api/onchain/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              portfolioId,
              onchainId: p.id,
              protocol: match.protocol,
              positionId: match.positionId,
              positionType: match.positionType,
              autoIngest: true,
            }),
          });
          const body = (await res.json()) as { link?: LinkRow };
          if (res.ok && body.link) {
            setLinks((prev) => [...(prev ?? []).filter((l) => l.onchain_id !== p.id), body.link!]);
          }
        } catch { /* mejor esfuerzo */ }
      }
      setAutoLinked(attempted);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, data, links, manualPositions, portfolioId]);

  async function load(refresh = true) {
    if (!portfolioId) return;
    setLoading(true);
    setError("");
    try {
      const url = `/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}${refresh ? "&refresh=1" : ""}`;
      const res = await fetch(url);
      const body = (await res.json()) as LiveResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo leer on-chain.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error leyendo on-chain.");
    } finally {
      setLoading(false);
    }
  }

  // Al montar: snapshot cacheado (instantáneo). Si está viejo (>15 min), se
  // lanza detrás una lectura en vivo que lo sustituye. "Actualizar" fuerza.
  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}`);
        const body = (await res.json()) as LiveResult & { error?: string };
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? "No se pudo leer on-chain.");
        setData(body);
        const ageMs = Date.now() - new Date(body.syncedAt).getTime();
        if (body.cached && ageMs > 15 * 60_000) {
          const fresh = await fetch(`/api/wallet/live?portfolioId=${encodeURIComponent(portfolioId)}&refresh=1`);
          const freshBody = (await fresh.json()) as LiveResult & { error?: string };
          if (!cancelled && fresh.ok) setData(freshBody);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error leyendo on-chain.");
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  const total = data?.positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0) ?? 0;

  return (
    <section className="glass-panel page-section-card p-5 md:p-6 mb-6" aria-label="Posiciones on-chain en vivo">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          <h2 className="font-designer text-2xl font-semibold tracking-tight text-[var(--foreground)]">En vivo (on-chain)</h2>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] uppercase font-mono tracking-wider text-[var(--muted)]">
            <span className="h-1 w-1 rounded-full bg-emerald-400/70" aria-hidden="true" />
            automático
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={() => setShowWallets((v) => !v)}
              className="btn-secondary px-3 py-2 text-sm"
              aria-expanded={showWallets}
            >
              <Wallet2 className="h-4 w-4" aria-hidden="true" />
              Wallets
            </button>
          ) : null}
          <button type="button" onClick={() => load(true)} disabled={loading || !portfolioId} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            {loading ? "Leyendo blockchain…" : data ? "Actualizar" : "Leer desde blockchain"}
          </button>
        </div>
      </div>

      {canManage && showWallets ? <WalletManager portfolioId={portfolioId} /> : null}

      {canManage && portfolioId ? (
        <HarvestInbox portfolioId={portfolioId} manualPositions={manualPositions} />
      ) : null}

      {error ? <p className="text-sm text-rose-400 mb-3">{error}</p> : null}

      {!data && !error ? (
        <p className="text-sm text-[var(--muted)]">
          Lee las posiciones reales de las wallets conectadas a este portfolio (balances, LP con rango, lending…). No modifica la contabilidad manual.
        </p>
      ) : null}

      {data ? (
        <>
          <div className="text-sm text-[var(--muted)] mb-3">
            Valor on-chain leído: <span className="text-[var(--foreground)] font-semibold">{usd(total)}</span>
            {" · "}{data.positions.length} posiciones{" · "}
            {new Date(data.syncedAt).toLocaleString("es-ES")}
            {data.cached ? (
              <span className="ml-2 inline-flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-[var(--muted)]">
                <span className="h-1 w-1 rounded-full bg-[var(--muted)]" aria-hidden="true" />
                snapshot — pulsa Actualizar para leer en vivo
              </span>
            ) : null}
          </div>

          <OnchainSections
            positions={data.positions}
            links={links ?? []}
            manualPositions={manualPositions}
            portfolioId={portfolioId}
            canManage={canManage}
          />

          {data.warnings.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-amber-300/80">
              {data.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
