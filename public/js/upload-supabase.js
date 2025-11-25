// Navigation
const menuItems = document.querySelectorAll('.menu-item');
const sections = document.querySelectorAll('.content-section');

menuItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const sectionName = item.dataset.section;
    showSection(sectionName);

    menuItems.forEach(mi => mi.classList.remove('active'));
    item.classList.add('active');
  });
});

function showSection(sectionName) {
  sections.forEach(section => section.classList.remove('active'));
  const targetSection = document.getElementById(`section-${sectionName}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }

  if (sectionName === 'transacciones') {
    loadAllTransactions();
  }

  window.location.hash = sectionName;
}

// Load section from URL hash
if (window.location.hash) {
  const sectionName = window.location.hash.substring(1);
  showSection(sectionName);
  menuItems.forEach(item => {
    if (item.dataset.section === sectionName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// File Upload Logic
const fileInput = document.getElementById('file-input');
const selectFileBtn = document.getElementById('select-file-btn');
const uploadForm = document.getElementById('upload-form');
const fileSelected = document.getElementById('file-selected');
const uploadMessage = document.getElementById('upload-message');
const uploadProgress = document.getElementById('upload-progress');

selectFileBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('selected-file-name').textContent = file.name;
    document.getElementById('selected-file-size').textContent = formatFileSize(file.size);
    fileSelected.style.display = 'flex';
  }
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const file = fileInput.files[0];
  if (!file) {
    showMessage('Please select a file', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    uploadProgress.style.display = 'block';
    fileSelected.style.display = 'none';
    uploadMessage.textContent = '';

    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/upload', {
      method: 'POST',
      headers,
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      showMessage('File uploaded successfully! Processing...', 'success');
      fileInput.value = '';
      fileSelected.style.display = 'none';

      setTimeout(() => {
        loadDashboardData();
      }, 1000);
    } else {
      showMessage(result.error || 'Upload failed', 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showMessage('Upload failed: ' + error.message, 'error');
  } finally {
    uploadProgress.style.display = 'none';
  }
});

// Load dashboard data
async function loadDashboardData() {
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/files', { headers });
    const result = await response.json();

    if (result.success) {
      updateDashboard(result.files);
      displayFiles(result.files);
    }
  } catch (error) {
    console.error('Error loading files:', error);
  }
}

function updateDashboard(files) {
  document.getElementById('total-files').textContent = files.length;

  let totalTransactions = 0;
  let totalVeps = 0;

  files.forEach(file => {
    if (file.document_type === 'vep') {
      totalVeps++;
    } else if (file.processing_status === 'completed') {
      // Assume bank statements have transactions
      totalTransactions += 10; // Placeholder
    }
  });

  document.getElementById('total-transactions').textContent = totalTransactions;
  document.getElementById('total-veps').textContent = totalVeps;

  // Recent activity
  const recentFiles = files.slice(0, 5);
  const recentContainer = document.getElementById('recent-files');

  if (recentFiles.length === 0) {
    recentContainer.innerHTML = '<p>No hay actividad reciente</p>';
  } else {
    recentContainer.innerHTML = recentFiles.map(file => `
      <div class="activity-item">
        <div class="activity-icon">${file.document_type === 'vep' ? '📄' : '📁'}</div>
        <div class="activity-details">
          <div class="activity-name">${file.original_name}</div>
          <div class="activity-date">${new Date(file.created_at).toLocaleDateString()}</div>
        </div>
        <div class="activity-status status-${file.processing_status}">${file.processing_status}</div>
      </div>
    `).join('');
  }
}

function getFileIcon(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'xls': '📊',
    'xlsx': '📊',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'txt': '📃',
    'zip': '📦',
    'csv': '📋'
  };
  return iconMap[extension] || '📁';
}

function getFileExtension(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  return extension.toUpperCase();
}

function displayFiles(files) {
  const filesList = document.getElementById('files-list');

  if (files.length === 0) {
    filesList.innerHTML = '<p class="no-files-message">No hay archivos cargados aún</p>';
    return;
  }

  filesList.innerHTML = files.map(file => `
    <div class="file-card" data-file-id="${file.id}" onclick="viewFileDetails('${file.id}', '${file.document_type}')">
      <div class="file-preview">
        <div class="file-icon-large">${getFileIcon(file.original_name)}</div>
        <div class="file-type-badge">${getFileExtension(file.original_name)}</div>
      </div>
      <div class="file-body">
        <div class="file-name" title="${file.original_name}">${file.original_name}</div>
        <div class="file-meta">
          <span class="file-size">${formatFileSize(file.file_size)}</span>
          <span class="file-date">${new Date(file.created_at).toLocaleDateString('es-AR')}</span>
        </div>
        <div class="file-status-badge ${file.processing_status}">
          ${file.processing_status === 'completed' ? 'Completado' :
            file.processing_status === 'pending' ? 'Pendiente' :
            file.processing_status === 'processing' ? 'Procesando' :
            file.processing_status === 'failed' ? 'Error' : file.processing_status}
        </div>
      </div>
    </div>
  `).join('');
}

async function deleteFile(fileId) {
  if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
    return;
  }

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers
    });

    const result = await response.json();

    if (result.success) {
      showMessage('File deleted successfully', 'success');
      loadDashboardData();
    } else {
      showMessage(result.error || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showMessage('Delete failed: ' + error.message, 'error');
  }
}

async function viewFileDetails(fileId, documentType) {
  showFileDetail(fileId);
}

async function viewVepDetails(fileId) {
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/files/${fileId}/vep`, { headers });

    const result = await response.json();

    if (result.success) {
      alert(`VEP Details:\n\nNro VEP: ${result.vep.nro_vep}\nCUIT: ${result.vep.cuit}\nImporte: $${result.vep.importe_total_pagar}`);
    }
  } catch (error) {
    console.error('Error loading VEP:', error);
  }
}

