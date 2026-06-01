-- Phase 21: Módulo Fiscal España
--
-- Añade infraestructura para tributación cripto según normativa española:
--   - Anotación fiscal por transacción (categoría, valor EUR, ganancia/pérdida)
--   - Tabla `tax_lots` para tracking FIFO de cost basis
--   - Tabla `tax_events` log de eventos tributables consolidados
--
-- Consulta el skill `spanish-crypto-tax-expert` para entender el modelo.
--
-- Esta migración es IDEMPOTENTE: puedes ejecutarla varias veces sin romper datos.

-- =============================================================================
-- 0. TABLA `wallet_protocols` — Clasificación fiscal de custodios
-- =============================================================================
--
-- Catálogo central que clasifica cada `protocol` que aparezca en transactions
-- por TIPO de wallet (cex_es, cex_foreign, dex, hot_wallet, cold_wallet, ...)
-- y país. Necesario para:
--   1. Determinar qué saldos cuentan para el Modelo 721 (umbral 50.000€ extranjero)
--   2. Permitir filtros y reportes por tipo de custodio
--   3. Aplicar reglas fiscales específicas por tipo (CEX vs DEX vs self-custody)
--
-- Se rellena con un catálogo inicial de protocolos comunes + el gestor puede
-- añadir nuevos desde la UI. Si una transacción usa un protocolo no clasificado,
-- se trata como `other` con país desconocido (UI avisa al gestor).

CREATE TABLE IF NOT EXISTS wallet_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
    -- Nombre exacto que aparece en transactions.protocol (case-insensitive match en código)

  wallet_kind TEXT NOT NULL,
    -- cex_es | cex_foreign | dex | hot_wallet | cold_wallet | paper_wallet |
    -- smart_contract_wallet | broker_es | broker_foreign | payment_app | other

  country_code TEXT NULL,
    -- ISO 3166-1 alpha-2 (ES, US, MT, KY, NL, CY, DE...). NULL para self-custody/DEX.

  is_foreign BOOLEAN NOT NULL DEFAULT FALSE,
    -- Si cuenta para Modelo 721 (TRUE cuando wallet_kind in (cex_foreign, broker_foreign)
    -- y la entidad está fuera de España)

  custodial BOOLEAN NOT NULL DEFAULT FALSE,
    -- Si el custodio guarda las claves privadas por ti. CEX y brokers = TRUE.
    -- Self-custody (hot/cold/paper/smart_contract) y DEX = FALSE.

  display_name TEXT NULL,
    -- Nombre amigable para UI. Si NULL, se usa `name`.

  icon_url TEXT NULL,
  notes TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wallet_protocols IS
  'Catálogo de custodios (exchanges, wallets, brokers) clasificados por tipo y país. Base para fiscalidad y Modelo 721.';

COMMENT ON COLUMN wallet_protocols.wallet_kind IS
  'cex_es | cex_foreign | dex | hot_wallet | cold_wallet | paper_wallet | smart_contract_wallet | broker_es | broker_foreign | payment_app | other';

CREATE INDEX IF NOT EXISTS wallet_protocols_kind_idx ON wallet_protocols(wallet_kind);
CREATE INDEX IF NOT EXISTS wallet_protocols_foreign_idx ON wallet_protocols(is_foreign) WHERE is_foreign = TRUE;
CREATE INDEX IF NOT EXISTS wallet_protocols_name_lower_idx ON wallet_protocols(LOWER(name));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_wallet_protocols_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_protocols_updated_at ON wallet_protocols;
CREATE TRIGGER trg_wallet_protocols_updated_at
  BEFORE UPDATE ON wallet_protocols
  FOR EACH ROW
  EXECUTE FUNCTION update_wallet_protocols_updated_at();

