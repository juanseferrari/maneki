# Sistema de Multi-Currency con Conversión a USD

Este documento explica el sistema de conversión multi-currency implementado en Maneki.

## Descripción General

El sistema permite:
- Almacenar transacciones en su moneda original (ARS, USD, etc.)
- Conversión automática a USD usando tipos de cambio oficiales
- Caché de tipos de cambio para optimizar performance
- Procesamiento diario de transacciones pendientes
- Manejo graceful de errores (si falla la API, la transacción se guarda sin conversión)

## Arquitectura

### 1. Base de Datos

#### Tabla `exchange_rates`
Cache de tipos de cambio para evitar llamadas repetidas a la API.

```sql
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  currency_from VARCHAR(3) NOT NULL,
  currency_to VARCHAR(3) DEFAULT 'USD',
  rate DECIMAL(10, 6) NOT NULL,
  source VARCHAR(100) DEFAULT 'dolarapi.com',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (date, currency_from, currency_to)
);
```

#### Tabla `transactions` - Nuevas columnas
```sql
ALTER TABLE transactions
  ADD COLUMN currency VARCHAR(3) DEFAULT 'ARS',
  ADD COLUMN amount_usd DECIMAL(15, 2),
  ADD COLUMN exchange_rate DECIMAL(10, 6),
  ADD COLUMN exchange_rate_date DATE;
```

**Campos:**
- `currency`: Moneda original de la transacción (ARS, USD, EUR, etc.)
- `amount_usd`: Monto convertido a USD
- `exchange_rate`: Tipo de cambio usado para la conversión
- `exchange_rate_date`: Fecha del tipo de cambio

### 2. ExchangeRateService

Servicio central que maneja todas las conversiones y consultas de tipos de cambio.

**Ubicación:** `services/exchange-rate.service.js`

#### Métodos principales:

##### `getExchangeRate(currencyFrom, date, currencyTo = 'USD')`
Obtiene el tipo de cambio para una fecha específica. Primero consulta la caché, luego la API si es necesario.

```javascript
const rate = await exchangeRateService.getExchangeRate('ARS', '2025-01-28', 'USD');
// Returns: { rate: 1050.5, date: '2025-01-28', source: 'dolarapi.com' }
```

##### `convertToUSD(amount, currency, date)`
Convierte un monto a USD.

```javascript
const conversion = await exchangeRateService.convertToUSD(100000, 'ARS', new Date());
// Returns: { amountUsd: 95.24, exchangeRate: 1050.5, exchangeRateDate: '2025-01-28' }
```

**Manejo de errores:** Si la conversión falla, retorna `null` para permitir que la transacción se guarde sin conversión.

##### `processUnconvertedTransactions(userId = null)`
Procesa transacciones que no tienen conversión a USD.

```javascript
const result = await exchangeRateService.processUnconvertedTransactions();
// Returns: { processed: 150, failed: 5 }
```

##### `processDailyCron()`
Job diario que:
1. Obtiene y cachea el tipo de cambio del día
2. Procesa todas las transacciones pendientes de conversión

### 3. Integración en el Flujo de Transacciones

La conversión se integró en `supabaseService.saveTransactions()`:

```javascript
// 1. Deduplicación
// 2. Auto-categorización
// 3. Conversión a USD ⭐ NUEVO
// 4. Inserción en DB
```

**Flujo:**
```javascript
const transactionsWithUSD = await Promise.all(
  transactions.map(async (t) => {
    const currency = t.currency || 'ARS';
    const conversion = await exchangeRateService.convertToUSD(
      t.amount,
      currency,
      t.transaction_date
    );

    return {
      ...t,
      amount_usd: conversion?.amountUsd || null,
      exchange_rate: conversion?.exchangeRate || null,
      exchange_rate_date: conversion?.exchangeRateDate || null
    };
  })
);
```

### 4. Cron Job Diario

**Ubicación:** `server.js` y `server-dev.js`

**Schedule:** Todos los días a las 2:00 AM

```javascript
cron.schedule('0 2 * * *', async () => {
  const result = await supabaseService.exchangeRateService.processDailyCron();
  console.log(`Processed ${result.processed} transactions, ${result.failed} failed`);
});
```

**Qué hace:**
1. Consulta DolarAPI.com para el tipo de cambio oficial del día
2. Cachea el resultado en `exchange_rates`
3. Busca transacciones con `amount_usd = NULL` y `currency != NULL`
4. Intenta convertir cada transacción
5. Actualiza las transacciones con la conversión exitosa

## API Externa: DolarAPI.com

**Endpoint:** `https://dolarapi.com/v1/dolares/oficial`

