# Ejemplos Prácticos de Uso de Agentes

Este documento muestra ejemplos reales de cómo usar los agentes en el desarrollo de Maneki.

---

## Ejemplo 1: Implementar Feature de Presupuestos

### Paso 1: Product Manager - Definir Feature

**Comando:**
```bash
/pm "Quiero agregar presupuestos por categoría con alertas cuando se excede el límite"
```

**Output esperado del PM:**
```markdown
## Feature: Sistema de Presupuestos por Categoría

### Problema
Los usuarios no tienen control proactivo sobre sus gastos. Actualmente
solo ven reportes históricos, pero no pueden establecer límites y
recibir alertas antes de excederse.

### User Stories

**US-1:** Como usuario, quiero establecer un presupuesto mensual para
cada categoría para controlar mis gastos.

**US-2:** Como usuario, quiero recibir una alerta cuando alcance el 80%
de mi presupuesto para tomar acción antes de excederme.

**US-3:** Como usuario, quiero ver mi progreso de presupuesto en el
dashboard para tener visibilidad constante.

### Criterios de Aceptación

**US-1:**
- [ ] El usuario puede crear presupuesto con: categoría, monto, periodo (mensual/semanal)
- [ ] El usuario puede editar presupuestos existentes
- [ ] El usuario puede desactivar (no eliminar) presupuestos
- [ ] El sistema valida que el monto sea > 0

**US-2:**
- [ ] El sistema calcula % consumido del presupuesto en tiempo real
- [ ] Se muestra alerta en dashboard cuando consumo >= 80%
- [ ] Se muestra alerta crítica cuando consumo >= 100%
- [ ] Las alertas son dismissibles pero reaparecen si aplica

**US-3:**
- [ ] El dashboard muestra card de "Presupuestos" con lista de categorías
- [ ] Cada categoría muestra: nombre, monto, % consumido, progress bar
- [ ] Color del progress bar cambia: verde (<70%), amarillo (70-90%), rojo (>90%)

### Prioridad: ALTA

**Impacto:** Alto (feature crítica para value prop)
**Esfuerzo:** Medio (backend + frontend + testing)
**Prioridad Final:** 8/10

### Riesgos
1. **Complejidad de cálculo:** Calcular consumo en tiempo real puede ser pesado si hay muchas transacciones
   - Mitigation: Cachear cálculos, recalcular solo cuando hay nueva transacción
2. **UX de alertas:** Pueden ser molestas si aparecen demasiado
   - Mitigation: Diseñar dismissible con cooldown de 24h

### Roadmap Propuesto

**Fase 1 (MVP):**
1. Backend: Tabla `budgets`, CRUD endpoints
2. Backend: Endpoint GET /api/budgets/status (calcula % consumido)
3. Frontend: UI de gestión de presupuestos
4. Frontend: Dashboard widget con progreso

**Fase 2 (Mejoras):**
5. Sistema de alertas en UI
6. Notificaciones push (si app móvil)
7. Historical tracking de presupuestos
8. Predicción de exceso basado en tendencia
```

---

### Paso 2: Architect - Diseñar Arquitectura

**Comando:**
```bash
/architect "Diseña arquitectura para sistema de presupuestos basado en el análisis del PM"
```

**Output esperado del Architect:**
```markdown
## Arquitectura: Sistema de Presupuestos

### Data Model

```sql
-- Tabla de presupuestos
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'ARS',
  period VARCHAR(20) NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un solo presupuesto activo por categoría por periodo
  CONSTRAINT unique_active_budget_per_category
    UNIQUE (user_id, category_id, period, is_active)
    WHERE is_active = true
);

CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_category_id ON budgets(category_id);
CREATE INDEX idx_budgets_active ON budgets(is_active) WHERE is_active = true;