-- Catálogo inicial — los protocolos más comunes precategorizados.
-- ON CONFLICT DO NOTHING para que la migración sea idempotente.
INSERT INTO wallet_protocols (name, wallet_kind, country_code, is_foreign, custodial, display_name) VALUES
  -- CEX España (NO declarables en 721)
  ('Bit2Me',        'cex_es',       'ES', FALSE, TRUE,  'Bit2Me'),
  ('Onyze',         'cex_es',       'ES', FALSE, TRUE,  'Onyze'),
  ('2gether',       'cex_es',       'ES', FALSE, TRUE,  '2gether'),
  -- CEX extranjeras (declarables si saldo > 50k€)
  ('Binance',       'cex_foreign',  'MT', TRUE,  TRUE,  'Binance'),
  ('Coinbase',      'cex_foreign',  'US', TRUE,  TRUE,  'Coinbase'),
  ('Kraken',        'cex_foreign',  'US', TRUE,  TRUE,  'Kraken'),
  ('OKX',           'cex_foreign',  'SC', TRUE,  TRUE,  'OKX'),
  ('Bybit',         'cex_foreign',  'AE', TRUE,  TRUE,  'Bybit'),
  ('KuCoin',        'cex_foreign',  'SC', TRUE,  TRUE,  'KuCoin'),
  ('Bitget',        'cex_foreign',  'SC', TRUE,  TRUE,  'Bitget'),
  ('MEXC',          'cex_foreign',  'SC', TRUE,  TRUE,  'MEXC'),
  ('Gate.io',       'cex_foreign',  'KY', TRUE,  TRUE,  'Gate.io'),
  ('HTX',           'cex_foreign',  'SC', TRUE,  TRUE,  'HTX'),
  ('Crypto.com',    'cex_foreign',  'SG', TRUE,  TRUE,  'Crypto.com'),
  ('Bitstamp',      'cex_foreign',  'LU', TRUE,  TRUE,  'Bitstamp'),
  ('Bitfinex',      'cex_foreign',  'VG', TRUE,  TRUE,  'Bitfinex'),
  -- Brokers
  ('eToro',         'broker_foreign','CY', TRUE,  TRUE,  'eToro'),
  ('Trade Republic','broker_foreign','DE', TRUE,  TRUE,  'Trade Republic'),
  ('Revolut',       'payment_app',  'LT', TRUE,  TRUE,  'Revolut'),
  -- DEX (NO custodial, NO declarables)
  ('Uniswap',       'dex',          NULL, FALSE, FALSE, 'Uniswap'),
  ('Sushiswap',     'dex',          NULL, FALSE, FALSE, 'SushiSwap'),
  ('PancakeSwap',   'dex',          NULL, FALSE, FALSE, 'PancakeSwap'),
  ('Curve',         'dex',          NULL, FALSE, FALSE, 'Curve Finance'),
  ('Balancer',      'dex',          NULL, FALSE, FALSE, 'Balancer'),
  ('1inch',         'dex',          NULL, FALSE, FALSE, '1inch'),
  ('Jupiter',       'dex',          NULL, FALSE, FALSE, 'Jupiter'),
  ('Raydium',       'dex',          NULL, FALSE, FALSE, 'Raydium'),
  ('Orca',          'dex',          NULL, FALSE, FALSE, 'Orca'),
  ('Aave',          'dex',          NULL, FALSE, FALSE, 'Aave'),
  ('Compound',      'dex',          NULL, FALSE, FALSE, 'Compound'),
  ('Morpho',        'dex',          NULL, FALSE, FALSE, 'Morpho'),
  ('Yearn',         'dex',          NULL, FALSE, FALSE, 'Yearn Finance'),
  ('Beefy',         'dex',          NULL, FALSE, FALSE, 'Beefy Finance'),
  ('EigenLayer',    'dex',          NULL, FALSE, FALSE, 'EigenLayer'),
  ('Lido',          'dex',          NULL, FALSE, FALSE, 'Lido'),
  ('Marinade',      'dex',          NULL, FALSE, FALSE, 'Marinade'),
  ('Hyperliquid',   'dex',          NULL, FALSE, FALSE, 'Hyperliquid'),
  ('dYdX',          'dex',          NULL, FALSE, FALSE, 'dYdX'),
  ('GMX',           'dex',          NULL, FALSE, FALSE, 'GMX'),
  -- Hot wallets self-custody
  ('MetaMask',      'hot_wallet',   NULL, FALSE, FALSE, 'MetaMask'),
  ('Phantom',       'hot_wallet',   NULL, FALSE, FALSE, 'Phantom'),
  ('Trust Wallet',  'hot_wallet',   NULL, FALSE, FALSE, 'Trust Wallet'),
  ('Rabby',         'hot_wallet',   NULL, FALSE, FALSE, 'Rabby'),
  ('Rainbow',       'hot_wallet',   NULL, FALSE, FALSE, 'Rainbow'),
  ('Coinbase Wallet','hot_wallet',  NULL, FALSE, FALSE, 'Coinbase Wallet (self-custody)'),
  -- Cold wallets self-custody
  ('Ledger',        'cold_wallet',  NULL, FALSE, FALSE, 'Ledger'),
  ('Trezor',        'cold_wallet',  NULL, FALSE, FALSE, 'Trezor'),
  ('Coldcard',      'cold_wallet',  NULL, FALSE, FALSE, 'Coldcard'),
  ('Keystone',      'cold_wallet',  NULL, FALSE, FALSE, 'Keystone'),
  -- Smart contract wallets
  ('Safe',          'smart_contract_wallet', NULL, FALSE, FALSE, 'Safe (Gnosis)'),
  ('Argent',        'smart_contract_wallet', NULL, FALSE, FALSE, 'Argent'),
  -- Genéricos
  ('Wallet',        'hot_wallet',   NULL, FALSE, FALSE, 'Wallet personal'),
  ('Hardware Wallet','cold_wallet', NULL, FALSE, FALSE, 'Hardware Wallet')
