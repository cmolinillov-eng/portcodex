# Release Gate Checklist (Pre‑Deploy)

Checklist operativo final antes de subir a GitHub y desplegar en Vercel.
Formato de prioridad:
- `P0` Bloqueante (sin esto, no se despliega)
- `P1` Alta (debe quedar cerrado en la misma ventana de release)
- `P2` Recomendado (no bloquea, pero conviene cerrar)

## 1) Seguridad y secretos (`P0`)

- [ ] Rotar claves usadas durante pruebas.
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `COINGECKO_API_KEY`

- [ ] Verificar variables en Vercel (Production):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPERADMIN_USER_ID`
  - `SUPERADMIN_EMAIL`
  - `NEXT_PUBLIC_APP_URL`
  - `COINGECKO_API_KEY` (si aplica)
  - `ENABLE_DEV_AUTH_FALLBACK=false`
  - `DEV_VIEWER_USER_ID` vacío/no definido

- [ ] Verificar variables en GitHub Actions (si habrá CI en PR):
  - mismas secret keys necesarias para workflows

## 2) Base de datos y RLS (`P0`)

- [ ] Ejecutar en Supabase SQL Editor, en este orden:
  1. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase13_integrity_and_audit.sql`
  2. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase14_security_hardening.sql`
  3. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase15_security_validation.sql`

- [ ] Confirmar `Success` en validación fase 15 (sin exceptions).

## 3) Calidad técnica local (`P0`)

Ejecutar en `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web`:

```bash
npm run -s lint
npm run -s test:math
npm run -s qa:prepush
```

Criterio de aprobación:
- [ ] Todos en PASS
- [ ] Sin errores TS/ESLint
- [ ] Matriz e2e sin fallos (roles, financial, exports, exports UI)

## 4) Autenticación y cuentas (`P0`)

- [ ] `Login` correcto por email/usuario.
- [ ] `Registro` crea usuario con rol inicial `autonomo`.
- [ ] `Recuperación` envía enlace y permite reset.
- [ ] `Logout` invalida sesión/cookies correctamente.

## 5) Matriz de permisos por rol (`P0`)

- [ ] `superadmin`
  - entra a `/admin`
  - cambia roles
  - asigna/desasigna portfolios a gestores

- [ ] `gestor`
  - entra a `/manager`
  - solo ve y opera portfolios asignados
  - no puede operar fuera de asignación

- [ ] `cliente`
  - solo lectura
  - no crea, no edita, no borra

- [ ] `autonomo`
  - solo su portfolio
  - no acceso a panel admin/manager

## 6) Endpoints críticos y hardening (`P1`)

- [ ] Endpoints mutables con CSRF check.
- [ ] Endpoints sensibles con rate limit.
- [ ] `service_role` solo en backend.
- [ ] Headers de seguridad activos en runtime:
  - CSP
  - X-Frame-Options
  - X-Content-Type-Options
  - Referrer-Policy
  - Permissions-Policy
  - COOP/CORP
  - HSTS en prod

## 7) Dependencias y supply chain (`P1`)

```bash
npm audit --audit-level=high
npm outdated
```

- [ ] Sin vulnerabilidades `high/critical` sin plan.
- [ ] Si hay excepciones: documentadas con mitigación y fecha.

## 8) Observabilidad y continuidad (`P1`)

- [ ] Logging de errores activo.
- [ ] Alertas básicas (auth/API/precios).
- [ ] Backup/restore validados.
- [ ] Definidos RPO/RTO.

## 9) Limpieza de release (`P1`)

- [ ] Eliminar usuarios y portfolios de prueba.
- [ ] Confirmar que no hay secretos en git:
  - `.env.local` no versionado
  - sin keys embebidas en código

## 10) Go/No-Go final (`P0`)

Deploy permitido solo si:
- [ ] Todos los `P0` completados.
- [ ] No hay bloqueantes abiertos.
- [ ] Se completó evidencia en: `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/release-evidence/TEMPLATE.md`

---

## Comando rápido sugerido (local)

```bash
cd /Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio\ codex/web
npm run -s lint && npm run -s test:math && npm run -s qa:prepush
```