-- Tabla de snapshots de presupuesto (para historical tracking)
CREATE TABLE budget_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  budgeted_amount DECIMAL(10,2) NOT NULL,
  spent_amount DECIMAL(10,2) NOT NULL,
  percentage_used DECIMAL(5,2) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('under', 'warning', 'exceeded')),
  snapshot_date DATE DEFAULT CURRENT_DATE,

  CONSTRAINT unique_snapshot_per_period UNIQUE (budget_id, period_start)
);

CREATE INDEX idx_budget_snapshots_budget_id ON budget_snapshots(budget_id);
```

### API Design

#### 1. CRUD de Presupuestos

**POST /api/budgets**
```json
Request:
{
  "category_id": "uuid",
  "amount": 50000,
  "currency": "ARS",
  "period": "monthly",
  "start_date": "2024-02-01"
}

Response (201):
{
  "id": "uuid",
  "category_id": "uuid",
  "amount": 50000,
  "currency": "ARS",
  "period": "monthly",
  "start_date": "2024-02-01",
  "is_active": true,
  "created_at": "2024-01-31T..."
}
```

**GET /api/budgets**
```json
Response (200):
{
  "budgets": [
    {
      "id": "uuid",
      "category": {
        "id": "uuid",
        "name": "Alimentación",
        "color": "#FF5733"
      },
      "amount": 50000,
      "currency": "ARS",
      "period": "monthly",
      "is_active": true
    }
  ]
}
```

**PUT /api/budgets/:id**
**DELETE /api/budgets/:id** (soft delete: is_active = false)

#### 2. Status de Presupuestos

**GET /api/budgets/status**
```json
Query params:
?period=current  // or specific date range

Response (200):
{
  "period": {
    "start": "2024-02-01",
    "end": "2024-02-29"
  },
  "budgets": [
    {
      "id": "uuid",
      "category": {
        "id": "uuid",
        "name": "Alimentación",
        "color": "#FF5733"
      },
      "budgeted_amount": 50000,
      "spent_amount": 42300,
      "remaining": 7700,
      "percentage_used": 84.6,
      "status": "warning",  // under | warning | exceeded
      "projection": {
        "estimated_end_of_month": 52000,
        "will_exceed": true
      }
    }
  ],
  "alerts": [
    {
      "budget_id": "uuid",
      "category_name": "Alimentación",
      "severity": "warning",  // warning | critical
      "message": "Has gastado el 84.6% de tu presupuesto de Alimentación"
    }
  ]
}
```

### Service Layer

```javascript
// services/budget.service.js
class BudgetService {
  constructor(supabaseService) {
    this.supabase = supabaseService;
  }

  // CRUD
  async createBudget(userId, budgetData) { }
  async getBudgets(userId, filters = {}) { }
  async updateBudget(budgetId, userId, updates) { }
  async deactivateBudget(budgetId, userId) { }

  // Status
  async getBudgetStatus(userId, period = 'current') {
    const budgets = await this.getActiveBudgets(userId);
    const { startDate, endDate } = this.calculatePeriod(period);

    const status = await Promise.all(budgets.map(async (budget) => {
      const spent = await this.calculateSpent(
        userId,
        budget.category_id,
        startDate,
        endDate
      );

      const percentageUsed = (spent / budget.amount) * 100;
      const status = this.determineStatus(percentageUsed);

      return {
        ...budget,
        spent_amount: spent,
        remaining: budget.amount - spent,
        percentage_used: percentageUsed,
        status,
        projection: await this.projectEndOfPeriod(
          spent,
          budget.amount,
          startDate,
          endDate
        )
      };
    }));

    const alerts = this.generateAlerts(status);

    return { period: { start: startDate, end: endDate }, budgets: status, alerts };
  }

  async calculateSpent(userId, categoryId, startDate, endDate) {
    const { data } = await this.supabase.supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('type', 'debit');  // Solo gastos

    return data.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }

  determineStatus(percentageUsed) {
    if (percentageUsed >= 100) return 'exceeded';
    if (percentageUsed >= 80) return 'warning';
    return 'under';
  }