ON CONFLICT (name) DO NOTHING;

-- RLS: catálogo es de lectura pública (todos los usuarios autenticados pueden leer);
-- escritura solo admin.
ALTER TABLE wallet_protocols ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_protocols_read ON wallet_protocols;
CREATE POLICY wallet_protocols_read ON wallet_protocols
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS wallet_protocols_write_admin ON wallet_protocols;
CREATE POLICY wallet_protocols_write_admin ON wallet_protocols
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

-- =============================================================================
-- 1. COLUMNAS FISCALES EN `transactions`
-- =============================================================================
--
-- Anotación fiscal sobre cada movimiento. Lo rellena el motor de categorización
-- en `lib/tax/categorize.ts`. Se puede recalcular completamente con un backfill.
-- Por eso son columnas nullables: las transacciones existentes empezarán con
-- NULL hasta que pase el backfill.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS fiscal_category TEXT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_income_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_value_eur NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS fiscal_cost_basis_eur NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS fiscal_realized_gain_eur NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS fiscal_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS fiscal_processed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fiscal_inferred BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS fiscal_wallet_kind TEXT NULL;

COMMENT ON COLUMN transactions.fiscal_category IS
  'Categoría fiscal según skill spanish-crypto-tax-expert: buy, sell, swap_out, swap_in, staking_reward, lp_provide, lp_remove, lending_supply, lending_withdraw, lending_interest, liquidation, airdrop, fork, non_taxable_transfer';

COMMENT ON COLUMN transactions.fiscal_income_type IS
  'Tipo de renta fiscal: ganancia_patrimonial | rendimiento_capital_mobiliario | none';

COMMENT ON COLUMN transactions.fiscal_value_eur IS
  'Valor de la operación en EUR al spot del momento (proceeds o aportación).';

COMMENT ON COLUMN transactions.fiscal_cost_basis_eur IS
  'Cost basis FIFO consumido en EUR (solo en ventas/permutas).';

COMMENT ON COLUMN transactions.fiscal_realized_gain_eur IS
  'Ganancia (+) o pérdida (−) patrimonial realizada en EUR. Positiva = ganancia.';

COMMENT ON COLUMN transactions.fiscal_processed_at IS
  'Cuándo el motor de categorización procesó esta fila por última vez. NULL = pendiente de procesar.';

COMMENT ON COLUMN transactions.fiscal_inferred IS
  'TRUE = categorización automática inferida por el motor (puede requerir revisión del gestor). FALSE = confirmada manualmente por el gestor.';

