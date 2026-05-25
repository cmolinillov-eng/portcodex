-- Phase 19: Portfolio snapshots
--
-- Tabla para capturar el estado del portfolio en momentos concretos.
-- Habilita gráficas de evolución, Time-Weighted Return, Max Drawdown y
-- Sharpe Ratio sin tener que recalcular todo el histórico cada vez.
--
-- Captura recomendada:
--   - Diaria via cron (Vercel Cron o Supabase scheduled function).
--   - On-demand cuando el gestor pulsa "Tomar snapshot".
--   - Automática tras operaciones grandes (rebalances, depósitos, withdrawals).

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Métricas principales del momento
  total_value_usd NUMERIC NOT NULL DEFAULT 0,
  total_deposited_usd NUMERIC NOT NULL DEFAULT 0,
  pending_harvest_usd NUMERIC NOT NULL DEFAULT 0,
  realized_pnl_usd NUMERIC NOT NULL DEFAULT 0,

  -- Descomposición por sección (Hold / Staking / Lending / LP) para gráficas
  composition JSONB NULL,

  -- Trigger / motivo del snapshot
  trigger TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'daily_cron' | 'post_operation'
  notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS portfolio_snapshots_portfolio_id_captured_at_idx
  ON portfolio_snapshots(portfolio_id, captured_at DESC);

-- RLS: heredamos el patrón de transactions / portfolios.
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Lectura: el viewer del portfolio puede leer sus snapshots.
DROP POLICY IF EXISTS portfolio_snapshots_read ON portfolio_snapshots;
CREATE POLICY portfolio_snapshots_read ON portfolio_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = portfolio_snapshots.portfolio_id
        AND (
          p.owner_user_id = auth.uid()
          OR p.manager_user_id = auth.uid()
          OR p.client_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = auth.uid() AND pr.role = 'admin')
        )
    )
  );

-- Escritura: solo admin/gestor pueden crear snapshots (via service role en backend).
-- El cron y los endpoints usan service role así que esta política es defensiva.
DROP POLICY IF EXISTS portfolio_snapshots_write ON portfolio_snapshots;
CREATE POLICY portfolio_snapshots_write ON portfolio_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = portfolio_snapshots.portfolio_id
        AND (
          p.owner_user_id = auth.uid()
          OR p.manager_user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = auth.uid() AND pr.role = 'admin')
        )
    )
  );

COMMENT ON TABLE portfolio_snapshots IS 'Snapshots periódicos del portfolio para series temporales (TWR, drawdown, gráficas).';
