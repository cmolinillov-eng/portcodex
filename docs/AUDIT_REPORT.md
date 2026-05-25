# Audit Report — Crypto Portfolio Tracker

> Auditoría matemática y de coherencia contable realizada el 2026-05-25.
> Cubre `src/lib/dashboard/get-dashboard-data.ts`, `src/app/api/transactions/route.ts`, `src/components/dashboard/dashboard-client.tsx` y todas las rutas API de operaciones.

## Veredicto general

La aplicación es **contablemente sólida en su núcleo** (~85%). Las fórmulas básicas son correctas, los rebalanceos preservan el Total Depositado global, los harvests reinvertidos se manejan bien y los soft-deletes capturan PnL realizado. Pero hay **4 bugs reales** que pueden hacer que los números mostrados al cliente no cuadren, y **un agujero contable serio** en la edición manual de posiciones.

## Lo que funciona bien

| Métrica | Implementación | Estado |
|---|---|---|
| Total Depositado | Acumulado con spot_price histórico, excluye movimientos internos | OK |
| PnL ajustado (Valor + Realizado − Depositado) | get-dashboard-data.ts:1545 | OK (sin doble conteo) |
| Impermanent Loss (fórmula clásica 2·√r/(1+r) − 1) | get-dashboard-data.ts:219-225 | OK |
| Rebalance + depositado heredado (depositedDelta) | route.ts:1074-1125 | OK |
| Harvest pending → descuento al reinvertir | get-dashboard-data.ts:1398 | OK |
| Lending equity (colateral − deuda) en valor actual | get-dashboard-data.ts:1223 | OK |
| Soft-delete + snapshot de cierre | positions/delete/route.ts:159 | OK (captura PnL realizado) |

## Bugs críticos (afectan números visibles)

### C1. Average Entry Price se infla tras withdrawals parciales
**Ubicación:** `src/lib/dashboard/get-dashboard-data.ts:879-882`
**Problema:** Los withdrawals restan `balance` pero NO descuentan `costUsd` pro-rata. Ejemplo: depósito de 1 BTC a 60k, retiras 0.5 BTC → estado actual: balance=0.5, costUsd=60k, avgPrice=120k. Correcto: avgPrice=60k.
**Impacto:** ROI individual sistemáticamente mal tras cualquier retirada parcial.
**Fix sugerido:** En la rama de withdrawals, restar `(outAmount / (balance + outAmount)) × costUsd`.

### C2. Health Factor sin liquidation thresholds
**Ubicación:** `src/lib/dashboard/get-dashboard-data.ts:1246`
**Problema:** Hace `collateralUsd / debtUsd` plano. La skill `skill-lending-health-factor.md` requiere `Σ(colateral_i × threshold_i) / Σ(deuda_j)`.
**Impacto:** HF siempre mayor que el real → falsa sensación de seguridad ante liquidación.
**Fix sugerido:** Tabla de thresholds por token (BTC≈0.75, ETH≈0.83, USDC≈0.85, memecoins≈0.50) editable por gestor.

### C3. Edit-position destruye histórico
**Ubicación:** `src/app/api/positions/edit/route.ts:88-144`
**Problema:** Soft-delete de todas las transactions de la posición y crea una sola fila con los valores tecleados. Permite forzar cost basis sin trazabilidad.
**Impacto:** Total Depositado del portfolio cambia sin que el cliente haya aportado capital. ROI se distorsiona. Viola la regla 8 del PROJECT_INITIAL_INSTRUCTIONS.
**Fix sugerido:** Generar fila `manual_adjustment` con el delta exacto, manteniendo el histórico intacto. O marcar las originales como "superseded" en metadata.

### C4. IL clampeado fuera de rango
**Ubicación:** `src/lib/dashboard/get-dashboard-data.ts:993-994`
**Problema:** Cuando un LP V3 sale de rango, el código clampea al límite del rango y sigue calculando IL. Pero la posición está 100% en un token y no hay IL real.
**Impacto:** Número engañoso en LPs fuera de rango.
**Fix sugerido:** Si `lpRangeStatus === "out_of_range"`, fijar `ilPercent = 0` y etiqueta "Fuera de rango — posición convertida a 1 token".

