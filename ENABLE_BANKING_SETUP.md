# Enable Banking (EU Banks) - Setup & Testing Guide

**Status**: ✅ Implementación completa
**Deploy**: v148 en producción
**Fecha**: 2026-02-08

---

## 📋 Resumen

Sistema completo para conectar bancos europeos y sincronizar transacciones de los últimos 3 meses automáticamente. Soporta múltiples cuentas en una sola conexión.

---

## 🔧 Configuración Inicial

### 1. Variables de Entorno

Asegurate de tener estas variables configuradas en `.env` y en Heroku:

```bash
# Enable Banking Configuration
EUBANKS_APP_ID=your_app_id_from_enable_banking
EUBANKS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYourPrivateKeyHere\n-----END PRIVATE KEY-----
EUBANKS_ENV=production  # o 'sandbox' para testing

# Callback URL (ya configurado)
BASE_URL=https://maneki-36d85d517656.herokuapp.com
```

**Importante**:
- El `EUBANKS_APP_ID` lo obtenés de tu cuenta de Enable Banking
- El `EUBANKS_PRIVATE_KEY` debe estar en formato de una línea con `\n` para los saltos de línea
- Alternativamente, podés usar `EUBANKS_PRIVATE_KEY_PATH` apuntando a un archivo `.pem` (solo local)

### 2. Configurar Callback en Enable Banking Dashboard

1. Andá a tu dashboard de Enable Banking
2. Configurá la Redirect URI: `https://maneki-36d85d517656.herokuapp.com/oauth/eubanks/callback`
3. Asegurate que tu aplicación tenga permisos para:
   - `accounts` (balances, details, transactions)
   - 90 días de histórico

---

## 🏦 Flujo de Conexión

### Paso 1: Conectar Banco

1. Andá a **Configuración** en tu app
2. Buscá la tarjeta "Bancos Europeos"
3. Click en **"Conectar Banco"**

### Paso 2: Seleccionar País y Banco

El modal te va a mostrar:

**Países disponibles** (27):
- Finlandia, Suecia, Noruega, Dinamarca
- Alemania, Reino Unido, Francia, España, Italia
- Países Bajos, Bélgica, Austria, Polonia, Portugal
- Irlanda, República Checa, Suiza, Grecia
- Hungría, Rumania, Bulgaria, Croacia
- Eslovenia, Eslovaquia, Lituania, Letonia, Estonia

**Flujo**:
1. Seleccionás tu país
2. Se cargan los bancos disponibles para ese país
3. Seleccionás tu banco
4. Click en "Conectar"

### Paso 3: Autorización en el Banco

1. Te redirige a la página de tu banco
2. Iniciás sesión con tus credenciales bancarias
3. Autorizás el acceso a Maneki
4. El banco te redirige de vuelta a Maneki

### Paso 4: Confirmación

- La conexión se guarda automáticamente
- Se muestran los botones "Sincronizar" y "Desconectar"
- Podés ver la info de tu conexión (banco, país, última sincronización)

---

## 🔄 Sincronización de Transacciones

### Sincronización Manual

1. En **Configuración**, buscá tu banco conectado
2. Click en **"Sincronizar"**
3. El sistema va a:
   - Obtener todas tus cuentas conectadas
   - Traer transacciones de los últimos 3 meses
   - Eliminar duplicados automáticamente
   - Mostrar resumen del resultado

**Resultado típico**:
```
✅ Sincronización Exitosa

Transacciones sincronizadas:
- Total: 150
- Nuevas: 145
- Duplicadas: 5
- Cuentas: 2

Período: 2025-11-08 a 2026-02-08
```

### Datos Sincronizados

Para cada transacción se guarda:

**Información básica**:
- Fecha de transacción (booking_date)
- Descripción
- Monto y moneda
- Tipo (ingreso/egreso)

**Información de cuenta**:
- ID de cuenta (UID)
- Nombre de cuenta o IBAN
- Banco asociado

**Contrapartes**:
- Nombre del acreedor/deudor
- IBAN de la contraparte

**Metadata adicional**:
- Fecha de valor (value_date)
- Códigos de transacción bancaria
- Información completa de acreedor/deudor

---

## 🧪 Testing - Flujo Completo

### Pre-requisitos

1. ✅ Migraciones de base de datos corridas
2. ✅ Variables de entorno configuradas
3. ✅ App deployeada en Heroku (v148)
4. ✅ Cuenta de Enable Banking configurada

### Test 1: Conexión de Banco

**Objetivo**: Verificar que se puede conectar un banco europeo

**Pasos**:
1. Andá a https://maneki-36d85d517656.herokuapp.com
2. Iniciá sesión con tu cuenta
3. Andá a **Configuración**
4. Click en **"Conectar Banco"** en la tarjeta "Bancos Europeos"
5. Seleccioná un país (ej: España)
6. Seleccioná un banco de la lista
7. Click en **"Conectar"**
8. Completá la autenticación en el banco

