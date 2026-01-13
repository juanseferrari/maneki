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
  includeDeleted: false,
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
let authIsReady = false;

// Initialize auth ready promise
function initAuthReady() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise(resolve => {
      authReadyResolve = resolve;
    });

    // Set up auth state listener to resolve when session is available
    if (typeof supabaseClient !== 'undefined') {
      supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log('[Auth] State changed:', event, session ? 'has session' : 'no session');
        if (session) {
          accessToken = session.access_token;
          authIsReady = true;
          if (authReadyResolve) {
            authReadyResolve();
            authReadyResolve = null;
          }
        }
      });

      // Also check immediately in case session is already available
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        console.log('[Auth] Initial session check:', session ? 'has session' : 'no session');
        if (session) {
          accessToken = session.access_token;
          authIsReady = true;
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

// Helper to wait for auth with timeout
async function waitForAuth(timeoutMs = 3000) {
  if (authIsReady) return true;

  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      console.log('[Auth] Timeout waiting for auth');
      resolve(false);
    }, timeoutMs);

    if (authReadyPromise) {
      authReadyPromise.then(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    } else {
      clearTimeout(timeout);
      resolve(false);
    }
  });
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
  } else if (sectionName === 'archivos') {
    loadDashboardData();
  } else if (sectionName === 'ajustes') {
    if (typeof initializeCategories === 'function') {
      initializeCategories();
    }
    loadUploadEmail();
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
  const loadingEl = document.getElementById('files-loading');
  const emptyEl = document.getElementById('files-empty');
  const tableContainer = document.getElementById('files-table-container');

  // Show loading state
  if (loadingEl) loadingEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'none';

  try {
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch('/api/files', { headers });
    const result = await response.json();

    if (loadingEl) loadingEl.style.display = 'none';

    if (result.success) {
      updateDashboard(result.files);
      displayFiles(result.files);
    } else {
      if (emptyEl) emptyEl.style.display = 'flex';
    }
  } catch (error) {
    console.error('Error loading files:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
  }
}

function updateDashboard(files) {
  // Update stats if elements exist (legacy dashboard)
  const totalFilesEl = document.getElementById('total-files');
  if (totalFilesEl) totalFilesEl.textContent = files.length;

  let totalTransactions = 0;
  let totalVeps = 0;

  files.forEach(file => {
    if (file.document_type === 'vep') {
      totalVeps++;
    } else if (file.processing_status === 'completed') {
      totalTransactions += 10;
    }
  });

  const totalTransEl = document.getElementById('total-transactions');
  const totalVepsEl = document.getElementById('total-veps');
  if (totalTransEl) totalTransEl.textContent = totalTransactions;
  if (totalVepsEl) totalVepsEl.textContent = totalVeps;

  // Recent activity (if element exists)
  const recentContainer = document.getElementById('recent-files');
  if (!recentContainer) return;

  const recentFiles = files.slice(0, 5);
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
  const tableBody = document.getElementById('files-table-body');
  const tableContainer = document.getElementById('files-table-container');
  const emptyEl = document.getElementById('files-empty');

  if (files.length === 0) {
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'block';

  if (tableBody) {
    tableBody.innerHTML = files.map(file => {
      const statusLabel = file.processing_status === 'completed' ? 'Completado' :
        file.processing_status === 'pending' ? 'Pendiente' :
        file.processing_status === 'processing' ? 'Procesando' :
        file.processing_status === 'failed' ? 'Error' : file.processing_status;
      const statusClass = file.processing_status;
      const transactionCount = file.transaction_count || 0;

      return `
        <tr class="file-row" onclick="viewFileDetails('${file.id}', '${file.document_type}')">
          <td class="file-name-cell">
            <div class="file-name-wrapper">
              <span class="file-icon">${getFileIcon(file.original_name)}</span>
              <span class="file-name-text" title="${file.original_name}">${file.original_name}</span>
            </div>
          </td>
          <td>
            <span class="file-type-badge">${getFileExtension(file.original_name)}</span>
          </td>
          <td>${formatFileSize(file.file_size)}</td>
          <td>${transactionCount > 0 ? transactionCount : '-'}</td>
          <td>${new Date(file.created_at).toLocaleDateString('es-AR')}</td>
          <td>
            <div class="file-actions">
              <span class="file-status-badge ${statusClass}">${statusLabel}</span>
              <button class="btn-icon-delete" onclick="event.stopPropagation(); deleteFile('${file.id}')" title="Eliminar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
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

  // Show table structure with header and loading spinner in tbody
  container.innerHTML = `
    <div class="transactions-table resizable">
      <table>
        <thead>
          <tr>
            <th data-col="fecha" style="width: 10%;">Fecha<span class="col-resize-handle"></span></th>
            <th data-col="descripcion" style="width: 32%;">Descripción<span class="col-resize-handle"></span></th>
            <th data-col="monto" style="width: 12%;">Monto<span class="col-resize-handle"></span></th>
            <th data-col="categoria" style="width: 18%;">Categoría<span class="col-resize-handle"></span></th>
            <th data-col="banco" style="width: 18%;">Banco<span class="col-resize-handle"></span></th>
            <th data-col="acciones" style="width: 10%;">Acciones</th>
          </tr>
        </thead>
        <tbody id="transactions-tbody">
          <tr class="transactions-loading-row">
            <td colspan="6">
              <div class="table-loading">
                <div class="spinner"></div>
                <span>Cargando transacciones...</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  try {
    // Wait for auth to be ready before making the request
    // This handles the case where the page loads directly on #transacciones
    const authReady = await waitForAuth(500);
    console.log('[Transactions] Auth ready:', authReady, 'Token:', accessToken ? 'present' : 'missing');

    const headers = await getAuthHeaders();
    console.log('[Transactions] Headers:', Object.keys(headers));

    // Build query params with filters
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (currentFilters.dateFrom) params.append('dateFrom', currentFilters.dateFrom);
    if (currentFilters.dateTo) params.append('dateTo', currentFilters.dateTo);
    if (currentFilters.description) params.append('description', currentFilters.description);
    if (currentFilters.includeDeleted) params.append('includeDeleted', 'true');

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
    const tbody = document.getElementById('transactions-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr class="transactions-error-row">
          <td colspan="6">
            <div class="table-error">
              <span>Error al cargar transacciones</span>
            </div>
          </td>
        </tr>
      `;
    }
  }
}

// Dynamic categories - loaded from API, with fallback defaults
let userCategories = [];
const fallbackCategories = [
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

// Load user categories from API
async function loadUserCategories() {
  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch('/api/categories', { headers });

    if (response.ok) {
      const data = await response.json();
      if (data.categories && data.categories.length > 0) {
        userCategories = data.categories;
        return;
      }
    }
  } catch (error) {
    console.error('Error loading user categories:', error);
  }
  // Use fallback if API fails
  userCategories = fallbackCategories;
}

// Get categories (returns user categories if loaded, fallback otherwise)
function getCategories() {
  return userCategories.length > 0 ? userCategories : fallbackCategories;
}

function getCategoryById(categoryId) {
  const categories = getCategories();
  // Try to find by ID first
  let category = categories.find(c => c.id === categoryId);
  // If not found and categoryId looks like an old string ID, try to find by name match
  if (!category && typeof categoryId === 'string' && !categoryId.includes('-')) {
    const nameMap = {
      'sin_categoria': 'Sin categoría',
      'alimentacion': 'Alimentación',
      'transporte': 'Transporte',
      'servicios': 'Servicios',
      'entretenimiento': 'Entretenimiento',
      'salud': 'Salud',
      'educacion': 'Educación',
      'hogar': 'Hogar',
      'impuestos': 'Impuestos',
      'transferencias': 'Transferencias',
      'ingresos': 'Ingresos'
    };
    const mappedName = nameMap[categoryId];
    if (mappedName) {
      category = categories.find(c => c.name === mappedName);
    }
  }
  return category || categories[0] || { id: null, name: 'Sin categoría', color: '#9CA3AF' };
}

function displayTransactions(transactions) {
  const tbody = document.getElementById('transactions-tbody');

  // Handle empty state - show message inside tbody
  if (transactions.length === 0 && totalTransactions === 0) {
    if (tbody) {
      tbody.innerHTML = `
        <tr class="transactions-empty-row">
          <td colspan="6">
            <div class="table-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
              <p>No hay transacciones disponibles</p>
              <span>Sube archivos o conecta tus cuentas para ver transacciones</span>
            </div>
          </td>
        </tr>
      `;
    }
    // Remove pagination if exists
    const existingPagination = document.querySelector('#all-transactions-container .pagination-controls');
    if (existingPagination) existingPagination.remove();
    return;
  }

  const startRecord = ((currentPage - 1) * currentLimit) + 1;
  const endRecord = Math.min(currentPage * currentLimit, totalTransactions);

  // Update tbody with transaction rows
  if (tbody) {
    tbody.innerHTML = transactions.map(t => {
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
                ${getCategories().map(cat => `
                  <div class="category-option ${cat.id === t.category || cat.id === category.id ? 'selected' : ''}" data-transaction-id="${t.id}" data-category-id="${cat.id}">
                    <span class="category-dot" style="background: ${cat.color}"></span>
                    ${cat.name}
                  </div>
                `).join('')}
              </div>
            </div>
          </td>
          <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${t.bank_name || '-'}</td>
          <td class="actions-cell">
            <button class="action-btn create-service-btn" onclick="event.stopPropagation(); createServiceFromTransaction('${t.id}')" title="Crear servicio recurrente">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M8 16H3v5"></path>
              </svg>
            </button>
            <button class="action-btn delete-transaction-btn" onclick="event.stopPropagation(); confirmDeleteTransaction('${t.id}')" title="Eliminar transaccion">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Update or create pagination
  const container = document.getElementById('all-transactions-container');
  let paginationEl = container.querySelector('.pagination-controls');

  const paginationHTML = `
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
  `;

  if (paginationEl) {
    paginationEl.innerHTML = paginationHTML;
  } else {
    paginationEl = document.createElement('div');
    paginationEl.className = 'pagination-controls';
    paginationEl.innerHTML = paginationHTML;
    container.appendChild(paginationEl);
  }

  // Load saved column widths and initialize resizing
  loadColumnWidths();
  initColumnResize();

  // Initialize category option click listeners
  initCategoryOptionListeners();
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
  // Close all other dropdowns and remove active class from rows
  document.querySelectorAll('.category-options.show').forEach(el => {
    if (el.id !== `category-options-${transactionId}`) {
      el.classList.remove('show');
      // Remove dropdown-active class from parent row
      el.closest('tr')?.classList.remove('dropdown-active');
    }
  });

  const dropdown = document.getElementById(`category-options-${transactionId}`);
  const row = dropdown.closest('tr');
  const isOpening = !dropdown.classList.contains('show');

  dropdown.classList.toggle('show');

  // Add/remove class to parent row to raise z-index
  if (isOpening) {
    row?.classList.add('dropdown-active');
  } else {
    row?.classList.remove('dropdown-active');
  }
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.category-dropdown')) {
    document.querySelectorAll('.category-options.show').forEach(el => {
      el.classList.remove('show');
      // Remove dropdown-active class from parent row
      el.closest('tr')?.classList.remove('dropdown-active');
    });
  }
});

// Initialize category option click listeners (called after rendering transactions)
function initCategoryOptionListeners() {
  document.querySelectorAll('.category-option').forEach(option => {
    // Remove existing listener to avoid duplicates
    option.removeEventListener('click', handleCategoryOptionClick);
    option.addEventListener('click', handleCategoryOptionClick);
  });
}

function handleCategoryOptionClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const transactionId = this.dataset.transactionId;
  const categoryId = this.dataset.categoryId;
  if (transactionId && categoryId) {
    updateTransactionCategory(transactionId, categoryId);
  }
}

// Update transaction category with Optimistic UI Update + Loading indicator
async function updateTransactionCategory(transactionId, categoryId) {
  const row = document.querySelector(`tr[data-transaction-id="${transactionId}"]`);
  const transaction = allTransactions.find(t => t.id === transactionId);

  // Store previous state for rollback
  const previousCategoryId = transaction?.category;
  const previousCategory = getCategoryById(previousCategoryId);
  const newCategory = getCategoryById(categoryId);

  // === OPTIMISTIC UPDATE: Update UI immediately with loading spinner ===

  // Update local data immediately
  if (transaction) {
    transaction.category = categoryId;
  }

  // Update UI immediately - show category with loading spinner
  if (row) {
    const btn = row.querySelector('.category-btn');
    btn.style.setProperty('--category-color', newCategory.color);
    btn.innerHTML = `
      <span class="category-dot" style="background: ${newCategory.color}"></span>
      ${newCategory.name}
      <span class="category-saving-spinner"></span>
    `;

    // Update selected state in options
    row.querySelectorAll('.category-option').forEach(opt => {
      opt.classList.remove('selected');
    });
    row.querySelector(`.category-option[data-category-id="${categoryId}"]`)?.classList.add('selected');
  }

  // Close dropdown immediately
  const dropdownEl = document.getElementById(`category-options-${transactionId}`);
  if (dropdownEl) {
    dropdownEl.classList.remove('show');
    dropdownEl.closest('tr')?.classList.remove('dropdown-active');
  }

  // === BACKGROUND: Save to server ===
  try {
    const headers = await getAuthHeaders(true);

    const response = await fetch(`/api/transactions/${transactionId}/category`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ category: categoryId })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to update category');
    }

    // Success - show checkmark briefly, then restore arrow
    if (row) {
      const btn = row.querySelector('.category-btn');
      btn.innerHTML = `
        <span class="category-dot" style="background: ${newCategory.color}"></span>
        ${newCategory.name}
        <svg class="category-success-check" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;

      // After brief delay, restore normal arrow
      setTimeout(() => {
        if (btn) {
          btn.innerHTML = `
            <span class="category-dot" style="background: ${newCategory.color}"></span>
            ${newCategory.name}
            <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          `;
        }
      }, 800);
    }

  } catch (error) {
    console.error('Error updating category:', error);

    // === ROLLBACK: Revert to previous state ===
    if (transaction) {
      transaction.category = previousCategoryId;
    }

    if (row) {
      const btn = row.querySelector('.category-btn');
      btn.style.setProperty('--category-color', previousCategory.color);
      btn.innerHTML = `
        <span class="category-dot" style="background: ${previousCategory.color}"></span>
        ${previousCategory.name}
        <svg class="dropdown-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;

      // Revert selected state
      row.querySelectorAll('.category-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      row.querySelector(`.category-option[data-category-id="${previousCategoryId}"]`)?.classList.add('selected');
    }

    // Show error notification
    if (typeof showNotification === 'function') {
      showNotification('Error al guardar categoría', 'error');
    }
  }
}

// Filter functionality - now uses server-side filtering
function filterTransactions() {
  // Update filter state from UI
  currentFilters.dateFrom = document.getElementById('filter-date-from').value;
  currentFilters.dateTo = document.getElementById('filter-date-to').value;
  currentFilters.description = document.getElementById('filter-description').value;
  const includeDeletedCheckbox = document.getElementById('filter-include-deleted');
  currentFilters.includeDeleted = includeDeletedCheckbox ? includeDeletedCheckbox.checked : false;

  // Reload from page 1 with new filters
  loadAllTransactions(1, currentLimit);
}

function clearFilters() {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-description').value = '';
  const includeDeletedCheckbox = document.getElementById('filter-include-deleted');
  if (includeDeletedCheckbox) includeDeletedCheckbox.checked = false;

  // Clear filter state
  currentFilters.dateFrom = '';
  currentFilters.dateTo = '';
  currentFilters.description = '';
  currentFilters.includeDeleted = false;

  // Reload from page 1 without filters
  loadAllTransactions(1, currentLimit);
}

// Add event listeners for filters
document.addEventListener('DOMContentLoaded', () => {
  // Load user categories from API
  loadUserCategories();

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
// CREATE SERVICE FROM TRANSACTION
// ========================================

// Map transaction categories to service categories
const transactionToServiceCategory = {
  'servicios': 'utilities',
  'entretenimiento': 'streaming',
  'hogar': 'housing',
  'transporte': 'subscriptions',
  'salud': 'insurance',
  'educacion': 'subscriptions',
  'impuestos': 'other',
  'alimentacion': 'other',
  'transferencias': 'other',
  'ingresos': 'other',
  'sin_categoria': 'other'
};

// Create a recurring service from a transaction
async function createServiceFromTransaction(transactionId) {
  try {
    // Get transaction data from API
    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`/api/transactions/${transactionId}`, { headers });
    const result = await response.json();

    if (!result.success) {
      console.error('Failed to get transaction:', result.error);
      showNotification('Error al obtener la transacción', 'error');
      return;
    }

    const t = result.transaction;

    // Check if openAddServiceModal exists (from services.js)
    if (typeof openAddServiceModal !== 'function') {
      // Navigate to services section and wait for it to load
      navigateToSection('servicios');
      showNotification('Navega a Servicios para crear un servicio recurrente', 'info');
      return;
    }

    // Open the service modal
    openAddServiceModal();

    // Pre-fill the form with transaction data
    setTimeout(() => {
      // Name: use description or merchant
      const serviceName = t.merchant || t.description || '';
      document.getElementById('service-name').value = serviceName;

      // Category: map from transaction category
      const serviceCategory = transactionToServiceCategory[t.category] || 'other';
      document.getElementById('service-category').value = serviceCategory;

      // Amount: use absolute value
      if (t.amount) {
        document.getElementById('service-amount').value = Math.abs(t.amount).toFixed(2);
      }

      // Currency: default to ARS
      document.getElementById('service-currency').value = 'ARS';

      // Day: extract from transaction date
      if (t.transaction_date) {
        const date = new Date(t.transaction_date);
        const day = date.getDate();
        document.getElementById('service-day').value = day;
      }

      // Set default frequency to monthly
      document.getElementById('service-frequency').value = 'monthly';

      // Notes: add reference to original transaction
      const notes = `Creado desde transacción del ${formatDate(t.transaction_date)}`;
      document.getElementById('service-notes').value = notes;

      // Show notification
      showNotification('Complete los datos del servicio', 'info');
    }, 100);

  } catch (error) {
    console.error('Error creating service from transaction:', error);
    showNotification('Error al crear servicio', 'error');
  }
}

// Open delete transaction confirmation modal
function confirmDeleteTransaction(transactionId) {
  const transaction = allTransactions.find(t => t.id === transactionId);
  if (!transaction) return;

  const modal = document.getElementById('delete-transaction-modal');
  const detailsEl = document.getElementById('delete-transaction-details');
  const idInput = document.getElementById('delete-transaction-id');

  if (!modal || !detailsEl || !idInput) return;

  // Store the transaction ID
  idInput.value = transactionId;

  // Format the transaction details
  const date = transaction.transaction_date
    ? new Date(transaction.transaction_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin fecha';
  const description = transaction.description || 'Sin descripcion';
  const amount = transaction.amount || 0;
  const formattedAmount = '$' + Math.abs(amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const amountClass = amount >= 0 ? 'income' : 'expense';

  detailsEl.innerHTML = `
    <div class="delete-detail-row">
      <span class="delete-detail-label">Fecha:</span>
      <span class="delete-detail-value">${date}</span>
    </div>
    <div class="delete-detail-row">
      <span class="delete-detail-label">Descripcion:</span>
      <span class="delete-detail-value">${escapeHtml(description)}</span>
    </div>
    <div class="delete-detail-row">
      <span class="delete-detail-label">Monto:</span>
      <span class="delete-detail-value ${amountClass}">${amount >= 0 ? '+' : '-'}${formattedAmount}</span>
    </div>
  `;

  // Show the modal
  modal.classList.add('active');

  // Add click outside to close
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeDeleteTransactionModal();
    }
  };
}

// Close delete transaction modal
function closeDeleteTransactionModal() {
  const modal = document.getElementById('delete-transaction-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Confirm delete from modal
function confirmDeleteFromModal() {
  const idInput = document.getElementById('delete-transaction-id');
  if (idInput && idInput.value) {
    deleteTransaction(idInput.value);
    closeDeleteTransactionModal();
  }
}

// Delete transaction (soft delete - mark as deleted)
async function deleteTransaction(transactionId) {
  try {
    const headers = await getAuthHeaders();
    headers['Content-Type'] = 'application/json';

    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: 'DELETE',
      headers
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Error al eliminar transaccion');
    }

    showNotification('Transaccion eliminada', 'success');

    // Reload transactions to reflect changes
    loadAllTransactions(currentPage, currentLimit);

  } catch (error) {
    console.error('Error deleting transaction:', error);
    showNotification('Error al eliminar transaccion', 'error');
  }
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

  const mpSyncBtn = document.getElementById('mercadopago-sync-btn');
  const mpDisconnectBtn = document.getElementById('mercadopago-disconnect-btn');

  if (mercadoPagoConnection && mercadoPagoConnection.status === 'active') {
    // Connected state
    if (mpStatusEl) {
      mpStatusEl.textContent = 'Conectado ✓';
      mpStatusEl.className = 'connection-status connected';
    }

    // Hide connect button, show sync and disconnect buttons
    if (mpBtnEl) {
      mpBtnEl.style.display = 'none';
    }
    if (mpSyncBtn) {
      mpSyncBtn.style.display = 'inline-flex';
    }
    if (mpDisconnectBtn) {
      mpDisconnectBtn.style.display = 'inline-flex';
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

    // Show connect button, hide sync and disconnect buttons
    if (mpBtnEl) {
      mpBtnEl.style.display = 'inline-flex';
    }
    if (mpSyncBtn) {
      mpSyncBtn.style.display = 'none';
    }
    if (mpDisconnectBtn) {
      mpDisconnectBtn.style.display = 'none';
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

// Sync Mercado Pago transactions
async function syncMercadoPago() {
  const syncBtn = document.getElementById('mercadopago-sync-btn');
  const originalText = syncBtn ? syncBtn.innerHTML : '';

  try {
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<div class="spinner-small"></div> Sincronizando...';
    }

    const headers = await getAuthHeaders(true);

    const response = await fetch('/api/sync/mercadopago', {
      method: 'POST',
      headers
    });
    const result = await response.json();

    if (result.success) {
      // Show sync result modal with correct field names
      showSyncResultModal({
        success: true,
        provider: 'Mercado Pago',
        syncedCount: result.syncedCount || 0,
        skippedCount: result.skippedCount || 0,
        totalFetched: result.totalFetched || 0
      });

      // Reload connections to update last sync time
      await loadConnections();

      // Reload transactions if we're on that section
      if (typeof loadAllTransactions === 'function') {
        loadAllTransactions();
      }
    } else {
      showSyncResultModal({
        success: false,
        provider: 'Mercado Pago',
        error: result.error || 'Error desconocido'
      });
    }
  } catch (error) {
    console.error('Error syncing Mercado Pago:', error);
    showSyncResultModal({
      success: false,
      provider: 'Mercado Pago',
      error: 'Error de conexion'
    });
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = originalText;
    }
  }
}

// Show sync result modal
function showSyncResultModal(data) {
  const modal = document.getElementById('sync-result-modal');
  const iconEl = document.getElementById('sync-result-icon');
  const titleEl = document.getElementById('sync-result-title');
  const messageEl = document.getElementById('sync-result-message');
  const detailsEl = document.getElementById('sync-result-details');

  if (!modal) return;

  if (data.success) {
    // Success state
    iconEl.className = 'custom-modal-icon success';
    iconEl.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    titleEl.textContent = 'Sincronizacion Completa';

    if (data.syncedCount > 0) {
      messageEl.textContent = `Se importaron ${data.syncedCount} transacciones de ${data.provider}`;
    } else {
      messageEl.textContent = `No hay transacciones nuevas para importar de ${data.provider}`;
    }

    // Build details HTML
    let detailsHtml = '<div class="sync-detail-row">';
    detailsHtml += `<span class="sync-detail-label">Transacciones obtenidas</span>`;
    detailsHtml += `<span class="sync-detail-value">${data.totalFetched}</span>`;
    detailsHtml += '</div>';
    detailsHtml += '<div class="sync-detail-row">';
    detailsHtml += `<span class="sync-detail-label">Importadas (nuevas)</span>`;
    detailsHtml += `<span class="sync-detail-value highlight">${data.syncedCount}</span>`;
    detailsHtml += '</div>';
    if (data.skippedCount > 0) {
      detailsHtml += '<div class="sync-detail-row">';
      detailsHtml += `<span class="sync-detail-label">Omitidas (ya existian)</span>`;
      detailsHtml += `<span class="sync-detail-value muted">${data.skippedCount}</span>`;
      detailsHtml += '</div>';
    }
    detailsEl.innerHTML = detailsHtml;
  } else {
    // Error state
    iconEl.className = 'custom-modal-icon danger';
    iconEl.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    `;
    titleEl.textContent = 'Error de Sincronizacion';
    messageEl.textContent = `Error al sincronizar con ${data.provider}`;
    detailsEl.innerHTML = `<div class="sync-error-message">${data.error}</div>`;
  }

  // Show modal
  modal.classList.add('active');

  // Close on overlay click
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeSyncResultModal();
    }
  };
}

// Close sync result modal
function closeSyncResultModal() {
  const modal = document.getElementById('sync-result-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Sync Mercury transactions
async function syncMercury() {
  const syncBtn = document.getElementById('mercury-sync-btn');
  const originalText = syncBtn ? syncBtn.innerHTML : '';

  try {
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<div class="spinner-small"></div> Sincronizando...';
    }

    const headers = await getAuthHeaders(true);

    const response = await fetch('/api/sync/mercury', {
      method: 'POST',
      headers
    });
    const result = await response.json();

    if (result.success) {
      const msg = result.imported > 0
        ? `Se importaron ${result.imported} transacciones de Mercury`
        : 'No hay transacciones nuevas para importar';
      alert(msg);

      await loadConnections();

      if (typeof loadAllTransactions === 'function') {
        loadAllTransactions();
      }
    } else {
      alert('Error al sincronizar: ' + (result.error || 'Error desconocido'));
    }
  } catch (error) {
    console.error('Error syncing Mercury:', error);
    alert('Error al sincronizar con Mercury');
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = originalText;
    }
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
