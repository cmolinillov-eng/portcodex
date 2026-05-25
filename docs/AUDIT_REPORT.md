# Audit Report — Crypto Portfolio Tracker

> Auditoría matemática y de coherencia contable realizada el 2026-05-25.
> **Última actualización:** 2026-05-25 (fin de sesión fase 20).

---

## Estado general

| Área | Estado |
|---|---|
| Contabilidad núcleo | ✅ Sólida (~90%) |
| Lending / Health Factor | ✅ Implementado con thresholds reales |
| Multi-currency USD/EUR | ✅ Implementado (toggle en header) |
| Position tags / estrategia | ✅ Implementado (SQL aplicado en Supabase) |
| PDF reports | ✅ Implementado (A4 print-ready) |
| Snapshots diarios | ✅ Implementado (cron Vercel) |
| Tests suite | ✅ 41/41 pasando |
| Gráficas de evolución / TWR | ⏳ En espera (necesita ≥7 snapshots acumulados) |
| Bugs contables abiertos | ⚠️ 3 pendientes (ver abajo) |

---

## Lo que funciona bien

| Métrica | Implementación | Estado |
|---|---|---|
| Total Depositado | Acumulado con spot_price histórico, excluye movimientos internos | ✅ |
| PnL ajustado (Valor + Realizado − Depositado) | get-dashboard-data.ts | ✅ |
| Impermanent Loss (fórmula clásica 2·√r/(1+r) − 1) | get-dashboard-data.ts | ✅ |
| Rebalance + depositado heredado (depositedDelta) | transactions/route.ts | ✅ |
| Harvest pending → descuento al reinvertir | get-dashboard-data.ts | ✅ |
| Lending equity + Health Factor con thresholds | lib/lending/thresholds.ts | ✅ NUEVO |
| LTV, MaxLTV, distancia a liquidación por token | lib/lending/thresholds.ts | ✅ NUEVO |
| LP costBasisUsd → ROI correcto (bug ROI=0 corregido) | get-dashboard-data.ts | ✅ NUEVO |
| Soft-delete + snapshot de cierre | positions/delete/route.ts | ✅ |
| Snapshots diarios (cron Vercel medianoche) | api/cron/snapshot/route.ts | ✅ NUEVO |
| Position tags por estrategia | position_tags table + API endpoint | ✅ NUEVO |
| Multi-currency USD ↔ EUR (Frankfurter/ECB, caché 30min) | lib/fx/usd-eur.ts + CurrencyContext | ✅ NUEVO |
| PDF report A4 (print-optimized, todos los datos) | lib/reports/portfolio-report-html.ts | ✅ NUEVO |
| HF Alert Banner (warning/critical con scroll-to) | HealthFactorAlertBanner.tsx | ✅ NUEVO |
| Donut estrategia por tags | StrategyComposition.tsx | ✅ NUEVO |

---

## Bugs abiertos (afectan números visibles)

### 🔴 C1. Average Entry Price se infla tras withdrawals parciales
**Ubicación:** `src/lib/dashboard/get-dashboard-data.ts` — rama withdrawal
**Problema:** Los withdrawals restan `balance` pero NO descuentan `costUsd` pro-rata.
Ejemplo: depósito 1 BTC@60k, retiras 0.5 → balance=0.5, costUsd=60k → avgPrice=**120k** (debería ser 60k).
**Impacto:** ROI individual sistemáticamente incorrecto tras cualquier retirada parcial.
**Fix:** En la rama de withdrawals, restar `(outAmount / (balance + outAmount)) × costUsd`.
**Prioridad:** Alta.

### 🟡 C3. Edit-position destruye histórico contable
**Ubicación:** `src/app/api/positions/edit/route.ts`
**Problema:** Soft-delete de todas las transactions y crea una sola fila con los valores tecleados.
Permite forzar cost basis sin trazabilidad. Viola regla 8 del proyecto.
**Impacto:** Total Depositado cambia sin que el cliente haya aportado capital.
**Fix:** Generar fila `manual_adjustment` con el delta exacto, manteniendo histórico intacto.
**Prioridad:** Media-alta.

### 🟡 C4. IL incorrecto en LPs fuera de rango
**Ubicación:** `src/lib/dashboard/get-dashboard-data.ts` — cálculo IL
**Problema:** Cuando un LP V3 sale de rango, la posición está 100% en un token → no hay IL real,
pero el código sigue calculando y mostrando un número engañoso.
**Fix:** Si `lpRangeStatus === "out_of_range"`, fijar `ilPercent = 0` + etiqueta "Fuera de rango".
**Prioridad:** Media.

