// ========================================
// CLAUDE API INTEGRATION COMPONENTS
// ========================================

/**
 * Claude Usage Indicator
 * Shows user's Claude API quota usage
 */
class ClaudeUsageIndicator {
  constructor(containerId) {
    this.containerId = containerId;
    this.quota = null;
  }

  async load() {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/claude/usage', { headers });
      const result = await response.json();

      if (result.success) {
        this.quota = result.data;
        this.render();
      }
    } catch (error) {
      console.error('Error loading Claude usage:', error);
    }
  }

  render() {
    const container = document.getElementById(this.containerId);
    if (!container || !this.quota) return;

    const { remaining, limit, used } = this.quota;
    const percentage = (remaining / limit) * 100;

    // Determine color based on remaining quota
    let colorClass = 'success'; // green
    if (remaining < 5) {
      colorClass = 'danger'; // red
    } else if (remaining < 10) {
      colorClass = 'warning'; // yellow
    }

    const html = `
      <div class="claude-usage-indicator ${colorClass}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        <span class="usage-text">IA: ${remaining}/${limit}</span>
        <div class="usage-tooltip">
          <strong>Cuota de Claude AI</strong><br>
          Usado: ${used}/${limit}<br>
          Restante: ${remaining}<br>
          ${remaining === 0 ? '<span style="color: var(--danger-color);">⚠️ Cuota agotada</span>' : ''}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  async refresh() {
    await this.load();
  }
}

/**
 * Transaction Preview Modal
 * Allows users to review and edit transactions before final save
 */
class TransactionPreviewModal {
  constructor() {
    this.fileId = null;
    this.fileData = null;
    this.transactions = [];
    this.categories = [];
    this.modalEl = null;
  }

  async open(fileId) {
    this.fileId = fileId;

    try {
      // Load transactions for review
      const headers = await getAuthHeaders();
      const [previewResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/files/${fileId}/transactions/preview`, { headers }),
        fetch('/api/categories', { headers })
      ]);

      const previewResult = await previewResponse.json();
      const categoriesResult = await categoriesResponse.json();

      if (!previewResult.success) {
        throw new Error(previewResult.error || 'Failed to load preview');
      }

      this.fileData = previewResult.data.file;
      this.transactions = previewResult.data.transactions;
      this.categories = categoriesResult.categories || [];

      this.render();
      this.show();
    } catch (error) {
      console.error('Error loading preview:', error);
      showToast('Error al cargar vista previa', 'error');
    }
  }

  render() {
    // Remove existing modal if present
    const existing = document.getElementById('transaction-preview-modal');
    if (existing) {
      existing.remove();
    }

    // Create modal HTML
    const modalHTML = `
      <div id="transaction-preview-modal" class="modal-overlay" style="display: none;">
        <div class="modal-container large">
          <div class="modal-header">
            <h2>Revisar Transacciones</h2>
            <button class="modal-close" onclick="transactionPreviewModal.close()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- File Info -->
            <div class="preview-file-info">
              <h3>${this.fileData.name}</h3>
              <div class="file-metadata">
                <span class="badge ${this.getProcessingMethodClass()}">${this.getProcessingMethodLabel()}</span>
                <span>Confianza: ${this.fileData.confidence_score || 0}%</span>
                ${this.renderDocumentMetadata()}
              </div>
            </div>

            <!-- Transactions Table -->
            <div class="preview-table-wrapper">
              <table class="preview-table">
                <thead>
                  <tr>
                    <th style="width: 110px;">Fecha</th>
                    <th>Descripción</th>
                    <th style="width: 130px;">Monto</th>
                    <th style="width: 180px;">Categoría</th>
                    <th style="width: 80px;">Tipo</th>
                    <th style="width: 60px;"></th>
                  </tr>
                </thead>
                <tbody id="preview-transactions-body">
                  ${this.renderTransactionRows()}
                </tbody>
              </table>
            </div>

            <div class="preview-summary">
              <strong>Total: ${this.transactions.length} transacciones</strong>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-secondary" onclick="transactionPreviewModal.close()">Cancelar</button>
            <button class="btn-primary" onclick="transactionPreviewModal.confirmAll()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Confirmar Todo
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modalEl = document.getElementById('transaction-preview-modal');

    // Add event listeners for inline editing
    this.attachEventListeners();
  }

  renderDocumentMetadata() {
    if (!this.fileData.metadata || Object.keys(this.fileData.metadata).length === 0) {
      return '';
    }

    const meta = this.fileData.metadata;
    const parts = [];

    if (meta.banco) parts.push(`Banco: ${meta.banco}`);
    if (meta.numero_cuenta) parts.push(`Cuenta: ${meta.numero_cuenta}`);
    if (meta.periodo) parts.push(`Período: ${meta.periodo}`);

    return parts.length > 0 ? `<span class="metadata-info">${parts.join(' • ')}</span>` : '';
  }

  getProcessingMethodClass() {
    const method = this.fileData.processing_method;
    return method === 'claude' ? 'badge-ai' : method === 'hybrid' ? 'badge-hybrid' : 'badge-template';
  }

  getProcessingMethodLabel() {
    const method = this.fileData.processing_method;
    return method === 'claude' ? 'IA' : method === 'hybrid' ? 'Híbrido' : 'Plantilla';
  }

  renderTransactionRows() {
    return this.transactions.map((tx, index) => `
      <tr data-tx-index="${index}" data-tx-id="${tx.id}">
        <td>
          <input type="date" class="tx-input tx-date" value="${tx.date}" data-field="date">
        </td>
        <td>
          <input type="text" class="tx-input tx-description" value="${escapeHtml(tx.description)}" data-field="description">
        </td>
        <td>
          <input type="number" step="0.01" class="tx-input tx-amount" value="${tx.amount}" data-field="amount">
        </td>
        <td>
          <select class="tx-input tx-category" data-field="category_id">
            <option value="">Sin categoría</option>
            ${this.categories.map(cat => `
              <option value="${cat.id}" ${tx.category_id === cat.id ? 'selected' : ''}>
                ${cat.name}
              </option>
            `).join('')}
          </select>
        </td>
        <td>
          <select class="tx-input tx-type" data-field="type">
            <option value="income" ${tx.type === 'income' ? 'selected' : ''}>Ingreso</option>
            <option value="expense" ${tx.type === 'expense' ? 'selected' : ''}>Egreso</option>
          </select>
        </td>
        <td>
          <button class="btn-icon-delete" onclick="transactionPreviewModal.deleteRow(${index})" title="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>
    `).join('');
  }

  attachEventListeners() {
    // Listen for changes to update transaction data
    const inputs = this.modalEl.querySelectorAll('.tx-input');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const row = e.target.closest('tr');
        const index = parseInt(row.dataset.txIndex);
        const field = e.target.dataset.field;
        const value = e.target.value;

        // Update transaction data
        if (field === 'amount') {
          this.transactions[index][field] = parseFloat(value);
        } else {
          this.transactions[index][field] = value;
        }
      });
    });
  }

  deleteRow(index) {
    // Remove from array
    this.transactions.splice(index, 1);

    // Re-render table
    const tbody = document.getElementById('preview-transactions-body');
    if (tbody) {
      tbody.innerHTML = this.renderTransactionRows();
      this.attachEventListeners();
    }

    // Update summary
    const summary = this.modalEl.querySelector('.preview-summary strong');
    if (summary) {
      summary.textContent = `Total: ${this.transactions.length} transacciones`;
    }
  }

  async confirmAll() {
    try {
      // Validate transactions
      const validTransactions = this.transactions.filter(tx => {
        return tx.date && tx.description && tx.amount !== undefined && tx.amount !== null;
      });

      if (validTransactions.length === 0) {
        showToast('No hay transacciones válidas para confirmar', 'warning');
        return;
      }

      // Confirm with backend
      const headers = await getAuthHeaders();
      headers['Content-Type'] = 'application/json';

      const response = await fetch(`/api/files/${this.fileId}/confirm-transactions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          transactions: validTransactions.map(tx => ({
            id: tx.id,
            date: tx.date,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            category_id: tx.category_id || null
          }))
        })
      });

      const result = await response.json();

      if (result.success) {
        showToast(`${result.data.count} transacciones confirmadas exitosamente`, 'success');
        this.close();

        // Refresh file list and transactions
        if (typeof loadFiles === 'function') {
          loadFiles();
        }
        if (typeof loadTransactions === 'function') {
          loadTransactions();
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Error confirming transactions:', error);
      showToast('Error al confirmar transacciones: ' + error.message, 'error');
    }
  }

  show() {
    if (this.modalEl) {
      this.modalEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Global instance
let transactionPreviewModal = new TransactionPreviewModal();
let claudeUsageIndicator = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Initialize Claude usage indicator if container exists
  const usageContainer = document.getElementById('claude-usage-indicator');
  if (usageContainer) {
    claudeUsageIndicator = new ClaudeUsageIndicator('claude-usage-indicator');
    claudeUsageIndicator.load();
  }
});