async function viewTransactions(fileId) {
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/files/${fileId}/transactions`, { headers });

    const result = await response.json();

    if (result.success) {
      alert(`Found ${result.transactions.length} transactions`);
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
  }
}

// Store all transactions globally for filtering
let allTransactions = [];

async function loadAllTransactions() {
  const container = document.getElementById('all-transactions-container');
  container.innerHTML = '<p>Cargando transacciones...</p>';

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/transactions', { headers });

    const result = await response.json();

    if (result.success) {
      allTransactions = result.transactions;
      displayTransactions(allTransactions);
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
    container.innerHTML = '<p>Error al cargar transacciones</p>';
  }
}

function displayTransactions(transactions) {
  const container = document.getElementById('all-transactions-container');

  if (transactions.length === 0) {
    container.innerHTML = '<p style="padding: 2rem; text-align: center;">No hay transacciones disponibles</p>';
    return;
  }

  container.innerHTML = `
    <div class="transactions-table">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Débito</th>
            <th>Crédito</th>
            <th>Balance</th>
            <th>Archivo</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(t => `
            <tr onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">
              <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
              <td>${t.description || '-'}</td>
              <td class="${t.amount < 0 ? 'debit' : ''}">${t.amount < 0 ? '$' + Math.abs(t.amount).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
              <td class="${t.amount > 0 ? 'credit' : ''}">${t.amount > 0 ? '$' + t.amount.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
              <td>${t.balance ? '$' + t.balance.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '-'}</td>
              <td>${t.files?.original_name || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Filter functionality
function filterTransactions() {
  const dateFrom = document.getElementById('filter-date-from').value;
  const dateTo = document.getElementById('filter-date-to').value;
  const description = document.getElementById('filter-description').value.toLowerCase();

  let filtered = allTransactions;

  // Filter by date range
  if (dateFrom) {
    filtered = filtered.filter(t => new Date(t.transaction_date) >= new Date(dateFrom));
  }

  if (dateTo) {
    filtered = filtered.filter(t => new Date(t.transaction_date) <= new Date(dateTo));
  }

  // Filter by description
  if (description) {
    filtered = filtered.filter(t =>
      (t.description || '').toLowerCase().includes(description) ||
      (t.merchant || '').toLowerCase().includes(description)
    );
  }

  displayTransactions(filtered);
}

function clearFilters() {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-description').value = '';
  displayTransactions(allTransactions);
}

// Add event listeners for filters
document.addEventListener('DOMContentLoaded', () => {
  const applyBtn = document.getElementById('apply-filters-btn');
  const clearBtn = document.getElementById('clear-filters-btn');
  const descInput = document.getElementById('filter-description');

  if (applyBtn) {
    applyBtn.addEventListener('click', filterTransactions);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearFilters);
  }

  // Filter on Enter key in description input
  if (descInput) {
    descInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filterTransactions();
      }
    });
  }
});

// Utility functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showMessage(message, type) {
  const messageDiv = uploadMessage;
  messageDiv.textContent = message;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}

// ========================================
// RIGHT SIDEBAR FUNCTIONALITY
// ========================================

const rightSidebar = document.getElementById('right-sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const closeSidebarBtn = document.getElementById('close-right-sidebar');
const sidebarContent = document.getElementById('right-sidebar-content');
const sidebarTitle = document.getElementById('right-sidebar-title');

function openRightSidebar() {
  rightSidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
}

function closeRightSidebar() {
  rightSidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

closeSidebarBtn.addEventListener('click', closeRightSidebar);
sidebarOverlay.addEventListener('click', closeRightSidebar);

// Transaction Detail View
async function showTransactionDetail(transactionId) {
  openRightSidebar();
  sidebarTitle.textContent = 'Detalle de Transacción';
  sidebarContent.innerHTML = '<div class="detail-loading">Cargando...</div>';

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/transactions/${transactionId}`, { headers });
    const result = await response.json();

    if (result.success) {
      const t = result.transaction;
      const isPositive = t.amount > 0;

      sidebarContent.innerHTML = `
        <div class="detail-section">
          <div class="detail-title">Monto</div>
          <div class="detail-value ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}$${Math.abs(t.amount).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div class="detail-subtitle">${isPositive ? 'Crédito' : 'Débito'}</div>
        </div>

        <div class="detail-info-grid">
          <div class="detail-info-item">
            <div class="detail-info-label">Fecha</div>
            <div class="detail-info-value">${new Date(t.transaction_date).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            })}</div>
          </div>

          <div class="detail-info-item">
            <div class="detail-info-label">Descripción</div>
            <div class="detail-info-value">${t.description || '-'}</div>
          </div>

          ${t.merchant ? `
            <div class="detail-info-item">
              <div class="detail-info-label">Comercio</div>
              <div class="detail-info-value">${t.merchant}</div>
            </div>
          ` : ''}

          ${t.balance ? `
            <div class="detail-info-item">
              <div class="detail-info-label">Balance</div>
              <div class="detail-info-value">$${t.balance.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
          ` : ''}
        </div>

        <div class="notes-section">
          <div class="detail-title">Notas</div>
          <textarea
            id="transaction-notes"
            class="notes-textarea"
            placeholder="Agregar nota sobre esta transacción..."
          >${t.notes || ''}</textarea>
          <button class="save-note-btn" onclick="saveTransactionNote('${t.id}')">
            Guardar Nota
          </button>
        </div>

        ${t.file_id ? `
          <div class="file-preview-section">
            <div class="detail-title">Archivo Original</div>
            <div class="file-preview-card" onclick="showFileDetail('${t.file_id}')">
              <div class="file-preview-icon">${getFileIcon(t.files?.original_name || 'file.pdf')}</div>
              <div class="file-preview-info">
                <div class="file-preview-name">${t.files?.original_name || 'Archivo'}</div>
                <div class="file-preview-meta">
                  ${t.files?.created_at ? new Date(t.files.created_at).toLocaleDateString('es-AR') : ''}
                </div>
              </div>
              <div class="file-preview-arrow">→</div>
            </div>
          </div>
        ` : ''}
      `;
    } else {
      sidebarContent.innerHTML = '<div class="detail-error">Error al cargar la transacción</div>';
    }
  } catch (error) {
    console.error('Error loading transaction:', error);
    sidebarContent.innerHTML = '<div class="detail-error">Error al cargar la transacción</div>';
  }
}

// File Detail View
async function showFileDetail(fileId) {
  openRightSidebar();
  sidebarTitle.textContent = 'Detalle de Archivo';
  sidebarContent.innerHTML = '<div class="detail-loading">Cargando...</div>';

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/files/${fileId}`, { headers });
    const result = await response.json();

    if (result.success) {
      const file = result.file;
      const transactionCount = file.transaction_count || 0;

      sidebarContent.innerHTML = `
        <div class="file-detail-header">
          <div class="file-detail-icon">${getFileIcon(file.original_name)}</div>
          <div class="file-detail-name">${file.original_name}</div>
          <div class="file-status-badge ${file.processing_status}">
            ${file.processing_status === 'completed' ? 'Completado' :
              file.processing_status === 'pending' ? 'Pendiente' :
              file.processing_status === 'processing' ? 'Procesando' :
              file.processing_status === 'failed' ? 'Error' : file.processing_status}
          </div>
        </div>

        <div class="detail-info-grid">
          <div class="detail-info-item">
            <div class="detail-info-label">Fecha de Carga</div>
            <div class="detail-info-value">${new Date(file.created_at).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
          </div>

          <div class="detail-info-item">
            <div class="detail-info-label">Tamaño</div>
            <div class="detail-info-value">${formatFileSize(file.file_size)}</div>
          </div>

          <div class="detail-info-item">
            <div class="detail-info-label">Tipo de Documento</div>
            <div class="detail-info-value">${file.document_type === 'vep' ? 'VEP' : 'Extracto Bancario'}</div>
          </div>

          ${file.document_type !== 'vep' ? `
            <div class="detail-info-item">
              <div class="detail-info-label">Transacciones Extraídas</div>
              <div class="detail-info-value">${transactionCount}</div>
            </div>
          ` : ''}

          <div class="detail-info-item">
            <div class="detail-info-label">Estado</div>
            <div class="detail-info-value">${
              file.processing_status === 'completed' ? 'Procesado correctamente' :
              file.processing_status === 'pending' ? 'En espera' :
              file.processing_status === 'processing' ? 'Procesando...' :
              file.processing_status === 'failed' ? 'Error en el procesamiento' : file.processing_status
            }</div>
          </div>
        </div>

        <div class="file-actions-section">
          ${file.storage_path ? `
            <button class="file-action-btn" onclick="downloadFile('${file.id}', '${file.original_name}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Descargar Archivo
            </button>
          ` : ''}

          ${file.document_type !== 'vep' && transactionCount > 0 ? `
            <button class="file-action-btn" onclick="viewFileTransactions('${file.id}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              Ver Transacciones (${transactionCount})
            </button>
          ` : ''}

          <button class="file-action-btn danger" onclick="confirmDeleteFile('${file.id}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Eliminar Archivo
          </button>
        </div>
      `;
    } else {
      sidebarContent.innerHTML = '<div class="detail-error">Error al cargar el archivo</div>';
    }
  } catch (error) {
    console.error('Error loading file:', error);
    sidebarContent.innerHTML = '<div class="detail-error">Error al cargar el archivo</div>';
  }
}

// Save transaction note
async function saveTransactionNote(transactionId) {
  const notes = document.getElementById('transaction-notes').value;

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/transactions/${transactionId}/notes`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ notes })
    });

    const result = await response.json();

    if (result.success) {
      alert('Nota guardada correctamente');
    } else {
      alert('Error al guardar la nota');
    }
  } catch (error) {
    console.error('Error saving note:', error);
    alert('Error al guardar la nota');
  }
}

