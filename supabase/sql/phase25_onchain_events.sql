-- Phase 25: Ingesta automática de harvests desde blockchain.
--
-- Un worker (GitHub Action, scripts/onchain-harvests.mjs) escanea los eventos
-- Collect de los position managers V3 (PancakeSwap/Uniswap/ProjectX) de las
-- wallets del portfolio y los guarda aquí como eventos PENDIENTES. En el panel
-- "En vivo" el manager los ve con cantidad/precio/fecha reales y los registra
-- con un clic como transacción `harvest` (o los descarta). Así el acumulado de
-- harvests se mantiene sin meter nada a mano.

CREATE TABLE IF NOT EXISTS onchain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,              -- `${chain}:${txHash}:${logIndex}` (idempotencia)
  kind TEXT NOT NULL DEFAULT 'harvest',
  chain TEXT NOT NULL,                  -- base, hyperevm…
  protocol TEXT NOT NULL,               -- "PancakeSwap V3", "ProjectX"…
  wallet_address TEXT NOT NULL,
  position_ref TEXT NULL,               -- nft id de la posición V3
  label TEXT NULL,                      -- "WETH/cbBTC"
  tokens JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{symbol, amount, priceUsd, valueUsd}]
  value_usd NUMERIC NULL,
  block_time TIMESTAMPTZ NULL,
  tx_hash TEXT NULL,
  includes_principal BOOLEAN NOT NULL DEFAULT FALSE,
    -- true si en la misma tx hubo DecreaseLiquidity: el Collect incluye
    -- principal además de fees → revisar antes de registrarlo como harvest.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ingested', 'dismissed')),
  ingested_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, event_key)
);

CREATE INDEX IF NOT EXISTS onchain_events_pending_idx
  ON onchain_events(portfolio_id, status) WHERE status = 'pending';

-- Estado del escaneo incremental (último bloque visto por cadena/protocolo).
CREATE TABLE IF NOT EXISTS onchain_scan_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  protocol TEXT NOT NULL,
  last_block BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, chain, protocol)
);

-- RLS: lectura para owner/manager/admin; escritura del worker (service role).
ALTER TABLE onchain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_scan_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onchain_events_read ON onchain_events;
CREATE POLICY onchain_events_read ON onchain_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = onchain_events.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS onchain_scan_state_read ON onchain_scan_state;
CREATE POLICY onchain_scan_state_read ON onchain_scan_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = onchain_scan_state.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE onchain_events IS 'Harvests (eventos Collect) detectados on-chain, pendientes de registrar como transacción harvest. Los rellena el worker; el manager los confirma o descarta en el panel En vivo.';
COMMENT ON TABLE onchain_scan_state IS 'Último bloque escaneado por portfolio/cadena/protocolo para la ingesta incremental de eventos.';
