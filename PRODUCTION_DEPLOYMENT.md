# Deployment a Producción - COMPLETADO ✅

La aplicación Maneki con integración OAuth de Mercado Pago ha sido deployada exitosamente a Heroku.

## 🌐 URLs de Producción

**Aplicación principal:**
```
https://maneki-36d85d517656.herokuapp.com/
```

**URL de OAuth Callback (Mercado Pago):**
```
https://maneki-36d85d517656.herokuapp.com/oauth/mercadopago/callback
```

## ✅ Estado del Deployment

- **Status**: ✅ En producción y funcionando
- **Version**: v26
- **Dyno**: web.1 (Eco) - Activo
- **Servidor**: Node.js 18.20.8
- **Environment**: production
- **Build**: Exitoso

## 🔐 Variables de Entorno Configuradas

Todas las variables de entorno necesarias están configuradas en Heroku:

- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `SUPABASE_BUCKET_NAME`
- ✅ `DATABASE_URL`
- ✅ `DATABASE_PASSWORD`
- ✅ `SESSION_SECRET`
- ✅ `GOOGLE_CLIENT_ID`
- ✅ `GOOGLE_CLIENT_SECRET`
- ✅ `MERCADOPAGO_CLIENT_ID`
- ✅ `MERCADOPAGO_CLIENT_SECRET`
- ✅ `NODE_ENV=production`

## 🚀 Funcionalidades Deployadas

### 1. OAuth de Mercado Pago
- ✅ Ruta de autorización: `/oauth/mercadopago/authorize`
- ✅ Ruta de callback: `/oauth/mercadopago/callback`
- ✅ Gestión de conexiones: `/api/connections`
- ✅ Desconexión: `DELETE /api/connections/:provider`

### 2. Gestión de Archivos
- ✅ Upload de archivos (VEP, CSV, XLSX, PDF)
- ✅ Procesamiento automático
- ✅ Almacenamiento en Supabase Storage

### 3. Transacciones
- ✅ Vista de transacciones procesadas
- ✅ Asociación con archivos
- ✅ Filtros y búsqueda

### 4. Autenticación
- ✅ Google OAuth
- ✅ Supabase Auth
- ✅ Multi-usuario con RLS

## 📋 SIGUIENTE PASO CRÍTICO

### Configurar Redirect URI en Mercado Pago

Para que el OAuth funcione en producción, **DEBES configurar la URL de callback en Mercado Pago**:

1. **Ve a Mercado Pago Developers:**
   ```
   https://www.mercadopago.com.ar/developers
   ```

2. **Selecciona tu aplicación:**
   - Application ID: 5794878736512057

3. **Configura las Redirect URIs:**

   Agrega AMBAS URLs (desarrollo y producción):

   **Desarrollo:**
   ```
   http://localhost:3000/oauth/mercadopago/callback
   ```

   **Producción:**
   ```
   https://maneki-36d85d517656.herokuapp.com/oauth/mercadopago/callback
   ```

4. **Guarda los cambios**

## 🧪 Cómo Probar en Producción

### 1. Acceder a la Aplicación
```
https://maneki-36d85d517656.herokuapp.com/
```

### 2. Iniciar Sesión
- Click en "Sign in with Google"
- Autoriza con tu cuenta de Google

### 3. Ir a Configuración
- Click en el menú lateral "Configuración"
- Verás la tarjeta de Mercado Pago

### 4. Conectar Mercado Pago
- Click en "Conectar Mercado Pago"
- Serás redirigido a Mercado Pago
- Inicia sesión y autoriza
- Serás redirigido de vuelta a Maneki
- Verás "Conectado" con tu email

### 5. Verificar Conexión
Puedes verificar en la base de datos:
```
https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo/editor
```
- Abre la tabla `connections`
- Deberías ver tu conexión con Mercado Pago

## 📊 Monitoreo

### Ver Logs en Tiempo Real
```bash
heroku logs --tail --app maneki
```

### Ver Status de la App
```bash
heroku ps --app maneki
```

### Verificar Variables de Entorno
```bash
heroku config --app maneki
```

### Reiniciar la App (si es necesario)
```bash
heroku restart --app maneki
```

## 🔄 Actualizar la Aplicación

Cuando hagas cambios en el código:

```bash
# 1. Commit cambios
git add .
git commit -m "Descripción de cambios"

# 2. Push a GitHub (opcional)
git push origin main

# 3. Deploy a Heroku
git push heroku main

# La app se rebuildeará y redeployará automáticamente
```

## 🐛 Troubleshooting

### Error: "Invalid redirect_uri" al conectar Mercado Pago
**Solución**: Verifica que agregaste la URL de producción en Mercado Pago:
```
https://maneki-36d85d517656.herokuapp.com/oauth/mercadopago/callback
```

### Error: "Invalid state"
**Solución**: El state token expiró. Intenta conectar de nuevo.

### La app no carga
**Solución**:
```bash
# Ver logs para diagnosticar
heroku logs --tail --app maneki

# Reiniciar si es necesario
heroku restart --app maneki
```

### Error de base de datos
**Solución**: Verifica que las tablas `connections` y `sync_logs` existan en Supabase:
```
https://supabase.com/dashboard/project/adgxouvmnkhcqfyyfrfo/editor
```

## 🔒 Seguridad en Producción

✅ **Implementado:**
- HTTPS obligatorio en Heroku
- Tokens OAuth almacenados de forma segura
- RLS policies en Supabase
- CSRF protection con state tokens
- Variables de entorno seguras
- No se exponen tokens en frontend

⚠️ **Recomendaciones adicionales:**
- Considera usar Redis para state tokens (actualmente en memoria)
- Monitorea los logs regularmente
- Mantén las dependencias actualizadas
- Configura alertas de errores (Sentry, etc.)

## 📈 Métricas de Deployment

- **Tiempo de build**: ~25 segundos
- **Tamaño comprimido**: 62.1 MB
- **Tiempo de inicio**: ~3 segundos
- **Node version**: 18.20.8
- **NPM version**: 9.9.4

## 📚 Documentación Relacionada

- [OAUTH_SETUP.md](./OAUTH_SETUP.md) - Guía técnica de OAuth
- [OAUTH_SETUP_COMPLETE.md](./OAUTH_SETUP_COMPLETE.md) - Estado de implementación
- [README.md](./README.md) - Documentación general

## 🎯 Próximos Pasos

1. ✅ **Deployar a producción** - COMPLETADO
2. ⏳ **Configurar Redirect URI en Mercado Pago** - PENDIENTE (TU PARTE)
3. ⏳ **Probar OAuth en producción** - PENDIENTE
4. ⏳ **Implementar sincronización de transacciones** - SIGUIENTE FEATURE

---

**Deployment realizado:** 24 de Noviembre 2025, 21:08:36 -0300

**URL de producción:** https://maneki-36d85d517656.herokuapp.com/

**Estado:** ✅ LIVE y funcionando
