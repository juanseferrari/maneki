// Global variables for auth (will be set from index-supabase.ejs)
let accessToken = null;
let currentUser = null;
let isDev = false;

// Pagination state variables
let allTransactions = [];
let currentPage = 1;
let currentLimit = 50;
let totalTransactions = 0;
let totalPages = 1;

// Filter state variables
let currentFilters = {
  dateFrom: '',
  dateTo: '',
  description: ''
};

// Helper function to format date without timezone issues
// Dates come as "YYYY-MM-DD" which JavaScript interprets as UTC midnight
// This causes off-by-one errors when converting to local time
function formatDate(dateStr, options = {}) {
  if (!dateStr) return '-';

  // If it's just a date string (YYYY-MM-DD), parse it directly without timezone conversion
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('es-AR', options);
  }

  // For full datetime strings, use normal parsing
  return new Date(dateStr).toLocaleDateString('es-AR', options);
}

// Promise that resolves when auth is ready
let authReadyPromise = null;
let authReadyResolve = null;

// Initialize auth ready promise
function initAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise(resolve => {
      authReadyResolve = resolve;
    });

    // Set up auth state listener to resolve when session is available
    if (typeof supabaseClient !== 'undefined') {
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
          accessToken = session.access_token;
          if (authReadyResolve) {
            authReadyResolve();
            authReadyResolve = null;
          }
        }
      });

      // Also check immediately in case session is already available
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          accessToken = session.access_token;
          if (authReadyResolve) {
            authReadyResolve();
            authReadyResolve = null;
          }
        }
      });
    }
  }
  return authReadyPromise;
}

// Helper function to get fresh access token
// Waits for session to be available (handles race condition on page load)
async function getAccessToken(retries = 5) {
  // If we already have a token, return it
  if (accessToken) return accessToken;

  if (typeof supabaseClient !== 'undefined') {
    // Try to get session directly first
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      accessToken = session.access_token;
      return accessToken;
    }

    // If no session yet, wait with exponential backoff
    if (retries > 0) {
      const delay = Math.min(200 * Math.pow(2, 5 - retries), 2000); // 200ms, 400ms, 800ms, 1600ms, 2000ms
      await new Promise(resolve => setTimeout(resolve, delay));
      return getAccessToken(retries - 1);
    }
  }
  return null;
}

// Initialize auth when script loads
initAuthReady();

// Helper function to get auth headers
async function getAuthHeaders(includeContentType = false) {
  const token = await getAccessToken();
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

// ========================================
// CUSTOM MODAL SYSTEM
// ========================================

let modalResolve = null;

function showCustomModal(options) {
  return new Promise((resolve) => {
    modalResolve = resolve;

    const overlay = document.getElementById('custom-modal-overlay');
    const icon = document.getElementById('modal-icon');
    const title = document.getElementById('modal-title');
    const message = document.getElementById('modal-message');
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');

    // Set content
    title.textContent = options.title || 'Confirmar acción';
    message.textContent = options.message || '¿Estás seguro?';

    // Set icon
    const iconType = options.type || 'warning';
    const iconEmojis = {
      warning: '⚠️',
      error: '❌',
      success: '✓',
      info: 'ℹ️'
    };

    icon.textContent = iconEmojis[iconType];
    icon.className = `custom-modal-icon ${iconType}`;

    // Set button texts
    cancelBtn.textContent = options.cancelText || 'Cancelar';
    confirmBtn.textContent = options.confirmText || 'Aceptar';

    // Set button style (danger or normal)
    confirmBtn.className = `custom-modal-btn btn-confirm ${options.danger ? 'danger' : ''}`;

    // Show modal
    overlay.classList.add('active');

    // Handle clicks
    const handleCancel = () => {
      closeCustomModal();
      resolve(false);
    };

    const handleConfirm = () => {
      closeCustomModal();
      resolve(true);
    };

    const handleOverlayClick = (e) => {
      if (e.target === overlay) {
        handleCancel();
      }
    };

    // Remove old listeners
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newConfirmBtn = confirmBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // Add new listeners
    document.getElementById('modal-cancel').addEventListener('click', handleCancel);
    document.getElementById('modal-confirm').addEventListener('click', handleConfirm);
    overlay.addEventListener('click', handleOverlayClick);

    // Close on ESC key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        handleCancel();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  });
}

function closeCustomModal() {
  const overlay = document.getElementById('custom-modal-overlay');
  overlay.classList.remove('active');
}

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
const uploadArea = document.getElementById('upload-area');
const uploadMessage = document.getElementById('upload-message');
const uploadProgress = document.getElementById('upload-progress');

selectFileBtn.addEventListener('click', () => {
  fileInput.click();
});

// Make the entire upload area clickable
uploadArea.addEventListener('click', (e) => {
  if (e.target !== selectFileBtn && !selectFileBtn.contains(e.target)) {
    fileInput.click();
  }
});

// Drag and Drop support
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  uploadArea.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    uploadFile(files[0]);
  }
});