COMMENT ON COLUMN transactions.fiscal_wallet_kind IS
  'Tipo de wallet (cex_es, cex_foreign, dex, hot_wallet, cold_wallet, ...) en el momento de la operación. Cacheado en la transacción para queries rápidas en la pestaña de trazabilidad.';

-- Índice para filtrar transacciones por categoría fiscal en la UI
CREATE INDEX IF NOT EXISTS transactions_fiscal_category_idx
  ON transactions(fiscal_category)
  WHERE fiscal_category IS NOT NULL;

-- Índice para filtrar por año fiscal en reportes anuales
CREATE INDEX IF NOT EXISTS transactions_fiscal_year_idx
  ON transactions(portfolio_id, (date_part('year', transaction_date)))
  WHERE fiscal_realized_gain_eur IS NOT NULL;

-- =============================================================================
-- 2. TABLA `tax_lots` — Lotes FIFO de cost basis
-- =============================================================================
--
-- Cada lote representa una "compra" o "recepción" de un token concreto con su
-- cost basis en EUR. Cuando se vende o permuta, se consumen lotes FIFO empezando
-- por el más antiguo. Los lotes consumidos parcialmente quedan con `amount` y
-- `cost_basis_eur` reducidos pro-rata. Los exhaurted_at se marcan cuando
-- amount llega a 0.

CREATE TABLE IF NOT EXISTS tax_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  token_symbol TEXT NOT NULL,

  -- Estado actual del lote (puede mutar tras consumos parciales)
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  cost_basis_eur NUMERIC NOT NULL CHECK (cost_basis_eur >= 0),

  -- Estado inicial al crear el lote (inmutable, para trazabilidad)
  original_amount NUMERIC NOT NULL,
  original_cost_basis_eur NUMERIC NOT NULL,

  -- Origen del lote
  acquired_at TIMESTAMPTZ NOT NULL,
  acquired_via_transaction_id UUID NULL REFERENCES transactions(id) ON DELETE SET NULL,
  acquired_via_event TEXT NOT NULL DEFAULT 'buy',
    -- buy | swap_in | staking_reward | lending_interest | airdrop | fork | lp_remove

  -- Estado de consumo
  exhausted_at TIMESTAMPTZ NULL,
    -- NULL = aún tiene saldo; timestamp = ya consumido al 100%

  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tax_lots IS
  'Lotes FIFO de cost basis por token y portfolio. Se consumen al vender/permutar siguiendo FIFO obligatorio del Art. 37.2 LIRPF.';

COMMENT ON COLUMN tax_lots.acquired_via_event IS
  'Tipo de evento que creó este lote: buy | swap_in | staking_reward | lending_interest | airdrop | fork | lp_remove';

-- Índices para queries FIFO eficientes
CREATE INDEX IF NOT EXISTS tax_lots_portfolio_token_active_idx
  ON tax_lots(portfolio_id, token_symbol, acquired_at)
  WHERE exhausted_at IS NULL;

CREATE INDEX IF NOT EXISTS tax_lots_portfolio_idx ON tax_lots(portfolio_id);

CREATE INDEX IF NOT EXISTS tax_lots_acquired_tx_idx
  ON tax_lots(acquired_via_transaction_id)
  WHERE acquired_via_transaction_id IS NOT NULL;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_tax_lots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tax_lots_updated_at ON tax_lots;
CREATE TRIGGER trg_tax_lots_updated_at
  BEFORE UPDATE ON tax_lots
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_lots_updated_at();

-- =============================================================================
-- 3. TABLA `tax_events` — Log de eventos tributables
-- =============================================================================
--
-- Cada fila representa un evento que GENERÓ ganancia/pérdida o rendimiento
-- en algún momento. Es el log consolidado para generar el resumen fiscal anual
-- y los reportes para asesores.
--
-- Un evento puede consumir varios lotes (matched via JSONB lots_consumed).

