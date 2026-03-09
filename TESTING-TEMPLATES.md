# Testing del Sistema de Templates Bancarios

## 🚀 Setup Inicial

### 1. Ejecutar Migraciones SQL

**Opción A: Desde Supabase Dashboard**
1. Ve a tu proyecto en https://app.supabase.com
2. SQL Editor → New Query
3. Copia y pega el contenido de cada archivo:
   - `db/migrations/007-create-bank-templates.sql`
   - `db/migrations/008-add-bank-templates-indexes.sql`
4. Ejecuta cada uno (botón "Run")

**Opción B: Desde Terminal con psql**
```bash
psql $DATABASE_URL < db/migrations/007-create-bank-templates.sql
psql $DATABASE_URL < db/migrations/008-add-bank-templates-indexes.sql
```

### 2. Verificar Tabla Creada

```sql
-- En Supabase SQL Editor o psql:
SELECT table_name FROM information_schema.tables
WHERE table_name = 'bank_templates';

-- Ver estructura:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'bank_templates';
```

### 3. Reiniciar Servidor

```bash
# El servidor cargará automáticamente los nuevos servicios
npm start
# o si usas nodemon, se reiniciará automáticamente
```

---

## 📝 Tests Manuales

### Test 1: Primera Carga de Banco Nuevo (Aprendizaje)

**Objetivo:** Verificar que Claude procesa el archivo y crea un template automáticamente

#### Paso 1: Subir archivo

Desde la UI web:
1. Ve a http://localhost:5000 (o tu URL de desarrollo)
2. Inicia sesión
3. Ve a la sección "Archivos"
4. Sube un archivo de un banco NO soportado (ej: Galicia, BBVA, Macro, Brubank)

O con cURL:
```bash
# Obtén tu token primero desde DevTools → Application → localStorage → accessToken
export TOKEN="tu_token_aqui"

curl -X POST http://localhost:5000/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/ruta/a/tu/archivo_banco_galicia.xlsx"
```

#### Paso 2: Verificar Logs del Servidor

Deberías ver algo como esto:

```
[Extractor] Detected columns: ["Fecha", "Descripción", "Importe", "Saldo"]
[Extractor] Buscando template aprendido para banco: Banco Galicia
[Template Learning] No hay templates para banco: galicia
[Extractor] No se encontró template aprendido para Banco Galicia

[Processor] Confidence: 30% < 60%, trying Claude API...
[Claude] Incluyendo 0 ejemplos previos de galicia en el prompt
[Claude] Successfully using model: claude-sonnet-4-5-20250929
[Claude] Received enhanced response from Claude API
[Processor] ✅ Claude extraction successful!
[Processor] - Confidence: 92%
[Processor] - Transactions: 85

[Processor] 🧠 Intentando aprender template de resultado de Claude...
[Template Learning] Analizando extracción exitosa para banco: Banco Galicia
[Template Learning] ✅ Template creado exitosamente (ID: abc123-...) para Banco Galicia
[Processor] Próximos archivos de Banco Galicia usarán este template automáticamente
```

#### Paso 3: Verificar Template en Base de Datos

```sql
SELECT
  bank_name,
  bank_id,
  usage_count,
  success_rate,
  avg_confidence,
  created_at
FROM bank_templates
ORDER BY created_at DESC
LIMIT 5;
```

Deberías ver un registro con:
- `bank_name`: "Banco Galicia" (o el banco que subiste)
- `usage_count`: 0 (aún no se usó, recién se creó)
- `success_rate`: 100.00
- `avg_confidence`: ~85-95

#### Paso 4: Verificar Transacciones

```sql
SELECT
  id,
  description,
  amount,
  transaction_date,
  processed_by_claude,
  needs_review
FROM transactions
WHERE file_id = 'tu_file_id_aqui'
LIMIT 10;
```

Deberías ver:
- `processed_by_claude`: true
- `needs_review`: true (porque Claude siempre requiere revisión)

---

### Test 2: Segunda Carga del Mismo Banco (Usando Template)

**Objetivo:** Verificar que el template aprendido se usa automáticamente

