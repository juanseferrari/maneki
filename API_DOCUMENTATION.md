# API de Análisis de Extractos Bancarios

## Descripción General

Esta API procesa extractos bancarios (PDF, CSV, XLSX) y devuelve información estructurada en formato JSON estandarizado. Similar a Claude Code, analiza el documento completo y extrae:

- Metadata del documento (banco, cuenta, período, saldos)
- Todas las transacciones con categorización inteligente
- Resumen estadístico (ingresos, gastos, balance)
- Detección automática de cuotas/installments

## Sistema de Procesamiento Inteligente

### Métodos de Procesamiento

1. **Template** (Verde): Matching de patrones, alta confianza (>60%)
2. **Claude AI** (Púrpura): Análisis con IA cuando confianza baja (<60%)
3. **Hybrid** (Rosa): Fallback de Claude a templates si falla

### Decision Tree Automático

```
Upload → Parser → Template Matching
         ↓
    Confidence < 60%?
         ↓ Yes
    Check Claude Quota (20/mes)
         ↓ Available
    Claude AI Analysis
         ↓
    Return Standardized JSON
```

## Endpoints

### 1. Upload y Procesamiento de Archivo

**Endpoint**: `POST /upload`

**Headers**:
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: multipart/form-data
```

**Body**:
```
file: <binary_file>
```

**Tipos de archivo soportados**:
- PDF (`.pdf`)
- CSV (`.csv`)
- Excel (`.xlsx`, `.xls`)

**Respuesta Exitosa** (200 OK):

```json
{
  "success": true,
  "file": {
    "id": "ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b",
    "name": "extracto_santander_enero_2026.pdf",
    "processing_method": "claude",
    "confidence_score": 95,
    "uploaded_at": "2026-02-08T10:30:00.000Z",
    "file_size": 475498
  },
  "extraction": {
    "document_metadata": {
      "banco": "Banco Santander",
      "numero_cuenta": "1234-5678-90",
      "tipo_cuenta": "Cuenta Corriente",
      "periodo": "2026-01",
      "saldo_inicial": 150000.50,
      "saldo_final": 120000.75
    },
    "transactions": [
      {
        "date": "2026-01-15",
        "description": "Compra en Coto Supermercado",
        "amount": 5420.30,
        "type": "expense",
        "category_id": "uuid-categoria-supermercado",
        "confidence": 95,
        "installment": {
          "number": 1,
          "total": 12,
          "group_id": "uuid-grupo-compra"
        }
      },
      {
        "date": "2026-01-16",
        "description": "Sueldo Enero",
        "amount": 80000.00,
        "type": "income",
        "category_id": "uuid-categoria-salario",
        "confidence": 98
      }
    ],
    "summary": {
      "total_transactions": 50,
      "total_income": 150000,
      "total_expenses": 120000,
      "net_balance": 30000
    }
  },
  "metadata": {
    "processing_time": "12.5s",
    "needs_review": true,
    "duplicate_count": 0
  }
}
```

**Respuesta de Error** (500):

```json
{
  "success": false,
  "file": {
    "id": "uuid",
    "name": "archivo.pdf",
    "processing_method": null,
    "confidence_score": 0
  },
  "error": {
    "message": "Failed to parse PDF",
    "type": "ParserError",
    "details": "Invalid PDF structure"
  },
  "extraction": {
    "document_metadata": null,
    "transactions": [],
    "summary": {
      "total_transactions": 0,
      "total_income": 0,
      "total_expenses": 0,
      "net_balance": 0
    }
  }
}
```

---

### 2. Obtener Análisis Detallado de un Archivo

**Endpoint**: `GET /api/files/:fileId/analysis`

**Headers**:
```
Authorization: Bearer <supabase_jwt_token>
```

**Query Parameters**:
- `format` (opcional): `json` (default), `markdown`, `text`

**Ejemplo**:
```bash
GET /api/files/ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b/analysis
GET /api/files/ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b/analysis?format=markdown
GET /api/files/ea4e7a58-2b37-4ead-a6e5-f51e5bb36e9b/analysis?format=text
```

**Respuesta (format=json)**:

Mismo formato que el endpoint de upload (ver arriba).

**Respuesta (format=markdown)**:

```markdown
# Análisis de Extracto Bancario

