# OAuth Setup Guide - Mercado Pago

Este documento explica cómo configurar la integración OAuth con Mercado Pago en Maneki.

## Arquitectura

La implementación está diseñada de forma modular y escalable para soportar múltiples proveedores OAuth:

```
services/
├── oauth/
│   ├── base-oauth.service.js       # Clase abstracta base para OAuth
│   └── mercadopago-oauth.service.js # Implementación de Mercado Pago
├── connections.service.js           # Manejo de conexiones en BD
└── ...
```

## 1. Configurar Base de Datos

Ejecuta el script SQL para crear las tablas necesarias:

```sql
psql $DATABASE_URL -f supabase-connections.sql
```

Esto creará:
- **Tabla `connections`**: Almacena las conexiones OAuth (tokens, metadata, etc.)
- **Tabla `sync_logs`**: Registra el historial de sincronizaciones
- **Políticas RLS**: Seguridad a nivel de fila

## 2. Configurar Variables de Entorno

Agrega estas variables a tu archivo `.env`:

```env
# Mercado Pago OAuth Configuration
MERCADOPAGO_CLIENT_ID=5794878736512057
MERCADOPAGO_CLIENT_SECRET=MhrOqlz8ymvwqgRoYyxR4wM2rOrkWhI5

# También necesitas tener configurado:
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## 3. Configurar Redirect URI en Mercado Pago

Debes configurar la URL de redirect en tu aplicación de Mercado Pago:

**Desarrollo:**
```
http://localhost:3000/oauth/mercadopago/callback
```

**Producción:**
```
https://tudominio.com/oauth/mercadopago/callback
```

### Cómo configurar en Mercado Pago:
1. Ve a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers)
2. Selecciona tu aplicación
3. Ve a "Configuración de OAuth"
4. Agrega la Redirect URI correspondiente

## 4. Flujo OAuth

### Paso 1: Usuario inicia conexión
```javascript
// El usuario hace click en "Conectar Mercado Pago"
connectMercadoPago()
```

### Paso 2: Generar URL de autorización
```
GET /oauth/mercadopago/authorize
→ Retorna URL de Mercado Pago con state token
```

### Paso 3: Usuario autoriza en Mercado Pago
- El usuario es redirigido a Mercado Pago
- Inicia sesión y autoriza la aplicación
- Mercado Pago redirige de vuelta con un `code`

### Paso 4: Intercambiar code por tokens
```
GET /oauth/mercadopago/callback?code=xxx&state=yyy
→ Intercambia code por access_token
→ Guarda tokens en la base de datos
→ Redirige a /#configuracion?connection=success
```

## 5. Endpoints Disponibles

### Obtener conexiones del usuario
```
GET /api/connections
Authorization: Bearer {token}
```

### Iniciar OAuth
```
GET /oauth/mercadopago/authorize
Authorization: Bearer {token}
```

### Callback OAuth
```
GET /oauth/mercadopago/callback?code=xxx&state=yyy
```

### Desconectar proveedor
```
DELETE /api/connections/:provider
Authorization: Bearer {token}
```

## 6. Estructura de la Base de Datos

### Tabla `connections`
```sql
{
  id: UUID,
  user_id: UUID,
  provider: 'mercadopago',
  provider_user_id: STRING,
  access_token: TEXT (encrypted),
  refresh_token: TEXT (encrypted),
  token_type: 'Bearer',
  expires_at: TIMESTAMP,
  scope: TEXT[],
  status: 'active' | 'expired' | 'revoked',
  metadata: JSONB,
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  last_synced_at: TIMESTAMP
}
```

### Tabla `sync_logs`
```sql
{
  id: UUID,
  connection_id: UUID,
  user_id: UUID,
  sync_type: 'transactions' | 'full' | 'incremental',
  status: 'success' | 'error' | 'partial',
  records_synced: INTEGER,
  error_message: TEXT,
  started_at: TIMESTAMP,
  completed_at: TIMESTAMP,
  metadata: JSONB
}
```

## 7. Seguridad

### CSRF Protection
- Cada request OAuth genera un `state` token único
- El state se valida en el callback
- Los states expiran después de 10 minutos

### Tokens
- Los access tokens se almacenan de forma segura en Supabase
- Solo el backend tiene acceso a los tokens
- El frontend nunca ve los tokens completos

### RLS (Row Level Security)
- Los usuarios solo pueden ver sus propias conexiones
- Las políticas RLS previenen acceso no autorizado

## 8. Agregar Nuevos Proveedores

Para agregar un nuevo proveedor OAuth (ej: Banco Galicia):

### 1. Crear servicio OAuth
```javascript
// services/oauth/banco-galicia-oauth.service.js
const BaseOAuthService = require('./base-oauth.service');

class BancoGaliciaOAuthService extends BaseOAuthService {
  constructor() {
    super();
    this.clientId = process.env.BANCO_GALICIA_CLIENT_ID;
    this.clientSecret = process.env.BANCO_GALICIA_CLIENT_SECRET;
    // ... implementar métodos abstractos
  }

  getProviderName() {
    return 'banco_galicia';
  }

  // Implementar otros métodos...
}

module.exports = new BancoGaliciaOAuthService();
```

### 2. Agregar rutas
```javascript
// server-dev.js
const bancoGaliciaOAuth = require('./services/oauth/banco-galicia-oauth.service');

app.get('/oauth/banco-galicia/authorize', devAuth, (req, res) => {
  // Similar a Mercado Pago
});

app.get('/oauth/banco-galicia/callback', async (req, res) => {
  // Similar a Mercado Pago
});
```

### 3. Actualizar UI
```html
<!-- views/menus/settings.ejs -->
<div class="connection-card" id="banco-galicia-card">
  <h3>Banco Galicia</h3>
  <button onclick="connectBancoGalicia()">Conectar</button>
</div>
```

## 9. Testing

### Verificar que el servidor está corriendo
```bash
curl http://localhost:3000/health
```

### Probar conexión manual
1. Ve a `http://localhost:3000/#configuracion`
2. Click en "Conectar Mercado Pago"
3. Serás redirigido a Mercado Pago
4. Autoriza la aplicación
5. Deberías volver a Maneki con la conexión establecida

## 10. Troubleshooting

### Error: "Invalid redirect_uri"
- Verifica que la URL de callback esté configurada correctamente en Mercado Pago
- Asegúrate de usar HTTP en desarrollo y HTTPS en producción

### Error: "Invalid state"
- El state token expiró (>10 minutos)
- Intenta de nuevo

### Error: "Connection failed"
- Revisa los logs del servidor
- Verifica que las credenciales sean correctas
- Asegúrate de que la tabla `connections` existe

### Los tokens no se guardan
- Verifica que `SUPABASE_SERVICE_ROLE_KEY` esté configurado
- Revisa las políticas RLS de la tabla `connections`

## 11. Próximos Pasos

Una vez que el OAuth esté funcionando, puedes:
1. **Sincronizar transacciones** - Implementar endpoints para obtener transacciones de Mercado Pago
2. **Refresh tokens** - Implementar lógica para renovar tokens expirados
3. **Webhooks** - Configurar webhooks para sincronización en tiempo real
4. **Más proveedores** - Agregar otros bancos y servicios de pago
