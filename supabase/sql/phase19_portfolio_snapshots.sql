-- Phase 19: Portfolio snapshots
--
-- Tabla para capturar el estado del portfolio en momentos concretos.
-- Habilita gráficas de evolución, Time-Weighted Return, Max Drawdown y
-- Sharpe Ratio sin tener que recalcular todo el histórico cada vez.
--
-- Captura recomendada:
--   - Diaria via cron (Vercel Cron apuntando a /api/snapshots/daily).
--   - On-demand cuando el gestor pulsa "Tomar snapshot".
--   - Automática tras operaciones grandes (rebalances, depósitos, withdrawals).
--
-- Modelo de auth/permisos (real, no Aave-style):
--   portfolios.owner_id  → profiles.id  (cliente o autónomo dueño del portfolio)
--   portfolios.manager_id → profiles.id  (gestor asignado, opcional)
--   profiles.auth_user_id → auth.users.id  (mapea sesión Supabase Auth)
--   profiles.role IN ('admin','cliente','autonomo')

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

-- RLS: solo viewers autorizados del portfolio pueden leer/escribir.
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

-- Lectura: el owner, el manager o un admin pueden leer.
DROP POLICY IF EXISTS portfolio_snapshots_read ON portfolio_snapshots;
CREATE POLICY portfolio_snapshots_read ON portfolio_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = portfolio_snapshots.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

-- Inserción: solo owner, manager o admin (los endpoints del backend usan
-- service role así que esta política es defensiva).
DROP POLICY IF EXISTS portfolio_snapshots_write ON portfolio_snapshots;
CREATE POLICY portfolio_snapshots_write ON portfolio_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = portfolio_snapshots.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE portfolio_snapshots IS 'Snapshots periódicos del portfolio para series temporales (TWR, drawdown, gráficas).';
