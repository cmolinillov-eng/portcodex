-- Phase 20: Position strategy tags
--
-- Permite al gestor (o cliente, si es autónomo) categorizar cada posición
-- bajo una etiqueta estratégica libre. La aplicación sugiere algunas por
-- defecto ("Stablecoin yield", "Blue-chip long", "Memecoin gamble"...) pero
-- el campo es free-text para máxima flexibilidad.
--
-- Habilita:
--   - Dona/gráfica de composición por ESTRATEGIA (no solo por categoría DeFi)
--   - Filtrado y comparativa de rendimiento por estrategia
--   - Inclusión en reporte PDF
--
-- Modelo: tabla separada en lugar de columna en transactions. Razón:
--   - transactions es histórico inmutable (regla 8 del proyecto)
--   - El tag puede cambiar sin generar movimientos
--   - Una sola fila por (portfolio_id, protocol, position_id) en lugar de
--     repetir el tag en cada transacción

CREATE TABLE IF NOT EXISTS position_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,
  position_id TEXT NOT NULL,
  strategy_tag TEXT NOT NULL,
  notes TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, protocol, position_id)
);

CREATE INDEX IF NOT EXISTS position_tags_portfolio_idx
  ON position_tags(portfolio_id);

CREATE INDEX IF NOT EXISTS position_tags_strategy_idx
  ON position_tags(strategy_tag);

-- RLS: mismo modelo de auth que portfolio_snapshots
ALTER TABLE position_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_tags_read ON position_tags;
CREATE POLICY position_tags_read ON position_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_tags.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS position_tags_write ON position_tags;
CREATE POLICY position_tags_write ON position_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_tags.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_tags.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE position_tags IS 'Etiquetas estratégicas por posición (Stablecoin yield, Blue-chip long, etc.). Free-text con sugerencias en la UI.';
