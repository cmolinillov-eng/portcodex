# Release Evidence Template

- Proyecto:
- Fecha:
- Responsable:
- Commit SHA:
- Entorno objetivo: `Vercel Preview` / `Vercel Production`

## 1) Seguridad y secretos (`P0`)

- Rotación de claves realizada: `Sí/No`
- Fecha/hora rotación:
- Claves rotadas:
  - `SUPABASE_SERVICE_ROLE_KEY`: `Sí/No`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: `Sí/No`
  - `COINGECKO_API_KEY`: `Sí/No`

## 2) SQL y RLS (`P0`)

- `phase13_integrity_and_audit.sql`: `PASS/FAIL`
- `phase14_security_hardening.sql`: `PASS/FAIL`
- `phase15_security_validation.sql`: `PASS/FAIL`
- Evidencia (captura/enlace):

## 3) Calidad técnica (`P0`)

- `npm run -s lint`: `PASS/FAIL`
- `npm run -s test:math`: `PASS/FAIL`
- `npm run -s qa:prepush`: `PASS/FAIL`
- Evidencia (salida resumida):

## 4) QA por rol (`P0`)

- `superadmin`: `PASS/FAIL`
- `gestor`: `PASS/FAIL`
- `cliente`: `PASS/FAIL`
- `autonomo`: `PASS/FAIL`
- Notas:

## 5) Auth flows (`P0`)

- Login: `PASS/FAIL`
- Registro: `PASS/FAIL`
- Recuperación contraseña: `PASS/FAIL`
- Logout: `PASS/FAIL`

## 6) Endpoints críticos (`P1`)

- CSRF verificado: `Sí/No`
- Rate limit verificado: `Sí/No`
- service_role solo backend: `Sí/No`

## 7) Dependencias (`P1`)

- `npm audit --audit-level=high`: `PASS/FAIL`
- `npm outdated`: `OK/Revisar`
- Excepciones abiertas:

## 8) Observabilidad y backups (`P1`)

- Alertas activas: `Sí/No`
- Backup/restore validado: `Sí/No`
- RPO/RTO definidos: `Sí/No`

## 9) Go / No-Go

- Estado final: `GO` / `NO-GO`
- Bloqueantes abiertos:
- Acciones pendientes:
