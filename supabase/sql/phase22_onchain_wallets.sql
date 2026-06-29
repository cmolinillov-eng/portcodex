-- Phase 22: Wallets on-chain por portfolio (integración de lectura automática)
--
-- Primer paso ("Fase 0" del diseño en docs/onchain-sync-design.md) de la
-- sincronización on-chain: guardar las direcciones PÚBLICAS de wallet asociadas
-- a cada portfolio, para luego leer su estado/actividad desde Zerion (EVM) y
-- Jupiter Portfolio (Solana).
--
-- SOLO LECTURA: aquí únicamente se guarda la dirección pública. Nunca claves
-- privadas ni seed phrases.
--
-- Modelo: N direcciones por portfolio. Una "wallet" del usuario suele ser una
-- address EVM (válida en las 5 cadenas EVM) + una address Solana → 2 filas.

CREATE TABLE IF NOT EXISTS portfolio_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  chain_kind TEXT NOT NULL CHECK (chain_kind IN ('evm', 'solana')),
    -- 'evm' cubre Ethereum/Arbitrum/Base/Polygon/BNB con la misma address.
    -- 'solana' es una address base58 independiente.
  address TEXT NOT NULL,
  label TEXT NULL,
    -- Nombre amigable opcional ("Wallet principal", "Ledger", etc.)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Permite desactivar el seguimiento sin borrar el histórico.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, chain_kind, address)
);

CREATE INDEX IF NOT EXISTS portfolio_wallets_portfolio_idx
  ON portfolio_wallets(portfolio_id);
CREATE INDEX IF NOT EXISTS portfolio_wallets_active_idx
  ON portfolio_wallets(portfolio_id, is_active) WHERE is_active = TRUE;

-- updated_at automático
CREATE OR REPLACE FUNCTION update_portfolio_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_portfolio_wallets_updated_at ON portfolio_wallets;
CREATE TRIGGER trg_portfolio_wallets_updated_at
  BEFORE UPDATE ON portfolio_wallets
  FOR EACH ROW EXECUTE FUNCTION update_portfolio_wallets_updated_at();

-- ── RLS: mismo patrón que position_tags (owner/manager del portfolio o admin) ──
ALTER TABLE portfolio_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_wallets_read ON portfolio_wallets;
CREATE POLICY portfolio_wallets_read ON portfolio_wallets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = portfolio_wallets.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS portfolio_wallets_write ON portfolio_wallets;
CREATE POLICY portfolio_wallets_write ON portfolio_wallets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = portfolio_wallets.portfolio_id
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
      WHERE p.id = portfolio_wallets.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE portfolio_wallets IS 'Direcciones públicas de wallet (EVM/Solana) por portfolio, para sincronización on-chain de solo lectura. Nunca claves privadas.';

-- ── Seed: wallet de mfita (Portfolio de M Fita) ───────────────────────────────
INSERT INTO portfolio_wallets (portfolio_id, chain_kind, address, label)
VALUES
  ('e6d39b43-89fa-446b-bda6-eabafb9424e3', 'evm',    '0xdfA97E25cE86308959E68F11E20200Ab5475A5D4', 'Wallet mfita (EVM)'),
  ('e6d39b43-89fa-446b-bda6-eabafb9424e3', 'solana', 'GWxeoXvuEZ2birWotW2xM9jeEazh4fCNJ8WmuZ3e4keP', 'Wallet mfita (Solana)')
ON CONFLICT (portfolio_id, chain_kind, address) DO NOTHING;
