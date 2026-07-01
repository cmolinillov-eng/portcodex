-- Phase 24: Bitcoin en portfolio_wallets (hold en cold wallet / Ledger).
--
-- Amplía el CHECK de chain_kind para admitir 'bitcoin'. El balance se lee vía
-- mempool.space (API pública) y el precio vía CoinGecko; solo direcciones
-- públicas, como siempre.

ALTER TABLE portfolio_wallets DROP CONSTRAINT IF EXISTS portfolio_wallets_chain_kind_check;
ALTER TABLE portfolio_wallets ADD CONSTRAINT portfolio_wallets_chain_kind_check
  CHECK (chain_kind IN ('evm', 'solana', 'bitcoin'));

COMMENT ON COLUMN portfolio_wallets.chain_kind IS
  'evm (una address vale para todas las cadenas EVM), solana (base58) o bitcoin (address BTC; si el Ledger usa varias, añadir una fila por address).';
