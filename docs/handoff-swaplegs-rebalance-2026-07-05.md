# Handoff — swapLegs en flujo manual + auditoría y fixes de rebalanceos (2026-07-04/05)

Resumen para continuar el trabajo en otra sesión. Todo lo descrito está **implementado y verificado** (`npx tsc --noEmit` limpio, `node --test tests/tax/*.test.mjs` 34/34 en verde). No hay migraciones de BD: todos los cambios son de código y retro-compatibles con las filas existentes.

## Contexto

La app registra operaciones como filas en `transactions`. El motor fiscal (`src/lib/tax/compute-traceability.ts` + `categorize.ts`) **recalcula todo desde cero** en cada carga sobre las filas vivas (`deleted_at IS NULL`) — no persiste lotes. El dashboard (`src/lib/dashboard/get-dashboard-data.ts`) y los snapshots (`src/lib/snapshots/capture.ts`) también recomputan. Por eso el botón "Deshacer" (soft-delete por `operation_group_id` en `/api/transactions/undo`) es consistente por construcción.

Mecanismo `swapLegs` (ya existía para el ingestor on-chain): cuando en una operación el token que entra difiere del que salió/se cobró, se anota `metadata.swapLegs = [{soldSymbol, soldAmount, soldPriceUsd, boughtSymbol, boughtAmount, boughtPriceUsd}]` en la fila del token comprado. El motor fiscal consume por FIFO los lotes del vendido y crea el lote del comprado con la base trasladada (sin hecho imponible). Sin esto: lote del vendido queda vivo + el comprado sale después sin lote → **base duplicada**.

## Parte 1 — swapLegs en el flujo MANUAL de reinversión de harvest

Problema: las ramas `harvest`-con-reinversión y `reinvest_harvest` de `src/app/api/transactions/route.ts` repartían el USD del harvest entre tokens destino sin anotar la permuta cuando el token destino ≠ token cobrado.

Cambios:

- `src/app/api/transactions/route.ts`: helper `reinvestSwapLegsFor(boughtSymbol, boughtAmount, usdPortion)` (junto a `spotPriceFor`). Construye el leg directamente (vendido = token del harvest, cantidad = porción USD / precio spot). Anotado en las 8 filas de reinversión de ambas ramas: LP tokenA/tokenB (`usdA`/`usdB`), colateral lending (`collateralUsd`), fallback Hold/Staking (total). Si el token coincide o no hay precio del cobrado → no anota nada (nunca rompe la operación).
- `lending_borrow` (modo "deuda") **sin legs a propósito**: la deuda no procede del harvest y no es capital-in.
- `src/lib/tax/categorize.ts`: el bloque swapLegs de `handleLpDeposit` se extrajo a `applyReinvestSwapLegs(tx, boughtSymbol, currentLots, rate, contextLabel)` + `reinvestSwapResult(...)`, y ahora también lo consumen:
  - `handleDeposit` (Hold) — el corte va **antes** de la rama "buy" para no crear además un lote a FMV.
  - `handleLendingMovement` (solo `lending_supply`).
  - `handleStakingMovement` (solo `staking_deposit`).
- Dashboard y snapshots no necesitaron cambios para esto: su ajuste de pending por swapLegs ya opera sobre cualquier fila capital-in con `source=harvest_reinvest`.

## Parte 2 — Auditoría de rebalanceos/undo/lending y fixes

Auditoría de: deshacer operaciones, rebalance LP→LP/lending/Hold, lending (colateral/deuda/health factor) y fiscalidad de swaps. **Verificado como correcto sin cambios**: undo (recomputación total), conservación de valor ±1% en rebalance, `depositedDelta` viajando por fila, health factor/LTV/liquidación por token, `lending_borrow` P&L-neutro, ventas CEX con FIFO.

Fallos encontrados y corregidos:

### F1+F2 — Fiscalidad de rebalanceos (base duplicada/perdida)

- `handleWithdrawal` ignoraba `reason=rebalance_transfer`: un origen Hold en CEX generaba una **venta tributable** en un movimiento interno. Ahora tiene rama `non_taxable_transfer` (también para `rebalance_harvest_out`).
- El destino Hold creaba lote con base `depositedDelta` sin que nadie consumiera los lotes del origen (duplicación); los destinos lending/staking no creaban lote ninguno (base perdida al vender después).
- **Solución**: la rama `rebalance` de `transactions/route.ts` anota `metadata.swapLegs` en las filas destino vía `computeReinvestSplit` (`src/lib/onchain/reinvest-split.ts`), comparando cesta origen (incluido el harvest arrastrado, cuyo lote creado al cobrarlo también viaja) vs cesta destino. Además marca `rebalanceSwapChecked: true`.
- Semántica en los 4 handlers destino (`handleDeposit`, `handleLpDeposit`, `handleLendingMovement`, `handleStakingMovement`):
  - **Con legs** → consumir lotes del vendido por FIFO + lote del comprado con base trasladada (etiqueta "el rebalanceo").
  - **`rebalanceSwapChecked` sin legs** → el token no cambió: el lote original sigue vivo y viaja; NO se crea lote (antes Hold→Hold mismo token duplicaba).
  - **Legacy (sin flag)** → comportamiento anterior intacto (Hold: lote depositedDelta; lending/staking/LP: nada). El histórico fiscal no se reescribe, salvo que desaparecen las ventas fantasma de rebalanceos Hold/CEX (corrección deliberada).
