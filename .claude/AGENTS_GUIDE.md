# Guía de Agentes Personalizados de Maneki

Esta guía explica cómo usar los agentes especializados configurados para el proyecto Maneki.

## 🎯 ¿Qué son los Agentes?

Los agentes son "roles" especializados que Claude Code puede asumir para ayudarte con diferentes aspectos del desarrollo:

- **Product Manager**: Analiza features, define user stories, prioriza roadmap
- **QA Expert**: Diseña estrategias de testing, identifica edge cases, detecta bugs
- **Senior Developer**: Code reviews, refactoring, best practices
- **UI/UX Designer**: Audita UX, propone mejoras de diseño, accesibilidad
- **DevOps Expert**: CI/CD, monitoring, deployment automation
- **Software Architect**: Decisiones arquitectónicas de alto nivel

## 📁 Estructura de Archivos

```
.claude/
├── agents/                      # Definiciones de agentes
│   ├── product-manager.md
│   ├── qa-expert.md
│   ├── senior-dev.md
│   ├── ui-designer.md
│   ├── devops-expert.md
│   └── architect.md
│
├── skills/                      # Comandos para invocar agentes
│   ├── pm.md                    # /pm
│   ├── qa.md                    # /qa
│   ├── review.md                # /review
│   ├── design.md                # /design
│   ├── devops.md                # /devops
│   └── architect.md             # /architect
│
└── AGENTS_GUIDE.md             # Esta guía
```

## 🚀 Cómo Usar los Agentes

### Método 1: Comandos Slash (Recomendado)

Los **skills** son comandos que puedes invocar directamente:

```bash
# Product Manager
/pm "Quiero agregar presupuestos por categoría"
/pm "Prioriza: presupuestos, app móvil, detección de fraude"

# QA Expert
/qa "Revisa services/categorization.service.js"
/qa "Necesito implementar tests. ¿Por dónde empiezo?"

# Senior Developer (Code Review)
/review "Revisa services/processor.service.js"
/review "¿Cómo mejoro upload-supabase.js (150KB)?"

# UI/UX Designer
/design "Audita el dashboard principal"
/design "Mejora el flujo de upload de archivos"

# DevOps Expert
/devops "Configura CI/CD desde cero"
/devops "Agrega monitoring y error tracking"

# Software Architect
/architect "Diseña arquitectura para sistema de presupuestos"
/architect "¿Uso Redis o caching en BD para exchange rates?"
```

### Método 2: Referencia Directa

También puedes mencionar el rol explícitamente:

```bash
"Actúa como Product Manager y analiza esta feature: [descripción]"
"Como QA Expert, revisa este endpoint: POST /upload"
"Haz un code review senior de este archivo: [file]"
```

## 📋 Casos de Uso por Agente

### 1. Product Manager (`/pm`)

**Cuándo usar:**
- Antes de empezar a codear una feature nueva
- Para definir requisitos claros
- Para priorizar entre múltiples features
- Para crear roadmap de producto

**Ejemplos:**
```bash
/pm "Quiero agregar un sistema de presupuestos. Ayúdame a definirlo"
/pm "Tengo 5 ideas de features. ¿Cuál debería hacer primero?"
/pm "Analiza el valor de negocio de implementar detección de fraude"
```

**Output esperado:**
- User stories claras
- Criterios de aceptación
- Matriz de priorización (Impacto vs Esfuerzo)
- Riesgos identificados
- Roadmap por fases

---

### 2. QA Expert (`/qa`)

**Cuándo usar:**
- Antes de escribir tests (para diseñar estrategia)
- Para identificar edge cases que no consideraste
- Para revisar código desde perspectiva de testabilidad
- Para detectar bugs potenciales

**Ejemplos:**
```bash
/qa "Analiza la testabilidad de services/categorization.service.js"
/qa "Qué edge cases debería testear en el upload de archivos?"
/qa "Diseña una estrategia de testing para Maneki"
/qa "Revisa seguridad del endpoint PUT /transactions/:id"
```

**Output esperado:**
- Test plan detallado
- Edge cases identificados
- Código de tests propuestos
- Bugs potenciales detectados
- Recomendaciones de herramientas (Vitest, Supertest)

