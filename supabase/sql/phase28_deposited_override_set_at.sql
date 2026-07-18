-- Phase 28: ancla temporal del override de depositado.
--
-- deposited_override_usd (phase27) sustituía la base derivada PARA SIEMPRE:
-- un aporte o retirada posterior movía la base real pero la vista seguía
-- mostrando la cifra congelada. Con set_at, el dashboard interpreta el
-- override como "la base A FECHA de fijarlo" y le suma los flujos de capital
-- posteriores (override + Σ flujos después de set_at).
--
-- Overrides antiguos (set_at NULL) conservan el comportamiento anterior
-- (valor fijo) hasta que el gestor los re-selle.

ALTER TABLE position_links
  ADD COLUMN IF NOT EXISTS deposited_override_set_at TIMESTAMPTZ;

COMMENT ON COLUMN position_links.deposited_override_set_at IS
  'Cuándo se fijó deposited_override_usd. El dashboard suma al override los flujos de capital posteriores a esta fecha; NULL = override congelado (comportamiento phase27).';
