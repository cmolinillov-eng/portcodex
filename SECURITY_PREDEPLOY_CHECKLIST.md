# Security Predeploy Checklist (Web)

Checklist obligatorio antes de desplegar en GitHub/Vercel.

## 1) Variables de entorno (bloqueante)

Verifica en local y en Vercel que existan:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERADMIN_USER_ID`
- `SUPERADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `COINGECKO_API_KEY` (recomendado)

Y que en producción:

- `ENABLE_DEV_AUTH_FALLBACK=false`
- `DEV_VIEWER_USER_ID` vacío o no definido

## 2) Seguridad de base de datos (bloqueante)

En Supabase confirma:

- Ejecutar en orden:
  - `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase13_integrity_and_audit.sql`
  - `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase14_security_hardening.sql`
  - `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase15_security_validation.sql`
- RLS activo en `profiles`, `portfolios`, `transactions`, `cached_prices`.
- Políticas por rol correctamente aplicadas (cliente solo lectura, gestor solo portfolios asignados, autónomo solo propio portfolio).
- Usuario `service_role` solo en backend (nunca en frontend).

## 3) Validación técnica mínima (bloqueante)

Ejecuta en `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web`:

```bash
npm run -s lint
npm run -s test:math
npm run -s test:e2e:roles
```

Opcional fuerte antes de release:

```bash
npm run -s qa:prepush
```

## 4) Validación manual por roles (bloqueante)

Comprobar:

- `superadmin`: accede a `/admin`, cambia roles, asigna gestores.
- `gestor`: accede a `/manager`, opera solo portfolios asignados.
- `cliente`: solo lectura (bloqueado en operaciones y borrado).
- `autonomo`: opera solo su portfolio, sin acceso admin.

## 5) API y hardening (bloqueante)

Confirmar que:

- Endpoints mutables usan CSRF check.
- Endpoints críticos tienen rate limit activo.
- Headers de seguridad están activos (`CSP`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`, `CORP`, `HSTS` en prod).

## 6) Secretos y repositorio (bloqueante)

Verificar:

- `.env.local` no versionado (`.env*` en `.gitignore`).
- No hay claves en commits ni en código.
- No hay logs con tokens ni credenciales.

## 7) Riesgos conocidos (aceptación explícita)

Antes de producción, decidir:

- El rate limit actual es en memoria de proceso (válido para dev/single instance).  
  Para escalado real, migrar a store distribuido (Redis/Upstash).