---

### 3. Senior Developer (`/review`)

**Cuándo usar:**
- Para code reviews de calidad
- Para refactoring suggestions
- Para mejorar performance
- Para aplicar best practices

**Ejemplos:**
```bash
/review "Revisa services/processor.service.js"
/review "Este archivo tiene 500 líneas. ¿Cómo lo refactorizo?"
/review "¿Cómo optimizo las queries de dashboard?"
/review "Encuentra code smells en mi código"
```

**Output esperado:**
- Strengths del código
- Issues (Critical/High/Medium/Low)
- Refactoring opportunities con código mejorado
- Performance improvements
- Security recommendations

---

### 4. UI/UX Designer (`/design`)

**Cuándo usar:**
- Para mejorar usabilidad de una página
- Para diseñar nuevos componentes
- Para auditorías de accesibilidad
- Para crear design systems

**Ejemplos:**
```bash
/design "Audita UX del dashboard principal"
/design "Mejora el flujo de upload de archivos"
/design "Diseña un sistema de notificaciones toast"
/design "Revisa accesibilidad (WCAG AA) del form de transacciones"
/design "Necesito un design system. ¿Cómo empiezo?"
```

**Output esperado:**
- Audit de usabilidad y accesibilidad
- Propuestas de mejora (con código CSS/HTML)
- Design tokens y componentes reutilizables
- Mockups o wireframes descritos
- Priorización de mejoras (P0/P1/P2)

---

### 5. DevOps Expert (`/devops`)

**Cuándo usar:**
- Para configurar CI/CD pipeline
- Para dockerizar la app
- Para setup de monitoring
- Para estrategia de deployment

**Ejemplos:**
```bash
/devops "Configura GitHub Actions CI/CD completo"
/devops "Dockeriza la aplicación de Maneki"
/devops "Agrega monitoring con Sentry y logging estructurado"
/devops "¿Cómo hago deploy a staging y producción?"
/devops "Diseña estrategia de backups de la BD"
```

**Output esperado:**
- GitHub Actions workflows (código completo)
- Dockerfile y docker-compose
- Setup de monitoring (Sentry, Prometheus, etc)
- Migration y deployment strategy
- Estimación de costos

---

### 6. Software Architect (`/architect`)

**Cuándo usar:**
- Para decisiones arquitectónicas grandes
- Para evaluar trade-offs de tecnologías
- Para diseñar nuevos módulos complejos
- Para refactoring arquitectónico

**Ejemplos:**
```bash
/architect "Diseña arquitectura para sistema de presupuestos"
/architect "¿Migro de EJS a React? Evalúa pros/cons"
/architect "¿Redis vs caching en BD para exchange rates?"
/architect "Diseña API REST para módulo de reportes"
/architect "¿Cómo escalo Maneki a 100k usuarios?"
```

**Output esperado:**
- Propuestas arquitectónicas con diagramas
- Comparación de opciones (tabla de pros/cons)
- Data model design
- API contracts
- Migration path
- Consideraciones de escalabilidad

---

## 🔄 Workflows Recomendados

### Workflow 1: Nueva Feature (End-to-End)

```bash
# 1. Definir feature (Product Manager)
/pm "Quiero agregar sistema de presupuestos por categoría"

# 2. Diseñar arquitectura (Architect)
/architect "Diseña arquitectura y data model para presupuestos"

# 3. Diseñar UX (Designer)
/design "Diseña interfaz para gestión de presupuestos"

# 4. Implementar código
# ... codeas la feature ...

# 5. Code review (Senior Dev)
/review "Revisa implementación de presupuestos"

# 6. Testing (QA Expert)
/qa "Diseña tests para módulo de presupuestos"

# 7. Deploy (DevOps)
/devops "Actualiza CI/CD para incluir tests de presupuestos"
```

### Workflow 2: Refactoring

```bash
# 1. Code review inicial
/review "upload-supabase.js tiene 150KB. ¿Cómo lo mejoro?"

# 2. Propuesta arquitectónica
/architect "Diseña modularización de upload-supabase.js"

# 3. Refactorizar
# ... implementas cambios ...

# 4. Testing
/qa "Diseña tests para los nuevos módulos de upload"
```

