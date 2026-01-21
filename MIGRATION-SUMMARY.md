# Migración: Categorías Compartidas para Services

## 📋 Resumen

Se implementó el sistema para que `recurring_services` use la misma tabla `categories` que las transacciones, mediante una relación de Foreign Key.

---

## ✅ Cambios Completados

### 1. **Script de Migración SQL** ✅
- **Archivo**: `scripts/sql/migrate-services-category-to-fk.sql`
- **Script de ayuda**: `run-migration.js`

**⚠️ ACCIÓN REQUERIDA**: Necesitas ejecutar este SQL en Supabase:

```sql
ALTER TABLE recurring_services
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_services_category_id
ON recurring_services(category_id);

COMMENT ON COLUMN recurring_services.category IS 'DEPRECATED: Old category field (text). Use category_id instead.';
COMMENT ON COLUMN recurring_services.category_id IS 'Foreign key to categories table. Preferred over old category field.';
```

**Cómo ejecutarlo**:
1. Ve a: https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo/sql
2. Copia y pega el SQL de arriba
3. Haz clic en "Run"
4. Verifica con `node run-migration.js` que la columna existe

---

### 2. **Backend - recurring-services.service.js** ✅

**Cambios**:
- `getServices()`: Ahora hace JOIN con `categories` y devuelve `category_name`, `category_color`
- `createService()`: Acepta `category_id` (UUID) en lugar de `category` (text)
- `updateService()`: Acepta `category_id` y lo actualiza

**Archivo**: `services/recurring-services.service.js`

---

### 3. **Backend - Endpoints** ✅

Los endpoints de categorías ya existían:
- `GET /api/categories` - Devuelve todas las categorías del usuario
- `GET /api/services` - Ahora incluye datos de categoría via JOIN

**Archivos**:
- `server-dev.js` (línea 2090)
- `server-supabase.js` (línea 2203)

---

### 4. **Frontend - services.js** ✅

**Cambios**:
- Nueva variable global: `categoriesData = []`
- Nueva función: `loadCategories()` - Carga categorías desde API
- Nueva función: `populateCategoryDropdown()` - Popula el dropdown dinámicamente
- `initServicesModule()`: Ahora carga categorías al iniciar
- `openAddServiceModal()` y `openEditServiceModal()`: Populan dropdown con categorías reales
- `saveService()`: Envía `category_id` en lugar de `category`
- `renderServicesList()`: Muestra `category_name` y `category_color` del JOIN

**Archivo**: `public/js/services.js`

---

### 5. **Frontend - services.ejs** ✅

No requiere cambios. El `<select id="service-category">` existente será poblado dinámicamente por JavaScript.

---

## 🧪 Cómo Probar

### 1. **Ejecutar el SQL de migración** (PRIMERO)
```bash
# Verificar si la migración ya está aplicada
node run-migration.js
```

Si muestra que la columna NO existe, ve a Supabase y ejecuta el SQL mencionado arriba.

### 2. **Iniciar servidor de desarrollo**
```bash
npm run dev
```

### 3. **Abrir la aplicación**
- Ve a http://localhost:3001
- Navega a "Pagos y Suscripciones"

### 4. **Crear un nuevo servicio**
- Haz clic en "Agregar Pago"
- El dropdown de categorías debería mostrar tus categorías reales desde la base de datos
- Selecciona una categoría
- Guarda el servicio

### 5. **Verificar en la tabla**
- El servicio debería aparecer con el color y nombre de la categoría seleccionada
- Abre DevTools > Network > Ver la respuesta de `/api/services`
- Deberías ver `category_id` con un UUID y `category_name` con el nombre

### 6. **Editar un servicio existente**
- Haz clic en un servicio
- Haz clic en "Editar"
- El dropdown debería mostrar la categoría actual seleccionada
- Cambia la categoría
- Guarda y verifica que se actualice

---

## 🔄 Migración de Datos Existentes (MANUAL)

Los servicios existentes tienen `category` como text (ej: "streaming", "other").
Necesitas mapearlos manualmente a `category_id`.

**Ejemplo de query de migración manual**:

```sql
-- Para mapear "streaming" a la categoría "Entretenimiento" de tu usuario
UPDATE recurring_services
SET category_id = (
  SELECT id FROM categories
  WHERE user_id = recurring_services.user_id
  AND name = 'Entretenimiento'  -- Ajusta según tus categorías
)
WHERE user_id = 'TU_USER_ID'
AND category = 'streaming';

-- Repite para cada combinación category -> category_id
```

**Mapeos sugeridos**:
- `streaming` → "Entretenimiento"
- `utilities` → "Servicios"
- `telecommunications` → "Servicios"
- `housing` → "Hogar"
- `other` → "Sin categoría"

---

## 🚨 Notas Importantes

1. **No se tocó la tabla `transactions`** - Solo se modificó `recurring_services`
2. **Backward compatibility** - La columna vieja `category` se mantiene, no se elimina
3. **NULL values OK** - Si `category_id` es NULL, el servicio no tiene categoría asignada
4. **RLS activado** - Las policies de `categories` aseguran que cada usuario solo ve sus categorías

---

## 📦 Archivos Modificados

1. ✅ `scripts/sql/migrate-services-category-to-fk.sql` (NUEVO)
2. ✅ `run-migration.js` (NUEVO)
3. ✅ `services/recurring-services.service.js`
4. ✅ `public/js/services.js`

---

## ✨ Próximos Pasos

1. **Ejecuta el SQL de migración en Supabase** ⚠️
2. **Prueba en desarrollo** (localhost:3001)
3. **Si todo funciona**, me avisas y lo deployamos a producción
4. **Después del deploy**, mapea manualmente los servicios existentes usando las queries SQL de arriba

---

## ❓ Preguntas Frecuentes

**Q: ¿Qué pasa con los servicios que ya existen?**
A: Seguirán funcionando. Tienen `category` como text pero `category_id` como NULL. Puedes mapearlos manualmente después.

**Q: ¿Puedo crear un servicio sin categoría?**
A: Sí, `category_id` puede ser NULL.

**Q: ¿El dropdown muestra las categorías del usuario?**
A: Sí, se cargan desde `/api/categories` que filtra por `user_id`.

**Q: ¿Qué pasa si borro una categoría que está en uso?**
A: El FK tiene `ON DELETE SET NULL`, así que `category_id` se pone en NULL automáticamente.

---

🎯 **Listo para probar!** Avísame cuando ejecutes el SQL y pruebes en dev.