// When file is selected via input, upload directly
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    uploadFile(file);
  }
});

// Direct upload function
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    uploadProgress.style.display = 'block';
    document.getElementById('progress-text').textContent = `Subiendo ${file.name}...`;
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
      showMessage('Archivo subido correctamente. Procesando...', 'success');
      fileInput.value = '';

      setTimeout(() => {
        loadDashboardData();
      }, 1000);
    } else {
      showMessage(result.error || 'Error al subir archivo', 'error');
    }
  } catch (error) {
    console.error('Upload error:', error);
    showMessage('Error al subir: ' + error.message, 'error');
  } finally {
    uploadProgress.style.display = 'none';
  }
}

// Keep form submit for fallback
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = fileInput.files[0];
  if (file) {
    uploadFile(file);
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

async function loadAllTransactions(page = 1, limit = currentLimit) {
  const container = document.getElementById('all-transactions-container');
  container.innerHTML = '<p>Cargando transacciones...</p>';

  try {
    const headers = await getAuthHeaders();

    // Build query params with filters
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (currentFilters.dateFrom) params.append('dateFrom', currentFilters.dateFrom);
    if (currentFilters.dateTo) params.append('dateTo', currentFilters.dateTo);
    if (currentFilters.description) params.append('description', currentFilters.description);

    const response = await fetch(`/api/transactions?${params.toString()}`, { headers });

    const result = await response.json();

    if (result.success) {
      allTransactions = result.transactions;
      currentPage = result.pagination.page;
      currentLimit = result.pagination.limit;
      totalTransactions = result.pagination.total;
      totalPages = result.pagination.totalPages;
      displayTransactions(allTransactions);
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
    container.innerHTML = '<p>Error al cargar transacciones</p>';
  }
}

// Default categories
const defaultCategories = [
  { id: 'sin_categoria', name: 'Sin categoría', color: '#9CA3AF' },
  { id: 'alimentacion', name: 'Alimentación', color: '#F59E0B' },
  { id: 'transporte', name: 'Transporte', color: '#3B82F6' },
  { id: 'servicios', name: 'Servicios', color: '#8B5CF6' },
  { id: 'entretenimiento', name: 'Entretenimiento', color: '#EC4899' },
  { id: 'salud', name: 'Salud', color: '#10B981' },
  { id: 'educacion', name: 'Educación', color: '#6366F1' },
  { id: 'hogar', name: 'Hogar', color: '#F97316' },
  { id: 'impuestos', name: 'Impuestos', color: '#EF4444' },
  { id: 'transferencias', name: 'Transferencias', color: '#14B8A6' },
  { id: 'ingresos', name: 'Ingresos', color: '#22C55E' }
];

function getCategoryById(categoryId) {
  return defaultCategories.find(c => c.id === categoryId) || defaultCategories[0];
}

function displayTransactions(transactions) {
  const container = document.getElementById('all-transactions-container');

  if (transactions.length === 0 && totalTransactions === 0) {
    container.innerHTML = '<p style="padding: 2rem; text-align: center;">No hay transacciones disponibles</p>';
    return;
  }

  const startRecord = ((currentPage - 1) * currentLimit) + 1;
  const endRecord = Math.min(currentPage * currentLimit, totalTransactions);

  container.innerHTML = `
    <div class="transactions-table resizable">
      <table>
        <thead>
          <tr>
            <th data-col="fecha" style="width: 12%;">Fecha<span class="col-resize-handle"></span></th>
            <th data-col="descripcion" style="width: 35%;">Descripción<span class="col-resize-handle"></span></th>
            <th data-col="monto" style="width: 15%;">Monto<span class="col-resize-handle"></span></th>
            <th data-col="categoria" style="width: 18%;">Categoría<span class="col-resize-handle"></span></th>
            <th data-col="banco" style="width: 20%;">Banco</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map(t => {
            const amountClass = t.amount < 0 ? 'amount-negative' : 'amount-positive';
            const amountPrefix = t.amount < 0 ? '-' : '+';
            const amountFormatted = '$' + Math.abs(t.amount).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            const category = getCategoryById(t.category);

            return `
            <tr data-transaction-id="${t.id}">
              <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${formatDate(t.transaction_date)}</td>
              <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${t.description || '-'}</td>
              <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;" class="${amountClass}">${amountPrefix}${amountFormatted}</td>
              <td class="category-cell">
                <div class="category-dropdown" onclick="event.stopPropagation();">
                  <button class="category-btn" onclick="toggleCategoryDropdown('${t.id}')" style="--category-color: ${category.color}">
                    <span class="category-dot" style="background: ${category.color}"></span>
                    ${category.name}
                    <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div class="category-options" id="category-options-${t.id}">
                    ${defaultCategories.map(cat => `
                      <div class="category-option ${cat.id === t.category ? 'selected' : ''}" onclick="updateTransactionCategory('${t.id}', '${cat.id}')">
                        <span class="category-dot" style="background: ${cat.color}"></span>
                        ${cat.name}
                      </div>
                    `).join('')}
                  </div>
                </div>
              </td>
              <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${t.bank_name || '-'}</td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
    <div class="pagination-controls">
      <div class="pagination-info">
        Mostrando ${startRecord}-${endRecord} de ${totalTransactions.toLocaleString('es-AR')} transacciones
      </div>
      <div class="pagination-actions">
        <div class="pagination-limit">
          <label>Por página:</label>
          <select id="pagination-limit" onchange="changePageLimit(this.value)">
            <option value="50" ${currentLimit === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${currentLimit === 100 ? 'selected' : ''}>100</option>
            <option value="300" ${currentLimit === 300 ? 'selected' : ''}>300</option>
          </select>
        </div>
        <div class="pagination-buttons">
          <button class="pagination-btn" onclick="goToPage(1)" ${currentPage === 1 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="11 17 6 12 11 7"></polyline>
              <polyline points="18 17 13 12 18 7"></polyline>
            </svg>
          </button>
          <button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <span class="pagination-page">Página ${currentPage} de ${totalPages}</span>
          <button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button class="pagination-btn" onclick="goToPage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="13 17 18 12 13 7"></polyline>
              <polyline points="6 17 11 12 6 7"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Load saved column widths and initialize resizing
  loadColumnWidths();
  initColumnResize();
}

// Column resize functionality
function initColumnResize() {
  const table = document.querySelector('.transactions-table.resizable table');
  if (!table) return;

  const handles = document.querySelectorAll('.col-resize-handle');
  let isResizing = false;
  let currentTh = null;
  let startX = 0;
  let startWidth = 0;
  let tableWidth = 0;

  handles.forEach(handle => {
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();

      isResizing = true;
      currentTh = this.parentElement;
      startX = e.pageX;
      startWidth = currentTh.offsetWidth;
      tableWidth = table.offsetWidth;

      this.classList.add('active');
      document.querySelector('.transactions-table').classList.add('resizing');

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  });

  function handleMouseMove(e) {
    if (!isResizing) return;

    const diff = e.pageX - startX;
    const newWidth = Math.max(80, startWidth + diff); // Min width 80px
    const widthPercent = (newWidth / tableWidth) * 100;

    currentTh.style.width = widthPercent + '%';
  }

  function handleMouseUp() {
    if (!isResizing) return;

    isResizing = false;
    document.querySelector('.col-resize-handle.active')?.classList.remove('active');
    document.querySelector('.transactions-table')?.classList.remove('resizing');

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // Save column widths to localStorage
    saveColumnWidths();
  }
}

// Save column widths to localStorage
function saveColumnWidths() {
  const headers = document.querySelectorAll('.transactions-table.resizable th[data-col]');
  const widths = {};

  headers.forEach(th => {
    widths[th.dataset.col] = th.style.width;
  });

  localStorage.setItem('transactionColumnWidths', JSON.stringify(widths));
}

// Load column widths from localStorage
function loadColumnWidths() {
  const saved = localStorage.getItem('transactionColumnWidths');
  if (!saved) return;

  try {
    const widths = JSON.parse(saved);
    Object.keys(widths).forEach(col => {
      const th = document.querySelector(`.transactions-table.resizable th[data-col="${col}"]`);
      if (th && widths[col]) {
        th.style.width = widths[col];
      }
    });
  } catch (e) {
    console.error('Error loading column widths:', e);
  }
}

// Pagination helper functions
function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  loadAllTransactions(page, currentLimit);
}

function changePageLimit(limit) {
  currentLimit = parseInt(limit);
  loadAllTransactions(1, currentLimit);
}

// Toggle category dropdown
function toggleCategoryDropdown(transactionId) {
  // Close all other dropdowns first
  document.querySelectorAll('.category-options.show').forEach(el => {
    if (el.id !== `category-options-${transactionId}`) {
      el.classList.remove('show');
    }
  });

  const dropdown = document.getElementById(`category-options-${transactionId}`);
  dropdown.classList.toggle('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.category-dropdown')) {
    document.querySelectorAll('.category-options.show').forEach(el => {
      el.classList.remove('show');
    });
  }
});

// Update transaction category
async function updateTransactionCategory(transactionId, categoryId) {
  try {
    const headers = await getAuthHeaders(true);

    const response = await fetch(`/api/transactions/${transactionId}/category`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ category: categoryId })
    });

    const result = await response.json();

    if (result.success) {
      // Update the local data
      const transaction = allTransactions.find(t => t.id === transactionId);
      if (transaction) {
        transaction.category = categoryId;
      }

      // Update the UI
      const category = getCategoryById(categoryId);
      const row = document.querySelector(`tr[data-transaction-id="${transactionId}"]`);
      if (row) {
        const btn = row.querySelector('.category-btn');
        btn.style.setProperty('--category-color', category.color);
        btn.innerHTML = `
          <span class="category-dot" style="background: ${category.color}"></span>
          ${category.name}
          <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        `;

        // Update selected state in options
        row.querySelectorAll('.category-option').forEach(opt => {
          opt.classList.remove('selected');
        });
        row.querySelector(`.category-option[onclick*="${categoryId}"]`)?.classList.add('selected');
      }

      // Close dropdown
      document.getElementById(`category-options-${transactionId}`).classList.remove('show');
    } else {
      console.error('Failed to update category:', result.error);
    }
  } catch (error) {
    console.error('Error updating category:', error);
  }
}

