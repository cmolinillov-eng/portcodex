# Plan: portfolio 100% automático desde blockchain

> Objetivo final (palabras del usuario): *"que todo el portfolio se vea automático
> y no tengamos nada manual"*, con la misma presentación que la parte manual:
> secciones separadas de Pools (LP), Lending, Hold y Staking — pero con los datos
> recogidos on-chain.

## Estado (2026-07-02) — TODAS LAS FASES IMPLEMENTADAS

- **Fase A ✅** — el panel carga al instante desde snapshot (`onchain_cache`
  source `snapshot`, lo escribe cada lectura en vivo); si el snapshot tiene
  >15 min se refresca solo en segundo plano. Secciones agrupadas con subtotal.
- **Fase B ✅** — `position_links` (phase26) + API `/api/onchain/links` +
  aprendizaje automático al ingerir + UI de enlace en la conciliación.
- **Fase C1 ✅** — Increase/DecreaseLiquidity V3 → `lp_deposit`/`lp_withdraw`
  (fees separadas del principal en el Collect).
- **Fase C2 ✅** — Aave Supply/Withdraw/Borrow/Repay → `lending_*` con el mismo
  contrato (`metadata.adjustType`) que el ajuste manual auditado.
- **Fase C3 ✅** — transferencias de holds: Bitcoin (mempool.space), EVM
  (Zerion send/receive) y Solana (Helius TRANSFER, delta neto por token) →
  `deposit`/`withdrawal` en Hold. *Hueco conocido*: los eventos LP de
  Orca/Kamino (depósito/retirada/collect) aún no se escanean — Kamino
  auto-compone (sus recompensas ya se ven en el panel vía caché) y las fees de
  Orca también; la ingesta de esos eventos queda para el rodaje de Fase E.
- **Fase D ✅** — sección "Conciliación on-chain ↔ contabilidad" en el panel:
  valor real vs contable por enlace, desvío %, huérfanas en ambos sentidos.
- **Notificaciones (opcional) ✅** — `scripts/onchain-notify.mjs`: email con los
  eventos pendientes por portfolio. Se activa añadiendo los secrets
  `RESEND_API_KEY` (resend.com, gratis) y `NOTIFY_EMAIL` en GitHub.
- **Fase E** — pendiente de rodaje: cuando la conciliación lleve unas semanas
  sin desvíos, poner `auto_ingest=true` en los enlaces y jubilar los formularios.

Robustez del escáner: si un tramo de `getLogs` falla, el cursor NO avanza (se
reintenta en el siguiente run); los HTTP 500 activan la reducción adaptativa
del tramo. Nada se pierde y nada se duplica (event_key idempotente).

## Dónde estamos (2026-07-01)

Lo ya construido y en producción:

- **Lectura en vivo completa**: 6 protocolos (PancakeSwap V3, Uniswap V3, Aave,
  ProjectX, Orca, Kamino) + holds en 3 billeteras (EVM/Rabby, Solana/Phantom,
  Bitcoin/Ledger). Rango de pools, health factor, sin-reclamar. `src/lib/onchain/*`.
- **Worker cada 30 min** (GitHub Action): caché de Kamino (valor+rango+recompensas)
  y fees de Orca en `onchain_cache`; escáner de eventos `Collect` → harvests
  detectados en `onchain_events` con confirmación de 1 clic.
- **Contabilidad manual auditada**: `transactions` + `get-dashboard-data.ts`
  calculan cost basis (invariante: el depositado se fija al abrir y no se toca),
  P&L, harvest acumulado por posición, evolución. **Esto NO se reemplaza: es el
  motor. Lo que se automatiza es la ENTRADA de datos.**

La brecha: la vista bonita (secciones, cost basis, P&L, harvest total) vive en lo
manual; la verdad vive on-chain. Hay que unirlas.

## La pieza central: `position_links` (Fase B)

Una tabla que enlaza cada posición on-chain con su posición contable:

```
position_links (
  portfolio_id, 
  onchain_id TEXT,       -- LivePosition.id: "base:pancakeswap-v3:1497859"
  protocol TEXT,         -- protocolo contable ("PancakeSwap")
  position_id TEXT,      -- position_id contable
  position_type TEXT,    -- "Liquidity Pool" | "Lending" | "Hold" | "Staking"
  auto_ingest BOOLEAN,   -- true → los eventos de esta posición se contabilizan solos
  UNIQUE (portfolio_id, onchain_id)
)
```

Es lo que desbloquea todo lo demás:
- La tarjeta on-chain puede mostrar **cost basis y P&L** (vienen de la contabilidad
  de la posición enlazada).
- Un evento on-chain (harvest, depósito, retirada) sabe **a qué posición contable
  apuntar** sin preguntar → automatización total posible.
- La conciliación puede detectar diferencias entre ambos mundos.