**Resultado esperado**:
- ✅ Redirección al banco exitosa
- ✅ Callback funciona correctamente
- ✅ Conexión guardada en base de datos
- ✅ Botones "Sincronizar" y "Desconectar" visibles
- ✅ Mensaje de éxito mostrado

**Verificación en base de datos**:
```sql
SELECT * FROM connections WHERE provider = 'eubanks' AND user_id = 'tu-user-id';
```

### Test 2: Primera Sincronización

**Objetivo**: Verificar que se pueden traer transacciones

**Pasos**:
1. Con el banco ya conectado, click en **"Sincronizar"**
2. Esperá a que termine el proceso (puede tardar 10-30 segundos)
3. Revisá el modal con los resultados

**Resultado esperado**:
- ✅ Modal muestra cantidad de transacciones sincronizadas
- ✅ Muestra cuántas son nuevas vs duplicadas
- ✅ Lista las cuentas procesadas
- ✅ Muestra el rango de fechas (últimos 3 meses)

**Verificación en base de datos**:
```sql
-- Ver transacciones sincronizadas
SELECT
  id,
  date,
  description,
  amount,
  type,
  account_name,
  source
FROM transactions
WHERE user_id = 'tu-user-id'
  AND source = 'enable_banking'
ORDER BY date DESC
LIMIT 20;

-- Ver log de sincronización
SELECT * FROM sync_logs
WHERE user_id = 'tu-user-id'
ORDER BY created_at DESC
LIMIT 1;
```

### Test 3: Sincronización Posterior (Deduplicación)

**Objetivo**: Verificar que no se duplican transacciones

**Pasos**:
1. Click en **"Sincronizar"** nuevamente
2. Revisá los resultados

**Resultado esperado**:
- ✅ Total transacciones = mismo número que antes
- ✅ Nuevas = 0 (o solo las muy recientes)
- ✅ Duplicadas = la mayoría de transacciones
- ✅ No hay transacciones repetidas en la lista

### Test 4: Múltiples Cuentas

**Objetivo**: Verificar que funciona con múltiples cuentas

**Pasos**:
1. Conectá un banco que tenga múltiples cuentas (ej: cuenta corriente + caja de ahorro)
2. Sincronizá
3. Revisá las transacciones

**Resultado esperado**:
- ✅ Se traen transacciones de TODAS las cuentas
- ✅ Cada transacción muestra su cuenta de origen
- ✅ El resumen muestra cantidad de cuentas procesadas

**Verificación**:
```sql
SELECT DISTINCT account_name, COUNT(*) as transaction_count
FROM transactions
WHERE user_id = 'tu-user-id'
  AND source = 'enable_banking'
GROUP BY account_name;
```

### Test 5: Desconexión

**Objetivo**: Verificar que se puede desconectar el banco

**Pasos**:
1. Click en **"Desconectar"**
2. Confirmá en el modal
3. Esperá la confirmación

**Resultado esperado**:
- ✅ Conexión eliminada de la base de datos
- ✅ Sesión revocada en Enable Banking
- ✅ Botón vuelve a "Conectar Banco"
- ✅ Las transacciones anteriores permanecen en la base de datos

---

## 🛠️ Debugging

### Ver Logs en Heroku

```bash
heroku logs --tail --app maneki -n 500 | grep -i "eubanks\|enable"
```

**Logs importantes**:
- `[EuBanks Sync] Starting sync for user:` - Inicio de sincronización
- `[EuBanks Sync] Found X accounts` - Cuentas detectadas
- `[EuBanks Sync] Fetched X transactions for account` - Transacciones por cuenta
- `[EuBanks Sync] ✅ Sync completed successfully` - Sincronización exitosa

### Errores Comunes

#### 1. "No private key configured"

**Causa**: Variable `EUBANKS_PRIVATE_KEY` no configurada

**Solución**:
```bash
# En Heroku
heroku config:set EUBANKS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTuKey\n-----END PRIVATE KEY-----" --app maneki
```

#### 2. "Session expired" o "401 Unauthorized"

**Causa**: La sesión de Enable Banking expiró (90 días)

**Solución**:
1. Desconectá el banco
2. Volvé a conectar
3. Sincronizá de nuevo

#### 3. "No accounts found"

**Causa**: La autorización no incluyó acceso a cuentas

**Solución**:
1. Desconectá y reconectá
2. Asegurate de autorizar TODAS las cuentas en el banco
3. Verificá permisos en Enable Banking dashboard

#### 4. Transacciones no aparecen

**Causa**: Filtro de fechas o cuentas sin transacciones

