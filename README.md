# Crypto Portfolio Tracker (Web)

Aplicación Next.js para gestión manual de portfolios cripto con backend en Supabase, control multi-rol y cálculo financiero (ROI, Lending HF, LP/IL, exportaciones).

## Requisitos

- Node.js 20+
- npm 10+
- Proyecto Supabase activo

## Variables de entorno

Crea `.env.local` desde `.env.local.example` y completa:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERADMIN_USER_ID`
- `SUPERADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `COINGECKO_API_KEY` (recomendado)
- `ENABLE_DEV_AUTH_FALLBACK=false` en producción
- `DEV_VIEWER_USER_ID` vacío en producción

## Desarrollo local

```bash
npm ci
npm run dev
```

App local:
- [http://localhost:3000](http://localhost:3000)

## Comandos de validación

```bash
npm run -s lint
npm run -s test:math
npm run -s test:e2e:roles
npm run -s test:e2e:financial
npm run -s test:e2e:exports
npm run -s test:e2e:exports:ui
```

Suite completa pre-push:

```bash
npm run -s qa:prepush
```

## Seguridad y SQL

Antes de desplegar, ejecutar en Supabase SQL Editor:

1. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase13_integrity_and_audit.sql`
2. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase14_security_hardening.sql`
3. `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/supabase/sql/phase15_security_validation.sql`

Checklists:
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/PRE_PUSH_CHECKLIST.md`
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/SECURITY_PREDEPLOY_CHECKLIST.md`

Runbook de despliegue/rotación:
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/DEPLOY_RUNBOOK.md`

Operación post-release:
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/BACKUP_RESTORE_RUNBOOK.md`
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/POST_RELEASE_MONITORING_48H.md`
- `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web/VERCEL_GIT_AUTODEPLOY_FIX.md`
