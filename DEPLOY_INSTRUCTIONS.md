# Instrucciones de Deployment - Acción Requerida

## ⚠️ Paso Crítico: Actualizar package-lock.json

El deployment a Heroku está fallando porque el `package-lock.json` no está sincronizado con las nuevas dependencias en `package.json`.

### Solución:

Ejecuta estos comandos en tu terminal local:

```bash
# 1. Eliminar node_modules y package-lock.json
rm -rf node_modules package-lock.json

# 2. Instalar dependencias (esto regenerará package-lock.json)
npm install

# 3. Commit el nuevo package-lock.json
git add package-lock.json
git commit -m "Update package-lock.json for automation dependencies"

# 4. Push a GitHub y Heroku
git push origin main
git push heroku main
```

## Estado Actual

✅ **Completado:**
- Variables de entorno configuradas en Heroku
- Tablas de base de datos creadas
- Código committeado y pusheado a GitHub
- Linear webhook configurado

⏳ **Pendiente:**
- Actualizar package-lock.json (ESTE PASO)
- Deploy a Heroku
- Configurar GitHub Secrets (opcional para CI)
- Probar con issue real

## Después del Deploy

### 1. Verificar que el servidor está corriendo

```bash
curl https://maneki.herokuapp.com/health
```

O visita: https://maneki.herokuapp.com

### 2. Verificar logs

```bash
heroku logs --tail --app maneki
```

### 3. Probar webhook de Linear

```bash
curl -X POST https://maneki.herokuapp.com/api/webhooks/linear \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: test" \
  -d '{
    "type": "Issue",
    "action": "create",
    "data": {
      "id": "test-id",
      "identifier": "TEST-1",
      "title": "Test Issue",
      "url": "https://linear.app/test",
      "labels": [{"name": "claude-auto"}],
      "state": {"name": "Todo"}
    }
  }'
```

Deberías ver en los logs:
```
[Linear Webhook] Received webhook event
```

## Crear tu Primer Issue Automatizado

Una vez que el deployment esté completo, crea un issue en Linear:

**Título:** Add health check endpoint

**Descripción:**
```
Create a simple health check endpoint for monitoring.

Requirements:
- Endpoint: GET /health
- Response: { "status": "ok", "timestamp": "ISO8601" }
- No authentication required

Related files:
- server-supabase.js (add route here)
```

**Labels:** `claude-auto`

**Status:** "Todo"

### Qué Esperar:

1. **5 minutos:** Comentario en Linear "Analyzing issue"
2. **10 minutos:** "Implementing solution"
3. **15 minutos:** "Running tests"
4. **20 minutos:** "Creating pull request"
5. **25 minutos:** PR creado y linked en Linear
6. **30 minutos:** CI pasa, auto-merge, deploy a Heroku

## Configurar GitHub Secrets (Opcional)

Para que funcione el CI/CD en GitHub Actions, necesitas configurar estos secrets manualmente:

1. Ve a: https://github.com/juanseferrari/maneki/settings/secrets/actions

2. Agrega estos secrets (usa los valores de tu `.env`):
   - `HEROKU_API_KEY` = (tu Heroku API key)
   - `HEROKU_APP_NAME` = `maneki`
   - `HEROKU_EMAIL` = (tu email de Heroku)
   - `LINEAR_API_KEY` = (tu Linear API key)

## Troubleshooting

### Si el deployment sigue fallando:

```bash
# Ver logs de build
heroku logs --tail --app maneki

# Reiniciar dyno
heroku restart --app maneki

# Verificar que las variables están configuradas
heroku config --app maneki | grep -E "ANTHROPIC|LINEAR|GITHUB"
```

### Si el webhook no funciona:

1. Verifica que Linear webhook esté configurado:
   - URL: `https://maneki.herokuapp.com/api/webhooks/linear`
   - Secret: `lin_wh_toh4AApVFgw8C8VY68IgtGufhFf6HWQ0sr34wsRn4y5B`

2. Verifica que el servidor responde:
   ```bash
   curl https://maneki.herokuapp.com/api/webhooks/linear
   ```

3. Revisa logs cuando crees un issue:
   ```bash
   heroku logs --tail --app maneki | grep Linear
   ```

## Próximos Pasos

Una vez que todo esté funcionando:

1. ✅ Crear 3-5 issues de prueba
2. ✅ Revisar PRs generados
3. ✅ Monitorear métricas en `automation_jobs` table
4. ✅ Ajustar prompts si es necesario
5. ✅ Habilitar aprobación manual después de 1 mes

---

**¡Estás casi listo!** Solo falta actualizar el package-lock.json y hacer el deploy final. 🚀
