# Google OAuth Authentication - Setup Guide

## Overview
Se ha implementado un sistema completo de autenticación con Google OAuth 2.0. Todos los datos están ahora segmentados por usuario, garantizando privacidad y seguridad.

## ✅ Lo que se implementó

### 1. **Sistema de Usuarios**
- ✅ Tabla `users` en Supabase con información de perfil
- ✅ Tabla `sessions` para manejo de sesiones
- ✅ Campos `user_id` en todas las tablas (files, transactions, veps)
- ✅ Row Level Security (RLS) configurado

### 2. **Autenticación Google OAuth**
- ✅ Passport.js con estrategia de Google
- ✅ Página de login profesional
- ✅ Flujo completo de autenticación
- ✅ Manejo de sesiones con PostgreSQL

### 3. **Protección de Rutas**
- ✅ Middleware de autenticación
- ✅ Todas las rutas protegidas
- ✅ Redirección automática a login
- ✅ Filtrado de datos por usuario

### 4. **UI/UX**
- ✅ Página de login diseñada
- ✅ Información de usuario en sidebar
- ✅ Botón de logout funcional
- ✅ Avatar con inicial del nombre

## 📋 Pasos de Configuración

### Paso 1: Ejecutar el Schema de Base de Datos

1. Abre tu **Supabase SQL Editor**
2. Ejecuta el archivo `supabase-users-schema.sql`:

```bash
# En Supabase Dashboard:
# SQL Editor → New Query → Pega el contenido del archivo
```

Esto creará:
- Tabla `users`
- Tabla `sessions`
- Columnas `user_id` en tables existentes
- Índices y políticas RLS

### Paso 2: Instalar Dependencias

```bash
npm install
```

Esto instalará:
- `passport` - Framework de autenticación
- `passport-google-oauth20` - Estrategia de Google
- `express-session` - Manejo de sesiones
- `connect-pg-simple` - Store de sesiones en PostgreSQL
- `pg` - Cliente de PostgreSQL

### Paso 3: Configurar Google Cloud Console

#### 3.1 Crear Proyecto en Google Cloud

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Nombre sugerido: "Maneki Auth"

#### 3.2 Habilitar Google+ API

1. En el menú, ve a **APIs & Services** → **Library**
2. Busca "Google+ API"
3. Haz clic en **Enable**

#### 3.3 Crear Credenciales OAuth 2.0

1. Ve a **APIs & Services** → **Credentials**
2. Haz clic en **Create Credentials** → **OAuth client ID**
3. Si es primera vez, configura la pantalla de consentimiento:
   - **User Type**: External
   - **App name**: Maneki
   - **User support email**: tu email
   - **Developer contact**: tu email
   - **Scopes**: Agregar `email` y `profile`
   - **Test users**: Agrega tu email para testing

4. Selecciona **Application type**: **Web application**
5. **Name**: Maneki Web Client

#### 3.4 Configurar URLs de Redirección

En **Authorized redirect URIs**, agrega:

**Para desarrollo (local):**
```
http://localhost:3000/auth/google/callback
```

**Para producción (cuando deploys):**
```
https://tudominio.com/auth/google/callback
https://www.tudominio.com/auth/google/callback
```

6. Haz clic en **Create**
7. **Copia el Client ID y Client Secret**

### Paso 4: Configurar Variables de Entorno

1. Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

2. Completa las variables en `.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
SUPABASE_BUCKET_NAME=uploads

# Database Configuration (for sessions)
# Obtén esto de Supabase: Settings → Database → Connection String → URI
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres

# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# Session Configuration
# Genera un string aleatorio seguro:
SESSION_SECRET=genera_un_string_aleatorio_muy_largo_y_seguro_aqui

# Google OAuth Configuration
GOOGLE_CLIENT_ID=tu_client_id_de_google.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret_de_google

# Claude API Configuration
ANTHROPIC_API_KEY=tu_api_key

# Upload Configuration
MAX_FILE_SIZE_MB=10
```

#### Cómo obtener DATABASE_URL de Supabase:

1. Ve a tu proyecto en Supabase
2. **Settings** → **Database**
3. En **Connection string**, copia el **URI**
4. Reemplaza `[YOUR-PASSWORD]` con tu contraseña de base de datos

#### Cómo generar SESSION_SECRET:

```bash
# En terminal (Mac/Linux):
openssl rand -base64 32

# O en Node:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Paso 5: Configurar Redirect URL en .env

La **Redirect URL** que debes configurar en Google Cloud Console es:

```
http://localhost:3000/auth/google/callback
```

Para producción (cuando hagas deploy):
```
https://tudominio.com/auth/google/callback
```

Esta URL ya está configurada en el código en:
- `config/passport.config.js` línea 15
- Usa la variable `BASE_URL` del .env

### Paso 6: Iniciar la Aplicación

```bash
npm start
# o
npm run dev  # con nodemon para desarrollo
```

La aplicación estará en: `http://localhost:3000`

## 🔐 Flujo de Autenticación

### 1. Usuario no autenticado
```
Usuario visita http://localhost:3000
  ↓
Redirige automáticamente a /login
  ↓
Muestra página de login con botón "Continuar con Google"
```

### 2. Login con Google
```
Usuario hace clic en "Continuar con Google"
  ↓
Redirige a Google para autenticación
  ↓
Usuario autoriza la aplicación
  ↓
Google redirige a /auth/google/callback
  ↓
Passport procesa la información del usuario
  ↓
Crea o actualiza usuario en base de datos
  ↓
Crea sesión
  ↓
Redirige a la página principal (/)
```

### 3. Usuario autenticado
```
Usuario navega por la aplicación
  ↓
Sesión se mantiene activa (30 días)
  ↓
Todos los datos filtrados por user_id
```

### 4. Logout
```
Usuario hace clic en su nombre (sidebar)
  ↓
Redirige a /logout
  ↓
Destruye sesión
  ↓
Redirige a /login
```

## 📁 Archivos Creados/Modificados

### Nuevos Archivos

1. **`supabase-users-schema.sql`**
   - Schema de base de datos para usuarios y sesiones

2. **`config/passport.config.js`**
   - Configuración de Passport.js
   - Estrategia de Google OAuth
   - Serialización/deserialización de usuarios

3. **`middleware/auth.middleware.js`**
   - `ensureAuthenticated` - Protege rutas
   - `ensureGuest` - Evita acceso de usuarios autenticados a login
   - `ensureAdmin` - Protege rutas de admin
   - `attachUser` - Adjunta usuario a templates

4. **`views/login.ejs`**
   - Página de login con diseño profesional
   - Botón de Google OAuth
   - Responsive design

### Archivos Modificados

1. **`package.json`**
   - Dependencias de autenticación añadidas

2. **`.env.example`**
   - Variables de entorno para OAuth

3. **`server.js`**
   - Configuración de sesiones
   - Inicialización de Passport
   - Rutas de autenticación
   - Protección de todas las rutas API
   - Filtrado por user_id en todas las consultas

4. **`services/supabase.service.js`**
   - Métodos actualizados para filtrar por user_id
   - `getFiles(userId)`
   - `getTransactionsByFile(fileId, userId)`
   - `getAllTransactions(userId)`
   - `getVeps(userId)`
   - `getVepByFile(fileId, userId)`
   - `getVepByNumber(nroVep, userId)`

5. **`views/index.ejs`**
   - Muestra información real del usuario
   - Avatar con inicial del nombre
   - Link a logout

## 🔒 Seguridad Implementada

### 1. **Sesiones Seguras**
- Sesiones almacenadas en PostgreSQL (no en memoria)
- Cookie httpOnly (previene XSS)
- Cookie secure en producción (solo HTTPS)
- Expiración de 30 días
- Secret key robusta

### 2. **Protección de Rutas**
- Middleware `ensureAuthenticated` en todas las rutas
- Redirección automática a login
- Preservación de URL destino (returnTo)

### 3. **Segmentación de Datos**
- Todos los queries filtran por `user_id`
- RLS (Row Level Security) en Supabase
- Usuarios solo ven sus propios datos

### 4. **Validación de Usuario**
- Verificación de cuenta activa
- Actualización de last_login
- Manejo de errores robusto

## 📊 Estructura de la Base de Datos

### Tabla `users`
```sql
id UUID PRIMARY KEY
google_id TEXT UNIQUE NOT NULL
email TEXT UNIQUE NOT NULL
email_verified BOOLEAN
name TEXT
given_name TEXT
family_name TEXT
picture TEXT (URL de foto de perfil)
locale TEXT
is_active BOOLEAN (para desactivar cuentas)
is_admin BOOLEAN (para futuros roles)
plan_type TEXT (free, pro, enterprise)
last_login_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

### Tabla `sessions`
```sql
sid TEXT PRIMARY KEY
sess JSONB
expire TIMESTAMPTZ
```

### Cambios en Tablas Existentes
```sql
files.user_id UUID → REFERENCES users(id)
transactions.user_id UUID → REFERENCES users(id)
veps.user_id UUID → REFERENCES users(id)
```

## 🧪 Testing

### Test 1: Login Exitoso
1. Ve a `http://localhost:3000`
2. Deberías ser redirigido a `/login`
3. Haz clic en "Continuar con Google"
4. Autoriza la aplicación
5. Deberías ser redirigido a la página principal
6. Tu nombre y email deberían aparecer en el sidebar