Auto-sugerencia de enlaces: por protocolo + par de tokens (p.ej. la LivePosition
"WETH/cbBTC · PancakeSwap V3" ↔ posición manual protocol="PancakeSwap" con esos
tokens). El manager confirma una vez; queda guardado.

## Fases

### Fase A — Dashboard on-chain con la estética manual
*(solo visual; sin tocar contabilidad — se puede hacer ya)*

1. El worker guarda también el snapshot EVM+BTC completo en `onchain_cache`
   (source `live_snapshot`) para que el dashboard cargue al instante sin pulsar
   ningún botón (el botón "Actualizar" queda para forzar).
2. Reorganizar el panel a **tarjetas por sección** con el mismo diseño Void Luxe
   que `PositionSectionCard`: Pools de liquidez / Lending / Staking / Hold, cada
   una con subtotal, y por posición: par, protocolo, cadena, wallet, valor,
   rango visual (barra), HF, sin-reclamar.
3. Toggle en el dashboard: "vista contable" | "vista on-chain" (misma página,
   mismos estilos).

### Fase B — Enlace on-chain ↔ contable
1. Migración `position_links` + RLS (patrón de siempre).
2. Endpoint sugerencias de match + UI de confirmación (una vez por posición).
3. La bandeja de harvests usa el enlace: si existe, preselecciona la posición
   (y con `auto_ingest=true` se registra solo, sin clic).
4. Las tarjetas on-chain muestran depositado/P&L/harvest acumulado de la posición
   enlazada → **la vista on-chain ya iguala en información a la manual**.

### Fase C — Ingesta completa de eventos (la automatización de verdad)
Extender `scripts/onchain-harvests.mjs` (mismo patrón: detectar → `onchain_events`
→ confirmar o auto-registrar según `auto_ingest`):

| Evento on-chain | Tipo contable | Notas |
|---|---|---|
| `IncreaseLiquidity` (V3) | `lp_deposit` | precio del bloque (DeFiLlama) sella el depositado |
| `DecreaseLiquidity`+`Collect` (V3) | `lp_withdraw` | separar principal (Decrease) de fees (Collect − Decrease) |
| Aave `Supply`/`Withdraw` | `lending_supply`/`lending_withdraw` | |
| Aave `Borrow`/`Repay` | `lending_borrow` (con el neto ya auditado) | |
| Transferencias ERC20/BTC del hold | `deposit`/`withdrawal` en Hold | diffing de balance por snapshot para BTC |
| Solana (Orca/Kamino dep/with) | ídem LP | vía Helius parsed-tx API (free) |

- **Detección de rebalanceos**: retirada + depósito enlazados en <N minutos →
  proponer como `rebalance_transfer` (mantiene el depositado global, como ya hace
  el flujo manual auditado).
- Todo pasa por `onchain_events` (idempotente por tx hash) → auditable y
  deshacible (mismo `operation_group_id`).

### Fase D — Conciliación y confianza
1. Job de conciliación en el worker: compara snapshot on-chain vs posiciones
   contables abiertas. Avisos en el panel: "posición cerrada on-chain pero abierta
   en contabilidad", "valor difiere >X%", "posición on-chain sin enlazar".
2. Página/sección de salud de datos con esos avisos.
3. Periodo de rodaje: auto_ingest OFF por defecto → se observan las sugerencias
   unas semanas → cuando cuadre todo, ON.

### Fase E — Jubilar la entrada manual
- El dashboard principal pasa a ser la vista on-chain (Fase A) + datos contables
  por `position_links` (Fase B) + eventos automáticos (Fase C).
- Los formularios manuales quedan como **excepción/override** (p.ej. corregir un
  precio, registrar algo que ningún escáner ve).
- Las posiciones nuevas se abren solas: aparece la posición on-chain → evento de
  depósito detectado → alta contable automática con el depositado sellado.

## Principios que no se negocian

- **Cero APIs de pago.** Zerion/Helius/Jupiter free tiers, drpc/publicnode,
  mempool.space, CoinGecko, DeFiLlama.
- **Solo direcciones públicas.** Nunca claves privadas. `.env.local` fuera del repo.
- **El invariante contable manda**: el valor depositado se fija en el momento del
  depósito (precio del bloque) y no se modifica jamás.
- **Idempotencia**: todo evento tiene `event_key` único (chain:tx:logIndex);
  reejecutar workers nunca duplica.
- **Nada se contabiliza sin poder deshacerse** (operation_group_id + undo).

## Orden recomendado

1. **Fase A** (visual) — impacto inmediato, riesgo cero.
2. **Fase B** (enlaces) — pequeña y desbloquea C.
3. **Fase C** por etapas: primero V3 LP (Increase/Decrease), luego Aave, luego
   holds, al final Solana (lo más laborioso por el parsing de transacciones).
4. **Fase D** en paralelo con C (la conciliación se beneficia de cada etapa).
5. **Fase E** cuando D lleve unas semanas sin avisos.