## 📄 Información del Archivo

- **Nombre**: extracto_santander_enero_2026.pdf
- **Método de procesamiento**: claude
- **Confianza**: 95%
- **Subido**: 8/2/2026 10:30:00

## 🏦 Información del Documento

- **Banco**: Banco Santander
- **Número de cuenta**: 1234-5678-90
- **Tipo de cuenta**: Cuenta Corriente
- **Período**: 2026-01
- **Saldo inicial**: $150,000.50
- **Saldo final**: $120,000.75

## 📊 Resumen

| Métrica | Valor |
|---------|-------|
| Total de transacciones | 50 |
| Ingresos | $150,000 |
| Gastos | $120,000 |
| Balance neto | $30,000 |

## 💰 Transacciones

| Fecha | Descripción | Monto | Tipo |
|-------|-------------|-------|------|
| 2026-01-15 | Compra en Coto Supermercado | -$5,420.30 | 📉 |
| 2026-01-16 | Sueldo Enero | +$80,000 | 📈 |
```

**Respuesta (format=text)**:

```
📄 Análisis de extracto_santander_enero_2026.pdf

🏦 Banco: Banco Santander
💳 Cuenta: 1234-5678-90
📅 Período: 2026-01

📊 Resumen:
- Total de transacciones: 50
- Ingresos: $150,000
- Gastos: $120,000
- Balance neto: $30,000

🤖 Procesado con: CLAUDE (95% confianza)
```

---

### 3. Verificar Cuota de Claude AI

**Endpoint**: `GET /api/claude/usage`

**Headers**:
```
Authorization: Bearer <supabase_jwt_token>
```

**Respuesta**:

```json
{
  "success": true,
  "data": {
    "available": true,
    "remaining": 15,
    "limit": 20,
    "used": 5,
    "monthYear": "2026-02",
    "resetDate": "2026-03-01"
  }
}
```

---

### 4. Obtener Transacciones para Revisión

**Endpoint**: `GET /api/files/:fileId/transactions/preview`

**Headers**:
```
Authorization: Bearer <supabase_jwt_token>
```

**Respuesta**:

```json
{
  "success": true,
  "data": {
    "file": {
      "id": "uuid",
      "name": "archivo.pdf",
      "processing_method": "claude",
      "confidence_score": 95,
      "metadata": { ... }
    },
    "transactions": [
      {
        "id": "uuid",
        "date": "2026-01-15",
        "description": "Compra en Coto",
        "amount": 5420.30,
        "type": "expense",
        "category_id": "uuid",
        "needs_review": true,
        "processed_by_claude": true
      }
    ]
  }
}
```

---

## Estructura de Datos

### Transaction Object

```typescript
{
  date: string;          // YYYY-MM-DD
  description: string;   // Descripción de la transacción
  amount: number;        // Monto (siempre positivo)
  type: "income" | "expense";
  category_id: string | null;  // UUID de categoría o null
  confidence: number;    // 0-100
  installment?: {        // Opcional: solo si hay cuotas
    number: number;      // Número de cuota (ej: 1)
    total: number;       // Total de cuotas (ej: 12)
    group_id: string;    // UUID que agrupa las cuotas
  }
}
```

### Document Metadata Object

```typescript
{
  banco: string | null;
  numero_cuenta: string | null;
  tipo_cuenta: string | null;  // "Cuenta Corriente", "Caja de Ahorro", etc.
  periodo: string | null;       // YYYY-MM
  saldo_inicial: number | null;
  saldo_final: number | null;
}
```

### Summary Object

```typescript
{
  total_transactions: number;
  total_income: number;
  total_expenses: number;
  net_balance: number;
}
```

---

## Ejemplos de Uso

### JavaScript/TypeScript

```javascript
// Upload file
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('https://maneki.herokuapp.com/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseToken}`
  },
  body: formData
});

