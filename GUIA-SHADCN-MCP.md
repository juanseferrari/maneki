# 📘 Guía de Uso: MCP de shadcn/ui

## ✅ Estado de Configuración

El MCP de shadcn está **correctamente configurado** en tu proyecto:

```json
// .mcp.json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

- ✅ Archivo `.mcp.json` configurado
- ✅ Registry `@shadcn` detectado
- ✅ Herramientas MCP funcionando

## 🛠️ Herramientas Disponibles

### 1. Buscar Componentes
**Herramienta**: `mcp__shadcn__search_items_in_registries`

**Cómo pedirlo**:
- "Busca componentes de botones en shadcn"
- "Busca componentes para formularios"
- "Qué componentes hay para tablas"

**Resultado**: Lista de componentes que coinciden con tu búsqueda

---

### 2. Ver Detalles de Componente
**Herramienta**: `mcp__shadcn__view_items_in_registries`

**Cómo pedirlo**:
- "Muéstrame el componente button de shadcn"
- "Quiero ver el código del componente card"
- "Dame los detalles del componente dialog"

**Resultado**: Código completo del componente, archivos, y dependencias

---

### 3. Ver Ejemplos de Uso
**Herramienta**: `mcp__shadcn__get_item_examples_from_registries`

**Cómo pedirlo**:
- "Muéstrame ejemplos del componente accordion"
- "Dame ejemplos de uso del button"
- "Quiero ver demos del componente table"

**Patrones de búsqueda**:
- `"accordion-demo"` → Demo específico
- `"button example"` → Ejemplos generales
- `"card-demo"` → Demo de cards

**Resultado**: Código completo de ejemplos con implementación

---

### 4. Obtener Comando de Instalación
**Herramienta**: `mcp__shadcn__get_add_command_for_items`

**Cómo pedirlo**:
- "Dame el comando para instalar button y card"
- "Cómo instalo el componente table"
- "Comando para agregar dialog al proyecto"

**Resultado**: Comando exacto para instalar, ejemplo:
```bash
npx shadcn@latest add @shadcn/button @shadcn/card
```

---

### 5. Listar Todos los Componentes
**Herramienta**: `mcp__shadcn__list_items_in_registries`

**Cómo pedirlo**:
- "Lista todos los componentes de shadcn"
- "Qué componentes están disponibles"
- "Muéstrame todos los componentes del registry"

**Resultado**: Lista completa de componentes disponibles

---

### 6. Checklist de Auditoría
**Herramienta**: `mcp__shadcn__get_audit_checklist`

**Cómo pedirlo**:
- "Dame el checklist de auditoría"
- "Qué debo verificar después de agregar componentes"

**Resultado**: Lista de verificación para asegurar que todo funciona

---

## 📝 Ejemplos de Uso Completo

### Ejemplo 1: Agregar un Botón
```
Usuario: "Necesito agregar un botón a mi proyecto"

Flujo:
1. Yo busco: "button" en el registry
2. Muestro detalles del componente @shadcn/button
3. Te doy el comando: npx shadcn@latest add @shadcn/button
4. Tú ejecutas el comando
5. Yo te doy el checklist de verificación
```

### Ejemplo 2: Ver Ejemplos de Accordion
```
Usuario: "Muéstrame ejemplos de uso del accordion"

Flujo:
1. Yo busco ejemplos: "accordion-demo"
2. Te muestro código completo con:
   - Importaciones
   - Componente funcional
   - Ejemplos de uso
   - Estilos si aplica
```

### Ejemplo 3: Explorar Componentes de Formulario
```
Usuario: "¿Qué componentes de formulario hay?"

Flujo:
1. Yo busco: "form" en el registry
2. Te muestro lista:
   - @shadcn/form
   - @shadcn/input
   - @shadcn/select
   - @shadcn/checkbox
   - @shadcn/radio-group
   - @shadcn/textarea
   - @shadcn/switch
3. Puedes pedirme detalles de cualquiera
```

---

## 🚀 Flujo de Trabajo Recomendado

Para agregar un nuevo componente a tu proyecto:

```
1. BUSCAR
   "Busca componentes de [tipo]"