#### Paso 1: Subir segundo archivo del mismo banco

```bash
curl -X POST http://localhost:5000/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/ruta/a/otro_archivo_galicia.xlsx"
```

#### Paso 2: Verificar Logs

Ahora deberías ver:

```
[Extractor] Buscando template aprendido para banco: Banco Galicia
[Template Learning] Buscando match en 1 templates para galicia
[Template Learning] Template abc123: 95.0% match
[Template Learning] ✅ Template encontrado: Banco Galicia (ID: abc123)
[Extractor] ✅ Usando template aprendido (ID: abc123)
[Template Learning] Aplicando template abc123 (Banco Galicia)
[Template Learning] Extraídas 88 transacciones con template

[Processor] ✅ High confidence (88%), using template results
[Template Learning] Stats actualizadas para template abc123: 1 usos, 100.0% éxito

❌ NO DEBE APARECER: "Using Claude API" o "Claude extraction"
```

**Clave:** El sistema NO debe llamar a Claude en la segunda carga!

#### Paso 3: Verificar Stats del Template

```sql
SELECT
  bank_name,
  usage_count,  -- Ahora debe ser 1
  success_rate,
  avg_confidence,
  last_used_at  -- Debe ser NOW()
FROM bank_templates
WHERE bank_name ILIKE '%galicia%';
```

Deberías ver:
- `usage_count`: 1 (incrementó)
- `last_used_at`: timestamp reciente

---

### Test 3: Ver Templates Aprendidos (API)

**Objetivo:** Verificar que los endpoints de templates funcionan

#### Endpoint 1: Listar Templates

```bash
curl http://localhost:5000/api/bank-templates \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "templates": [
    {
      "id": "abc123-...",
      "bank_name": "Banco Galicia",
      "bank_id": "galicia",
      "usage_count": 1,
      "success_rate": 100.00,
      "avg_confidence": 88.50,
      "created_at": "2026-03-06T...",
      "last_used_at": "2026-03-06T...",
      "learned_by": "claude"
    }
  ]
}
```

#### Endpoint 2: Ver Detalles de un Template

```bash
curl http://localhost:5000/api/bank-templates/abc123-template-id \
  -H "Authorization: Bearer $TOKEN"
```

**Respuesta esperada:**
```json
{
  "success": true,
  "template": {
    "id": "abc123-...",
    "bank_name": "Banco Galicia",
    "column_mapping": {
      "date_column": "Fecha",
      "description_column": "Descripción",
      "amount_column": "Importe",
      "balance_column": "Saldo"
    },
    "detection_patterns": {
      "required_columns": ["date", "amount"],
      "column_patterns": {...}
    },
    "date_format": "DD/MM/YYYY",
    "amount_format": "argentine"
  }
}
```

---

### Test 4: Historial como Contexto

**Objetivo:** Verificar que Claude usa ejemplos previos del banco

#### Paso 1: Subir archivo de formato diferente del mismo banco

```bash
# Sube un archivo de Galicia con estructura ligeramente diferente
curl -X POST http://localhost:5000/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@galicia_formato_diferente.xlsx"
```

#### Paso 2: Verificar Logs

```
[Extractor] Buscando template aprendido para banco: Banco Galicia
[Template Learning] Template abc123: 45.0% match  ← NO matchea (< 80%)
[Template Learning] No se encontró template con match > 80%

[Processor] Confidence: 35%, trying Claude API...
[Claude] Incluyendo 2 ejemplos previos de galicia en el prompt  ← ✅ CLAVE!
[Claude] Successfully extracted 92 transactions

[Processor] 🧠 Intentando aprender template...
[Template Learning] ✅ Template creado exitosamente (ID: def456) para Banco Galicia
```

**Clave:** Ahora hay 2 templates para Galicia (diferentes formatos)

---

### Test 5: Quota de Claude Agotada

**Objetivo:** Verificar comportamiento cuando no hay quota

#### Paso 1: Simular quota agotada

```sql
-- Temporalmente incrementar el contador de uso
UPDATE claude_usage_tracking
SET usage_count = 50
WHERE user_id = 'tu_user_id'
  AND month_year = '2026-03';
```