---

## Mejoras importantes (no críticas)

### I2. realizedPnl en cierres no-rebalance
Solo los rebalances crean `position_closed`. Full withdrawals manuales pierden el PnL.
**Fix:** Cuando balance ≤ 0 tras operación, generar `position_closed` automáticamente.

### I1 + I3. Presentación lending
`currentValue = colateral − deuda` pero `costBasis = solo colateral` → ROI visual confuso.
El panel `LendingDetailsPanel` muestra ya Net Equity, LTV y distancias de liquidación,
pero el ROI % del row principal sigue siendo engañoso si hay deuda.
**Fix:** Ocultar ROI% en posiciones lending y mostrar solo Net Equity + HF.

---

## Pendiente de configuración (acciones manuales)

| Tarea | Dónde | Estado |
|---|---|---|
| Aplicar `supabase/sql/phase20_position_tags.sql` | Supabase SQL Editor | ✅ APLICADO (2026-05-25) |
| Añadir `SNAPSHOTS_CRON_SECRET` en Vercel env vars | Vercel → Settings → Env | ⚠️ PENDIENTE |

> **SNAPSHOTS_CRON_SECRET:** Sin esta variable, el cron de snapshots falla con 401. Ir a
> Vercel → proyecto → Settings → Environment Variables → añadir con un string aleatorio largo.
> El mismo valor debe estar en `vercel.json` como `CRON_SECRET` si se usa header de auth.

---

## Features estratégicas pendientes

### Lote siguiente recomendado (1-2 sesiones)
1. **C1 avgPrice tras withdrawal** — fix de ~5 líneas + test (impacta ROI de muchos clientes)
2. **C4 IL fuera de rango** — fix de ~3 líneas
3. **C3 edit-position no destructivo** — cambio mayor pero necesario

### Lote medio plazo
4. **Gráficas de evolución / TWR / Max Drawdown** — ya hay arquitectura de snapshots,
   esperar a tener ≥7 días de datos acumulados para que tenga sentido visual
5. **Alertas configurables** — HF < umbral, LP fuera de rango > N horas, IL > X%, variación diaria > Y%
6. **Audit log visible al cliente** — "el gestor X editó esta posición el día Y"

### Lote largo plazo
7. **Tracker de objetivos** — "Objetivo +30% anual" con barra de progreso
8. **Tax lots (FIFO/LIFO/Average)** — reporte PnL realizado para declaración fiscal ES/US
9. **Fees / gas tracking** — campo `feeAmountUsd` por transaction, relevante en DeFi con rotación alta
10. **Más monedas** — GBP, CHF… (la arquitectura CurrencyContext ya lo soporta, solo añadir Frankfurter pairs)

---

## Tests suite

```
tests/math/financial-core.test.mjs — 41/41 ✅

Cobertura:
- Cálculos básicos PnL, ROI, IL
- Rebalanceos A→B→C (invariantes de capital)
- Rebalance + full/partial withdrawal
- Chains multi-depósito
- LTV básico, LTV sin colateral, LTV sin deuda
- MaxLTV BTC, MaxLTV mixto
- Precio liquidación 1 BTC + deuda, colateral USDC, multi-colateral
- LP costBasisUsd → ROI correcto
```

---

## Archivos clave (referencia rápida)

| Fichero | Qué hace |
|---|---|
| `src/lib/dashboard/get-dashboard-data.ts` | Fuente de verdad de todos los cálculos del dashboard |
| `src/lib/lending/thresholds.ts` | HF, LTV, MaxLTV, liquidation prices |
| `src/lib/fx/usd-eur.ts` | FX rate USD→EUR (Frankfurter, caché 30min) |
| `src/lib/reports/portfolio-report-html.ts` | Generador PDF A4 |
| `src/components/dashboard/utils/currency-context.tsx` | Provider USD/EUR + hook useMoneyFormatters() |
| `src/components/dashboard/sections/HealthFactorAlertBanner.tsx` | Banner alertas HF |
| `src/components/dashboard/sections/StrategyComposition.tsx` | Donut por estrategia |
| `src/components/dashboard/sections/StrategyTagBadge.tsx` | Badge editable inline |
| `src/app/api/positions/tag/route.ts` | API upsert/delete de tags |
| `src/app/api/cron/snapshot/route.ts` | Cron snapshot diario |
| `supabase/sql/phase20_position_tags.sql` | Migración tabla position_tags (ya aplicada) |
| `tests/math/financial-core.test.mjs` | Suite de tests matemáticos (41 tests) |
