# Audit Report — Crypto Portfolio Tracker

> **Última actualización:** 2026-05-27 (pausamos fiscal, investigando bug LP 3 tokens).

## 📌 Punto de retomada — Módulo fiscal/trazabilidad

**Estado al pausar (commit `5ef1a54`):**

✅ Completado:
- Fase 0 — Skill `spanish-crypto-tax-expert`
- Fase 1 — Schema BD (`phase21_tax_module.sql` aplicado en Supabase)
- Fase 2 — Motor categorización + walletProtocol + humanLabel + inferred
- Fase 4 — UI tabla compacta colapsable al pie del dashboard
- A — Exportar CSV con 18 columnas para asesor fiscal
- E — Backfill persistente con botón Recalcular
- Skill `defi-protocol-expert` con 60+ protocolos
- LP deposit ya NO calcula ganancia ficticia
- Harvest sobre LP → `lp_reward` (no staking_reward)
- Filtros agrupados por tipo: Cold / Hot / CEX / DEX
- Catálogo ampliado: ProjectX, Variational, Kamino, Drift, Jito, Marinade, Pendle, Ethena, Spark, etc.

⏳ Pendiente cuando retomemos:
- **B — Override manual del gestor**: click en fila → modal para reclasificar categoría, marca `fiscal_inferred=false`
- **Separación real wallet/protocolo en BD**: añadir campo `wallet` independiente de `protocol` para casos como "BTC en Ledger pero opero desde Rabby"
- Click en badge "?" para clasificar manualmente protocolo desconocido
- Resumen anual por tipo de renta para Modelo 100
- Tests adicionales por edge cases (datos null, precisión, mismo token harvested 2 veces el mismo día)



---

## Estado general

| Área | Estado |
|---|---|
| Contabilidad núcleo | ✅ Sólida (100% bugs críticos corregidos) |
| Lending / Health Factor | ✅ Implementado con thresholds reales |
| Multi-currency USD/EUR | ✅ Toggle en toolbar del header |
| Position tags / estrategia | ✅ SQL aplicado en Supabase |
| PDF reports | ✅ A4 print-ready |
| Snapshots diarios | ✅ Cron activo (CRON_SECRET configurado) |
| Gráficas de evolución / TWR / Drawdown | ✅ Desplegado |
| Tests suite | ✅ 69/69 pasando (41 financial + 28 fiscal) |
| Header UI | ✅ Slim icon toolbar simétrico |
| Rebalance LP→LP | ✅ Fix metadata.lp |
| **Motor de categorización fiscal** | ✅ **DESPLEGADO** (computación on-the-fly) |
| **Pestaña Trazabilidad por Wallet** | ✅ **DESPLEGADO** (editorial timeline) |

---

## Bugs — todos corregidos ✅

| Bug | Estado |
|---|---|
| C1 avgPrice withdrawal parcial | ✅ |
| C2 HF sin liquidation thresholds | ✅ |
| C3 Edit-position destructivo | ✅ |
| C4 IL en LP fuera de rango | ✅ |
| I2 realizedPnl en cierres manuales | ✅ |
| LP ROI=0 | ✅ |
| Rebalance LP→LP metadata.lp | ✅ |

---

## Módulo de Trazabilidad (anteriormente "Fiscal")

**Reframe de scope (2026-05-27):** la app NO es una herramienta fiscal. Es una herramienta de **trazabilidad** que da al cliente visibilidad clara de TODOS sus movimientos por wallet con clasificación entendible. El "borrador fiscal" es un EXTRA opcional para que el asesor fiscal trabaje más rápido.

### Fases del módulo

| Fase | Descripción | Estado |
|---|---|---|
| **0** | Skill `spanish-crypto-tax-expert/SKILL.md` (fuente de verdad fiscal) | ✅ |
| **1** | Schema BD `phase21_tax_module.sql` | ✅ Preparado, **no aplicado aún** (no necesario para UI on-the-fly) |
| **2** | Motor categorización `web/src/lib/tax/` | ✅ |
| **2.5** | Fix walletProtocol + humanLabel + inferred flag | ✅ |
| **3** | Backfill persistente | ⏳ Pendiente |
| **4** | UI "Trazabilidad por Wallet" (editorial timeline) | ✅ |
| **5** | Export PDF/CSV anual + override manual del gestor | ⏳ Pendiente |

### Capacidades del motor

El motor `categorizeTransaction(tx, options)` toma una transacción y:
- Decide su categoría fiscal según el tipo de transacción + tipo de wallet
- Calcula valor EUR, cost basis FIFO, ganancia/pérdida realizada
- Devuelve etiqueta humana en español plano
- Marca `inferred: true` (el gestor puede confirmar/cambiar más tarde)
- Genera tax_events trazables con detalle de lotes consumidos

**Cobertura por (txType, walletKind):**

| Tx \\ Wallet | CEX (Binance, Coinbase) | Self-custody (MetaMask, Ledger) | DEX (Uniswap, Aave) |
|---|---|---|---|
| deposit | `buy` (compra fiat) | `non_taxable_transfer` | `non_taxable_transfer` |
| withdrawal | `sell` (venta fiat) | `non_taxable_transfer` | `non_taxable_transfer` |
| lp_deposit | — | — | `lp_provide` (permuta DGT) |
| lp_withdraw | — | — | `lp_remove` |
| staking_* | `non_taxable_transfer` | `non_taxable_transfer` | `non_taxable_transfer` |
| lending_supply/withdraw | — | — | `non_taxable_transfer` |
| lending_borrow | — | — | `non_taxable_transfer` (deuda) |
| harvest (Staking) | `staking_reward` | `staking_reward` | `staking_reward` |
| harvest (Lending) | — | — | `lending_interest` |

