# Runbook de Backup y Restore (Producción)

Objetivo: poder recuperar la operación sin improvisación.

## 1) Objetivos operativos

- `RPO`: 24 horas (pérdida máxima de datos aceptable).
- `RTO`: 60 minutos (tiempo máximo para volver operativo).

## 2) Alcance

- Base de datos principal en Supabase (`public` + `auth` relacionadas con operación).
- No incluye archivos locales del navegador ni cachés efímeros.

## 3) Estrategia de backup

Usar **dos capas**:

1. Backup gestionado del proveedor (si tu plan lo soporta).
2. Export lógico periódico (SQL dump) como copia adicional.

## 4) Frecuencia

- Backup completo lógico: diario.
- Retención mínima recomendada: 14 días.
- Snapshot de release: en cada tag de versión.

## 5) Procedimiento de backup lógico (manual)

Prerequisitos:

- `DATABASE_URL` de Supabase (solo uso backend seguro).
- `pg_dump` disponible en la máquina operativa.

Comando ejemplo:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "backup_$(date +%Y%m%d_%H%M%S).dump"
```

Validación rápida:

```bash
pg_restore -l "backup_YYYYMMDD_HHMMSS.dump" | head
```

## 6) Procedimiento de restauración (drill)

1. Crear entorno objetivo de restauración (nunca sobre producción en caliente).
2. Restaurar backup:

```bash
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$RESTORE_DATABASE_URL" \
  "backup_YYYYMMDD_HHMMSS.dump"
```

3. Ejecutar validaciones:

- Conteos clave (`profiles`, `portfolios`, `transactions`, `cached_prices`).
- Consultas críticas de dashboard.
- Login + lectura por rol.

4. Documentar:

- Hora inicio/fin restore.
- Resultado PASS/FAIL.
- Brechas vs RPO/RTO.

## 7) Validación de integridad post-restore

SQL recomendado:

```sql
select
  (select count(*) from public.profiles) as profiles_count,
  (select count(*) from public.portfolios) as portfolios_count,
  (select count(*) from public.transactions) as transactions_count,
  (select count(*) from public.cached_prices) as cached_prices_count;
```

```sql
select token_symbol, price, last_updated
from public.cached_prices
order by last_updated desc
limit 20;
```

## 8) Checklist de cierre del drill

- [ ] Restore completado en entorno aislado.
- [ ] Conteos esperados validados.
- [ ] Login por rol validado (`superadmin`, `gestor`, `cliente`, `autonomo`).
- [ ] Dashboard carga y exportes funcionan.
- [ ] Tiempo total de recuperación documentado.
- [ ] Evidencia guardada en `release-evidence/`.

## 9) Riesgos conocidos

- Errores de credenciales/rotación no sincronizada.
- Restore sobre entorno equivocado.
- Falta de prueba de restauración periódica.

Mitigación: ejecutar un drill mensual y registrar evidencia.