// Additional helper functions
function confirmDeleteFile(fileId) {
  if (confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
    deleteFile(fileId);
    closeRightSidebar();
  }
}

function downloadFile(fileId, fileName) {
  window.location.href = `/api/files/${fileId}/download`;
}

function viewFileTransactions(fileId) {
  closeRightSidebar();
  showSection('transacciones');
  // TODO: Add filter for specific file
}

// ========================================
// CONNECTIONS FUNCTIONALITY
// ========================================

// Load connections on page load
async function loadConnections() {
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/connections', { headers });
    const result = await response.json();

    if (result.success) {
      updateConnectionsUI(result.connections);
    }
  } catch (error) {
    console.error('Error loading connections:', error);
  }
}

// Update connections UI
function updateConnectionsUI(connections) {
  connections.forEach(conn => {
    if (conn.provider === 'mercadopago') {
      const statusEl = document.getElementById('mercadopago-status');
      const btnEl = document.getElementById('mercadopago-btn');
      const cardEl = document.getElementById('mercadopago-card');

      if (statusEl) {
        statusEl.textContent = conn.status === 'active' ? 'Conectado' : 'Inactivo';
        statusEl.className = `connection-status ${conn.status === 'active' ? 'connected' : 'disconnected'}`;
      }

      if (btnEl && conn.status === 'active') {
        btnEl.textContent = 'Desconectar';
        btnEl.onclick = () => disconnectProvider('mercadopago');
        btnEl.classList.add('disconnect');
      }

      if (cardEl && conn.metadata) {
        const infoEl = cardEl.querySelector('.connection-description');
        if (infoEl && conn.metadata.email) {
          infoEl.textContent = `Conectado como: ${conn.metadata.email}`;
        }
      }
    }
  });
}

// Connect Mercado Pago
async function connectMercadoPago() {
  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/oauth/mercadopago/authorize', { headers });
    const result = await response.json();

    if (result.success) {
      // Redirect to Mercado Pago OAuth
      window.location.href = result.authUrl;
    } else {
      alert('Error al iniciar conexión con Mercado Pago');
    }
  } catch (error) {
    console.error('Error connecting Mercado Pago:', error);
    alert('Error al conectar con Mercado Pago');
  }
}

// Disconnect provider
async function disconnectProvider(provider) {
  if (!confirm(`¿Estás seguro de que quieres desconectar ${provider}?`)) {
    return;
  }

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/connections/${provider}`, {
      method: 'DELETE',
      headers
    });

    const result = await response.json();

    if (result.success) {
      alert('Desconectado exitosamente');
      location.reload();
    } else {
      alert('Error al desconectar');
    }
  } catch (error) {
    console.error('Error disconnecting provider:', error);
    alert('Error al desconectar');
  }
}

// Check for OAuth callback success
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const connection = urlParams.get('connection');
  const provider = urlParams.get('provider');

  if (connection === 'success' && provider) {
    alert(`Conexión con ${provider} establecida exitosamente`);
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    loadConnections();
  }

  // Load connections when viewing the connections section
  const configuracionMenuItem = document.querySelector('[data-section="configuracion"]');
  if (configuracionMenuItem) {
    configuracionMenuItem.addEventListener('click', () => {
      setTimeout(loadConnections, 100);
    });
  }

  // Load connections on initial page load if on connections section
  if (window.location.hash === '#configuracion') {
    setTimeout(loadConnections, 100);
  }
});
