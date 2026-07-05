-- Phase 27: Depositado manual (override) por posición on-chain.
--
-- Para posiciones abiertas ANTES de usar la app (o cuando el gestor quiere
-- corregir la base estimada), se guarda AQUÍ cuánto se depositó en USD. Este
-- valor manda en la COLUMNA DEPOSITADO / P&L de la vista on-chain, para poder
-- ver si la posición sube o baja según el precio de las monedas.
--
-- Invariante fiscal: este override NO toca el libro de transacciones (FIFO /
-- módulo de impuestos queda intacto). Es un dato de seguimiento de la vista
-- on-chain, editable en cualquier momento.
--
-- Para posiciones NUEVAS creadas a partir de ahora, el depositado se sella solo
-- con el valor USD del depósito on-chain detectado (auto-ingesta, Fase C/D), sin
-- necesidad de rellenar este campo.

ALTER TABLE position_links
  ADD COLUMN IF NOT EXISTS deposited_override_usd NUMERIC;

COMMENT ON COLUMN position_links.deposited_override_usd IS
  'Depositado en USD indicado a mano por el gestor. Manda en la columna DEPOSITADO/P&L de la vista on-chain. No afecta al libro fiscal (FIFO).';
