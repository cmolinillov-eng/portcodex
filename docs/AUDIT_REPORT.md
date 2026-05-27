# Audit Report — Crypto Portfolio Tracker

> Auditoría matemática y de coherencia contable.
> **Última actualización:** 2026-05-27 (revisión completa — todos los bugs críticos confirmados corregidos).

---

## Estado general

| Área | Estado |
|---|---|
| Contabilidad núcleo | ✅ Sólida (100% bugs críticos corregidos) |
| Lending / Health Factor | ✅ Implementado con thresholds reales |
| Multi-currency USD/EUR | ✅ Toggle en toolbar del header |
| Position tags / estrategia | ✅ SQL aplicado en Supabase |
| PDF reports | ✅ A4 print-ready |
| Snapshots diarios | ✅ Cron activo — acumulando datos (día 2 de 7+) |
| Tests suite | ✅ 41/41 pasando |
| Header UI | ✅ Slim icon toolbar — layout simétrico sin huecos |
| Rebalance LP→LP | ✅ Fix metadata.lp en source rows |
| Gráficas TWR / Drawdown | ⏳ Esperando ≥7 snapshots (~5 días más) |

---

## Bugs — todos corregidos ✅

| Bug | Fix | Estado |
|---|---|---|
| **C1** avgPrice infla tras withdrawal parcial | Pro-rata `costUsd -= costUsd × fraction` en rama withdrawal | ✅ |
| **C2** HF sin liquidation thresholds | `lib/lending/thresholds.ts` con tabla Aave V3 | ✅ |
| **C3** Edit-position destruye histórico | Genera filas `manual_edit` (withdrawal + deposit de delta) sin tocar historial | ✅ |
| **C4** IL incorrecto en LP fuera de rango | `if (lpRangeStatus === "out_of_range") → impermanentLossPercent = 0` | ✅ |
| **I2** realizedPnl perdido en cierres manuales | `autoClosePositionIfEmpty` en transactions/edit routes | ✅ |
| **LP ROI=0** costBasisUsd siempre null | Usa `txData.costUsd` del histórico | ✅ |
| **Rebalance LP→LP** metadata.lp obligatoria | Source rows heredan LP metadata del primer `lp_deposit` | ✅ |

---

## Pendiente de configuración (acción manual — URGENTE)

### ⚠️ CRON_SECRET no configurado en Vercel

Sin esta variable el cron de snapshots diarios falla con 401 cada medianoche.

**Pasos:**
1. Vercel → tu proyecto → **Settings → Environment Variables**
2. Añadir `CRON_SECRET` = (string aleatorio largo, ej. 40+ caracteres)
3. Redeploy (o el siguiente deploy automático lo activa)

> Vercel inyecta automáticamente `Authorization: Bearer <CRON_SECRET>` en sus cron jobs
> cuando la variable está configurada. El endpoint `/api/snapshots/daily` ya acepta tanto
> `CRON_SECRET` como `SNAPSHOTS_CRON_SECRET`.

---

## Mejoras pendientes (no críticas)

### I1 + I3. ROI confuso en posiciones lending con deuda
`currentValue = colateral − deuda` pero `costBasis = solo colateral`.
El panel `LendingDetailsPanel` ya muestra Net Equity, LTV y liquidación, pero el ROI%
del row principal puede confundir si hay deuda activa.
**Fix sugerido:** Ocultar ROI% en posiciones lending con deuda y mostrar solo Net Equity + HF.
**Prioridad:** Baja (cosmético — el LendingDetailsPanel ya da info correcta).

---

## Features estratégicas pendientes

### Lote próximo (cuando haya ≥7 snapshots ≈ 1-jun-2026)
1. **Gráficas de evolución** — valor del portfolio en el tiempo
2. **TWR (Time-Weighted Return)** — ROI estándar para gestores, descuenta timing de aportaciones
3. **Max Drawdown** — pico-a-valle del portfolio

### Lote medio plazo
4. **Alertas configurables** — HF < umbral, LP fuera de rango > N horas, IL > X%, variación diaria > Y%
5. **Audit log visible al cliente** — "el gestor X editó esta posición el día Y"

### Lote largo plazo
6. **Tracker de objetivos** — "Objetivo +30% anual" con barra de progreso
7. **Tax lots (FIFO/LIFO/Average)** — reporte PnL realizado para declaración fiscal ES/US
8. **Fees / gas tracking** — campo `feeAmountUsd` por transaction
9. **Más monedas** — GBP, CHF… (arquitectura CurrencyContext ya preparada)

---

## Tests suite

```
tests/math/financial-core.test.mjs — 41/41 ✅

Cobertura:
- PnL, ROI, Impermanent Loss
- Rebalanceos A→B→C (invariantes de capital)
- Rebalance + full/partial withdrawal
- Chains multi-depósito
- LTV básico/nulo, MaxLTV BTC/mixto
- Liquidation prices (1 BTC + deuda, USDC, multi-colateral)
- LP costBasisUsd → ROI correcto (fix C1 implícito)
```

---

## Archivos clave

| Fichero | Qué hace |
|---|---|
| `src/lib/dashboard/get-dashboard-data.ts` | Fuente de verdad de todos los cálculos |
| `src/lib/lending/thresholds.ts` | HF, LTV, MaxLTV, liquidation prices |
| `src/lib/fx/usd-eur.ts` | FX rate USD→EUR (Frankfurter, caché 30min) |
| `src/lib/reports/portfolio-report-html.ts` | Generador PDF A4 |
| `src/lib/positions/auto-close.ts` | Auto-cierre posición cuando balance ≤ 0 |
| `src/components/dashboard/utils/currency-context.tsx` | Provider USD/EUR + useMoneyFormatters() |
| `src/components/dashboard/sections/DashboardHeader.tsx` | Header con slim icon toolbar |
| `src/components/dashboard/sections/HealthFactorAlertBanner.tsx` | Banner alertas HF |
| `src/components/dashboard/sections/StrategyComposition.tsx` | Donut por estrategia |
| `src/components/dashboard/sections/StrategyTagBadge.tsx` | Badge editable inline |
| `src/app/api/positions/edit/route.ts` | Edit no-destructivo (filas manual_edit) |
| `src/app/api/positions/tag/route.ts` | API upsert/delete de tags |
| `src/app/api/snapshots/daily/route.ts` | Cron snapshot diario (requiere CRON_SECRET) |
| `supabase/sql/phase20_position_tags.sql` | Migración tabla position_tags (aplicada) |
| `tests/math/financial-core.test.mjs` | Suite 41 tests matemáticos |