#### Paso 2: Subir archivo de banco sin template

```bash
curl -X POST http://localhost:5000/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@nuevo_banco_sin_template.xlsx"
```

#### Paso 3: Verificar Logs

```
[Processor] ⛔ Quota exceeded (50/20), using templates only
[Processor] ⚠️  Low confidence needs review
```

#### Paso 4: Restaurar quota

```sql
-- Resetear contador
UPDATE claude_usage_tracking
SET usage_count = 0
WHERE user_id = 'tu_user_id';
```

---

## 🔍 Debugging

### Ver Todos los Templates

```sql
SELECT
  bank_name,
  bank_id,
  usage_count,
  success_rate,
  avg_confidence,
  learned_by,
  created_at,
  last_used_at
FROM bank_templates
ORDER BY usage_count DESC;
```

### Ver Templates con Bajo Rendimiento

```sql
SELECT
  bank_name,
  usage_count,
  success_rate,
  avg_confidence
FROM bank_templates
WHERE success_rate < 50.0
ORDER BY success_rate ASC;
```

### Limpiar Templates con Mal Rendimiento

```sql
-- Función automática (elimina templates con < 30% success y > 5 usos)
SELECT cleanup_poor_templates();
```

### Ver Archivos Procesados por Método

```sql
SELECT
  processing_method,
  COUNT(*) as total,
  AVG(confidence_score) as avg_confidence
FROM files
WHERE user_id = 'tu_user_id'
GROUP BY processing_method;
```

Deberías ver:
- `template`: Archivos procesados con extractores hardcoded (Santander, Hipotecario)
- `template_learned`: Archivos procesados con templates aprendidos
- `claude`: Archivos procesados con Claude (primera vez)
- `hybrid`: Claude con fallback a template

---

## ✅ Checklist de Testing

- [ ] Migraciones ejecutadas sin errores
- [ ] Tabla `bank_templates` existe en DB
- [ ] Primera carga de banco nuevo llama a Claude
- [ ] Template se crea automáticamente después de éxito de Claude
- [ ] Segunda carga del mismo banco usa template (NO llama Claude)
- [ ] Stats del template se actualizan correctamente
- [ ] Endpoint `/api/bank-templates` funciona
- [ ] Endpoint `/api/bank-templates/:id` funciona
- [ ] Claude incluye ejemplos previos en el prompt
- [ ] Quota agotada usa fallback genérico
- [ ] Archivos de Santander e Hipotecario siguen funcionando (retrocompatibilidad)

---

## 🐛 Problemas Comunes

### 1. "Table bank_templates does not exist"
**Solución:** Ejecuta la migration 007 primero

### 2. "Claude usage not incremented"
**Solución:** Verifica que `claude_usage_tracking` tenga registro para el mes actual

### 3. "Template no matchea en segunda carga"
**Solución:** Verifica que el archivo tenga las mismas columnas. Si cambió el formato, creará un nuevo template.

### 4. "Cannot find module template-learning.service"
**Solución:** Reinicia el servidor después de crear el archivo

### 5. Template se crea pero no se usa
**Solución:** Verifica que `bank_id` sea el mismo (lowercase, sin espacios)

---

## 📊 Métricas de Éxito

Después de varios días de uso, deberías ver:

```sql
-- Total de templates aprendidos
SELECT COUNT(*) FROM bank_templates;
-- Esperado: 5-10 templates (diferentes bancos)

-- Ahorro de quota de Claude
SELECT
  SUM(CASE WHEN processing_method = 'template_learned' THEN 1 ELSE 0 END) as saved_calls,
  SUM(CASE WHEN processing_method = 'claude' THEN 1 ELSE 0 END) as claude_calls,
  ROUND(100.0 * SUM(CASE WHEN processing_method = 'template_learned' THEN 1 ELSE 0 END) / COUNT(*), 2) as savings_percent
FROM files
WHERE created_at > NOW() - INTERVAL '7 days';
-- Esperado: > 60% ahorro después de primera semana
```
