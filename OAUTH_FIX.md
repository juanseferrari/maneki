# Fix OAuth Redirect URI - COMPLETADO ✅

## Problema Detectado

El OAuth de Mercado Pago estaba fallando con error `redirect_uri_mismatch` porque el servidor estaba construyendo la URL de callback dinámicamente usando:

```javascript
const redirectUri = `${req.protocol}://${req.get('host')}/oauth/mercadopago/callback`;
```

**Problema**: En desarrollo local, esto generaba `http://localhost:3000` pero Mercado Pago espera HTTPS en producción, causando un mismatch.

## Solución Implementada

### 1. Variable de Entorno BASE_URL

Se agregó la variable `BASE_URL` para definir explícitamente la URL base de la aplicación:

**Desarrollo (.env local):**
```env
BASE_URL=http://localhost:3000
```

**Producción (Heroku):**
```env
BASE_URL=https://maneki-36d85d517656.herokuapp.com
```

### 2. Actualización de Servidores

**server-dev.js** (líneas 523 y 561):
```javascript
// ANTES
const redirectUri = `${req.protocol}://${req.get('host')}/oauth/mercadopago/callback`;

// DESPUÉS
const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;
```

**server-supabase.js** (líneas 393 y 433):
```javascript
// ANTES
const redirectUri = `${req.protocol}://${req.get('host')}/oauth/mercadopago/callback`;

// DESPUÉS
const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;
```

### 3. Actualización de .env.example

Se agregó `SUPABASE_SERVICE_ROLE_KEY` y se actualizaron los comentarios de Mercado Pago:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key  # NUEVO
SUPABASE_BUCKET_NAME=uploads

# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000  # Ya existía

# Mercado Pago OAuth Configuration
MERCADOPAGO_CLIENT_ID=your_mercadopago_client_id
MERCADOPAGO_CLIENT_SECRET=your_mercadopago_client_secret
# The callback URL is determined by BASE_URL above
# Make sure BASE_URL matches the redirect URI configured in Mercado Pago
# Development: http://localhost:3000
# Production: https://yourdomain.com
```

## Cambios Deployados

### Commit
```
Fix OAuth redirect URI to use BASE_URL environment variable

- Replace dynamic req.protocol/req.get('host') with BASE_URL
- Fixes redirect_uri_mismatch error with Mercado Pago OAuth
- Update both server-dev.js and server-supabase.js
- Add SUPABASE_SERVICE_ROLE_KEY to .env.example
- Update comments in .env.example for clarity
```

### Heroku Config
```bash
heroku config:set BASE_URL=https://maneki-36d85d517656.herokuapp.com --app maneki
```

### Deploy
- **Version**: v27
- **Status**: ✅ Deployed y funcionando
- **Timestamp**: 2025-11-24 22:30:22 -0300

## URLs de Callback Configuradas

### Desarrollo
```
http://localhost:3000/oauth/mercadopago/callback
```

### Producción
```
https://maneki-36d85d517656.herokuapp.com/oauth/mercadopago/callback
```

## Próximos Pasos

### 1. Configurar en Mercado Pago

Debes agregar AMBAS URLs en tu aplicación de Mercado Pago:

1. Ve a: https://www.mercadopago.com.ar/developers
2. Selecciona tu aplicación (ID: 5794878736512057)
3. En "Redirect URIs" o "URLs de redirección", agrega:
   - `http://localhost:3000/oauth/mercadopago/callback` (desarrollo)
   - `https://maneki-36d85d517656.herokuapp.com/oauth/mercadopago/callback` (producción)

### 2. Probar el OAuth

**En Producción:**
1. Abre: https://maneki-36d85d517656.herokuapp.com/
2. Inicia sesión con Google
3. Ve a "Configuración"
4. Click en "Conectar Mercado Pago"
5. Ahora debería redirigir correctamente a Mercado Pago (sin error de redirect_uri)

**En Desarrollo:**
1. Asegúrate de tener `BASE_URL=http://localhost:3000` en tu `.env`
2. Inicia el servidor: `npm run dev`
3. Abre: http://localhost:3000
4. Prueba el flujo OAuth

## Verificación

### Verificar Variable en Heroku
```bash
heroku config:get BASE_URL --app maneki
# Debería retornar: https://maneki-36d85d517656.herokuapp.com
```

### Verificar Logs
```bash
heroku logs --tail --app maneki
# No deberías ver errores de redirect_uri_mismatch
```

## Beneficios del Fix

1. ✅ **URL Consistente**: La redirect URI es siempre la misma, definida en la variable de entorno
2. ✅ **Fácil Configuración**: Cambiar de desarrollo a producción solo requiere cambiar `BASE_URL`
3. ✅ **Sin Problemas de Protocolo**: No importa si el request es HTTP o HTTPS, usa la URL configurada
4. ✅ **Configuración Centralizada**: Una sola variable controla toda la configuración de URLs
5. ✅ **Deployment Simplificado**: Heroku ya tiene `BASE_URL` configurado automáticamente

## Archivos Modificados

- ✅ [server-dev.js](server-dev.js) - Líneas 523 y 561
- ✅ [server-supabase.js](server-supabase.js) - Líneas 393 y 433
- ✅ [.env.example](.env.example) - Agregado SUPABASE_SERVICE_ROLE_KEY y actualizado docs
- ✅ Heroku config - Agregado `BASE_URL=https://maneki-36d85d517656.herokuapp.com`

## Estado Final

- ✅ Fix implementado en desarrollo
- ✅ Fix implementado en producción
- ✅ Variable BASE_URL configurada en Heroku
- ✅ Deploy exitoso (v27)
- ✅ Servidor corriendo sin errores
- ⏳ Falta: Configurar redirect URIs en Mercado Pago (tu parte)
- ⏳ Falta: Probar el flujo OAuth completo

---

**Fix deployado:** 24 de Noviembre 2025, 22:30:22 -0300

**Estado:** ✅ LISTO para probar