// Add styles
const styles = `
<style>
/* Claude Usage Indicator */
.claude-usage-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  position: relative;
  cursor: help;
  transition: all 0.2s;
}

.claude-usage-indicator.success {
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.claude-usage-indicator.warning {
  background: rgba(251, 191, 36, 0.1);
  color: #F59E0B;
  border: 1px solid rgba(251, 191, 36, 0.3);
}

.claude-usage-indicator.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #EF4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.claude-usage-indicator:hover .usage-tooltip {
  opacity: 1;
  visibility: visible;
}

.usage-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(10, 37, 64, 0.95);
  color: white;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s;
  pointer-events: none;
  z-index: 10000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* Processing Method Badges */
.badge-ai {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-hybrid {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-template {
  background: #10B981;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Preview Modal Specific Styles */
.modal-container.large {
  max-width: 1200px;
  width: 95%;
  max-height: 90vh;
}

.preview-file-info {
  padding: 20px;
  background: #f9fafb;
  border-radius: 8px;
  margin-bottom: 20px;
}

.preview-file-info h3 {
  margin: 0 0 10px 0;
  font-size: 18px;
  color: #1f2937;
}

.file-metadata {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  color: #6b7280;
  flex-wrap: wrap;
}

.metadata-info {
  font-size: 13px;
  color: #9ca3af;
}

.preview-table-wrapper {
  max-height: 50vh;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 16px;
}

.preview-table {
  width: 100%;
  border-collapse: collapse;
}

.preview-table thead {
  position: sticky;
  top: 0;
  background: #f9fafb;
  z-index: 10;
}

.preview-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  color: #374151;
  border-bottom: 2px solid #e5e7eb;
}

.preview-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.preview-table tbody tr:hover {
  background: #f9fafb;
}

.tx-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  transition: border-color 0.2s;
}

.tx-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.tx-description {
  min-width: 200px;
}

.preview-summary {
  text-align: right;
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', styles);
