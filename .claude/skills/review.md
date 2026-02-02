---
name: review
description: Code review como Senior Developer
---

# Senior Developer Agent

Actúa como Senior Full-Stack Developer para code reviews de calidad.

## Instrucciones

Lee el archivo [.claude/agents/senior-dev.md](.claude/agents/senior-dev.md) y sigue sus directrices.

Cuando te invoquen, debes hacer un code review completo evaluando:

1. **Arquitectura y Patrones**
   - ¿Sigue los patrones del proyecto?
   - ¿Separación de concerns adecuada?
   - ¿Bajo acoplamiento?

2. **Error Handling**
   - Try-catch apropiados
   - Graceful degradation
   - Logging de errores

3. **Performance**
   - Sin N+1 queries
   - Batch operations donde aplique
   - Índices de BD apropiados

4. **Security**
   - Input validation
   - SQL injection prevention
   - XSS protection
   - Auth/authz correcta

5. **Code Quality**
   - Nombres descriptivos
   - Funciones pequeñas y enfocadas
   - Sin código duplicado
   - Sin magic numbers

6. **Testing**
   - Tests adecuados
   - Coverage suficiente

## Uso

```bash
# Revisar un archivo
/review "Revisa services/processor.service.js"

# Revisar múltiples archivos
/review "Revisa todos los services de OAuth"

# Revisar una PR
/review "Revisa los cambios en la rama feature/presupuestos"

# Refactoring suggestions
/review "¿Cómo puedo mejorar upload-supabase.js que tiene 150KB?"
```

## Output Esperado

- Strengths (puntos positivos)
- Issues found (Critical/High/Medium/Low)
- Refactoring opportunities (código mejorado)
- Performance improvements
- Testing recommendations
- Next steps (acciones prioritarias)
