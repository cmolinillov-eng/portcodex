# Monitorización Post-Release (48h)

Objetivo: detectar regresiones rápidas tras release y reaccionar sin ambigüedad.

## 1) Ventana y cadencia

- Ventana activa: primeras 48 horas tras release.
- Revisiones sugeridas:
  - 0h (inmediata)
  - 2h
  - 6h
  - 12h
  - 24h
  - 36h
  - 48h

## 2) Qué revisar en cada ronda

## A) Vercel (app)

- Deploy `Production` en `Ready`.
- Error rate y logs sin picos de 5xx.
- Endpoints sensibles sin errores repetidos:
  - `/api/auth/*`
  - `/api/transactions`
  - `/api/prices/refresh`

## B) Supabase Auth

- Errores de login/recover dentro de rango normal.
- Sin picos de rate-limit inesperados.

## C) Oráculo de precios

SQL 1: último estado HTTP del cron/oráculo

```sql
select id, status_code, error_msg, left(content::text, 300) as body, created
from net._http_response
order by created desc
limit 20;
```

Esperado: respuestas recientes con `status_code = 200` y `ok:true`.

SQL 2: precios stale (>45 min)

```sql
select token_symbol, price, last_updated
from public.cached_prices
where last_updated < now() - interval '45 minutes'
order by last_updated asc;
```

Esperado: `0 rows`.

## D) Salud funcional por rol

- `superadmin`: `/admin` operativo.
- `gestor`: `/manager` y portfolios asignados.
- `cliente`: solo lectura.
- `autonomo`: operaciones en su portfolio.

## 3) Umbrales de acción

Escalar inmediatamente si:

- 2 o más errores 5xx consecutivos en endpoint crítico.
- `cached_prices` stale >45 min en dos revisiones seguidas.
- fallos de login generalizados.
- cualquier acceso cruzado por rol no autorizado.

## 4) Respuesta rápida

1. Verificar último deploy y commit.
2. Revisar cambios de secrets recientes (Supabase/Vercel/GitHub).
3. Si impacto es alto: rollback en Vercel al deploy estable previo.
4. Abrir incidente con causa inicial y plan correctivo.

## 5) Evidencia mínima a guardar

- Captura de Vercel deploy `Ready`.
- Resultado de SQL stale = 0.
- Resultado de SQL HTTP responses con 200.
- Nota corta de smoke por roles.

Guardar en `release-evidence/` con fecha/hora.
