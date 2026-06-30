-- Phase 23: Caché de posiciones on-chain que no se pueden leer en serverless.
--
-- Kamino (Liquidez) se lee con SDKs ESM+WASM que NO corren en las funciones
-- serverless de Vercel. Solución: un worker en Node normal (GitHub Action)
-- calcula esas posiciones y las cachea aquí; el panel "En vivo" lee de esta
-- tabla para esas fuentes (el resto —EVM, Orca— sigue en vivo on-demand).

CREATE TABLE IF NOT EXISTS onchain_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  source TEXT NOT NULL,                 -- 'kamino', …
  positions JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array de LivePosition
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, source)
);

CREATE INDEX IF NOT EXISTS onchain_cache_portfolio_idx ON onchain_cache(portfolio_id);

-- RLS: lectura para owner/manager del portfolio o admin (igual que position_tags).
-- La escritura la hace el worker con la service-role key (que salta RLS), así que
-- no hace falta política de escritura.
ALTER TABLE onchain_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onchain_cache_read ON onchain_cache;
CREATE POLICY onchain_cache_read ON onchain_cache
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = onchain_cache.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid() AND admin.role = 'admin'
    )
  );

COMMENT ON TABLE onchain_cache IS 'Caché de posiciones on-chain no leíbles en serverless (Kamino). Lo rellena un worker en Node (GitHub Action) y lo lee el panel En vivo.';
