# 🚀 Quick Start: Agentes de Claude Code

Guía rápida para empezar a usar los agentes personalizados de Maneki en 5 minutos.

---

## ⚡ Comandos Básicos

Estos son los 6 comandos principales que tienes disponible:

| Comando | Qué hace | Cuándo usarlo |
|---------|----------|---------------|
| `/pm` | Product Manager | Definir features, priorizar roadmap |
| `/qa` | QA Expert | Diseñar tests, encontrar bugs |
| `/review` | Senior Developer | Code review, refactoring |
| `/design` | UI/UX Designer | Mejorar interfaces, accesibilidad |
| `/devops` | DevOps Expert | CI/CD, deployment, monitoring |
| `/architect` | Software Architect | Decisiones arquitectónicas |

---

## 🎯 Prueba Esto Ahora

Copia y pega estos comandos para ver los agentes en acción:

### 1. Analiza una feature con el Product Manager
```bash
/pm "Analiza la feature de auto-categorización de transacciones. ¿Qué mejoras le harías?"
```

### 2. Pide un code review
```bash
/review "Revisa services/categorization.service.js y dame sugerencias de mejora"
```

### 3. Diseña tests
```bash
/qa "Diseña una estrategia de testing para Maneki. ¿Por dónde empiezo?"
```

### 4. Mejora la UX
```bash
/design "Audita la experiencia de usuario del flujo de upload de archivos"
```

### 5. Setup DevOps
```bash
/devops "Necesito configurar CI/CD con GitHub Actions. Dame un workflow completo"
```

### 6. Evalúa arquitectura
```bash
/architect "¿Debería usar Redis para cachear exchange rates o caching en la BD?"
```

---

## 💡 Tips para Mejores Resultados

### ✅ Haz Esto

**Sé específico:**
```bash
✅ /qa "Revisa el algoritmo de longest-match en categorization.service.js:45-78"
❌ /qa "Revisa todo"
```

**Da contexto:**
```bash
✅ /pm "Quiero agregar presupuestos. Usuarios piden alertas cuando se excede"
❌ /pm "Presupuestos"
```

**Combina agentes:**
```bash
1. /pm "Analiza feature de reportes PDF"
2. /architect "Diseña arquitectura para reportes PDF"
3. /review "Revisa implementación de reportes"
4. /qa "Tests para reportes PDF"
```

### ❌ Evita Esto

**Muy genérico:**
```bash
❌ /pm "Analiza la app"
❌ /review "Revisa el código"
```

**Sin contexto:**
```bash
❌ /design "Mejora el dashboard"  (¿qué específicamente?)
✅ /design "Mejora la visualización de categorías en el dashboard"
```

---

## 🎓 Ejercicio de 10 Minutos

Practica con esta secuencia completa:

```bash
# Paso 1: Define una feature (2 min)
/pm "Quiero agregar búsqueda full-text en transacciones"

# Paso 2: Diseña arquitectura (3 min)
/architect "Diseña la implementación de búsqueda full-text basándote en el análisis del PM"

# Paso 3: Code review de código existente (2 min)
/review "Revisa el endpoint GET /api/transactions para ver cómo integrarlo"

# Paso 4: Diseña tests (2 min)
/qa "Qué tests necesito para búsqueda full-text?"

# Paso 5: Mejora UX (1 min)
/design "Diseña el search bar con autocompletado"
```

---

## 📖 Workflows Comunes

### Workflow 1: Nueva Feature
```
/pm → /architect → [código] → /review → /qa
```

### Workflow 2: Refactoring
```
/review → /architect → [refactor] → /qa
```

### Workflow 3: Optimización
```
/review → /architect → /devops
```

### Workflow 4: Setup Inicial
```
/devops → /qa → /design
```

---

## 🔥 Casos de Uso Reales para Maneki

### Feature Planning
```bash
/pm "Analiza: (1) App móvil, (2) Detección de fraude, (3) Presupuestos. ¿Cuál priorizo?"
```

### Code Quality
```bash
/review "upload-supabase.js tiene 150KB. ¿Cómo lo refactorizo?"
```

### Testing Strategy
```bash
/qa "No tengo tests. Diseña estrategia de testing con coverage objetivo"
```

### UX Improvements
```bash
/design "El dashboard está muy básico. ¿Cómo lo mejoro?"
```

### DevOps Setup
```bash
/devops "Configura CI/CD completo: lint, tests, deploy a staging y prod"
```

### Architecture Decisions
```bash
/architect "¿Migro de EJS a React? Evalúa pros/cons y esfuerzo"
```

---

## 🎯 Próximos Pasos

1. **Prueba los comandos de ejemplo** arriba
2. **Lee la guía completa:** [AGENTS_GUIDE.md](AGENTS_GUIDE.md)
3. **Ve ejemplos detallados:** [EXAMPLES.md](EXAMPLES.md)
4. **Personaliza los agentes** editando archivos en `.claude/agents/`

---

## 🆘 Ayuda

Si necesitas ayuda con los agentes:

```bash
# Ver lista de skills disponibles
/help

# Preguntar sobre un agente específico
"¿Cómo funciona el agente de Product Manager?"

# Pedir ejemplos
"Dame ejemplos de uso del comando /qa"
```

---

## 🚀 Empieza Ahora

Elige uno de estos comandos y pégalo para ver tu primer agente en acción:

```bash
/pm "Analiza las features actuales de Maneki y priorízalas"
```

```bash
/review "Revisa services/processor.service.js y dame feedback"
```

```bash
/qa "Diseña tests unitarios para services/categorization.service.js"
```

**¡Experimenta y aprende iterando!** 🎉