**Solución**:
```sql
-- Verificar qué se guardó
SELECT * FROM transactions
WHERE user_id = 'tu-user-id'
  AND source = 'enable_banking'
ORDER BY created_at DESC;

-- Ver logs de sincronización
SELECT * FROM sync_logs
WHERE user_id = 'tu-user-id'
ORDER BY created_at DESC;
```

---

## 📊 Endpoints API

### Conexión

**GET** `/api/eubanks/countries`
- Retorna lista de países soportados

**GET** `/api/eubanks/banks/:country`
- Retorna lista de bancos para un país
- Params: `country` (código ISO, ej: "ES", "FR")

**POST** `/oauth/eubanks/authorize`
- Inicia flujo OAuth
- Body: `{ "bankName": "Banco Santander", "country": "ES" }`

**GET** `/oauth/eubanks/callback`
- Callback de OAuth (usado por Enable Banking)

### Sincronización

**POST** `/api/eubanks/sync`
- Sincroniza transacciones de todas las cuentas
- Headers: `Authorization: Bearer {token}`
- Retorna:
```json
{
  "success": true,
  "data": {
    "total_transactions": 150,
    "inserted": 145,
    "duplicates": 5,
    "accounts": [
      {
        "uid": "account-uid",
        "name": "Cuenta Corriente",
        "transactions": 100,
        "inserted": 95,
        "duplicates": 5
      }
    ],
    "date_range": {
      "from": "2025-11-08",
      "to": "2026-02-08"
    }
  }
}
```

**GET** `/api/eubanks/accounts`
- Retorna cuentas conectadas del usuario

**GET** `/api/eubanks/sync/status`
- Retorna estado de sincronización

**DELETE** `/api/connections/:provider`
- Desconecta provider (ej: `/api/connections/eubanks`)

---

## 🔒 Seguridad

### JWT Authentication

- Cada request a Enable Banking API usa JWT firmado con RS256
- La private key nunca se expone al frontend
- Los tokens expiran en 1 hora

### Row Level Security (RLS)

- La tabla `connections` tiene RLS habilitado
- Los usuarios solo pueden ver sus propias conexiones
- Las transacciones están ligadas al user_id

### OAuth State Validation

- Se usa CSRF token (state) en el flujo OAuth
- El state se valida en el callback
- Los states expiran en 10 minutos

---

## 📈 Métricas y Monitoring

### Queries Útiles

**Usuarios con Enable Banking conectado**:
```sql
SELECT COUNT(DISTINCT user_id)
FROM connections
WHERE provider = 'eubanks'
  AND status = 'active';
```

**Transacciones sincronizadas hoy**:
```sql
SELECT COUNT(*)
FROM transactions
WHERE source = 'enable_banking'
  AND created_at >= CURRENT_DATE;
```

**Última sincronización por usuario**:
```sql
SELECT
  user_id,
  last_synced_at,
  metadata->>'bank_name' as bank_name
FROM connections
WHERE provider = 'eubanks'
ORDER BY last_synced_at DESC;
```

**Logs de sincronización recientes**:
```sql
SELECT
  sl.created_at,
  sl.status,
  sl.records_synced,
  sl.error_message,
  c.metadata->>'bank_name' as bank
FROM sync_logs sl
JOIN connections c ON sl.connection_id = c.id
WHERE c.provider = 'eubanks'
ORDER BY sl.created_at DESC
LIMIT 10;
```

---

## ✅ Checklist Final

Antes de usar en producción:

- [x] Variables de entorno configuradas en Heroku
- [x] Callback URL configurado en Enable Banking dashboard
- [x] Migraciones corridas en Supabase
- [ ] Probado flujo completo de conexión
- [ ] Probado sincronización con múltiples cuentas
- [ ] Verificado deduplicación de transacciones
- [ ] Probado desconexión de banco
- [ ] Revisado logs en Heroku

---

## 🆘 Soporte

Si tenés problemas:

1. Revisá los logs en Heroku
2. Verificá las tablas en Supabase
3. Usá los queries de debugging de arriba
4. Revisá la documentación de Enable Banking: https://enablebanking.com/docs

---

## 📝 Notas Adicionales

### Límites de Enable Banking

- **Histórico máximo**: 90 días
- **Sesiones**: Expiran después de 90 días
- **Rate limiting**: Depende de tu plan

### Renovación de Sesión

Si la sesión expira:
1. El usuario verá un error al sincronizar
2. Debe desconectar y reconectar el banco
3. La nueva sesión durará otros 90 días

### Próximas Mejoras

- [ ] Auto-sincronización diaria
- [ ] Notificaciones de nuevas transacciones
- [ ] Renovación automática de sesiones
- [ ] Dashboard de cuentas bancarias
- [ ] Análisis de gastos por cuenta

---

**Última actualización**: 2026-02-08
**Versión**: v148
**Estado**: ✅ Listo para producción