2. VER DETALLES
   "Muéstrame el componente [nombre]"

3. VER EJEMPLOS
   "Dame ejemplos de [nombre]"

4. OBTENER COMANDO
   "Comando para instalar [nombre]"

5. EJECUTAR
   npx shadcn@latest add @shadcn/[nombre]

6. VERIFICAR
   "Dame el checklist de auditoría"
```

---

## 💡 Tipos de Componentes Disponibles

### UI Básicos
- `button`, `input`, `label`, `badge`, `avatar`

### Navegación
- `tabs`, `navigation-menu`, `breadcrumb`, `pagination`

### Formularios
- `form`, `select`, `checkbox`, `radio-group`, `switch`, `textarea`

### Feedback
- `alert`, `toast`, `dialog`, `alert-dialog`, `sonner`

### Layout
- `card`, `separator`, `aspect-ratio`, `scroll-area`, `resizable`

### Data Display
- `table`, `accordion`, `collapsible`, `hover-card`

### Overlay
- `dialog`, `sheet`, `popover`, `dropdown-menu`, `context-menu`, `tooltip`

### Y más...
- `calendar`, `command`, `slider`, `progress`, `skeleton`

---

## 🎯 Cómo Pedirme Ayuda

### ✅ Formas Correctas (háblame naturalmente):

- "Busca componentes de calendario"
- "Muéstrame el componente table"
- "Dame ejemplos del dropdown-menu"
- "Comando para instalar button y card"
- "Lista todos los componentes"
- "Qué componentes hay para modales"

### ❌ NO necesitas decir:

- "Usa el MCP de shadcn para..." (ya lo sé)
- "Ejecuta la herramienta mcp__shadcn..." (lo haré automáticamente)
- Comandos técnicos (yo los manejo por ti)

---

## ⚠️ Nota Importante

**Tu proyecto NO tiene `components.json` todavía.**

Para usar shadcn/ui en tu proyecto, necesitas:

### Opción A: Inicializar shadcn (Recomendado)
```bash
npx shadcn@latest init
```

Esto te preguntará:
- ¿Qué framework? (Next.js, Vite, etc.)
- ¿Dónde guardar componentes? (ej: `components/ui`)
- ¿Qué estilo? (Default, New York)
- ¿Qué colores base?

Luego podrás instalar componentes con:
```bash
npx shadcn@latest add button card table
```

### Opción B: Crear `components.json` manualmente
Si ya tienes un proyecto configurado, puedo ayudarte a crear el archivo de configuración.

---

## 📦 Integración con tu Proyecto Actual

Tu proyecto usa:
- **Backend**: Node.js + Express
- **Base de datos**: Supabase (PostgreSQL)
- **Frontend**: EJS templates + JavaScript vanilla

shadcn/ui está diseñado principalmente para **React**, pero hay alternativas:

### Alternativas para tu stack:
1. **DaisyUI** - Componentes para Tailwind CSS (no requiere React)
2. **Tailwind UI** - Componentes HTML/CSS puros
3. **Bootstrap 5** - Framework CSS tradicional
4. **Bulma** - Framework CSS moderno

### Si quieres usar shadcn:
Necesitarías agregar React a tu frontend, lo cual es viable pero requiere refactorización.

---

## 🤔 ¿Qué Prefieres?

1. **Inicializar shadcn/ui** y migrar a React (más trabajo, componentes modernos)
2. **Usar alternativa sin React** como DaisyUI (más fácil, compatible con tu stack)
3. **Solo explorar** shadcn para ver qué componentes hay (sin instalación)

Dime qué prefieres y te ayudo con los siguientes pasos.

---

## 📚 Recursos Útiles

- **Documentación**: https://ui.shadcn.com
- **Componentes**: https://ui.shadcn.com/docs/components
- **Ejemplos**: https://ui.shadcn.com/examples
- **GitHub**: https://github.com/shadcn-ui/ui

---

**Resumen**: El MCP está configurado y funciona. Solo pídeme lo que necesites de forma natural, y yo usaré las herramientas MCP automáticamente para ayudarte. 🚀