CREATE TABLE IF NOT EXISTS tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  transaction_id UUID NULL REFERENCES transactions(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL,
    -- sell | swap | lp_provide | lp_remove | staking_reward | lending_interest |
    -- liquidation | airdrop | fork

  event_date TIMESTAMPTZ NOT NULL,
  tax_year INT NOT NULL,  -- año fiscal (extract año de event_date)

  -- Montos en EUR
  proceeds_eur NUMERIC NOT NULL DEFAULT 0,        -- valor recibido / FMV reward
  cost_basis_eur NUMERIC NOT NULL DEFAULT 0,      -- cost basis consumido (FIFO)
  realized_gain_eur NUMERIC NOT NULL DEFAULT 0,   -- proceeds - cost_basis

  -- Clasificación fiscal española
  income_type TEXT NOT NULL,
    -- ganancia_patrimonial | rendimiento_capital_mobiliario | none

  -- Token(s) involucrado(s)
  token_symbol TEXT NULL,
  token_amount NUMERIC NULL,

  -- Detalle de lotes consumidos (FIFO trace)
  lots_consumed JSONB NULL,
    -- [{ lot_id, amount_consumed, cost_basis_consumed_eur, acquired_at }]

  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tax_events IS
  'Log consolidado de eventos tributables. Una transacción puede generar 0 o más eventos (LP provide genera 2: uno por token).';

-- Índices para consultas comunes
CREATE INDEX IF NOT EXISTS tax_events_portfolio_year_idx
  ON tax_events(portfolio_id, tax_year);

CREATE INDEX IF NOT EXISTS tax_events_portfolio_date_idx
  ON tax_events(portfolio_id, event_date DESC);

CREATE INDEX IF NOT EXISTS tax_events_income_type_idx
  ON tax_events(portfolio_id, income_type, tax_year);

CREATE INDEX IF NOT EXISTS tax_events_transaction_idx
  ON tax_events(transaction_id)
  WHERE transaction_id IS NOT NULL;

-- =============================================================================
-- 4. RLS POLICIES — Mismo modelo que portfolio_snapshots / position_tags
-- =============================================================================
-- Acceso: owner del portfolio, manager del portfolio, o admin global.

-- ─── tax_lots ───
ALTER TABLE tax_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_lots_read ON tax_lots;
CREATE POLICY tax_lots_read ON tax_lots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = tax_lots.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS tax_lots_write ON tax_lots;
CREATE POLICY tax_lots_write ON tax_lots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = tax_lots.portfolio_id
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
      WHERE p.id = tax_lots.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

-- ─── tax_events ───
ALTER TABLE tax_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tax_events_read ON tax_events;
CREATE POLICY tax_events_read ON tax_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = tax_events.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

DROP POLICY IF EXISTS tax_events_write ON tax_events;
CREATE POLICY tax_events_write ON tax_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM portfolios p
      JOIN profiles pr ON pr.id IN (p.owner_id, p.manager_id)
      WHERE p.id = tax_events.portfolio_id
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
      WHERE p.id = tax_events.portfolio_id
        AND pr.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles admin
      WHERE admin.auth_user_id = auth.uid()
        AND admin.role = 'admin'
    )
  );

-- =============================================================================
-- 5. VISTA RESUMEN ANUAL (opcional, optimización para reportes)
-- =============================================================================
--
-- Agregación rápida por (portfolio, año, tipo de renta) para el panel fiscal.

CREATE OR REPLACE VIEW v_tax_summary_yearly AS
SELECT
  portfolio_id,
  tax_year,
  income_type,
  COUNT(*) AS event_count,
  SUM(proceeds_eur) AS total_proceeds_eur,
  SUM(cost_basis_eur) AS total_cost_basis_eur,
  SUM(realized_gain_eur) AS total_realized_gain_eur,
  SUM(CASE WHEN realized_gain_eur > 0 THEN realized_gain_eur ELSE 0 END) AS total_gains_eur,
  SUM(CASE WHEN realized_gain_eur < 0 THEN realized_gain_eur ELSE 0 END) AS total_losses_eur
FROM tax_events
GROUP BY portfolio_id, tax_year, income_type;

COMMENT ON VIEW v_tax_summary_yearly IS
  'Resumen agregado por (portfolio, año fiscal, tipo de renta). Base para el panel "Resumen Fiscal" anual.';

-- =============================================================================
-- FIN
-- =============================================================================
