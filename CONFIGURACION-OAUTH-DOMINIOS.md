# Configuración OAuth para Dominios getmanni.com

Este documento detalla las configuraciones necesarias en cada proveedor OAuth para soportar tanto `getmanni.com` como `www.getmanni.com`.

## Cambios Realizados en el Código

### ✅ Redirects sin Hash
Los OAuth callbacks ahora redirigen a URLs limpias sin hash:

**Antes:**
```
/#configuracion?connection=success&provider=mercadopago
```

**Después:**
```
/conexiones?connection=success&provider=mercadopago
```

**Archivos modificados:**
- `server-dev.js` líneas 1200, 1402 - Mercado Pago y EuBanks callbacks
- `public/js/upload-supabase.js` línea 4002 - Manejo de query params post-OAuth

---

## Configuraciones Externas Requeridas

### 1. Supabase Dashboard

**Ubicación:** Dashboard → Authentication → URL Configuration

#### Site URL
```
https://getmanni.com
```
O si prefieres que www sea la principal:
```
https://www.getmanni.com
```

#### Redirect URLs (Lista permitida)
Agregar AMBAS variantes:
```
https://getmanni.com
https://getmanni.com/*
https://www.getmanni.com
https://www.getmanni.com/*
http://localhost:3001    (solo desarrollo)
```

**⚠️ IMPORTANTE:** Remover cualquier referencia a herokuapp.com

---

### 2. Google Cloud Console

**Ubicación:** APIs & Services → Credentials → OAuth 2.0 Client IDs

#### Authorized JavaScript Origins
```
https://getmanni.com
https://www.getmanni.com
https://adgxouvmnkhcqfyyfrfo.supabase.co
http://localhost:3001    (desarrollo)
```

#### Authorized Redirect URIs
```
https://adgxouvmnkhcqfyyfrfo.supabase.co/auth/v1/callback
https://getmanni.com/auth/google/callback
https://www.getmanni.com/auth/google/callback
https://getmanni.com
https://www.getmanni.com
```

**⚠️ IMPORTANTE:** Remover cualquier referencia a herokuapp.com

---

### 3. Mercado Pago

**Ubicación:** Portal de Desarrolladores → Tu Aplicación → Redirect URIs

#### Redirect URIs
Agregar AMBAS variantes:
```
https://getmanni.com/oauth/mercadopago/callback
https://www.getmanni.com/oauth/mercadopago/callback
```

**Nota:** El código usa `BASE_URL` de Heroku, así que asegúrate que:
```bash
heroku config:get BASE_URL -a maneki-36d85d517656
# Debería mostrar: https://getmanni.com o https://www.getmanni.com
```

Si necesitas cambiar:
```bash
# Opción 1: Sin www
heroku config:set BASE_URL=https://getmanni.com -a maneki-36d85d517656

# Opción 2: Con www
heroku config:set BASE_URL=https://www.getmanni.com -a maneki-36d85d517656
```

---

### 4. Enable Banking (EuBanks)

**Ubicación:** Portal de desarrolladores EuBanks → OAuth Configuration

#### Redirect URIs
```
https://getmanni.com/oauth/eubanks/callback
https://www.getmanni.com/oauth/eubanks/callback
```

---

### 5. Mercury (si está activo)

**Ubicación:** Mercury Developer Portal → OAuth Settings

#### Redirect URIs
```
https://getmanni.com/oauth/mercury/callback
https://www.getmanni.com/oauth/mercury/callback
```

---

## Configuración de DNS/Cloudflare

Para que tanto `getmanni.com` como `www.getmanni.com` funcionen, necesitas configurar:

### Opción A: Ambos dominios apuntan a Heroku (Recomendado)

**En Cloudflare o tu proveedor DNS:**

1. **Registro A o CNAME para dominio raíz:**
   ```
   Type: CNAME
   Name: @
   Target: maneki-36d85d517656.herokuapp.com
   ```

2. **Registro CNAME para www:**
   ```
   Type: CNAME
   Name: www
   Target: maneki-36d85d517656.herokuapp.com
   ```

3. **En Heroku, agregar ambos dominios:**
   ```bash
   heroku domains:add getmanni.com -a maneki-36d85d517656
   heroku domains:add www.getmanni.com -a maneki-36d85d517656
   ```

### Opción B: Redirect de www a no-www (o viceversa)

Si prefieres que solo UNA versión sea la canónica:

**En Cloudflare:**
1. Page Rules → Create Page Rule
2. Si prefieres **sin www:**
   ```
   URL: www.getmanni.com/*
   Setting: Forwarding URL (301 - Permanent Redirect)
   Destination: https://getmanni.com/$1
   ```

3. Si prefieres **con www:**
   ```
   URL: getmanni.com/*
   Setting: Forwarding URL (301 - Permanent Redirect)
   Destination: https://www.getmanni.com/$1
   ```

**Recomendación:** Usar Opción A (ambos dominios funcionan) porque es más flexible para OAuth.

---

## Verificación de Configuración

### Test 1: Google OAuth
```
1. Abrir https://getmanni.com → Login
2. ✅ Debería funcionar
3. Abrir https://www.getmanni.com → Login
4. ✅ Debería funcionar
5. Verificar URL final: debe mantener el dominio usado (con o sin www)
```

### Test 2: Mercado Pago OAuth
```
1. Ir a https://www.getmanni.com/conexiones
2. Conectar Mercado Pago
3. ✅ Callback debe volver a: https://www.getmanni.com/conexiones?connection=success&provider=mercadopago
4. ✅ NO debe tener hash (#)
5. Repetir desde https://getmanni.com/conexiones
```

### Test 3: Navegación Post-OAuth
```
1. Después de OAuth callback exitoso
2. ✅ URL debe ser: /conexiones?connection=success
3. ✅ Debe mostrar mensaje de éxito
4. ✅ Debe cargar lista de conexiones automáticamente
```

---

## Troubleshooting

### Error: "redirect_uri_mismatch" en Mercado Pago
**Causa:** La URL registrada no coincide con la usada

**Solución:**
1. Verificar `BASE_URL` en Heroku: `heroku config:get BASE_URL`
2. Verificar que esa misma URL esté registrada en Mercado Pago con `/oauth/mercadopago/callback`
3. Si usas www, asegúrate que AMBAS variantes estén registradas

### OAuth funciona pero redirige con hash
**Causa:** Código desactualizado

**Solución:**
- Verificar que los cambios en `server-dev.js` estén deployados
- Las líneas 1200 y 1402 deben redirigir a `/conexiones` (sin hash)

### Funciona sin www pero no con www
**Causa:** DNS o Heroku domains

**Solución:**
1. Verificar en Heroku: `heroku domains -a maneki-36d85d517656`
2. Debe aparecer tanto `getmanni.com` como `www.getmanni.com`
3. Si falta alguno, agregarlo: `heroku domains:add www.getmanni.com`

### Conexiones no se cargan después del OAuth
**Causa:** Router no está llamando a `loadConnections()`

**Solución:**
- Verificado en código: línea 315 de upload-supabase.js ahora incluye:
  ```javascript
  else if (sectionName === 'conexiones') {
    loadConnections();
  }
  ```

---

## Resumen de Cambios

### Código (✅ Completado)
- ✅ Redirects OAuth sin hash (server-dev.js)
- ✅ Router maneja `/conexiones` correctamente
- ✅ Carga automática de conexiones al navegar
- ✅ Limpieza de URLs post-OAuth

### Configuración Externa (⏳ Pendiente - Tu tarea)
- ⏳ Supabase: Agregar www.getmanni.com a redirect URLs
- ⏳ Google Console: Agregar www variant en redirect URIs
- ⏳ Mercado Pago: Agregar ambas variantes de callback URL
- ⏳ EuBanks: Agregar ambas variantes (si está activo)
- ⏳ Heroku: Verificar que ambos dominios estén agregados
- ⏳ DNS/Cloudflare: Configurar CNAME para www

---

## Checklist Final

Antes de considerar la migración completa:

- [ ] Ambos dominios (con/sin www) apuntan a Heroku
- [ ] `BASE_URL` en Heroku config está configurado correctamente
- [ ] Supabase permite ambas variantes en redirect URLs
- [ ] Google Cloud Console tiene ambas variantes registradas
- [ ] Mercado Pago tiene ambas variantes de callback
- [ ] OAuth de Google funciona desde ambos dominios
- [ ] OAuth de Mercado Pago funciona desde ambos dominios
- [ ] URLs finales NO tienen hash (#)
- [ ] Conexiones se cargan automáticamente post-OAuth
- [ ] Navegación funciona correctamente en /conexiones
