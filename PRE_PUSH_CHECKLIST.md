# Pre-Push Checklist (Web)

## 1) Validación técnica local

Ejecuta en `/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web`:

```bash
npm run -s qa:prepush
```

Debe quedar todo en PASS:
- `lint`
- `test:e2e:roles`
- `test:e2e:financial`
- `test:e2e:exports`
- `test:e2e:exports:ui`

Si algo falla, no hagas push.

## 2) Revisión rápida de cambios

```bash
git status --short
git diff --stat
```

Confirma que no subes:
- `.env.local`
- claves/tokens
- archivos temporales no deseados

## 3) Commit limpio (Conventional Commits)

Ejemplo:

```bash
git add .
git commit -m "test: ampliar matriz e2e de roles y exportaciones"
```

## 4) Push a rama de trabajo

```bash
git push -u origin <tu-rama>
```

## 5) Antes de abrir PR (GitHub)

Verifica que en `Settings > Secrets and variables > Actions` estén definidos:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPERADMIN_USER_ID`
- `SUPERADMIN_EMAIL`
- `COINGECKO_API_KEY` (recomendado)

Sin esos secrets, el workflow de E2E no correrá.
