# Deploy Runbook (GitHub + Vercel)

## 1) Bloque de entrada (go/no-go)

Debe estar en PASS:

```bash
npm run -s qa:prepush
```

Y en Supabase SQL Editor:

1. `phase13_integrity_and_audit.sql`
2. `phase14_security_hardening.sql`
3. `phase15_security_validation.sql`

Si algo falla, no desplegar.

## 2) Secrets requeridos

### GitHub Actions (`Settings > Secrets and variables > Actions`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERADMIN_USER_ID`
- `SUPERADMIN_EMAIL`
- `COINGECKO_API_KEY` (opcional recomendado)

### Vercel (`Project > Settings > Environment Variables`)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERADMIN_USER_ID`
- `SUPERADMIN_EMAIL`
- `NEXT_PUBLIC_APP_URL` (URL pública real del entorno)
- `COINGECKO_API_KEY` (opcional recomendado)
- `ENABLE_DEV_AUTH_FALLBACK=false`
- `DEV_VIEWER_USER_ID` vacío

## 3) Flujo de despliegue

1. Commit con Conventional Commit.
2. Push a rama de trabajo.
3. Abrir PR a `main`.
4. Esperar CI verde (`E2E QA Matrix`).
5. Merge.
6. Verificar deploy de Vercel.

## 4) Smoke test post-deploy (obligatorio)

Con un usuario de cada rol:

- `superadmin`: entra a `/admin`, ve usuarios, cambia rol de prueba.
- `gestor`: entra a `/manager`, abre portfolio asignado, crea operación en portfolio permitido.
- `cliente`: entra y confirma solo lectura (sin crear/borrar).
- `autonomo`: opera solo su portfolio.

APIs:

- `POST /api/transactions` respeta permisos.
- `POST /api/positions/delete` respeta permisos.
- `GET /api/transactions/export` bloquea portfolios ajenos.
- `POST /api/prices/refresh` funciona para roles con permiso.

## 5) Rotación de claves (operativa segura)

### A. `SUPABASE_SERVICE_ROLE_KEY`

1. Generar nueva key en Supabase.
2. Actualizarla primero en Vercel (Preview + Production).
3. Actualizarla en GitHub Actions secrets.
4. Redeploy.
5. Ejecutar smoke test completo.
6. Revocar key anterior en Supabase.

### B. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

1. Generar/reemplazar key en Supabase.
2. Actualizar en Vercel y GitHub Actions.
3. Redeploy.
4. Probar login + carga dashboard + export.
5. Revocar key antigua cuando validación termine.

### C. `COINGECKO_API_KEY`

1. Generar nueva key.
2. Actualizar en Vercel y GitHub.
3. Verificar `POST /api/prices/refresh`.
4. Confirmar actualización en `cached_prices`.
5. Revocar key anterior.

## 6) Rollback rápido

Si falla producción:

1. Revertir al deployment anterior en Vercel.
2. Restaurar secrets previos (si la causa es rotación).
3. Re-ejecutar smoke test.
4. Abrir incidente y bloquear merge hasta fix.