const result = await response.json();
console.log('Análisis:', result.extraction.summary);
console.log('Banco:', result.extraction.document_metadata.banco);
console.log('Transacciones:', result.extraction.transactions.length);
```

### Python

```python
import requests

# Upload file
files = {'file': open('extracto.pdf', 'rb')}
headers = {'Authorization': f'Bearer {supabase_token}'}

response = requests.post(
    'https://maneki.herokuapp.com/upload',
    files=files,
    headers=headers
)

data = response.json()
print(f"Procesado con: {data['file']['processing_method']}")
print(f"Total transacciones: {data['extraction']['summary']['total_transactions']}")
print(f"Balance: ${data['extraction']['summary']['net_balance']}")
```

### cURL

```bash
# Upload file
curl -X POST https://maneki.herokuapp.com/upload \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -F "file=@extracto.pdf"

# Get analysis (JSON)
curl -X GET https://maneki.herokuapp.com/api/files/FILE_ID/analysis \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Get analysis (Markdown)
curl -X GET "https://maneki.herokuapp.com/api/files/FILE_ID/analysis?format=markdown" \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"

# Check Claude quota
curl -X GET https://maneki.herokuapp.com/api/claude/usage \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN"
```

---

## Límites y Cuotas

### Claude AI
- **Límite**: 20 análisis por usuario por mes
- **Reset**: Primer día de cada mes
- **Fallback**: Si se excede, usa templates automáticamente

### Archivos
- **Tamaño máximo**: 10 MB por archivo
- **Formatos**: PDF, CSV, XLSX, XLS
- **Texto máximo para Claude**: 50,000 caracteres (optimización de costos)

---

## Códigos de Error

| Código | Descripción |
|--------|-------------|
| 400 | Bad Request - Archivo inválido o faltante |
| 401 | Unauthorized - Token inválido o faltante |
| 404 | Not Found - Archivo no encontrado |
| 413 | Payload Too Large - Archivo excede 10 MB |
| 500 | Internal Server Error - Error de procesamiento |

---

## Casos de Uso

### 1. Análisis Automático de Extractos

Sube tu extracto bancario y obtén:
- Todas las transacciones categorizadas
- Resumen de ingresos y gastos
- Detección automática de cuotas
- Metadata del documento extraída

### 2. Integración con Apps de Finanzas Personales

Usa la API para:
- Importar transacciones automáticamente
- Categorizar gastos con IA
- Generar reportes mensuales
- Detectar patrones de gasto

### 3. Contabilidad Empresarial

Procesa múltiples extractos:
- Conciliación bancaria automatizada
- Exportación a sistemas contables
- Análisis de flujo de caja
- Detección de duplicados

---

## Soporte

Para reportar issues o solicitar features:
- GitHub: [github.com/juanseferrari/maneki](https://github.com/juanseferrari/maneki)
- Email: juansegundoferrari@gmail.com

---

## Changelog

### v145 (2026-02-08)
- ✅ Implementado sistema de respuestas JSON estandarizadas
- ✅ Agregado endpoint `/api/files/:fileId/analysis`
- ✅ Soporte para formato markdown y texto plano
- ✅ Procesamiento síncrono con respuesta inmediata
- ✅ Análisis detallado estilo Claude Code

### v143 (2026-02-08)
- ✅ Fixed foreign key constraint issue
- ✅ Corrección de referencias a auth.users

### v141 (2026-02-07)
- ✅ Claude API fallback system implementado
- ✅ Smart categorization con matching semántico
- ✅ Detección de cuotas/installments
- ✅ Sistema de cuotas (20/mes por usuario)