### Workflow 3: Optimización de Performance

```bash
# 1. Análisis inicial
/review "Analiza performance de dashboard.js"

# 2. Propuestas arquitectónicas
/architect "¿Cómo optimizo queries del dashboard?"

# 3. DevOps (caching)
/devops "Implementa Redis para cachear stats del dashboard"

# 4. Testing
/qa "Cómo testeo que el caching funcione correctamente?"
```

### Workflow 4: Setup Inicial de Proyecto

```bash
# 1. CI/CD
/devops "Configura GitHub Actions CI/CD completo"

# 2. Testing strategy
/qa "Diseña estrategia de testing para Maneki"

# 3. Design system
/design "Crea design system con tokens y componentes base"

# 4. Monitoring
/devops "Setup monitoring, logging y error tracking"
```

---

## 💡 Tips y Best Practices

### 1. Sé Específico
```bash
# ❌ Muy genérico
/pm "Analiza la app"

# ✅ Específico
/pm "Analiza feature de auto-categorización: prioridad, user stories y roadmap"
```

### 2. Provee Contexto
```bash
# ❌ Sin contexto
/qa "Revisa este archivo"

# ✅ Con contexto
/qa "Revisa services/categorization.service.js - específicamente el algoritmo de longest-match. ¿Qué edge cases faltan?"
```

### 3. Combina Agentes
```bash
# Usa múltiples perspectivas para decisiones complejas
/architect "¿Uso Redis o caching en BD?"
/devops "¿Cuáles son las implicaciones operacionales de usar Redis?"
/review "¿Cómo afecta esto a la complejidad del código?"
```

### 4. Itera
```bash
# Primera pasada
/pm "Analiza feature de presupuestos"

# Profundiza basado en output
/pm "Del análisis anterior, prioriza entre presupuesto mensual vs anual"
```

### 5. Usa para Aprender
```bash
# Pide explicaciones
/review "Explica por qué este patrón es mejor que el actual"
/qa "¿Por qué este edge case es importante?"
/architect "¿Cuáles son los trade-offs de usar microservicios?"
```

---

## 🎓 Ejercicios de Práctica

Para familiarizarte con los agentes, prueba estos ejercicios:

### Ejercicio 1: Feature Completa
Implementa "Alertas de presupuesto excedido" usando todos los agentes:
1. `/pm` - Define feature
2. `/architect` - Diseña arquitectura
3. `/design` - Diseña notificación toast
4. Implementa código
5. `/review` - Code review
6. `/qa` - Test plan

### Ejercicio 2: Refactoring
Mejora `upload-supabase.js` (150KB):
1. `/review` - Identifica problemas
2. `/architect` - Propón modularización
3. Refactoriza
4. `/qa` - Tests para nuevo código

### Ejercicio 3: Performance
Optimiza dashboard:
1. `/review` - Analiza performance
2. `/architect` - Propón caching strategy
3. `/devops` - Implementa Redis
4. `/qa` - Tests de performance

---

## 🔧 Personalización

Puedes modificar los agentes editando los archivos en `.claude/agents/`:

```bash
# Editar Product Manager
code .claude/agents/product-manager.md

# Editar QA Expert
code .claude/agents/qa-expert.md
```

También puedes crear **nuevos agentes** para roles específicos de tu proyecto:

```bash
# Ejemplo: Agente de Security Expert
.claude/agents/security-expert.md
.claude/skills/security.md
```

---

## 📚 Recursos Adicionales

- **Claude Code Docs**: https://docs.anthropic.com/claude/docs/claude-code
- **Agent SDK**: https://github.com/anthropics/agent-sdk
- **Skills Custom**: Docs de cómo crear skills personalizados

---

## 🤝 Contribuir

Si creas nuevos agentes útiles para Maneki, documéntalos aquí y comparte!

---

## 📝 Changelog

- **2024-01-31**: Creación inicial con 6 agentes (PM, QA, Senior Dev, Designer, DevOps, Architect)

---

**¿Preguntas?** Experimenta con los comandos y aprende iterando!