**Respuesta:**
```json
{
  "moneda": "USD",
  "casa": "oficial",
  "nombre": "Oficial",
  "compra": 1045.00,
  "venta": 1050.50,
  "fechaActualizacion": "2025-01-28T10:00:00.000Z"
}
```

**Usamos:** El valor `venta` (sell rate) para las conversiones.

**Limitaciones:**
- No provee datos históricos
- Puede tener downtime
- Rate limiting desconocido

**Por eso:**
- Cacheamos los rates
- Tenemos manejo de errores graceful
- Job diario para retry automático

## Flujo de Datos

### Escenario 1: Nueva Transacción con Conversión Exitosa

```
1. Usuario sube archivo CSV/PDF
2. Processor extrae transacciones
3. saveTransactions() procesa cada transacción:
   a. Detecta currency = 'ARS'
   b. Llama exchangeRateService.convertToUSD(amount, 'ARS', date)
   c. Service consulta cache → no existe
   d. Service llama a DolarAPI.com → rate = 1050.5
   e. Service cachea rate en exchange_rates
   f. Service calcula: amountUsd = amount / 1050.5
   g. Retorna { amountUsd, exchangeRate, exchangeRateDate }
4. Transacción se guarda con todos los campos USD completos
```

### Escenario 2: Nueva Transacción con API Failure

```
1. Usuario sube archivo
2. Processor extrae transacciones
3. saveTransactions() procesa cada transacción:
   a. Detecta currency = 'ARS'
   b. Llama exchangeRateService.convertToUSD(amount, 'ARS', date)
   c. Service consulta cache → no existe
   d. Service llama a DolarAPI.com → ❌ ERROR (timeout/500/etc)
   e. Service retorna null
4. Transacción se guarda con:
   - currency = 'ARS' ✅
   - amount = valor original ✅
   - amount_usd = NULL ⏳
   - exchange_rate = NULL
   - exchange_rate_date = NULL
5. Cron job diario intentará convertir esta transacción más tarde
```

### Escenario 3: Cron Job Diario

```
1. 2:00 AM - Cron job se ejecuta
2. Obtiene tipo de cambio del día de DolarAPI.com
3. Cachea en exchange_rates
4. Query: SELECT * FROM transactions WHERE amount_usd IS NULL AND currency IS NOT NULL
5. Por cada transacción pendiente:
   a. Intenta conversión usando rate cacheado
   b. Si exitoso: UPDATE transactions SET amount_usd, exchange_rate, exchange_rate_date
   c. Si falla: log error, continúa con siguiente
6. Retorna stats: { processed: X, failed: Y }
```

## Consideraciones Futuras

### Agregar más monedas

El sistema está diseñado para soportar múltiples monedas:

```javascript
// Ya funciona para USD
if (currency === 'USD') {
  return { amountUsd: amount, exchangeRate: 1.0, ... };
}

// Para agregar EUR, BRL, etc:
// 1. Agregar API endpoint para cada moneda
// 2. Modificar fetchAndCacheRate() para soportar múltiples sources
// 3. UI: agregar selector de moneda
```

### Datos Históricos

Actualmente no convertimos transacciones históricas. Para hacerlo:

1. Encontrar API con datos históricos (ej: exchangerate-api.com)
2. Crear script de backfill:
   ```javascript
   // scripts/backfill-historical-rates.js
   for (let date = '2024-01-01'; date <= today; date++) {
     const rate = await getHistoricalRate('ARS', 'USD', date);
     await cacheRate('ARS', 'USD', date, rate);
   }
   ```
3. Ejecutar `processUnconvertedTransactions()` después del backfill

### Performance

**Optimizaciones actuales:**
- Cache de rates (evita llamadas repetidas a API)
- Batch processing en cron job (50 transacciones por vez)
- Índices en DB:
  - `idx_transactions_currency` para filtrar por moneda
  - `idx_transactions_usd_conversion` para encontrar pendientes
  - `idx_exchange_rates_date_currency` para lookups de rates

**Si escala:**
- Implementar Redis para cache de rates
- Rate limiting más agresivo
- Background workers para procesamiento async

## Testing

### Test Manual

1. **Crear transacción en ARS:**
   ```bash
   # Subir archivo CSV con transacciones en ARS
   # Verificar en DB:
   SELECT currency, amount, amount_usd, exchange_rate
   FROM transactions
   WHERE id = 'xxx';
   ```