  async projectEndOfPeriod(spent, budgeted, startDate, endDate) {
    // Proyección lineal basada en días transcurridos
    const totalDays = this.daysBetween(startDate, endDate);
    const daysElapsed = this.daysBetween(startDate, new Date());
    const dailyRate = spent / daysElapsed;
    const estimated = dailyRate * totalDays;

    return {
      estimated_end_of_month: Math.round(estimated),
      will_exceed: estimated > budgeted
    };
  }

  generateAlerts(budgetStatuses) {
    return budgetStatuses
      .filter(b => b.status !== 'under')
      .map(b => ({
        budget_id: b.id,
        category_name: b.category.name,
        severity: b.status === 'exceeded' ? 'critical' : 'warning',
        message: b.status === 'exceeded'
          ? `Has excedido tu presupuesto de ${b.category.name} (${b.percentage_used.toFixed(1)}%)`
          : `Has gastado el ${b.percentage_used.toFixed(1)}% de tu presupuesto de ${b.category.name}`
      }));
  }

  // Cron job para crear snapshots diarios
  async createDailySnapshots() {
    // Ejecutar cada noche a las 00:00
    // Para cada presupuesto activo, crear snapshot del día
  }
}
```

### Caching Strategy

Para optimizar performance:

```javascript
// Cache de status de presupuestos (5 minutos)
const BUDGET_STATUS_CACHE_KEY = (userId, period) =>
  `budget_status:${userId}:${period}`;

async getBudgetStatus(userId, period = 'current') {
  // Try cache first
  const cached = await redis.get(BUDGET_STATUS_CACHE_KEY(userId, period));
  if (cached) return JSON.parse(cached);

  // Calculate
  const status = await this._calculateBudgetStatus(userId, period);

  // Cache for 5 minutes
  await redis.setex(
    BUDGET_STATUS_CACHE_KEY(userId, period),
    300,
    JSON.stringify(status)
  );

  return status;
}

// Invalidar cache cuando se crea nueva transacción
async onTransactionCreated(userId) {
  await redis.del(BUDGET_STATUS_CACHE_KEY(userId, 'current'));
}
```

### Trade-offs Evaluados

| Opción | Pros | Contras | Decisión |
|--------|------|---------|----------|
| **Cálculo en tiempo real vs Snapshots diarios** | Siempre actualizado | Queries pesados con muchas txns | Híbrido: Cálculo real + cache 5min |
| **Redis cache vs In-memory** | Compartido entre instancias | Requiere Redis | Redis (ya necesario para otras features) |
| **Proyección simple vs ML** | Fácil de implementar | Menos preciso | Simple por ahora, ML en Fase 2 |
| **Alertas en DB vs In-memory** | Persistentes, auditables | Más complejidad | In-memory generadas on-the-fly |

### Implementation Phases

**Fase 1 (2 semanas):**
- [ ] Migrations de BD (budgets, budget_snapshots)
- [ ] BudgetService completo
- [ ] CRUD endpoints
- [ ] Status endpoint
- [ ] Tests unitarios + integración

**Fase 2 (1 semana):**
- [ ] Frontend: UI de gestión de presupuestos
- [ ] Frontend: Dashboard widget
- [ ] Sistema de alertas visual
- [ ] E2E tests

**Fase 3 (Mejoras futuras):**
- [ ] Proyecciones con ML
- [ ] Notificaciones push
- [ ] Presupuestos compartidos (familia)
```

---

### Paso 3: Designer - Diseñar UI

**Comando:**
```bash
/design "Diseña la interfaz de gestión de presupuestos y el widget del dashboard basándote en el análisis arquitectónico"
```