### Test 2: Datos por Usuario
1. Sube algunos archivos
2. Cierra sesión
3. Inicia sesión con otra cuenta de Google
4. No deberías ver los archivos del usuario anterior

### Test 3: Protección de Rutas
1. Cierra sesión
2. Intenta acceder a `http://localhost:3000/api/files`
3. Deberías ser redirigido a `/login`

### Test 4: Logout
1. Haz clic en tu nombre en el sidebar
2. Deberías ser redirigido a `/login`
3. Intenta acceder a la página principal
4. Deberías ser redirigido nuevamente a `/login`

## ⚠️ Troubleshooting

### Error: "redirect_uri_mismatch"
**Problema**: La URL de callback no coincide

**Solución**:
1. Verifica que en Google Cloud Console tengas exactamente:
   ```
   http://localhost:3000/auth/google/callback
   ```
2. Verifica que `BASE_URL` en `.env` sea:
   ```
   BASE_URL=http://localhost:3000
   ```
3. No uses `https` en desarrollo local

### Error: "Session not saving"
**Problema**: Las sesiones no persisten

**Solución**:
1. Verifica que `DATABASE_URL` esté correcto
2. Verifica que la tabla `sessions` exista en Supabase
3. Revisa los logs de Supabase para errores de conexión

### Error: "User not found after login"
**Problema**: El usuario no se crea en la base de datos

**Solución**:
1. Verifica que ejecutaste `supabase-users-schema.sql`
2. Revisa los logs del servidor (`console.log` en passport.config.js)
3. Verifica permisos RLS en Supabase

### Error: "Cannot read property 'id' of undefined"
**Problema**: `req.user` es undefined

**Solución**:
1. Verifica que `app.use(passport.session())` esté antes de las rutas
2. Verifica que `deserializeUser` funcione correctamente
3. Revisa los logs para ver si la sesión se está cargando

## 🚀 Deployment a Producción

### 1. Actualizar Variables de Entorno

```env
BASE_URL=https://tudominio.com
SESSION_SECRET=un_nuevo_secret_muy_seguro_para_produccion
NODE_ENV=production
```

### 2. Actualizar Google Cloud Console

Agrega las URLs de producción en **Authorized redirect URIs**:
```
https://tudominio.com/auth/google/callback
https://www.tudominio.com/auth/google/callback
```

### 3. HTTPS Obligatorio

En producción, las cookies de sesión requieren HTTPS. Asegúrate de:
- Usar HTTPS en tu dominio
- La variable `NODE_ENV=production` activa automáticamente cookies seguras

### 4. Verificar RLS en Supabase

Actualiza las políticas RLS para usar Supabase Auth (opcional):
```sql
-- Ejemplo de política más restrictiva
CREATE POLICY "Users can view own files"
  ON files
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

## 📝 Próximos Pasos (Opcional)

### Mejoras Sugeridas:

1. **Email de Bienvenida**
   - Enviar email cuando se crea una cuenta nueva

2. **Recuperación de Cuenta**
   - Manejo de cuentas desactivadas
   - Reactivación de cuentas

3. **Roles y Permisos**
   - Admin dashboard
   - Gestión de usuarios

4. **Planes de Suscripción**
   - Integración con Stripe
   - Límites por plan

5. **Audit Log**
   - Registro de acciones importantes
   - Historial de login

## 📞 Soporte

Si tienes problemas:

1. Revisa los logs del servidor
2. Revisa los logs de Supabase
3. Verifica las variables de entorno
4. Revisa que todas las tablas existan
5. Verifica la configuración de Google Cloud Console

## ✅ Checklist Final

Antes de considerar completa la configuración:

- [ ] Schema de base de datos ejecutado en Supabase
- [ ] Dependencias instaladas (`npm install`)
- [ ] Proyecto creado en Google Cloud Console
- [ ] Google+ API habilitada
- [ ] Credenciales OAuth creadas
- [ ] Redirect URL configurada correctamente
- [ ] Archivo `.env` creado y completado
- [ ] `DATABASE_URL` funcionando
- [ ] `SESSION_SECRET` generado
- [ ] `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` configurados
- [ ] Aplicación inicia sin errores
- [ ] Login con Google funciona
- [ ] Usuario se crea en base de datos
- [ ] Datos se filtran por usuario
- [ ] Logout funciona correctamente

¡Tu sistema de autenticación está listo! 🎉