## Importantes (ambigüedad o casos no cubiertos)

### I1. ROI engañoso en lending con borrow
`currentValue = colateral − deuda` pero `costBasis = solo colateral`. Depósito $1000 + borrow $500 → ROI = (500−1000)/1000 = −50% pero el cliente no perdió nada. Sugerencia: separar *ROI del colateral* y *ROI neto del equity*, o no mostrar ROI y poner Health Factor + Net Equity.

### I2. Cierre completo sin rebalance no genera realizedPnl
Solo los rebalances crean `position_closed`. Full withdrawals o deletes manuales pierden el realizedPnl del global. Fix: cuando una operación deja `balance ≤ 0`, generar `position_closed` automáticamente.

### I3. Total Depositado ambiguo en lending
Si pides 500 prestado y los retiras a wallet personal, el sistema lo trata como deuda — pero el cliente puede leer "1000 depositado" pensando que es suyo. UI debería separar: *Capital aportado / Deuda / Equity neto*.

## Mejoras menores

- **LP sin costBasisUsd:** en algunos paths, LPs muestran ROI=0 por sincronización (get-dashboard-data.ts:1036).
- **Precisión flotante:** cálculos críticos en `decimal.js` para evitar artefactos en sumas grandes.
- **Tests faltantes:** cadenas de rebalanceos (A→B→C), full withdrawal tras rebalance.

## Mejoras estratégicas (roadmap)

### Métricas avanzadas
- **Time-Weighted Return (TWR):** ROI estándar para gestores, descuenta timing de aportaciones.
- **Sharpe Ratio:** requiere histórico de valor → ver snapshots.
- **Max Drawdown:** pico-a-valle del portfolio.

### Snapshots periódicos
Tabla `portfolio_snapshots` con valor diario. Cron que guarda `{date, portfolioId, valueUsd, depositedUsd, pendingHarvestUsd, realizedPnlUsd}`. Habilita gráficas de evolución, TWR/Sharpe/drawdown e inmunidad a cambios retroactivos de precios.

### Alertas configurables
- HF < umbral (1.5 por defecto)
- LP fuera de rango > N horas
- IL > X%
- Variación diaria > Y%

### Reporting
- **PDF snapshot actual** (en roadmap inicial, no implementado)
- **CSV histórico** (implementado)

### Tax lots (FIFO/LIFO/Average)
Reporte por lots con realized PnL clasificado para jurisdicciones que pagan impuestos sobre crypto (ES, US…).

### Tracker de objetivos
En roadmap inicial. "Objetivo +30% anual" con barra de progreso vs tiempo restante.

### Fees / gas tracking
Campo opcional `feeAmountUsd` por transaction. Relevante para portfolios DeFi con rotación alta.

### Multi-currency display
Conversión a EUR/otras en tiempo real para clientes que piensan en su moneda local.

### Audit log visible al cliente
Hoy hay `admin-audit` solo para admin. Mostrar al cliente final "el gestor X editó esta posición el día Y" da confianza.

### Position tagging / estrategia
Etiquetas tipo "Stablecoin yield", "Blue-chip long", "Memecoin gamble" para agrupar el donut por estrategia.

## Plan de prioridades

**Lote 1 — Bugs críticos** (1-2 sesiones)
1. C1 (avgPrice tras withdrawal parcial) — fix de 5 líneas + test
2. C4 (IL fuera de rango = 0) — fix de 3 líneas
3. C3 (Edit-position no destructivo) — cambio mayor pero crítico

**Lote 2 — Mejoras importantes** (1 sesión)
4. C2 (Health Factor con thresholds)
5. I2 (realizedPnl en cierres no-rebalance)
6. I1 + I3 (presentación lending)

**Lote 3 — Features estratégicas** (escalonado)
7. Snapshots diarios
8. PDF reports
9. Tracker de objetivos
10. Alertas

**Lote 4 — Refinamiento** (largo plazo)
- TWR / Sharpe / Drawdown
- Tax lots
- Multi-currency
- Fees / gas