**Output esperado del Designer:**
```markdown
## UI Design: Sistema de Presupuestos

### 1. Dashboard Widget

**Layout:**
```
┌─────────────────────────────────────┐
│ 💰 Presupuestos de Febrero         │
├─────────────────────────────────────┤
│                                     │
│ Alimentación              84.6%    │
│ ████████████████▓▓░░  $42,300/$50k │
│ ⚠️ Estás cerca del límite           │
│                                     │
│ Transporte                45.2%    │
│ ████████░░░░░░░░░░  $9,040/$20k    │
│                                     │
│ Entretenimiento          102.3%    │
│ ████████████████████  $10,230/$10k │
│ 🚨 Has excedido tu presupuesto      │
│                                     │
│ Ver todos los presupuestos →       │
└─────────────────────────────────────┘
```

**Componente HTML:**
```html
<div class="budget-widget card">
  <div class="card-header">
    <h3 class="card-title">
      <span class="icon">💰</span>
      Presupuestos de Febrero
    </h3>
    <button class="btn-icon" aria-label="Configurar presupuestos">
      <svg>⚙️</svg>
    </button>
  </div>

  <div class="card-body">
    <!-- Budget Item: Under -->
    <div class="budget-item" data-status="under">
      <div class="budget-header">
        <span class="category-name">Transporte</span>
        <span class="percentage">45.2%</span>
      </div>
      <div class="progress-bar" role="progressbar"
           aria-valuenow="45" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill progress-under" style="width: 45.2%"></div>
      </div>
      <div class="budget-amounts">
        <span class="spent">$9,040</span>
        <span class="separator">/</span>
        <span class="budgeted">$20,000</span>
      </div>
    </div>

    <!-- Budget Item: Warning -->
    <div class="budget-item" data-status="warning">
      <div class="budget-header">
        <span class="category-name">Alimentación</span>
        <span class="percentage warning">84.6%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill progress-warning" style="width: 84.6%"></div>
      </div>
      <div class="budget-amounts">
        <span class="spent">$42,300</span>
        <span class="separator">/</span>
        <span class="budgeted">$50,000</span>
      </div>
      <div class="alert-inline alert-warning">
        <svg class="alert-icon">⚠️</svg>
        <span>Estás cerca del límite</span>
      </div>
    </div>

    <!-- Budget Item: Exceeded -->
    <div class="budget-item" data-status="exceeded">
      <div class="budget-header">
        <span class="category-name">Entretenimiento</span>
        <span class="percentage critical">102.3%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill progress-exceeded" style="width: 100%"></div>
      </div>
      <div class="budget-amounts">
        <span class="spent critical">$10,230</span>
        <span class="separator">/</span>
        <span class="budgeted">$10,000</span>
      </div>
      <div class="alert-inline alert-critical">
        <svg class="alert-icon">🚨</svg>
        <span>Has excedido tu presupuesto</span>
      </div>
    </div>
  </div>

  <div class="card-footer">
    <a href="/budgets" class="link-primary">
      Ver todos los presupuestos
      <svg class="icon-right">→</svg>
    </a>
  </div>
</div>
```

**CSS:**
```css
/* Budget Widget */
.budget-widget {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.budget-item {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-color);
}

.budget-item:last-child {
  border-bottom: none;
}

.budget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.category-name {
  font-weight: 600;
  color: var(--text-primary);
}

.percentage {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-success);
}

.percentage.warning {
  color: var(--color-warning);
}

.percentage.critical {
  color: var(--color-error);
}

/* Progress Bar */
.progress-bar {
  height: 8px;
  background: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-2);
}

.progress-fill {
  height: 100%;
  transition: width 400ms ease-out;
  border-radius: var(--radius-full);
}

