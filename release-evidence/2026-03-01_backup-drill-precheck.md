# Backup/Restore Drill - Precheck

Fecha: 2026-03-01
Entorno: Production (Supabase + Vercel)

## Objetivo
Validar procedimiento operativo de backup/restore sin ejecutar restore destructivo en producción.

## Estado
- Runbook disponible: BACKUP_RESTORE_RUNBOOK.md
- RPO objetivo: 24h
- RTO objetivo: 60 min
- Auto-deploy Git->Vercel: OK (ver commit 99e5a32 en Deployments)

## Siguiente acción planificada
Ejecutar drill completo en entorno aislado (staging/clone) y adjuntar:
- tiempos reales
- conteos post-restore
- smoke por roles