### Pestaña UI — "Trazabilidad por Wallet"

Identidad editorial dark (NO look "AI genérico"):
- **Header**: eyebrow small-caps + título serif italic 200wt + standfirst con barra accent
- **Filtros**: pills con underline accent (sin background) + contador
- **Timeline**: spine vertical con dots semánticos
- **Datelines**: día grande en serif (2.5rem) + mes/año en small-caps
- **Entradas**: headline serif italic + categoría con tinte de color por tono + descripción humana + stats inline en monospace
- **Empty states**: serif headlines, no "No data yet"
- **Disclaimer**: como standfirst editorial al inicio + footer sutil

### Catálogo embebido de wallets (45 protocolos)

CEX España: Bit2Me, Onyze, 2gether
CEX extranjeros: Binance, Coinbase, Kraken, OKX, Bybit, KuCoin, Crypto.com, Bitstamp, Bitfinex
DEX: Uniswap, Sushiswap, PancakeSwap, Curve, Balancer, 1inch, Jupiter, Raydium, Orca, Aave, Compound, Morpho, Yearn, Beefy, EigenLayer, Lido, Marinade, Hyperliquid, dYdX, GMX
Hot wallets: MetaMask, Phantom, Trust Wallet, Rabby, Rainbow, Coinbase Wallet, Wallet
Cold wallets: Ledger, Trezor, Coldcard, Keystone
Smart contract: Safe, Argent
Brokers/Payment: eToro, Trade Republic, Revolut

---

## Configuración manual pendiente

| Tarea | Estado |
|---|---|
| `phase20_position_tags.sql` en Supabase | ✅ Aplicado (2026-05-25) |
| `CRON_SECRET` en Vercel | ✅ Aplicado (2026-05-27) |
| `phase21_tax_module.sql` en Supabase | ⏳ **No urgente** — necesario solo cuando hagamos Fase 3 (backfill persistente) |

---

## Features pendientes

### Lote próximo (trazabilidad → completar)
1. **Fase 3** — Backfill persistente: script que escribe categorías en BD para no recomputar en cada carga
2. **Fase 5** — Override manual del gestor sobre cada entrada (confirma/cambia categoría inferida)
3. **Export anual CSV/PDF** para que el cliente lo entregue al asesor fiscal

### Otros
4. Alertas configurables (HF, LP fuera de rango, variación diaria)
5. Audit log visible al cliente
6. Tracker de objetivos
7. Más monedas (GBP, CHF…)

---

## Tests suite

```
tests/math/financial-core.test.mjs  — 41/41 ✅
tests/tax/fifo.test.mjs             — 10/10 ✅
tests/tax/categorize.test.mjs       — 18/18 ✅
TOTAL                                 — 69/69 ✅
```

Cobertura fiscal:
- FIFO (orden, parcial, exhausted, multi-token, ejemplo SKILL)
- Categorización por tipo de wallet (CEX, hot, cold, smart contract, DEX, sin clasificar)
- Cada handler (deposit, withdrawal, harvest staking vs lending, LP provide/remove)
- Flag inferred en todas las anotaciones
- Escenario realista CEX → Cold Wallet

---

## Archivos clave

### Trazabilidad (módulo nuevo)
| Fichero | Qué hace |
|---|---|
| `skills/spanish-crypto-tax-expert/SKILL.md` | Fuente de verdad fiscal España |
| `web/src/lib/tax/types.ts` | Tipos: FiscalCategory, WalletKind, TaxLot, TaxEvent, FiscalAnnotation, DISCLAIMER |
| `web/src/lib/tax/eur-conversion.ts` | USD→EUR helpers (Frankfurter) |
| `web/src/lib/tax/fifo.ts` | Algoritmo FIFO puro |
| `web/src/lib/tax/wallet-classification.ts` | Catálogo wallets + lookup BD/sync |
| `web/src/lib/tax/human-language.ts` | Traducciones técnicas → español plano |
| `web/src/lib/tax/categorize.ts` | Motor: usa walletProtocol, genera humanDescription |
| `web/src/app/api/transactions/traceability/route.ts` | Endpoint enriquecimiento on-the-fly |
| `web/src/components/dashboard/sections/WalletTraceability.tsx` | UI editorial |
| `web/supabase/sql/phase21_tax_module.sql` | Schema BD (preparado, no aplicado) |
| `web/tests/tax/fifo.test.mjs` | 10 tests FIFO |
| `web/tests/tax/categorize.test.mjs` | 18 tests categorización |

### Dashboard existente
| Fichero | Qué hace |
|---|---|
| `src/lib/dashboard/get-dashboard-data.ts` | Fuente de verdad cálculos |
| `src/lib/lending/thresholds.ts` | HF, LTV, MaxLTV, liquidation |
| `src/lib/fx/usd-eur.ts` | FX rate |
| `src/lib/snapshots/capture.ts` | Snapshots diarios |
| `src/components/dashboard/sections/DashboardHeader.tsx` | Header con slim toolbar |
| `src/components/dashboard/sections/HealthFactorAlertBanner.tsx` | Banner HF |
| `src/components/dashboard/sections/StrategyComposition.tsx` | Donut estrategia |
| `src/components/dashboard/sections/PortfolioEvolutionChart.tsx` | Gráfica TWR + DD |