- Las filas de SALIDA del rebalance no consumen lotes (los consume el destino vía legs) → el orden de proceso entre filas del grupo no importa.

### F3 — Harvest arrastrado en rebalance contado doble

Al incluir `rebalanceSourceHarvestTokens`, su valor entraba en el destino pero el pending del origen no se descontaba → `totalValueUsd` y PnL inflados. Fix: `rebalance_harvest_out` ahora descuenta `pendingByToken` del origen en `get-dashboard-data.ts` (rama capital-out) y en `capture.ts` (misma semántica).

### Menor — auto-close vs undo

`autoClosePositionIfEmpty` (`src/lib/positions/auto-close.ts`) creaba el snapshot `position_closed` con `operation_group_id` propio → deshacer la operación que vació la posición dejaba un marcador huérfano (bloqueaba futuros auto-cierres). Ahora acepta `operationGroupId` opcional y los dos callers (`/api/transactions` POST y `/api/positions/edit`) le pasan el grupo de la operación.

### Bug raíz descubierto — herencia de metadata LP contaminada

`getLatestLpMetadata` (transactions/route.ts) devolvía el metadata **completo** del último `lp_deposit`. Las filas nuevas que heredaban con `{ ...metadata }` (depósito base LP, reinversiones LP) podían arrastrar `source=harvest_reinvest/rebalance_transfer`, `swapLegs`, `depositedDelta` de la fila anterior → un depósito base posterior podía quedar marcado como movimiento interno (**no sumaba al total depositado**) o re-consumir legs ya procesados. Fix: ahora devuelve **solo la clave `lp`** (rango/ratio/par), que es lo único que debe heredarse.

## Archivos tocados

| Archivo | Cambio |
|---|---|
| `src/app/api/transactions/route.ts` | `reinvestSwapLegsFor` + anotación en 8 filas de reinversión; anotación swapLegs/`rebalanceSwapChecked` en filas destino de rebalance; `getLatestLpMetadata` devuelve solo `lp`; pasa `operationGroupId` a auto-close |
| `src/lib/tax/categorize.ts` | `applyReinvestSwapLegs` + `reinvestSwapResult`; rama rebalance en `handleWithdrawal`; legs en `handleDeposit`/`handleLpDeposit`/`handleLendingMovement`/`handleStakingMovement` con lógica legs / checked-sin-legs / legacy |
| `src/lib/dashboard/get-dashboard-data.ts` | Descuento de pending en `rebalance_harvest_out` |
| `src/lib/snapshots/capture.ts` | Ídem |
| `src/lib/positions/auto-close.ts` | Param opcional `operationGroupId` |
| `src/app/api/positions/edit/route.ts` | Pasa `groupId` a auto-close |

## Pendientes (decisión del usuario / próximas tareas)

1. **Filas legacy contaminadas en BD**: por el bug de la herencia puede haber depósitos base antiguos con `source=harvest_reinvest` heredado que no suman al depositado. Conviene una consulta de detección (buscar `lp_deposit` sin operación de harvest asociada pero con `source=harvest_reinvest`, o depósitos base con `depositedDelta`/`swapLegs` inesperados) y limpieza puntual.
2. **Semántica del modo "deuda" en reinversión de harvest**: emite `lending_borrow` de entrada (más deuda). Es P&L-neutro pero dudoso (¿debería ser un repago con `token_out`?) y su pending nunca se descuenta. Decidir y ajustar.
3. Ya pendientes de antes: activar emails de notificación (tarea #38) y decisión sobre los 2 harvests manuales duplicados de SOL/USDC (24-may y 1-jun).

## Cómo verificar

```bash
cd web
npx tsc --noEmit
node --test tests/tax/*.test.mjs
```

Prueba funcional sugerida: rebalancear un LP con cambio de par (o LP→Hold) y comprobar en el módulo fiscal que la fila destino incluye la nota "Incluye permuta implícita en el rebalanceo…", que los lotes del vendido quedan consumidos y que el Total Depositado global no varía; deshacer la operación y comprobar que todo vuelve al estado previo.
