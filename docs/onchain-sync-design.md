# Diseño técnico — Sincronización on-chain automática

> Estado: **borrador de diseño** (v1, 2026-06-29). No implementado todavía.
> Objetivo: que las posiciones y operaciones lleguen **automáticamente** desde
> blockchain a la app, incluyendo la parte fiscal, en lugar de meterlas a mano.

---

## 1. Objetivo y principio rector

Hoy todo (altas, rangos de LP, lending, rebalanceos, harvests) se introduce y
modifica **manualmente**. Queremos que la app **lea la wallet on-chain** y mantenga
las posiciones y el histórico al día sola.

**Principio rector:** capturar **cada cambio según ocurre** (arquitectura por
eventos), con su **fecha y precio del momento**, para que el cost basis y la
fiscalidad se construyan automáticamente **de aquí en adelante**. No se trata de
reconstruir el pasado, sino de no volver a perder un evento futuro.

**Seguridad — innegociable:** todo es **solo lectura**. Se usa únicamente la
**dirección pública** de la wallet. Nunca se piden claves privadas ni seed
phrases, ni se firma nada. Encaja con `wallet_protocols.custodial = false`
(self-custody / DEX).

**Invariante contable (no negociable):** al abrir una posición, su valor en ese
momento = **valor depositado / cost basis**, y eso **queda fijo para siempre**.
Lo único que cambia con el tiempo es el **valor de mercado** de la posición
(flota con el precio). El P&L = valor de mercado actual − depositado fijo. La
captura on-chain debe respetar esto: cuando se detecta la **apertura** de una
posición, se sella su depositado al precio del bloque y no se vuelve a tocar;
los eventos posteriores solo mueven el valor de mercado. (Es exactamente el
modelo ya auditado: `totalDepositedUsd` fijo, `currentValue` flotante.)

---

## 2. Por qué por eventos (webhooks) y no por polling cada X horas

| | Polling (foto cada 1-3 h) | Eventos / webhooks (tiempo real) |
|---|---|---|
| Detecta el cambio | Sí, con retraso | Sí, al instante |
| Sabe **qué** pasó | No — solo ve el saldo neto (ambiguo) | **Sí** — recibe la tx ya parseada |
| Precio para cost basis | Aproximado | **Exacto** (timestamp del bloque) |
| Apto para fiscalidad | Riesgoso | **Correcto** |
| Puede perder eventos intermedios | Sí (depósito+retiro entre fotos) | No |

Conclusión: **webhooks** como mecanismo principal, con un **polling de
reconciliación** (cada N horas) como red de seguridad para detectar lo que un
webhook pudiera haber perdido.

---

## 3. Fuentes de datos por cadena (verificado 2026-06)

Ningún proveedor cubre bien Solana DeFi **y** EVM DeFi a la vez. Se combinan:

### Solana (Kamino, Orca, Jupiter)
- **Eventos:** [Helius](https://helius.dev) webhooks de "enhanced transactions"
  (entrega la tx parseada: swap, depósito, etc.) + RPC.
- **Estado de posiciones (rangos/lending):** **Jupiter Portfolio API**
  (ex-SonarWatch, en beta) — cubre Kamino lending/borrow, Orca whirlpools con
  rango concentrado, Jupiter. Alternativa: el `portfolio-api` de SonarWatch es
  **open-source** y auto-hospedable (plugins por protocolo) si la beta no basta.
- **Pricing:** Jupiter Price API / Birdeye para precio actual; CoinGecko
  histórico para el timestamp del evento.

### EVM (Aave, Pancakeswap — Ethereum / BNB Chain)
- **Eventos:** [Alchemy](https://alchemy.com) o [Moralis](https://moralis.io)
  Streams/webhooks de actividad de address.
- **Estado de posiciones:** **Zerion API** (tier gratis de dev; decodifica
  Aave colateral/deuda y LPs). Nota: Zerion **NO** devuelve posiciones de
  protocolo en Solana — por eso Solana va por Jupiter Portfolio.
- **Pricing:** el propio proveedor + CoinGecko histórico.

> Decisión abierta D1: ¿Jupiter Portfolio beta o auto-hospedar SonarWatch
> open-source para Solana? Depende de la riqueza/estabilidad de la beta.

---

## 4. Arquitectura por capas

```
                 ┌─────────── on-chain ───────────┐
   Helius (SOL) ─┤                                 ├─ Alchemy/Moralis (EVM)
                 └───────────────┬─────────────────┘
                                 │  webhooks (tx parseada)
                                 ▼
              ┌─────────────────────────────────────┐
              │  /api/wallet/webhook  (ingesta)      │  ← valida firma del proveedor
              └───────────────┬─────────────────────┘
                              ▼
              ┌─────────────────────────────────────┐
              │  Clasificador de eventos             │  ← reglas: tx on-chain → tipo app
              │  (mapea a transactions.type+reason)  │
              └───────────────┬─────────────────────┘
                              ▼
              ┌─────────────────────────────────────┐
              │  Pricing histórico (EUR @ block ts)  │
              └───────────────┬─────────────────────┘
                              ▼
              ┌─────────────────────────────────────┐
              │  Inserción en `transactions`         │  ← MISMO modelo auditado
              │  (source: "onchain", needs_review)   │
              └───────────────┬─────────────────────┘
                              ▼
        Dashboard / FIFO / tax_events / AEAT  ← sin cambios: ya consumen `transactions`

   Polling de reconciliación (cron cada N h): compara estado on-chain vs `transactions`
   y crea eventos "drift" para revisar lo que los webhooks no captaron.
```

Clave del diseño: **reutilizamos la tabla `transactions` y todo el motor ya
auditado** (cost basis, FIFO, fiscal). El trabajo nuevo está en *generar* esas
filas desde on-chain en vez de a mano.

---

## 5. Mapeo: evento on-chain → modelo de la app

La app ya tiene los tipos y `reason` correctos. El clasificador traduce:

| Evento on-chain | `transactions.type` | `reason` / notas |
|---|---|---|
| Depósito a LP (Orca/Kamino) | `lp_deposit` (×2 tokens) | metadata.lp con rango leído on-chain |
| Retiro de LP | `lp_withdraw` | |
| Swap dentro de rebalanceo | `lp_withdraw` + `lp_deposit` | `reason: rebalance_transfer` + `depositedDelta` |
| Claim de recompensas | `harvest` | token_in = recompensa |
| Reinversión de harvest | `lp_deposit` | `source: harvest_reinvest` |
| Supply colateral (Aave/Kamino) | `lending_supply` | |
| Borrow | `lending_borrow` | (P&L-neutro, ya implementado) |
| Repago | `lending_borrow` (token_out) | |
| Retiro colateral | `lending_withdraw` | |
| Compra spot / entrada | `deposit` | |
| Venta spot / salida | `withdrawal` | |
| Cierre total de posición | `position_closed` | snapshot (ya con sentinela 1/1) |
| **Traspaso entre wallets propias** | *(no es operación fiscal)* | marcar `self_transfer`, NO genera venta |

### Reglas de clasificación (el corazón del trabajo)
- **Identificar wallets propias** del usuario: un envío a otra address suya es un
  **traspaso no sujeto** (clave para no inventar ventas en Hacienda).
- **Distinguir swap-venta vs swap-de-rebalanceo**: por contexto de protocolo y
  por si el destino es una posición ya conocida del usuario.
- **Agrupar** las txs de una misma acción con un `operation_group_id` (igual que
  hoy), para que el botón **Deshacer** y la trazabilidad sigan funcionando.
- Toda fila on-chain entra marcada `metadata.source = "onchain"` y
  `metadata.needsReview = true` hasta que se valide (ver §8 fases).

---

## 6. Pricing histórico en EUR

Cada operación se valora al **timestamp de su bloque**:
1. Precio del token en USD al ts (CoinGecko histórico / Birdeye histórico).
2. Conversión USD→EUR al ts (reutilizar [usd-eur.ts](../src/lib/fx/usd-eur.ts),
   ampliándolo a histórico vía Frankfurter `?date=`).
3. Se guarda en `spot_price` (cumple el CHECK `> 0`) y alimenta FIFO/`tax_lots`.

---

## 7. Sembrado del estado inicial (one-time)

Lo único que la captura por eventos NO resuelve: las posiciones **ya abiertas
hoy**. Tres opciones (no excluyentes):
- **A. Snapshot + confirmación:** leer estado actual on-chain, crear las
  posiciones con su valor actual y pedir al usuario que confirme/ajuste el precio
  de entrada (una vez).
- **B. Reconstrucción de histórico:** parsear toda la actividad pasada de la
  wallet + precios históricos. Más trabajo; mayor fidelidad fiscal.
- **C. Cost basis manual inicial:** el usuario fija el coste de cada posición
  existente una sola vez.

Recomendado: **A** para arrancar, **B** como mejora posterior por wallet.

---

## 8. Encaje fiscal (Modelo 100 / 721)

- Las filas on-chain entran en `transactions`; `categorize.ts`, `tax_lots` y
  `tax_events` ya producen la fiscalidad. **No hay motor nuevo.**
- `wallet_protocols` ya distingue `custodial`, `is_foreign`, `wallet_kind`,
  `country_code` → self-custody/DEX (`custodial=false`) es justo el caso on-chain.
- **Pendiente de verificar (apuntado en la auditoría):** que `categorize.ts`
  trate `lending_borrow` y su repago como **no sujetos**.
- Traspasos entre wallets propias → **no sujetos** (regla §5).

---

## 9. Seguridad y privacidad

- Solo direcciones públicas. Cero claves privadas / seed phrases / firmas.
- El endpoint de webhook **valida la firma** del proveedor (Helius/Alchemy) y
  hace rate-limit, igual que el resto de rutas.
- Las API keys de proveedores van en variables de entorno del servidor (nunca
  expuestas al cliente), como `SUPABASE_SERVICE_ROLE_KEY` hoy.
- Las addresses por portfolio se guardan asociadas al `portfolio_id` y respetan
  el control de acceso existente (`ensurePortfolioAccess`).

---

## 10. Roadmap incremental ("poco a poco")

| Fase | Entregable | Riesgo | Toca lo auditado |
|---|---|---|---|
| **0** | Modelo de datos: addresses por portfolio + tabla de eventos crudos on-chain | Bajo | No |
| **1** | **Panel "En vivo" read-only**: leer estado actual (Solana+EVM) y mostrarlo aparte | Bajo | No |
| **2** | Ingesta por webhooks + clasificador → filas `transactions` marcadas `needsReview` | Medio | Lectura sí, escritura aislada |
| **3** | Pricing histórico EUR + alimentar FIFO/`tax_events` | Medio | Sí (validar en paralelo) |
| **4** | Sembrado inicial de posiciones existentes (opción A) | Medio | Sí |
| **5** | Reconciliación por polling (cron) + alertas de "drift" | Bajo | No |
| **6** | Migración a fuente de verdad: jubilar lo manual cuando la captura demuestre que clasifica bien | Alto | Sí — **solo tras validación** |

Regla de oro: hasta la Fase 6, **on-chain corre en paralelo** a lo manual y se
**valida que cuadra** antes de sustituir nada. No hay big-bang.

---

## 11. Decisiones

- **D1.** Solana: ✅ **incluido desde el principio**. El portfolio `mfita` tiene
  dirección Solana (Kamino/Orca/Jupiter) además de la EVM → la Fase 1 usa **dos
  fuentes**: Zerion (EVM) + Jupiter Portfolio / SonarWatch (Solana).
- **D2.** EVM: ✅ **Zerion** para empezar (gratis, multichain por defecto,
  decodifica Aave/Pancake). DeBank queda como alternativa si falta cobertura.
- **D3.** ✅ **Una sola wallet (EVM + Solana), un solo portfolio** (`mfita`) para
  arrancar. Multi-wallet se diseña pero no se activa aún.
- **D4.** ✅ Cadenas EVM: **Ethereum, Arbitrum, Base, Polygon, BNB Chain**
  ("Binance") **+ Solana**.
- **D5.** Reglas de "wallet propia" para traspasos no sujetos: pendiente —
  empezaremos con **lista manual** de addresses del usuario.

> Nota: una "wallet" del usuario = en la práctica **una address EVM** (válida en
> las 5 cadenas EVM) **+ una address Solana**. El modelo de datos guarda N
> addresses por portfolio, cada una con su `chain_kind` (evm | solana).

---

## 12. Próximo paso concreto

**Fase 0 + 1**: añadir addresses al portfolio y construir el panel "En vivo"
read-only (un endpoint `/api/wallet/live` que consulta Jupiter Portfolio + Zerion
y muestra el estado actual, sin tocar la contabilidad). Es visible, de bajo
riesgo, y valida que las fuentes de datos dan lo que necesitamos antes de
construir la ingesta por eventos.