// Filter functionality - now uses server-side filtering
function filterTransactions() {
  // Update filter state from UI
  currentFilters.dateFrom = document.getElementById('filter-date-from').value;
  currentFilters.dateTo = document.getElementById('filter-date-to').value;
  currentFilters.description = document.getElementById('filter-description').value;

  // Reload from page 1 with new filters
  loadAllTransactions(1, currentLimit);
}

function clearFilters() {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-description').value = '';

  // Clear filter state
  currentFilters.dateFrom = '';
  currentFilters.dateTo = '';
  currentFilters.description = '';

  // Reload from page 1 without filters
  loadAllTransactions(1, currentLimit);
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
            <div class="detail-info-value">${formatDate(t.transaction_date, {
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

          ${t.cuit ? `
            <div class="detail-info-item">
              <div class="detail-info-label">CUIT</div>
              <div class="detail-info-value cuit-value">${t.cuit}</div>
            </div>
          ` : ''}

          ${t.razon_social ? `
            <div class="detail-info-item">
              <div class="detail-info-label">Razón Social</div>
              <div class="detail-info-value">${t.razon_social}</div>
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
// EMAIL UPLOAD FUNCTIONALITY
// ========================================

// Load email upload token
async function loadEmailUploadToken() {
  try {
    const loadingEl = document.getElementById('email-upload-loading');
    const contentEl = document.getElementById('email-upload-content');
    const emailInput = document.getElementById('upload-email-address');

    if (!loadingEl || !contentEl || !emailInput) return;

    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/email/token', { headers });
    const result = await response.json();

    if (result.success) {
      emailInput.value = result.uploadEmail;
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    } else {
      loadingEl.innerHTML = '<span style="color: var(--error-color);">Error al cargar</span>';
    }
  } catch (error) {
    console.error('Error loading email token:', error);
    const loadingEl = document.getElementById('email-upload-loading');
    if (loadingEl) {
      loadingEl.innerHTML = '<span style="color: var(--error-color);">Error al cargar</span>';
    }
  }
}

// Copy upload email to clipboard
async function copyUploadEmail() {
  const emailInput = document.getElementById('upload-email-address');
  const copyBtn = document.querySelector('.btn-copy');

  if (!emailInput) return;

  try {
    await navigator.clipboard.writeText(emailInput.value);

    // Visual feedback
    if (copyBtn) {
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
    }

    showMessage('Email copiado al portapapeles', 'success');
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    showMessage('Error al copiar', 'error');
  }
}

// Regenerate upload email
async function regenerateUploadEmail() {
  const confirmed = await showCustomModal({
    title: 'Regenerar Email de Carga',
    message: '¿Estás seguro? Tu email de carga actual dejará de funcionar y recibirás uno nuevo.',
    type: 'warning',
    confirmText: 'Regenerar',
    cancelText: 'Cancelar',
    danger: false
  });

  if (!confirmed) return;

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/email/token/regenerate', {
      method: 'POST',
      headers
    });

    const result = await response.json();

    if (result.success) {
      const emailInput = document.getElementById('upload-email-address');
      if (emailInput) {
        emailInput.value = result.uploadEmail;
      }
      showMessage('Email de carga regenerado exitosamente', 'success');
    } else {
      showMessage(result.error || 'Error al regenerar email', 'error');
    }
  } catch (error) {
    console.error('Error regenerating email:', error);
    showMessage('Error al regenerar email', 'error');
  }
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
  // Update Mercado Pago connection
  const mercadoPagoConnection = connections.find(conn => conn.provider === 'mercadopago');

  const mpStatusEl = document.getElementById('mercadopago-status');
  const mpBtnEl = document.getElementById('mercadopago-btn');
  const mpCardEl = document.getElementById('mercadopago-card');

  if (mercadoPagoConnection && mercadoPagoConnection.status === 'active') {
    // Connected state
    if (mpStatusEl) {
      mpStatusEl.textContent = 'Conectado ✓';
      mpStatusEl.className = 'connection-status connected';
    }

    if (mpBtnEl) {
      mpBtnEl.textContent = 'Desconectar';
      mpBtnEl.onclick = () => disconnectProvider('mercadopago');
      mpBtnEl.classList.remove('btn-connection');
      mpBtnEl.classList.add('btn-disconnect');
    }

    if (mpCardEl) {
      mpCardEl.classList.add('connected');
      const infoEl = mpCardEl.querySelector('.connection-description');
      if (infoEl && mercadoPagoConnection.metadata) {
        if (mercadoPagoConnection.metadata.email) {
          infoEl.textContent = `Conectado como: ${mercadoPagoConnection.metadata.email}`;
        } else if (mercadoPagoConnection.metadata.nickname) {
          infoEl.textContent = `Conectado como: ${mercadoPagoConnection.metadata.nickname}`;
        }
      }
    }
  } else {
    // Disconnected state
    if (mpStatusEl) {
      mpStatusEl.textContent = 'No conectado';
      mpStatusEl.className = 'connection-status disconnected';
    }

    if (mpBtnEl) {
      mpBtnEl.textContent = 'Conectar Mercado Pago';
      mpBtnEl.onclick = () => connectMercadoPago();
      mpBtnEl.classList.remove('btn-disconnect');
      mpBtnEl.classList.add('btn-connection');
    }

    if (mpCardEl) {
      mpCardEl.classList.remove('connected');
      const infoEl = mpCardEl.querySelector('.connection-description');
      if (infoEl) {
        infoEl.textContent = 'Conecta tu cuenta de Mercado Pago para importar transacciones automáticamente';
      }
    }
  }

  // Update EuBanks connection
  const eubanksConnection = connections.find(conn => conn.provider === 'eubanks');

  const ebStatusEl = document.getElementById('eubanks-status');
  const ebBtnEl = document.getElementById('eubanks-btn');
  const ebCardEl = document.getElementById('eubanks-card');

  if (eubanksConnection && eubanksConnection.status === 'active') {
    // Connected state
    if (ebStatusEl) {
      ebStatusEl.textContent = 'Conectado ✓';
      ebStatusEl.className = 'connection-status connected';
    }

    if (ebBtnEl) {
      ebBtnEl.textContent = 'Desconectar';
      ebBtnEl.onclick = () => disconnectProvider('eubanks');
      ebBtnEl.classList.remove('btn-connection');
      ebBtnEl.classList.add('btn-disconnect');
    }

    if (ebCardEl) {
      ebCardEl.classList.add('connected');
      const infoEl = ebCardEl.querySelector('.connection-description');
      if (infoEl && eubanksConnection.metadata) {
        const bankName = eubanksConnection.metadata.bank_name || 'Banco';
        const country = eubanksConnection.metadata.country || '';
        infoEl.textContent = `Conectado: ${bankName} ${country ? '(' + country + ')' : ''}`;
      }
    }
  } else {
    // Disconnected state
    if (ebStatusEl) {
      ebStatusEl.textContent = 'No conectado';
      ebStatusEl.className = 'connection-status disconnected';
    }

    if (ebBtnEl) {
      ebBtnEl.textContent = 'Conectar Banco';
      ebBtnEl.onclick = () => connectEuBank();
      ebBtnEl.classList.remove('btn-disconnect');
      ebBtnEl.classList.add('btn-connection');
    }

    if (ebCardEl) {
      ebCardEl.classList.remove('connected');
      const infoEl = ebCardEl.querySelector('.connection-description');
      if (infoEl) {
        infoEl.textContent = 'Conecta tus cuentas bancarias europeas para sincronizar movimientos';
      }
    }
  }
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
  let providerName = provider;
  if (provider === 'mercadopago') {
    providerName = 'Mercado Pago';
  } else if (provider === 'eubanks') {
    providerName = 'tu banco europeo';
  }

  const confirmed = await showCustomModal({
    title: 'Desconectar ' + providerName,
    message: `¿Estás seguro de que quieres desconectar tu cuenta de ${providerName}? Dejarás de sincronizar transacciones automáticamente.`,
    type: 'warning',
    confirmText: 'Desconectar',
    cancelText: 'Cancelar',
    danger: true
  });

  if (!confirmed) {
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
      showMessage('Desconectado exitosamente', 'success');
      setTimeout(() => location.reload(), 1500);
    } else {
      showMessage('Error al desconectar', 'error');
    }
  } catch (error) {
    console.error('Error disconnecting provider:', error);
    showMessage('Error al desconectar', 'error');
  }
}

// ========================================
// BANK SELECTOR FUNCTIONALITY (Enable Banking)
// ========================================

let selectedCountry = null;
let selectedBank = null;
let availableCountries = [];
let availableBanks = [];

// Country codes to flags mapping
const countryFlags = {
  'FI': '🇫🇮', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'DE': '🇩🇪',
  'FR': '🇫🇷', 'ES': '🇪🇸', 'IT': '🇮🇹', 'NL': '🇳🇱', 'BE': '🇧🇪',
  'AT': '🇦🇹', 'PT': '🇵🇹', 'IE': '🇮🇪', 'PL': '🇵🇱', 'CZ': '🇨🇿',
  'GB': '🇬🇧', 'CH': '🇨🇭', 'LU': '🇱🇺', 'GR': '🇬🇷', 'EE': '🇪🇪',
  'LV': '🇱🇻', 'LT': '🇱🇹', 'SK': '🇸🇰', 'SI': '🇸🇮', 'HU': '🇭🇺',
  'RO': '🇷🇴', 'BG': '🇧🇬', 'HR': '🇭🇷', 'MT': '🇲🇹', 'CY': '🇨🇾'
};

const countryNames = {
  'FI': 'Finlandia', 'SE': 'Suecia', 'NO': 'Noruega', 'DK': 'Dinamarca', 'DE': 'Alemania',
  'FR': 'Francia', 'ES': 'España', 'IT': 'Italia', 'NL': 'Países Bajos', 'BE': 'Bélgica',
  'AT': 'Austria', 'PT': 'Portugal', 'IE': 'Irlanda', 'PL': 'Polonia', 'CZ': 'República Checa',
  'GB': 'Reino Unido', 'CH': 'Suiza', 'LU': 'Luxemburgo', 'GR': 'Grecia', 'EE': 'Estonia',
  'LV': 'Letonia', 'LT': 'Lituania', 'SK': 'Eslovaquia', 'SI': 'Eslovenia', 'HU': 'Hungría',
  'RO': 'Rumanía', 'BG': 'Bulgaria', 'HR': 'Croacia', 'MT': 'Malta', 'CY': 'Chipre'
};

async function connectEuBank() {
  selectedCountry = null;
  selectedBank = null;

  // Show bank selector modal
  const overlay = document.getElementById('bank-selector-overlay');
  overlay.classList.add('active');

  // Show country step
  showBankSelectorStep('country');

  // Load available countries
  await loadCountries();
}

function showBankSelectorStep(step) {
  document.getElementById('country-step').classList.remove('active');
  document.getElementById('bank-step').classList.remove('active');
  document.getElementById('loading-step').classList.remove('active');

  if (step === 'country') {
    document.getElementById('country-step').classList.add('active');
  } else if (step === 'bank') {
    document.getElementById('bank-step').classList.add('active');
  } else if (step === 'loading') {
    document.getElementById('loading-step').classList.add('active');
  }
}

function closeBankSelector() {
  const overlay = document.getElementById('bank-selector-overlay');
  overlay.classList.remove('active');
  selectedCountry = null;
  selectedBank = null;
}

async function loadCountries() {
  // Show loading
  showBankSelectorStep('loading');

  try {
    // Get list of available countries
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/eubanks/countries', { headers });
    const result = await response.json();

    if (result.success) {
      availableCountries = result.countries;
      renderCountries(availableCountries);
      showBankSelectorStep('country');
    } else {
      showMessage('Error al cargar países', 'error');
      closeBankSelector();
    }
  } catch (error) {
    console.error('Error loading countries:', error);
    showMessage('Error al cargar países', 'error');
    closeBankSelector();
  }
}

function renderCountries(countries) {
  const container = document.getElementById('country-selector');
  container.innerHTML = '';

  countries.forEach(country => {
    // Handle both object format { code: 'FI', name: 'Finland' } and string format 'FI'
    const countryCode = typeof country === 'string' ? country : country.code;
    const countryName = typeof country === 'string' ? (countryNames[country] || country) : country.name;

    const option = document.createElement('div');
    option.className = 'country-option';
    option.innerHTML = `
      <div class="country-flag">${countryFlags[countryCode] || '🏳️'}</div>
      <p class="country-name">${countryName}</p>
    `;

    option.addEventListener('click', () => {
      selectedCountry = countryCode;
      loadBanks(countryCode);
    });

    container.appendChild(option);
  });
}

async function loadBanks(countryCode) {
  showBankSelectorStep('loading');

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/eubanks/banks/${countryCode}`, { headers });
    const result = await response.json();

    console.log('Banks API response:', result);

    if (result.success) {
      availableBanks = result.banks;

      // Validate that banks is an array
      if (!Array.isArray(availableBanks)) {
        console.error('Banks is not an array:', availableBanks);
        showMessage('Error: formato de datos inválido', 'error');
        closeBankSelector();
        return;
      }

      if (availableBanks.length === 0) {
        showMessage('No hay bancos disponibles para este país', 'info');
        closeBankSelector();
        return;
      }

      renderBanks(availableBanks);
      showBankSelectorStep('bank');
    } else {
      showMessage(result.error || 'Error al cargar bancos', 'error');
      closeBankSelector();
    }
  } catch (error) {
    console.error('Error loading banks:', error);
    showMessage('Error al cargar bancos', 'error');
    closeBankSelector();
  }
}

function renderBanks(banks) {
  const container = document.getElementById('bank-selector');
  container.innerHTML = '';

  // Update the country label
  const countryLabel = document.getElementById('selected-country-label');
  if (countryLabel && selectedCountry) {
    const countryName = typeof availableCountries[0] === 'object'
      ? availableCountries.find(c => c.code === selectedCountry)?.name || selectedCountry
      : countryNames[selectedCountry] || selectedCountry;
    const flag = countryFlags[selectedCountry] || '🏳️';
    countryLabel.textContent = `${flag} ${countryName}`;
  }

  banks.forEach(bank => {
    const option = document.createElement('div');
    option.className = 'bank-option';
    option.dataset.bankName = bank.name;

    // Use logo from API if available, otherwise use emoji
    const logoHtml = bank.logo
      ? `<img src="${bank.logo}" alt="${bank.name}" class="bank-logo-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="bank-logo" style="display:none;">🏦</div>`
      : `<div class="bank-logo">🏦</div>`;

    option.innerHTML = `
      ${logoHtml}
      <p class="bank-name">${bank.name}</p>
    `;

    option.addEventListener('click', () => {
      // Remove previous selection
      container.querySelectorAll('.bank-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');

      selectedBank = bank;
      document.getElementById('connect-bank').disabled = false;
    });

    container.appendChild(option);
  });
}

async function initiateBankConnection() {
  if (!selectedBank || !selectedCountry) {
    showMessage('Por favor selecciona un banco', 'error');
    return;
  }

  console.log('🏦 [FRONTEND] Initiating bank connection');
  console.log('🏦 [FRONTEND] Selected bank:', selectedBank);
  console.log('🏦 [FRONTEND] Selected country:', selectedCountry);

  showBankSelectorStep('loading');

  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const payload = {
      bankName: selectedBank.name,
      country: selectedCountry
    };

    console.log('🏦 [FRONTEND] Sending request to /oauth/eubanks/authorize');
    console.log('🏦 [FRONTEND] Payload:', payload);

    const response = await fetch('/oauth/eubanks/authorize', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    console.log('🏦 [FRONTEND] Response status:', response.status);

    const result = await response.json();
    console.log('🏦 [FRONTEND] Response data:', result);

    if (result.success && result.authUrl) {
      console.log('🏦 [FRONTEND] ✅ Success! Redirecting to:', result.authUrl);
      // Redirect to Enable Banking auth page
      window.location.href = result.authUrl;
    } else {
      console.log('🏦 [FRONTEND] ❌ Error:', result.error);
      showMessage(result.error || 'Error al iniciar conexión con el banco', 'error');
      closeBankSelector();
    }
  } catch (error) {
    console.error('🏦 [FRONTEND] ❌ Exception:', error);
    showMessage('Error al conectar con el banco', 'error');
    closeBankSelector();
  }
}

// Search functionality for countries and banks
document.addEventListener('DOMContentLoaded', () => {
  // Country search
  const countrySearch = document.getElementById('country-search');
  if (countrySearch) {
    countrySearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const filtered = availableCountries.filter(country => {
        const countryCode = typeof country === 'string' ? country : country.code;
        const countryName = typeof country === 'string' ? (countryNames[country] || country) : country.name;
        return countryName.toLowerCase().includes(searchTerm) || countryCode.toLowerCase().includes(searchTerm);
      });
      renderCountries(filtered);
    });
  }

  // Bank search
  const bankSearch = document.getElementById('bank-search');
  if (bankSearch) {
    bankSearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const filtered = availableBanks.filter(bank =>
        bank.name.toLowerCase().includes(searchTerm)
      );
      renderBanks(filtered);
    });
  }

  // Button handlers
  const cancelCountry = document.getElementById('cancel-country');
  if (cancelCountry) {
    cancelCountry.addEventListener('click', closeBankSelector);
  }

  const backToCountry = document.getElementById('back-to-country');
  if (backToCountry) {
    backToCountry.addEventListener('click', () => {
      selectedBank = null;
      renderCountries(availableCountries);
      showBankSelectorStep('country');
    });
  }

  const connectBank = document.getElementById('connect-bank');
  if (connectBank) {
    connectBank.addEventListener('click', initiateBankConnection);
  }

  // Close on overlay click
  const bankSelectorOverlay = document.getElementById('bank-selector-overlay');
  if (bankSelectorOverlay) {
    bankSelectorOverlay.addEventListener('click', (e) => {
      if (e.target === bankSelectorOverlay) {
        closeBankSelector();
      }
    });
  }
});