2. **Simular API failure:**
   ```javascript
   // En exchange-rate.service.js, temporalmente:
   async fetchAndCacheRate() {
     throw new Error('API down');
   }
   ```
   - Subir transacciones → deben guardarse sin amount_usd
   - Revertir cambio
   - Ejecutar cron manualmente → deben procesarse

3. **Test cron job:**
   ```javascript
   // En server.js o via node REPL:
   const result = await supabaseService.exchangeRateService.processDailyCron();
   console.log(result);
   ```

### Test de Integración

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar migraciones en Supabase SQL Editor
node scripts/run-migrations.js

# 3. Iniciar servidor dev
npm run dev

# 4. Subir archivo de prueba
# 5. Verificar logs:
#    - [Supabase] Converting X transactions to USD...
#    - [Supabase] Successfully converted X/Y transactions to USD

# 6. Verificar en DB que amount_usd está poblado
```

## Troubleshooting

### Transacciones no se están convirtiendo

**Check 1:** ¿Existe la columna `currency` en transactions?
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'currency';
```

**Check 2:** ¿La API está respondiendo?
```bash
curl https://dolarapi.com/v1/dolares/oficial
```

**Check 3:** ¿El cron está corriendo?
```bash
# Ver logs del servidor
heroku logs --tail --app maneki | grep CRON
```

**Check 4:** ¿Hay transacciones pendientes?
```sql
SELECT COUNT(*) FROM transactions
WHERE amount_usd IS NULL AND currency IS NOT NULL;
```

### Cron job falla

**Error:** `exchangeRateService is not defined`
- Verificar que ExchangeRateService está inicializado en el constructor de SupabaseService

**Error:** `Failed to fetch exchange rate`
- API de DolarAPI.com puede estar caída
- Verificar conectividad de red
- Check rate limits

### Rates incorrectos

**Problema:** Los USD amounts no parecen correctos

1. Verificar qué rate se usó:
   ```sql
   SELECT exchange_rate, exchange_rate_date
   FROM transactions WHERE id = 'xxx';
   ```

2. Comparar con rate oficial del día:
   ```sql
   SELECT rate, date FROM exchange_rates
   WHERE currency_from = 'ARS'
   ORDER BY date DESC LIMIT 5;
   ```

3. Si el rate está mal, actualizar manualmente:
   ```sql
   UPDATE exchange_rates
   SET rate = 1050.5
   WHERE date = '2025-01-28' AND currency_from = 'ARS';

   -- Reprocessar transacciones de ese día
   UPDATE transactions
   SET amount_usd = amount / 1050.5,
       exchange_rate = 1050.5
   WHERE DATE(transaction_date) = '2025-01-28'
     AND currency = 'ARS';
   ```

## Deployment Checklist

Antes de deployar a producción:

- [ ] Ejecutar migraciones SQL en Supabase producción
- [ ] Verificar que `SUPABASE_SERVICE_ROLE_KEY` está configurado en Heroku
- [ ] Instalar `npm install` para agregar node-cron
- [ ] Deploy a Heroku
- [ ] Verificar logs de inicio:
  - `[CRON] Daily exchange rate job scheduled: 2:00 AM every day`
- [ ] Test manual: subir archivo y verificar conversión
- [ ] Monitorear logs por 24h para verificar que cron corre

## Logs Importantes

```bash
# Conversión durante upload
[Supabase] Converting 50 transactions to USD...
[Supabase] Successfully converted 48/50 transactions to USD

# Cron job
[CRON] Starting daily exchange rate update job...
===== Starting daily exchange rate cron job =====
Fetching rate for 2025-01-28...
✓ Today's rate cached successfully
Processing unconverted transactions...
Found 15 transactions to convert
✓ Processed 15 transactions (0 failed)
===== Daily cron job completed in 2.34s =====
[CRON] Daily exchange rate job completed: 15 transactions processed, 0 failed

# Errores
Error converting 100000 ARS to USD: Failed to fetch exchange rate: timeout
[Supabase] Successfully converted 47/50 transactions to USD  ← 3 fallaron
```

## Resumen

El sistema de multi-currency está diseñado para:
- ✅ Ser **escalable** (soporta múltiples monedas, fácil agregar más)
- ✅ Ser **resiliente** (maneja errores de API gracefully)
- ✅ Ser **performante** (cache, índices, batch processing)
- ✅ **No perder datos** (si falla conversión, se guarda igual)
- ✅ Ser **automático** (cron job diario procesa pendientes)

Para cualquier duda, revisar:
- `services/exchange-rate.service.js` - Lógica central
- `services/supabase.service.js` - Integración en saveTransactions
- `server.js` / `server-dev.js` - Configuración de cron
- `scripts/sql/*.sql` - Migraciones de DB
