# Fix definitivo: Auto-deploy GitHub -> Vercel

Problema observado: push a `main` no dispara deploy automático en producción.

## 1) Reconexión limpia del repo en Vercel

En `Vercel > Project > Settings > Git`:

1. `Disconnect` repositorio actual.
2. `Connect Git Repository` de nuevo:
   - repo: `cmolinillov-eng/portcodex`
   - production branch: `main`
3. Guardar.

## 2) Verificar permisos en GitHub

En GitHub repo `portcodex`:

- Settings > Integrations / Installed GitHub Apps.
- Confirmar que la app de Vercel tiene acceso a este repo.
- Si hay duda: reautorizar la app de Vercel para este repositorio.

## 3) Probar webhook end-to-end

Crear commit de prueba y push:

```bash
cd "/Users/carlosmolinillo/Desktop/PROGRAMACIÓN/Codex/Portfolio codex/web"
git commit --allow-empty -m "chore: webhook test vercel autodeploy"
git push origin main
```

Validación esperada en `Vercel > Deployments`:

- aparece un deploy nuevo (no redeploy manual del anterior)
- branch `main`
- commit igual al de GitHub
- estado `Ready`

## 4) Si sigue sin disparar

Plan B inmediato (sin bloquear operación):

```bash
npx vercel --prod --yes
```

Y abrir incidencia interna con evidencia:

- captura Deployments Vercel
- hash commit en GitHub
- hora exacta del push

## 5) Criterio de cierre

Se considera resuelto cuando dos pushes consecutivos a `main` generan dos deploys automáticos en Vercel con commit matching.
