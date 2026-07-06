# Backup de harvests de mfita (antes de reiniciar el portfolio)

> Extraído el 2026-07-06 del portfolio mfita (`e6d39b43-89fa-446b-bda6-eabafb9424e3`)
> antes de vaciarlo para empezar de cero solo con on-chain. Es el único dato
> que se conserva: el resto de la contabilidad de mfita era data de pruebas.
>
> **Total cobrado en harvests: 352,54 USD** (12 registros).

## Detalle por fecha

| Fecha | Cantidad | Token | Precio | USD | Protocolo |
|-------|---------:|-------|-------:|----:|-----------|
| 2026-04-11 | 8,561858 | USDC | 1,00 | 8,56 | Pancakeswap |
| 2026-04-11 | 32,907141 | USDC | 1,00 | 32,90 | ORCA |
| 2026-04-11 | 14,543156 | USDC | 1,00 | 14,54 | Kamino |
| 2026-04-18 | 3,000432 | USDC | 1,00 | 3,00 | Kamino |
| 2026-04-19 | 53,007633 | USDC | 1,00 | 53,00 | ProjectX |
| 2026-04-24 | 16,003009 | USDC | 1,00 | 16,00 | ProjectX |
| 2026-04-24 | 3,000564 | USDC | 1,00 | 3,00 | Kamino |
| 2026-05-24 | 50,009602 | USDC | 1,00 | 50,00 | ProjectX |
| 2026-05-24 | 17,003265 | USDC | 1,00 | 17,00 | Kamino |
| 2026-06-01 | 12,004406 | USDC | 1,00 | 12,00 | ProjectX |
| 2026-07-04 | 0,859541 | SOL | 81,42 | 69,98 | ORCA |
| 2026-07-04 | 72,570737 | USDC | 1,00 | 72,56 | ORCA |

## Total por protocolo

| Protocolo | USD |
|-----------|----:|
| ORCA | 175,44 |
| ProjectX | 131,00 |
| Kamino | 37,54 |
| Pancakeswap | 8,56 |
| **TOTAL** | **352,54** |

## Nota sobre posible doble conteo (revisar antes de re-registrar)

Los 3 harvests manuales de SOL/USDC en ORCA de abril–junio (24-may 66 $ y 1-jun 22 $
NO figuran aquí como ORCA sino que había apuntes manuales) podrían solaparse con
el COLLECT_FEES real del 4-jul. Al re-registrar en el portfolio nuevo, si vas a
meter solo los harvests **reales cobrados on-chain**, verifica que no cuentas dos
veces las fees de ORCA acumuladas. (Ver memoria: doble conteo harvests SOL/USDC.)
