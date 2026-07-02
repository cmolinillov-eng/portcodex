-- Phase 26: Enlaces posición on-chain ↔ posición contable.
--
-- La pieza central del plan 100% automático (docs/onchain-full-auto-plan.md,
-- Fase B). Cada posición leída de blockchain (LivePosition.id, p.ej.
-- "base:pancakeswap-v3:1497859") se enlaza UNA VEZ con su posición contable
-- (protocol + position_id de transactions). A partir de ahí:
--   - las tarjetas on-chain pueden mostrar depositado/P&L/harvest acumulado,
--   - los eventos detectados (harvest, depósito…) saben a qué posición
--     contable apuntar sin preguntar,
--   - con auto_ingest=true se contabilizan solos (sin clic).

CREATE TABLE IF NOT EXISTS position_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  onchain_id TEXT NOT NULL,        -- LivePosition.id estable
  protocol TEXT NOT NULL,          -- protocolo contable ("PancakeSwap")
  position_id TEXT NOT NULL,       -- position_id contable
  position_type TEXT NOT NULL DEFAULT 'Liquidity Pool',
  auto_ingest BOOLEAN NOT NULL DEFAULT FALSE,
    -- true → los eventos de esta posición se registran sin confirmación.
    -- Empezar en OFF (rodaje, Fase D) y activar cuando la conciliación cuadre.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, onchain_id)
);

CREATE INDEX IF NOT EXISTS position_links_portfolio_idx ON position_links(portfolio_id);

CREATE OR REPLACE FUNCTION update_position_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_position_links_updated_at ON position_links;
CREATE TRIGGER trg_position_links_updated_at
  BEFORE UPDATE ON position_links
  FOR EACH ROW EXECUTE FUNCTION update_position_links_updated_at();

-- RLS: mismo patrón que portfolio_wallets (owner/manager del portfolio o admin).
ALTER TABLE position_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS position_links_read ON position_links;
CREATE POLICY position_links_read ON position_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_links.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS position_links_write ON position_links;
CREATE POLICY position_links_write ON position_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_links.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = position_links.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE position_links IS 'Enlace posición on-chain (LivePosition.id) ↔ posición contable (protocol+position_id). Pieza central de la automatización: harvests/eventos se asignan solos; con auto_ingest se contabilizan sin confirmación.';
