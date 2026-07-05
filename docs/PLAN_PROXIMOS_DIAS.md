# Plan de trabajo — próximos días (post-auditoría, pre-clientes)

> Estado a 2026-07-06. Sale de las 2 rondas de auditoría multi-agente (fiscal,
> on-chain, ciclo de vida contable, coherencia entre vistas) + dogfooding sobre
> datos reales. Los críticos de las auditorías ya están arreglados y en
> producción (`693442c`, `9679d8f`). Este plan ordena TODO lo que queda:
> arreglar, probar, crear.
>
> Regla de lectura: cada fase tiene un "gate" — qué desbloquea. No hace falta
> completarlo todo para operar; sí para cada tipo de cliente/uso.

---

## FASE 0 — Arranque (HOY, manual, 15 min) ✋ acciones del gestor

| # | Acción | Cómo |
|---|--------|------|
| 0.1 | Aplicar migración phase27 | SQL Editor de Supabase: `ALTER TABLE position_links ADD COLUMN IF NOT EXISTS deposited_override_usd NUMERIC;` |
| 0.2 | Verificar secrets del worker | GitHub repo `portcodex` → Settings → Secrets: `HELIUS_API_KEY`, `ZERION_API_KEY`, `JUPITER_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (+ `RESEND_API_KEY` si se quieren emails) |
| 0.3 | Dogfooding mfita | Entrar como gestor: adoptar las posiciones sin depositado (JITOSOL/SOL, HYPE, SOL, USDC, WETH…), escribir el $ depositado, comprobar que Total Depositado del header lo recoge |
| 0.4 | Revisar los 84 eventos descartados | Si alguno era real (harvest/depósito de verdad), registrarlo a mano; si eran pruebas, ignorar |

**Gate:** empezar a usar la app en el día a día con mfita (pools/holds/staking, sin préstamos). Auto-ingesta ya activa (6 enlaces AUTO verificados).

---

## FASE 1 — Unificar la fuente de verdad de los números (3-5 días) 🔴 la más importante

**Problema estructural (confirmado por ambos auditores):** hay TRES cálculos de
"cuánto vale el portfolio" que conviven sin reconciliarse:
1. Header/donut/informe/fiscal → contable (`get-dashboard-data.ts`)
2. Lista de posiciones visible → on-chain en vivo (`/api/wallet/live`)
3. Curva de evolución → snapshot con su propio motor (`capture.ts`)

Un cliente que compare ve números distintos para lo mismo. Con auto-ingesta ON
además hay doble conteo percibido (la posición cuenta en el header Y aparece en
vivo).

Trabajo:
- [ ] 1.1 Extraer la valoración a UNA función compartida (posición → valor USD)
      usada por `get-dashboard-data`, `capture.ts` y el informe. Muere el motor
      paralelo del snapshot (clave `positionId::symbol` sin protocolo, sin LP
      agregado, sin FIFO pro-rata — divergencias C3 de la auditoría).
- [ ] 1.2 Decidir el modelo de presentación (decisión de producto, 1 h con
      Carlos): **opción A** — el header suma contable + on-chain-no-ingerido y
      el panel vivo marca "✓ contabilizada" cada posición enlazada; **opción B**
      — banda de reconciliación explícita ("Contable X · En vivo Y · diferencia
      Z por…"). Recomendada: A.
- [ ] 1.3 El panel on-chain señala posiciones ya ingeridas (vía `position_links`)
      para que nadie las sume dos veces mentalmente.
- [ ] 1.4 El donut/composición y el "Valor actual" del informe tratan el harvest
      pendiente igual que el header (línea explícita "Harvest sin reinvertir" o
      exclusión consistente) — hallazgo A3.
- [ ] 1.5 El P&L on-chain (`computeMetrics`) suma el harvest cobrado como lo
      hace el contable (hoy dos ROIs distintos para la misma posición) — B2.
- [ ] 1.6 "Valor on-chain leído" neta la deuda de lending (hoy suma solo
      positivos) — B1.
- [ ] 1.7 **Test de coherencia automatizado**: header == Σ secciones == snapshot
      recién capturado == suma del informe, sobre una fixture con pools +
      lending + harvest pendiente. Es el candado para que no vuelva a divergir.

**Gate:** enseñar la app a un cliente sin que pueda pillar dos números que no cuadran.

---

## FASE 2 — Lending con deuda (2-3 días) 🟠 gate para clientes con préstamos

Bugs verificados (NO afectan a mfita hoy — sin borrows):
- [ ] 2.1 Posición con colateral 0 y deuda viva desaparece del dashboard (filtro
      `currentBalance > 0` en `get-dashboard-data.ts:1115`) → la deuda se
      evapora del total y el portfolio se infla. Incluir posiciones con deuda
      viva aunque el colateral sea 0.
- [ ] 2.2 `auto-close.ts` ignora `lending_borrow`: puede marcar cerrada una
      posición con deuda impagada. Incluir la deuda en `totalAbsBalance`.
- [ ] 2.3 Rebalanceo desde lending con deuda: solo viaja el colateral y el
      `sourceCostBasis` ignora el borrow → depositado destino inflado + deuda
      huérfana. O arrastrar la deuda, o BLOQUEAR el rebalanceo si hay deuda
      viva (más simple y seguro: exigir repay primero).
- [ ] 2.4 (menor) Repago con token volátil distorsiona el depositado (M-1):
      documentar o restituir al precio del borrow original.
- [ ] 2.5 Tests: ciclo B completo (supply → borrow → repay parcial → withdraw)
      + los 3 casos de arriba.

**Gate:** aceptar clientes/estrategias con préstamos (Aave etc.).

---

## FASE 3 — Fiscal de segundo orden (2-3 días) 🟡 antes de entregar nada a un asesor

- [ ] 3.1 **Fees**: hoy `fee_amount` siempre es 0 y el motor lo ignora. Añadir
      campo de comisión en el formulario de operación + en la ingesta on-chain
      (gas de la tx vía Zerion/Helius), y que el motor las aplique (Art. 35
      LIRPF: suman a adquisición, restan a transmisión). Sin esto las ganancias
      declaradas salen sobrevaloradas (perjudica al cliente).
- [ ] 3.2 **CSV CoinTracking**: `lp_provide`/`lp_remove` caen a "Trade"
      unilateral (base 0 al importar) y `lending_borrow` sale como "Transfer".
      Mapear a los tipos correctos de CoinTracking o retirar la exportación
      hasta entonces (la pestaña fiscal interna SÍ es correcta).
- [ ] 3.3 **Sells inferidos**: la retirada de un CEX hacia el Ledger propio se
      infiere como venta tributable. Añadir aviso/bloqueo en la exportación
      mientras existan `fiscal_inferred=true` de tipo `sell` sin revisar.
- [ ] 3.4 **Saneo de filas legacy** (pre-flag `rebalanceSwapChecked`): script
      one-shot que detecte rebalanceos antiguos con base duplicada y
      reinversiones antiguas con "ventas fantasma", y los re-anote. Ejecutar
      backfill después.
- [ ] 3.5 Ejecutar el backfill fiscal en todos los portfolios (ya usa FX
      histórico tras el fix) y validar contra la pestaña fiscal.

**Gate:** exportar cifras a un asesor fiscal / campaña de la renta.

---

## FASE 4 — Robustez de la ingesta on-chain (3-4 días) 🟡 calidad del "solo"

- [ ] 4.1 **Cierre de posiciones V3**: si el NFT se quema entre runs, la
      retirada final no se detecta nunca (la posición contable queda abierta
      para siempre). Guardar los tokenIds vistos en runs anteriores
      (`onchain_scan_state`) y escanear también los desaparecidos.
- [ ] 4.2 **Retiradas de Meteora DLMM**: hoy no se detectan (solo harvests por
      delta). Detectar caída de principal entre lecturas de caché y emitir
      evento `withdraw` (mismo patrón que el harvest por delta de fees).
- [ ] 4.3 **Paginación de cursores**: Helius (limit 100) y Zerion (page 100) no
      paginan → >100 txs entre runs = hueco permanente. Paginar hasta agotar o
      hasta el cursor anterior.
- [ ] 4.4 **Transferencias entre wallets propias**: catálogo de direcciones
      propias del portfolio (las de `portfolio_wallets` + direcciones
      declaradas del cliente: CEX, cold). Si la contraparte es propia →
      transferencia interna, NO resta del depositado.
- [ ] 4.5 **Ventana de reinversión 45min/±50%**: señal visible en la operación
      creada ("clasificado como reinversión") con botón "era capital nuevo" que
      deshaga y re-registre. Hoy corregirlo exige cirugía manual.
- [ ] 4.6 Wallet compartida entre dos portfolios: detectar y avisar (hoy
      duplica los eventos en ambos).
- [ ] 4.7 Alerta si el workflow de GitHub Actions lleva >2h sin correr con
      éxito (email vía Resend o aviso en el panel).

**Gate:** confiar en el "100% automático" sin revisar la bandeja a diario.

---

## FASE 5 — Producto y experiencia de cliente (2-3 días) 🟢 pulido pre-onboarding

- [ ] 5.1 Informe HTML/PDF en la moneda activa (hoy siempre USD) y con el
      mismo total que el header (depende de 1.1).
- [ ] 5.2 Estado "precio no disponible" por posición: hoy un RPC caído muestra
      la posición a 0 $ (parece pérdida del 100%). Mostrar "— sin precio" y
      excluir del total con aviso.
- [ ] 5.3 Emails a clientes (#38 pendiente): resumen semanal/mensual por email
      (Resend ya está integrado en el worker de notificaciones).
- [ ] 5.4 Limpieza de código muerto: `PositionSectionCard` (ya no se renderiza),
      `HarvestInbox` (bandeja retirada), formatters USD sueltos. Menos ruido
      para las próximas auditorías.
- [ ] 5.5 Flujo de onboarding de cliente nuevo documentado y probado de punta a
      punta: crear usuario → añadir wallets (EVM/Solana/BTC) → esperar primer
      scan → adoptar posiciones existentes con su depositado → verificar
      dashboard. Hacerlo UNA vez con un portfolio de prueba y cronometrarlo.
- [ ] 5.6 Runbook de incidentes de 1 página: "un evento se clasificó mal →
      cómo deshacerlo" (undo por grupo), "un total no cuadra → qué mirar",
      "el worker no corre → qué revisar".

**Gate:** onboarding del primer cliente externo sin improvisación.

---

## FASE 6 — Pruebas y hardening continuo (transversal, 2 días + mantenimiento)

- [ ] 6.1 Suite E2E financiera sobre los ciclos auditados: A (pool completo),
      B (lending), C (rebalanceos cruzados), D (hold compras/ventas), E
      (retirada parcial) — los mismos que se trazaron a mano, ahora en código.
- [ ] 6.2 El test de coherencia entre vistas (1.7) en CI en cada push.
- [ ] 6.3 Tests fiscales que importen el motor REAL (hoy `tests/tax/*` replica
      la lógica en .mjs: no protege contra regresiones en `categorize.ts`).
      Compilar TS en el test o mover el motor a un paquete testeable.
- [ ] 6.4 Snapshot diario verificado: comparar el snapshot de medianoche con el
      total del dashboard y avisar si divergen >1%.

---

## Orden recomendado (si se hace en serie)

| Días | Qué |
|------|-----|
| Día 0 (hoy) | FASE 0 completa + empezar a operar con mfita |
| Días 1-4 | FASE 1 (fuente de verdad única + test de coherencia) |
| Días 5-6 | FASE 5.1, 5.2, 5.4 (lo visible barato) + FASE 6.1-6.2 |
| Días 7-9 | FASE 4 (robustez ingesta) — mientras, mfita rueda y valida |
| Días 10-12 | FASE 2 (lending con deuda) si hay clientes con préstamos a la vista; si no, FASE 3 (fiscal) |
| Antes de la renta | FASE 3 completa |
| Onboarding 1er cliente | FASE 5.5-5.6 hechas + FASE 1 cerrada |

## Qué NO está en este plan (decidido)

- Modo conservador de auto-ingesta: descartado por decisión del gestor
  (auto-ingesta ON desde ya). El plan compensa con 4.5 y 4.7.
- Rediseños visuales: la UI actual es válida; solo coherencia y estados.