.progress-under {
  background: linear-gradient(90deg, #10b981, #059669);
}

.progress-warning {
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

.progress-exceeded {
  background: linear-gradient(90deg, #ef4444, #dc2626);
}

/* Budget Amounts */
.budget-amounts {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.spent {
  font-weight: 600;
  color: var(--text-primary);
}

.spent.critical {
  color: var(--color-error);
}

/* Inline Alerts */
.alert-inline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}

.alert-warning {
  background: #fef3c7;
  color: #92400e;
}

.alert-critical {
  background: #fee2e2;
  color: #991b1b;
}

.alert-icon {
  width: 16px;
  height: 16px;
}
```

### 2. Gestión de Presupuestos (Página Completa)

**Modal de Crear/Editar:**
```html
<dialog class="modal" id="budget-modal" aria-labelledby="modal-title">
  <form class="modal-content" onsubmit="handleSubmit(event)">
    <div class="modal-header">
      <h2 id="modal-title">Crear Presupuesto</h2>
      <button type="button" class="btn-close" onclick="closeModal()"
              aria-label="Cerrar">×</button>
    </div>

    <div class="modal-body">
      <!-- Category Selection -->
      <div class="form-group">
        <label for="category">Categoría</label>
        <select id="category" name="category_id" required>
          <option value="">Selecciona una categoría</option>
          <option value="uuid-1">Alimentación</option>
          <option value="uuid-2">Transporte</option>
          <option value="uuid-3">Entretenimiento</option>
        </select>
      </div>

      <!-- Amount -->
      <div class="form-group">
        <label for="amount">Monto Mensual</label>
        <div class="input-group">
          <span class="input-prefix">$</span>
          <input
            type="number"
            id="amount"
            name="amount"
            min="1"
            step="0.01"
            placeholder="50000"
            required
            aria-describedby="amount-help">
        </div>
        <small id="amount-help" class="form-help">
          Monto máximo que deseas gastar este mes
        </small>
      </div>

      <!-- Period (futuro: semanal/anual) -->
      <div class="form-group">
        <label for="period">Periodo</label>
        <select id="period" name="period" required>
          <option value="monthly">Mensual</option>
          <option value="weekly" disabled>Semanal (próximamente)</option>
        </select>
      </div>

      <!-- Start Date -->
      <div class="form-group">
        <label for="start_date">Fecha de Inicio</label>
        <input
          type="date"
          id="start_date"
          name="start_date"
          required>
      </div>
    </div>

    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">
        Cancelar
      </button>
      <button type="submit" class="btn btn-primary">
        Guardar Presupuesto
      </button>
    </div>
  </form>
</dialog>
```

### 3. Animaciones y Micro-interacciones

**Progress Bar Animation:**
```css
@keyframes fillProgress {
  from {
    width: 0;
  }
  to {
    width: var(--target-width);
  }
}

.progress-fill {
  animation: fillProgress 800ms ease-out forwards;
}
```

**Alert Slide In:**
```css
@keyframes slideInDown {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.alert-inline {
  animation: slideInDown 300ms ease-out;
}
```

### 4. Accesibilidad Checklist

- [ ] Progress bars tienen `role="progressbar"` y `aria-valuenow`
- [ ] Contraste de colores cumple WCAG AA (4.5:1)
- [ ] Labels asociados a inputs con `for` e `id`
- [ ] Modal tiene `aria-labelledby` y `role="dialog"`
- [ ] Focus visible en todos los elementos interactivos
- [ ] Keyboard navigation (Tab, Enter, Esc para cerrar modal)
- [ ] Screen reader anuncia cambios en progress (aria-live)

### 5. Responsive Design

```css
/* Mobile */
@media (max-width: 640px) {
  .budget-item {
    padding: var(--space-3);
  }

  .budget-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .modal-content {
    width: 100%;
    max-width: 100vw;
    margin: 0;
    border-radius: 0;
  }
}

/* Tablet */
@media (min-width: 768px) {
  .budget-widget {
    grid-column: span 2;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .budgets-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-6);
  }
}
```

### Priority de Implementación

**P0 (MVP):**
- [ ] Budget widget en dashboard
- [ ] Progress bars con colores según status
- [ ] Modal de crear/editar presupuesto

**P1 (Post-MVP):**
- [ ] Alertas inline en budget items
- [ ] Animaciones de progress bar
- [ ] Responsive design completo

**P2 (Mejoras futuras):**
- [ ] Dark mode support
- [ ] Gráfico de tendencia (histórico)
- [ ] Projection visual (si excederás)
```

---

## Continuación...

Este documento muestra el flujo completo para una feature. ¿Te gustaría que agregue más ejemplos de otros casos de uso (refactoring, optimización, testing)?