// Check for OAuth callback success
document.addEventListener('DOMContentLoaded', () => {
  // Parse URL - can be either #section?params or ?params#section
  const hash = window.location.hash;

  // Extract query params from hash if present
  let urlParams;
  if (hash.includes('?')) {
    const queryString = hash.split('?')[1];
    urlParams = new URLSearchParams(queryString);
  } else {
    urlParams = new URLSearchParams(window.location.search);
  }

  const connection = urlParams.get('connection');
  const provider = urlParams.get('provider');

  if (connection === 'success' && provider) {
    // Show configuracion section
    showSection('configuracion');

    // Activate menu item
    menuItems.forEach(item => {
      if (item.dataset.section === 'configuracion') {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Show success message
    setTimeout(() => {
      let providerName = provider;
      if (provider === 'mercadopago') {
        providerName = 'Mercado Pago';
      } else if (provider === 'eubanks') {
        providerName = 'tu banco europeo';
      }
      showMessage(`Conexión con ${providerName} establecida exitosamente`, 'success');

      // Load connections to update UI
      loadConnections();
    }, 500);

    // Clean URL - remove query params but keep hash
    const cleanUrl = window.location.pathname + '#configuracion';
    window.history.replaceState({}, document.title, cleanUrl);
  }

  // Load connections and email token when viewing the settings section
  const configuracionMenuItem = document.querySelector('[data-section="configuracion"]');
  if (configuracionMenuItem) {
    configuracionMenuItem.addEventListener('click', () => {
      setTimeout(() => {
        loadConnections();
        loadEmailUploadToken();
      }, 100);
    });
  }

  // Load connections and email token on initial page load if on settings section
  if (hash.includes('configuracion')) {
    setTimeout(() => {
      loadConnections();
      loadEmailUploadToken();
    }, 100);
  }
});
