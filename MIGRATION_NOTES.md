# Migration: transaction_date to transaction_datetime

## Resumen
Cambiamos de guardar solo la fecha (DATE) a guardar fecha y hora (TIMESTAMPTZ) para las transacciones.

## Cambios en Base de Datos

### 1. Migración SQL
Ejecutar: `db/migrations/006-change-transaction-date-to-timestamp.sql`

Esta migración:
- Agrega nueva columna `transaction_datetime` (TIMESTAMPTZ)
- Migra datos existentes de `transaction_date` a `transaction_datetime` (como midnight UTC)
- Mantiene `transaction_date` por compatibilidad (será deprecated en el futuro)
- Crea índice en `transaction_datetime`

### 2. Servicios Actualizados

#### Servicios de Sync (APIs con timestamps precisos)
- ✅ `services/sync/mercadopago-sync.service.js` - Guarda timestamp completo de `date_created`
- ✅ `services/sync/mercury-sync.service.js` - Guarda timestamp completo de `postedAt`
- ✅ `services/eubanks-sync.service.js` - Usa fecha + noon UTC (APIs bancarias solo dan fecha)

#### Extractor de Archivos (PDFs/CSVs)
- ✅ `services/extractor.service.js` - Genera timestamps con noon UTC por defecto

### 3. Frontend
- ✅ `public/js/upload-supabase.js` - Nueva función `formatDateTime()` que muestra hora para transacciones de APIs

## Ordenamiento

### Antes
```javascript
.order('transaction_date', { ascending: false })
```

### Ahora (PENDIENTE - actualizar manualmente)
```javascript
.order('transaction_datetime', { ascending: false })
```

### Archivos que necesitan actualización de ORDER BY:
1. `server-supabase.js` (4 ocurrencias en líneas 291, 452, 559, 743)
2. `services/supabase.service.js`
3. `services/recurring-services.service.js`
4. `services/sync/mercadopago-sync.service.js`
5. `services/sync/mercury-sync.service.js`

### Función SQL actualizada
La función `get_file_transactions_for_review` ya usa:
```sql
ORDER BY t.date DESC, t.created_at DESC
```
Debería cambiarse a:
```sql
ORDER BY t.transaction_datetime DESC
```

## Compatibilidad

### Durante la transición
- Ambas columnas existen (`transaction_date` y `transaction_datetime`)
- Frontend puede leer ambas
- Nuevas transacciones usan `transaction_datetime`
- Consultas antiguas con `transaction_date` siguen funcionando

### En el futuro (después de validar)
- Eliminar `transaction_date` completamente
- Renombrar referencias en código

## Testing

### En local (antes de deploy):
1. Ejecutar migración en Supabase local/staging
2. Importar transacciones de Mercado Pago (verificar timestamp)
3. Subir archivo CSV (verificar noon UTC)
4. Verificar ordenamiento correcto en frontend
5. Verificar que se muestra hora para transacciones de APIs

### En producción:
1. Ejecutar migración
2. Monitorear logs de errores
3. Verificar que nuevas transacciones tengan ambos campos
4. Actualizar ORDER BY una vez confirmado que funciona

## Notas Importantes

- **Mercado Pago**: Ahora guarda hora exacta de `date_created`
- **Mercury**: Ahora guarda hora exacta de `postedAt` o `createdAt`
- **Enable Banking**: Solo provee fecha, usa noon UTC como default
- **Archivos (PDF/CSV)**: Solo tienen fecha, usa noon UTC como default

Esto permite ordenamiento más preciso especialmente para:
- Múltiples transacciones del mismo día
- Transacciones de APIs que ocurren a diferentes horas
- Sincronizaciones incrementales basadas en timestamp exacto
