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

// Files state variable
let existingFiles = [];

// Sort state variables
let currentSortColumn = 'fecha';
let currentSortOrder = 'desc'; // 'asc' or 'desc'

// Filter state variables
let currentFilters = {
  dateFrom: '',
  dateTo: '',
  includeDeleted: false,
  description: '',
  categories: [],      // Array of selected category IDs
  amountType: 'all',   // 'all', 'positive', 'negative', 'custom'
  amountMin: '',
  amountMax: '',
  files: []            // Array of selected file IDs
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
async function getAccessToken(retries = 2) {
  // If we already have a token, return it
  if (accessToken) return accessToken;

  if (typeof supabaseClient !== 'undefined') {
    // Try to get session directly first
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      accessToken = session.access_token;
      return accessToken;
    }

    // If no session yet, wait with minimal backoff (only 2 retries max)
    if (retries > 0) {
      const delay = retries === 2 ? 50 : 100; // 50ms first retry, 100ms second retry
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
  // Check if file already exists (same name, size, and type)
  const duplicateFile = existingFiles.find(f =>
    f.original_name === file.name &&
    f.file_size === file.size &&
    f.mime_type === file.type
  );

  if (duplicateFile) {
    const fileSizeText = formatFileSize(file.size);

    const confirmed = await showCustomModal({
      icon: 'warning',
      title: 'Archivo Duplicado',
      message: `Ya cargaste este archivo anteriormente:`,
      hint: `
        <div style="margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.05); border-radius: 6px;">
          <strong>Nombre:</strong> ${file.name}<br>
          <strong>Tamaño:</strong> ${fileSizeText}<br>
          <strong>Tipo:</strong> ${file.type}
        </div>
        ¿Deseas cargar el archivo de todas formas?
      `,
      confirmText: 'Cargar de todas formas',
      cancelText: 'Cancelar'
    });

    if (!confirmed) {
      fileInput.value = '';
      return;
    }
  }

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

      // Store the file ID to check for duplicates later
      const uploadedFileId = result.file.id;

      setTimeout(() => {
        loadDashboardData();
        // Check processing status after a delay to show duplicate notification
        checkForDuplicatesNotification(uploadedFileId);
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

  // Store files globally for duplicate checking
  existingFiles = files;

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
            <span class="file-name-text" title="${file.original_name}">${file.original_name}</span>
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
  // Find the file in existingFiles to get transaction count
  const file = existingFiles.find(f => f.id === fileId);
  const transactionCount = file?.transaction_count || 0;

  // Build warning message
  let message = '¿Estás seguro de que quieres eliminar este archivo?';
  let hint = '';

  if (transactionCount > 0) {
    message = `Al eliminar este archivo se eliminarán también ${transactionCount} ${transactionCount === 1 ? 'transacción asociada' : 'transacciones asociadas'}.`;
    hint = `
      <div style="margin: 12px 0; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; border-left: 3px solid #EF4444;">
        <strong style="color: #DC2626;">⚠️ Esta acción no se puede deshacer</strong><br>
        <span style="color: #7F1D1D;">Se eliminarán permanentemente ${transactionCount} ${transactionCount === 1 ? 'transacción' : 'transacciones'} de tu historial.</span>
      </div>
    `;
  }

  const confirmed = await showCustomModal({
    icon: 'danger',
    title: 'Eliminar Archivo',
    message: message,
    hint: hint || 'Esta acción no se puede deshacer.',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar'
  });

  if (!confirmed) {
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
      const deletedMsg = transactionCount > 0
        ? `Archivo eliminado junto con ${transactionCount} ${transactionCount === 1 ? 'transacción' : 'transacciones'}`
        : 'Archivo eliminado correctamente';
      showMessage(deletedMsg, 'success');
      loadDashboardData();
    } else {
      showMessage(result.error || 'Error al eliminar archivo', 'error');
    }
  } catch (error) {
    console.error('Delete error:', error);
    showMessage('Error al eliminar: ' + error.message, 'error');
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
            <th data-col="fecha" style="width: 10%; cursor: pointer;" onclick="sortTransactions('fecha')" title="Click para ordenar">
              Fecha <span class="sort-icon" id="sort-icon-fecha">⇅</span><span class="col-resize-handle"></span>
            </th>
            <th data-col="descripcion" style="width: 30%; cursor: pointer;" onclick="sortTransactions('descripcion')" title="Click para ordenar">
              Descripción <span class="sort-icon" id="sort-icon-descripcion">⇅</span><span class="col-resize-handle"></span>
            </th>
            <th data-col="monto" style="width: 12%; cursor: pointer;" onclick="sortTransactions('monto')" title="Click para ordenar">
              Monto <span class="sort-icon" id="sort-icon-monto">⇅</span><span class="col-resize-handle"></span>
            </th>
            <th data-col="categoria" style="width: 18%; cursor: pointer;" onclick="sortTransactions('categoria')" title="Click para ordenar">
              Categoría <span class="sort-icon" id="sort-icon-categoria">⇅</span><span class="col-resize-handle"></span>
            </th>
            <th data-col="banco" style="width: 16%; cursor: pointer;" onclick="sortTransactions('banco')" title="Click para ordenar">
              Banco <span class="sort-icon" id="sort-icon-banco">⇅</span><span class="col-resize-handle"></span>
            </th>
            <th data-col="acciones" style="width: 14%;">Acciones</th>
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
    // Get auth headers directly - getAccessToken() has built-in retry logic
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

    // Add category filters
    if (currentFilters.categories && currentFilters.categories.length > 0) {
      currentFilters.categories.forEach(catId => {
        params.append('categories', catId);
      });
    }

    // Add "Sin categoría" filter
    if (currentFilters.includeNoCategory) {
      params.append('includeNoCategory', 'true');
    }

    // Add amount filters
    if (currentFilters.amountType && currentFilters.amountType !== 'all') {
      params.append('amountType', currentFilters.amountType);
      if (currentFilters.amountType === 'custom') {
        if (currentFilters.amountMin) params.append('amountMin', currentFilters.amountMin);
        if (currentFilters.amountMax) params.append('amountMax', currentFilters.amountMax);
      }
    }

    // Add file filters
    if (currentFilters.files && currentFilters.files.length > 0) {
      currentFilters.files.forEach(fileId => {
        params.append('files', fileId);
      });
    }

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
  const categories = userCategories.length > 0 ? userCategories : fallbackCategories;
  // Sort categories alphabetically by name
  return [...categories].sort((a, b) => {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

function getCategoryById(categoryId) {
  // If no category ID provided, return "Sin categoría" placeholder
  if (!categoryId || categoryId === null || categoryId === undefined || categoryId === '') {
    return { id: null, name: 'Sin categoría', color: '#9CA3AF' };
  }

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

  // If still not found, return "Sin categoría" placeholder
  return category || { id: null, name: 'Sin categoría', color: '#9CA3AF' };
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
      const category = getCategoryById(t.category_id);

      // Badge de splits
      const splitIndicator = t.has_splits
        ? `<span class="split-badge" title="${t.split_count} subdivisiones">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"></path>
             </svg>
             ${t.split_count}
           </span>`
        : '';

      return `
        <tr data-transaction-id="${t.id}">
          <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${formatDate(t.transaction_date)}</td>
          <td onclick="showTransactionDetail('${t.id}')" style="cursor: pointer;">${t.description || '-'}${splitIndicator}</td>
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
            ${t.has_service ? `
              <button class="action-btn service-linked-btn" onclick="event.stopPropagation(); showTransactionDetail('${t.id}')" title="Vinculado a servicio">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </button>
            ` : `
              <button class="action-btn create-service-btn" onclick="event.stopPropagation(); openAssociateServiceModal('${t.id}')" title="Asociar a servicio">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                  <path d="M21 3v5h-5"></path>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                  <path d="M8 16H3v5"></path>
                </svg>
              </button>
            `}
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

  // Update sort icons to show current sort state
  updateSortIcons();
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
      el.classList.remove('dropup');
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

    // Check if there's enough space below to show the dropdown
    const dropdownRect = dropdown.getBoundingClientRect();
    const dropdownHeight = dropdown.scrollHeight || 300; // Estimated height if not visible yet
    const spaceBelow = window.innerHeight - dropdownRect.top;
    const spaceAbove = dropdownRect.top;

    // If not enough space below but more space above, open upwards
    if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
      dropdown.classList.add('dropup');
    } else {
      dropdown.classList.remove('dropup');
    }
  } else {
    row?.classList.remove('dropdown-active');
    dropdown.classList.remove('dropup');
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
  const previousCategoryId = transaction?.category_id;
  const previousCategory = getCategoryById(previousCategoryId);
  const newCategory = getCategoryById(categoryId);

  // === OPTIMISTIC UPDATE: Update UI immediately with loading spinner ===

  // Update local data immediately
  if (transaction) {
    transaction.category_id = categoryId;
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
      transaction.category_id = previousCategoryId;
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

  // Get selected categories
  const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all]):not([data-category-null]):checked');
  currentFilters.categories = Array.from(categoryCheckboxes).map(cb => cb.value);

  // Check if "Sin categoría" is selected
  const noCategoryCheckbox = document.querySelector('#filter-category-options input[data-category-null]');
  currentFilters.includeNoCategory = noCategoryCheckbox ? noCategoryCheckbox.checked : false;

  // Get amount filter type
  const amountRadio = document.querySelector('input[name="amount-filter"]:checked');
  currentFilters.amountType = amountRadio ? amountRadio.value : 'all';

  // Get amount range if custom
  if (currentFilters.amountType === 'custom') {
    currentFilters.amountMin = document.getElementById('filter-amount-min').value;
    currentFilters.amountMax = document.getElementById('filter-amount-max').value;
  } else {
    currentFilters.amountMin = '';
    currentFilters.amountMax = '';
  }

  // Get selected files
  const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all]):checked');
  currentFilters.files = Array.from(fileCheckboxes).map(cb => cb.value);

  // Update active filters pills
  updateActiveFiltersPills();

  // Reload from page 1 with new filters
  loadAllTransactions(1, currentLimit);
}

// Sort transactions by column
function sortTransactions(column) {
  // Toggle sort order if clicking same column
  if (currentSortColumn === column) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = column;
    currentSortOrder = 'desc'; // Default to descending for new column
  }

  // Sort the transactions array
  allTransactions.sort((a, b) => {
    let valueA, valueB;

    switch(column) {
      case 'fecha':
        valueA = new Date(a.transaction_date);
        valueB = new Date(b.transaction_date);
        break;

      case 'monto':
        valueA = a.amount;
        valueB = b.amount;
        break;

      case 'descripcion':
        valueA = (a.description || '').toLowerCase();
        valueB = (b.description || '').toLowerCase();
        break;

      case 'categoria':
        // Get category name from category_id
        const catA = getCategoryById(a.category_id);
        const catB = getCategoryById(b.category_id);
        valueA = (catA ? catA.name : 'Sin categoría').toLowerCase();
        valueB = (catB ? catB.name : 'Sin categoría').toLowerCase();
        break;

      case 'banco':
        // Get bank name from connection or file
        valueA = (a.bank_name || a.files?.original_name || 'Sin banco').toLowerCase();
        valueB = (b.bank_name || b.files?.original_name || 'Sin banco').toLowerCase();
        break;

      default:
        return 0;
    }

    // Handle null/undefined values
    if (valueA == null && valueB == null) return 0;
    if (valueA == null) return 1;
    if (valueB == null) return -1;

    // Compare values
    let comparison = 0;
    if (valueA > valueB) {
      comparison = 1;
    } else if (valueA < valueB) {
      comparison = -1;
    }

    // Apply sort order
    return currentSortOrder === 'asc' ? comparison : -comparison;
  });

  // Re-render table with sorted data
  displayTransactions(allTransactions);

  // Update sort icons
  updateSortIcons();
}

// Update sort icons to show current sort state
function updateSortIcons() {
  // Reset all icons
  const icons = ['fecha', 'descripcion', 'monto', 'categoria', 'banco'];
  icons.forEach(col => {
    const icon = document.getElementById(`sort-icon-${col}`);
    if (icon) {
      if (col === currentSortColumn) {
        icon.textContent = currentSortOrder === 'asc' ? '↑' : '↓';
        icon.style.opacity = '1';
      } else {
        icon.textContent = '⇅';
        icon.style.opacity = '0.4';
      }
    }
  });
}

function clearFilters() {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-description').value = '';
  const includeDeletedCheckbox = document.getElementById('filter-include-deleted');
  if (includeDeletedCheckbox) includeDeletedCheckbox.checked = false;

  // Clear category checkboxes
  const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]');
  categoryCheckboxes.forEach(cb => cb.checked = false);
  // Check "All categories"
  const allCategoriesCheckbox = document.querySelector('#filter-category-options input[data-category-all]');
  if (allCategoriesCheckbox) allCategoriesCheckbox.checked = true;

  // Reset amount filter
  const allAmountRadio = document.querySelector('input[name="amount-filter"][value="all"]');
  if (allAmountRadio) allAmountRadio.checked = true;
  document.getElementById('filter-amount-min').value = '';
  document.getElementById('filter-amount-max').value = '';
  const amountRange = document.getElementById('filter-amount-range');
  if (amountRange) amountRange.style.display = 'none';

  // Reset file filter checkboxes
  const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]');
  fileCheckboxes.forEach(cb => cb.checked = false);
  const allFilesCheckbox = document.querySelector('#filter-file-options input[data-file-all]');
  if (allFilesCheckbox) allFilesCheckbox.checked = true;

  // Reset dropdown labels
  document.getElementById('filter-category-label').textContent = 'Categoría';
  document.getElementById('filter-amount-label').textContent = 'Monto';
  document.getElementById('filter-file-label').textContent = 'Archivo';

  // Clear filter state
  currentFilters.dateFrom = '';
  currentFilters.dateTo = '';
  currentFilters.description = '';
  currentFilters.includeDeleted = false;
  currentFilters.categories = [];
  currentFilters.includeNoCategory = false;
  currentFilters.amountType = 'all';
  currentFilters.amountMin = '';
  currentFilters.amountMax = '';
  currentFilters.files = [];

  // Hide active filters pills
  const activeFiltersDiv = document.getElementById('active-filters');
  if (activeFiltersDiv) activeFiltersDiv.style.display = 'none';

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

  // Initialize advanced filters
  initializeAdvancedFilters();
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
    const headers = await getAuthHeaders();

    const response = await fetch(`/api/transactions/${transactionId}`, { headers });
    const result = await response.json();

    if (result.success) {
      const t = result.transaction;
      const isPositive = t.amount > 0;

      // Get category info
      const category = getCategoryById(t.category_id);
      const categoryName = category.name;
      const categoryColor = category.color;

      // Determine source
      let sourceInfo = '';
      if (t.connection_id) {
        // From bank connection
        sourceInfo = `
          <div class="detail-info-item">
            <div class="detail-info-label">Origen</div>
            <div class="detail-info-value">
              <span class="source-badge connection-source">
                Conexión bancaria${t.bank_name ? ` - ${t.bank_name}` : ''}
              </span>
            </div>
          </div>
        `;
      } else if (t.file_id) {
        // From file upload
        sourceInfo = `
          <div class="detail-info-item">
            <div class="detail-info-label">Origen</div>
            <div class="detail-info-value">
              <span class="source-badge file-source" onclick="showFileDetail('${t.file_id}')">
                📄 ${t.files?.original_name || 'Archivo importado'}
              </span>
            </div>
          </div>
        `;
      }

      sidebarContent.innerHTML = `
        <div class="detail-section">
          <div class="detail-title">MONTO</div>
          <div class="detail-value ${isPositive ? 'positive' : 'negative'}">
            ${isPositive ? '+' : ''}$${Math.abs(t.amount).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
          <div class="detail-subtitle">${isPositive ? 'Crédito' : 'Débito'}</div>
        </div>

        <div class="detail-info-grid">
          <div class="detail-info-item editable-field">
            <div class="detail-info-label">FECHA <span style="font-size: 10px; color: #6B7280; font-weight: 400;">(DD-MM-AAAA)</span></div>
            <div class="detail-info-value" id="date-display" onclick="editTransactionDate('${t.id}', '${t.transaction_date}', this)">
              ${formatDate(t.transaction_date, {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
              <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
          </div>

          <div class="detail-info-item editable-field">
            <div class="detail-info-label">DESCRIPCIÓN</div>
            <div class="detail-info-value" id="description-display" onclick="editTransactionField('${t.id}', 'description', this)">
              ${t.description || '-'}
              <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
          </div>

          <div class="detail-info-item editable-field">
            <div class="detail-info-label">CATEGORÍA</div>
            <div class="detail-info-value category-value" id="category-display" onclick="editTransactionCategory('${t.id}', '${t.category || ''}')">
              <span class="category-dot" style="background: ${categoryColor}"></span>
              ${categoryName}
              <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </div>
          </div>

          <!-- Linked Service Section -->
          <div class="detail-info-item" id="linked-service-section">
            <div class="detail-info-label">SERVICIO ASOCIADO</div>
            <div class="detail-info-value" id="linked-service-display">
              <div class="loading-small-inline">Verificando...</div>
            </div>
          </div>

          ${sourceInfo}

          ${t.currency ? `
            <div class="detail-info-item">
              <div class="detail-info-label">MONEDA</div>
              <div class="detail-info-value">${t.currency}</div>
            </div>
          ` : ''}

          ${t.merchant ? `
            <div class="detail-info-item">
              <div class="detail-info-label">COMERCIO</div>
              <div class="detail-info-value">${t.merchant}</div>
            </div>
          ` : ''}

          ${t.razon_social ? `
            <div class="detail-info-item">
              <div class="detail-info-label">RAZÓN SOCIAL</div>
              <div class="detail-info-value">${t.razon_social}</div>
            </div>
          ` : ''}

          ${t.cuit ? `
            <div class="detail-info-item">
              <div class="detail-info-label">CUIT</div>
              <div class="detail-info-value cuit-value">${t.cuit}</div>
            </div>
          ` : ''}

          ${t.provider_transaction_id ? `
            <div class="detail-info-item">
              <div class="detail-info-label">ID DE PROVEEDOR</div>
              <div class="detail-info-value transaction-id-value">${t.provider_transaction_id}</div>
            </div>
          ` : ''}

        </div>

        ${t.transaction_splits && t.transaction_splits.length > 0 ? `
          <div class="detail-section splits-section">
            <div class="detail-section-header">
              <h4 class="detail-title">SUBDIVISIONES</h4>
              <button class="btn-icon" onclick="createSplits('${t.id}')" title="Editar subdivisiones">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
            <div class="splits-list">
              ${t.transaction_splits.sort((a, b) => a.split_order - b.split_order).map(split => {
                const splitCategory = split.categories || { name: 'Sin categoría', color: '#6B7280' };
                return `
                  <div class="split-item">
                    <div class="split-category">
                      <span class="category-dot" style="background-color: ${splitCategory.color}"></span>
                      <span class="category-name">${splitCategory.name}</span>
                    </div>
                    <div class="split-description">${split.description || '-'}</div>
                    <div class="split-amount">$${split.amount.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="splits-total">
              <span>Total subdivisiones:</span>
              <strong>$${t.transaction_splits.reduce((sum, s) => sum + s.amount, 0).toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong>
            </div>
            <button class="btn-text-danger" onclick="removeSplits('${t.id}')">
              Eliminar subdivisiones
            </button>
          </div>
        ` : `
          <div class="detail-section">
            <button class="btn-secondary" onclick="createSplits('${t.id}')" style="width: 100%;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"></path>
              </svg>
              Subdividir transacción
            </button>
          </div>
        `}

        <div class="notes-section">
          <div class="detail-title">NOTAS</div>
          <textarea
            id="transaction-notes"
            class="notes-textarea"
            placeholder="Agregar nota sobre esta transacción..."
          >${t.notes || ''}</textarea>
          <button class="save-note-btn" onclick="saveTransactionNote('${t.id}')">
            Guardar Nota
          </button>
        </div>

        <div class="transaction-uuid">
          <div class="detail-info-label">ID DE TRANSACCIÓN</div>
          <div class="uuid-value">${t.id}</div>
        </div>
      `;

      // Load linked service after rendering the detail
      loadLinkedService(t.id);
    } else {
      sidebarContent.innerHTML = '<div class="detail-error">Error al cargar la transacción</div>';
    }
  } catch (error) {
    console.error('Error loading transaction:', error);
    sidebarContent.innerHTML = '<div class="detail-error">Error al cargar la transacción</div>';
  }
}

// Load and display linked service for a transaction
async function loadLinkedService(transactionId) {
  const displayEl = document.getElementById('linked-service-display');
  if (!displayEl) return;

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/transactions/${transactionId}/service`, {
      headers
    });

    const result = await response.json();

    if (result.success && result.service) {
      // Transaction is linked to a service
      const service = result.service;
      const payment = result.payment;
      const matchedByAuto = payment.matched_by === 'auto';
      const confidence = payment.match_confidence || 0;

      displayEl.innerHTML = `
        <div class="linked-service-info">
          <div class="linked-service-name">
            ${escapeHtml(service.name)}
            <span class="payment-link-badge">
              🔗 ${matchedByAuto ? `Auto (${confidence}%)` : 'Manual'}
            </span>
          </div>
          <div class="linked-service-meta">
            ${service.frequency ? `<span class="service-frequency">${formatFrequency(service.frequency)}</span>` : ''}
            ${service.category ? `<span class="service-category">${escapeHtml(service.category)}</span>` : ''}
          </div>
          <div class="linked-service-actions">
            <button class="btn-link-small" onclick="openServiceDetailFromTransaction('${service.id}')" title="Ver servicio">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              Ver servicio
            </button>
            <button class="btn-link-small danger" onclick="unlinkServiceFromTransaction('${payment.id}', '${transactionId}')" title="Desvincular">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Desvincular
            </button>
          </div>
        </div>
      `;
    } else {
      // No service linked - show "Asociar a servicio" button
      displayEl.innerHTML = `
        <div class="no-service-linked">
          <span class="no-service-text">Sin servicio asociado</span>
          <button class="btn-link-small" onclick="openAssociateServiceModal('${transactionId}')" title="Asociar a un servicio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Asociar a servicio
          </button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading linked service:', error);
    displayEl.innerHTML = `
      <span class="error-text">Error al cargar servicio</span>
    `;
  }
}

// Helper function to format frequency
function formatFrequency(freq) {
  const freqMap = {
    'weekly': 'Semanal',
    'biweekly': 'Quincenal',
    'monthly': 'Mensual',
    'bimonthly': 'Bimestral',
    'quarterly': 'Trimestral',
    'semiannual': 'Semestral',
    'annual': 'Anual'
  };
  return freqMap[freq] || freq;
}

// Open service detail from transaction
function openServiceDetailFromTransaction(serviceId) {
  // Navigate to services section and open the detail
  // This assumes services.js has openServiceDetail function available globally
  if (typeof openServiceDetail === 'function') {
    openServiceDetail(serviceId);
  } else {
    // Fallback: redirect to services page with hash
    window.location.href = `/dashboard#services/${serviceId}`;
  }
}

// Unlink service from transaction
async function unlinkServiceFromTransaction(paymentId, transactionId) {
  if (!confirm('¿Estás seguro de que quieres desvincular esta transacción del servicio?')) {
    return;
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/services/payments/${paymentId}/unlink`, {
      method: 'DELETE',
      headers
    });

    const result = await response.json();

    if (result.success) {
      showNotification('Transacción desvinculada correctamente', 'success');
      // Reload the linked service section
      loadLinkedService(transactionId);
    } else {
      showNotification('Error al desvincular: ' + (result.error || 'Error desconocido'), 'error');
    }
  } catch (error) {
    console.error('Error unlinking service:', error);
    showNotification('Error al desvincular la transacción', 'error');
  }
}

// Open modal to associate transaction with a service
async function openAssociateServiceModal(transactionId) {
  // Get the transaction data
  const transaction = allTransactions.find(t => t.id === transactionId);
  if (!transaction) {
    showNotification('No se encontró la transacción', 'error');
    return;
  }

  // Fetch potential matches
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/transactions/${transactionId}/matches`, {
    headers
  });

  const result = await response.json();
  const matches = result.success ? result.matches : [];

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container associate-service-modal">
      <div class="modal-header">
        <h3>Asociar transacción a servicio</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Transaction Summary Card -->
        <div class="transaction-summary-card">
          <div class="tx-card-row">
            <div class="tx-card-col">
              <span class="tx-card-label">Descripción</span>
              <span class="tx-card-value tx-card-value-primary">${escapeHtml(transaction.description || '-')}</span>
            </div>
            <div class="tx-card-col">
              <span class="tx-card-label">Monto</span>
              <span class="tx-card-value tx-card-value-amount">${formatCurrency(Math.abs(transaction.amount), transaction.currency)}</span>
            </div>
            <div class="tx-card-col">
              <span class="tx-card-label">Fecha</span>
              <span class="tx-card-value">${formatDate(transaction.transaction_date)}</span>
            </div>
          </div>
        </div>

        ${matches.length > 0 ? `
          <div class="services-section">
            <div class="services-section-header">
              <h4 class="services-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                Sugeridos
              </h4>
              <span class="services-section-count">${matches.length}</span>
            </div>
            <div class="services-grid">
              ${matches.map(match => `
                <div class="service-card service-card-suggested" onclick="linkTransactionToServiceFromTx('${transactionId}', '${match.id}', ${match.confidence})">
                  <div class="service-card-header">
                    <div class="service-card-name">${escapeHtml(match.name)}</div>
                    <span class="confidence-badge ${match.confidence >= 75 ? 'high' : match.confidence >= 50 ? 'medium' : 'low'}">
                      ${match.confidence}%
                    </span>
                  </div>
                  <div class="service-card-meta">
                    ${match.frequency ? `<span class="service-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatFrequency(match.frequency)}</span>` : ''}
                    ${match.estimated_amount ? `<span class="service-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>~${formatCurrency(match.estimated_amount, match.currency)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="services-section">
          <div class="services-section-header">
            <h4 class="services-section-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              Todos los servicios
            </h4>
            <button class="btn-create-service" onclick="openCreateServiceFromTransaction('${transactionId}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Crear nuevo
            </button>
          </div>
          <div id="all-services-list" class="services-grid">
            <div class="loading-services">
              <div class="spinner-small"></div>
              <span>Cargando servicios...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Load all services
  loadAllServicesForLinking(transactionId);
}

// Load all services for linking
async function loadAllServicesForLinking(transactionId) {
  const listEl = document.getElementById('all-services-list');
  if (!listEl) return;

  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/services', {
      headers
    });

    const result = await response.json();

    if (result.success && result.services.length > 0) {
      listEl.innerHTML = result.services.map(service => `
        <div class="service-card" onclick="linkTransactionToServiceFromTx('${transactionId}', '${service.id}', 100)">
          <div class="service-card-header">
            <div class="service-card-name">${escapeHtml(service.name)}</div>
          </div>
          <div class="service-card-meta">
            ${service.frequency ? `<span class="service-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${formatFrequency(service.frequency)}</span>` : ''}
            ${service.estimated_amount ? `<span class="service-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>~${formatCurrency(service.estimated_amount, service.currency)}</span>` : ''}
          </div>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = `
        <div class="empty-state-services">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <p>No hay servicios creados</p>
          <button class="btn-primary btn-sm" onclick="openCreateServiceFromTransaction('${transactionId}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Crear primer servicio
          </button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading services:', error);
    listEl.innerHTML = `
      <div class="empty-state-services error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <p>Error al cargar servicios</p>
        <button class="btn-secondary btn-sm" onclick="loadAllServicesForLinking('${transactionId}')">Reintentar</button>
      </div>
    `;
  }
}

// Link transaction to service from transaction detail
async function linkTransactionToServiceFromTx(transactionId, serviceId, confidence) {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/services/${serviceId}/payments`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        matched_by: 'manual',
        match_confidence: confidence || 100
      })
    });

    const result = await response.json();

    if (result.success) {
      showNotification('Transacción vinculada correctamente', 'success');

      // Close modal
      const modal = document.querySelector('.modal-overlay');
      if (modal) modal.remove();

      // Reload linked service section
      loadLinkedService(transactionId);
    } else {
      showNotification('Error al vincular: ' + (result.error || 'Error desconocido'), 'error');
    }
  } catch (error) {
    console.error('Error linking transaction:', error);
    showNotification('Error al vincular la transacción', 'error');
  }
}

// Global variable to store pending transaction to link after service creation
window.pendingTransactionToLink = null;

// Open create service modal from transaction association
function openCreateServiceFromTransaction(transactionId) {
  // Store the transaction ID to link after service creation
  window.pendingTransactionToLink = transactionId;

  // Close the association modal
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();

  // Open the create service modal
  if (typeof openAddServiceModal === 'function') {
    openAddServiceModal();
  } else {
    // If services.js is not loaded, navigate to services section
    window.location.hash = '#servicios';
    setTimeout(() => {
      if (typeof openAddServiceModal === 'function') {
        openAddServiceModal();
      }
    }, 500);
  }
}

// Edit transaction description
async function editTransactionField(transactionId, fieldName, element) {
  const currentValue = element.textContent.trim().replace(/\s+/g, ' ');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue === '-' ? '' : currentValue;
  input.className = 'edit-input';

  const originalHTML = element.innerHTML;
  element.innerHTML = '';
  element.appendChild(input);
  input.focus();
  input.select();

  const saveEdit = async () => {
    const newValue = input.value.trim();
    if (newValue === currentValue || (newValue === '' && currentValue === '-')) {
      element.innerHTML = originalHTML;
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [fieldName]: newValue })
      });

      const result = await response.json();
      if (result.success) {
        element.textContent = newValue || '-';
        // Update the transaction in the list
        const transaction = allTransactions.find(t => t.id === transactionId);
        if (transaction) {
          transaction[fieldName] = newValue;
          displayTransactions(allTransactions);
        }
      } else {
        element.innerHTML = originalHTML;
        alert('Error al actualizar: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      element.innerHTML = originalHTML;
      console.error('Error updating field:', error);
      alert('Error al actualizar el campo');
    }
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveEdit();
    } else if (e.key === 'Escape') {
      element.innerHTML = originalHTML;
    }
  });
}

// Edit transaction date
async function editTransactionDate(transactionId, currentDate, element) {
  // Get current date in YYYY-MM-DD format (database format) and convert to DD-MM-YYYY for display
  const [datePart] = currentDate.split('T');
  const [year, month, day] = datePart.split('-');
  const dateValueDB = `${year}-${month}-${day}`; // Database format YYYY-MM-DD
  const dateValueDisplay = `${day}-${month}-${year}`; // Display format DD-MM-YYYY

  // Create simple text input
  const input = document.createElement('input');
  input.type = 'text';
  input.value = dateValueDisplay; // Show in DD-MM-YYYY format
  input.className = 'edit-input';
  input.placeholder = 'DD-MM-AAAA';
  input.maxLength = 10;
  input.style.cssText = 'width: 100%; padding: 8px; border: 2px solid #3B82F6; border-radius: 4px;';

  const originalHTML = element.innerHTML;
  element.innerHTML = '';
  element.appendChild(input);
  input.focus();
  input.select(); // Select all text for easy editing

  // Auto-format as user types: DD-MM-YYYY with validation
  input.addEventListener('input', (e) => {
    let value = e.target.value;

    // Remove all non-digits
    let numbers = value.replace(/\D/g, '');

    // Limit to 8 digits (DDMMYYYY)
    if (numbers.length > 8) {
      numbers = numbers.substring(0, 8);
    }

    let formatted = '';

    // Add day (DD) - validate 01-31
    if (numbers.length >= 1) {
      let day = numbers.substring(0, 2);
      if (numbers.length >= 2) {
        let dayNum = parseInt(day);
        if (dayNum > 31) day = '31';
        if (dayNum < 1 && numbers.length === 2) day = '01';
      }
      formatted = day;
    }

    // Add first dash after day
    if (numbers.length >= 3) {
      formatted += '-';

      // Add month (MM) - validate 01-12
      let month = numbers.substring(2, 4);
      if (numbers.length >= 4) {
        let monthNum = parseInt(month);
        if (monthNum > 12) month = '12';
        if (monthNum < 1 && numbers.length === 4) month = '01';
      }
      formatted += month;
    }

    // Add second dash after month
    if (numbers.length >= 5) {
      formatted += '-';

      // Add year (YYYY) - validate range 1900-2100
      let year = numbers.substring(4, 8);
      if (numbers.length >= 8) {
        let yearNum = parseInt(year);
        if (yearNum > 2100) year = '2100';
        if (yearNum < 1900) year = '1900';
      }
      formatted += year;
    }

    e.target.value = formatted;
  });

  const saveEdit = async () => {
    const inputValue = input.value.trim();

    // Validate format DD-MM-YYYY
    const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = inputValue.match(datePattern);

    if (!match) {
      alert('Formato de fecha inválido. Use DD-MM-AAAA');
      element.innerHTML = originalHTML;
      return;
    }

    const [, d, m, y] = match;

    // Validate it's a real date
    const testDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (testDate.getFullYear() !== parseInt(y) ||
        testDate.getMonth() !== parseInt(m) - 1 ||
        testDate.getDate() !== parseInt(d)) {
      alert('Fecha inválida');
      element.innerHTML = originalHTML;
      return;
    }

    // Convert DD-MM-YYYY to YYYY-MM-DD for database
    const newDateValueDB = `${y}-${m}-${d}`;

    // If date hasn't changed, restore original
    if (newDateValueDB === dateValueDB) {
      element.innerHTML = originalHTML;
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transaction_date: newDateValueDB }) // Send in YYYY-MM-DD format
      });

      const result = await response.json();
      if (result.success) {
        // Format the new date for display (formatDate expects YYYY-MM-DD)
        const formattedDate = formatDate(newDateValueDB, {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        // Update display
        element.innerHTML = `
          ${formattedDate}
          <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        `;

        // Update the transaction in the list (store in YYYY-MM-DD format)
        const transaction = allTransactions.find(t => t.id === transactionId);
        if (transaction) {
          transaction.transaction_date = newDateValueDB;
          displayTransactions(allTransactions);
        }

        showNotification('Fecha actualizada correctamente', 'success');
      } else {
        element.innerHTML = originalHTML;
        alert('Error al actualizar: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      element.innerHTML = originalHTML;
      console.error('Error updating date:', error);
      alert('Error al actualizar la fecha');
    }
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      element.innerHTML = originalHTML;
    }
  });
}

// Edit transaction category
async function editTransactionCategory(transactionId, currentCategoryId) {
  const categoryDisplay = document.getElementById('category-display');
  if (!categoryDisplay) return;

  // Sort categories alphabetically by name
  const sortedCategories = [...userCategories].sort((a, b) => {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'category-edit-dropdown';
  dropdown.innerHTML = `
    <div class="category-edit-search">
      <input type="text" placeholder="Buscar categoría..." class="category-search-input" />
    </div>
    <div class="category-edit-options">
      ${sortedCategories.map(cat => `
        <div class="category-edit-option ${cat.id === currentCategoryId ? 'selected' : ''}" data-category-id="${cat.id}">
          <span class="category-dot" style="background: ${cat.color}"></span>
          <span>${cat.name}</span>
        </div>
      `).join('')}
    </div>
  `;

  categoryDisplay.innerHTML = '';
  categoryDisplay.appendChild(dropdown);

  const searchInput = dropdown.querySelector('.category-search-input');
  const options = dropdown.querySelectorAll('.category-edit-option');

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    options.forEach(option => {
      const text = option.textContent.toLowerCase();
      option.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
  });

  // Category selection
  options.forEach(option => {
    option.addEventListener('click', async () => {
      const newCategoryId = option.getAttribute('data-category-id');
      if (newCategoryId === currentCategoryId) {
        showTransactionDetail(transactionId);
        return;
      }

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/transactions/${transactionId}/category`, {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ category: newCategoryId })
        });

        const result = await response.json();
        if (result.success) {
          // Update the transaction in the list
          const transaction = allTransactions.find(t => t.id === transactionId);
          if (transaction) {
            transaction.category_id = newCategoryId;
            displayTransactions(allTransactions);
          }
          // Reload detail view
          showTransactionDetail(transactionId);
        } else {
          alert('Error al actualizar categoría: ' + (result.error || 'Error desconocido'));
          showTransactionDetail(transactionId);
        }
      } catch (error) {
        console.error('Error updating category:', error);
        alert('Error al actualizar la categoría');
        showTransactionDetail(transactionId);
      }
    });
  });

  // Close on click outside
  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target)) {
      document.removeEventListener('click', closeDropdown);
      showTransactionDetail(transactionId);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 100);
}

// Detect bank from filename
function detectBankFromFilename(filename) {
  const banks = {
    'santander': { name: 'Santander Rio', color: '#EC0000' },
    'galicia': { name: 'Banco Galicia', color: '#FF6600' },
    'bbva': { name: 'BBVA', color: '#004481' },
    'macro': { name: 'Banco Macro', color: '#0066CC' },
    'nacion': { name: 'Banco Nación', color: '#0033A0' },
    'patagonia': { name: 'Banco Patagonia', color: '#005EB8' },
    'icbc': { name: 'ICBC', color: '#C8102E' },
    'hsbc': { name: 'HSBC', color: '#DB0011' },
    'mercadopago': { name: 'Mercado Pago', color: '#009EE3' },
    'brubank': { name: 'Brubank', color: '#7B61FF' },
    'uala': { name: 'Ualá', color: '#FF4C4C' },
    'prex': { name: 'Prex', color: '#00D632' },
    'naranja': { name: 'Naranja X', color: '#FF6600' },
    'personal': { name: 'Personal Pay', color: '#00A8E1' },
  };

  const lowerFilename = filename.toLowerCase();
  for (const [key, value] of Object.entries(banks)) {
    if (lowerFilename.includes(key)) {
      return value;
    }
  }

  return null;
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
      const detectedBank = detectBankFromFilename(file.original_name);

      sidebarContent.innerHTML = `
        <div class="file-detail-container">
          <!-- Main Info Card -->
          <div class="file-main-card">
            <div class="file-type-label">${file.document_type === 'vep' ? 'VEP' : 'EXTRACTO BANCARIO'}</div>

            ${detectedBank ? `
              <div class="file-bank-badge" style="background: ${detectedBank.color}15; color: ${detectedBank.color}; border: 2px solid ${detectedBank.color}30;">
                🏦 ${detectedBank.name}
              </div>
            ` : ''}

            ${file.document_type !== 'vep' ? `
              <div class="file-transaction-count">
                <div class="count-number">${transactionCount}</div>
                <div class="count-label">Transacciones Extraídas</div>
              </div>
            ` : ''}

            <div class="file-status-indicator ${file.processing_status}">
              ${file.processing_status === 'completed' ? '✓ Completado' :
                file.processing_status === 'pending' ? '⏱ Pendiente' :
                file.processing_status === 'processing' ? '⚙️ Procesando' :
                file.processing_status === 'failed' ? '✗ Error' : file.processing_status}
            </div>
          </div>

          <!-- File Name -->
          <div class="file-name-section">
            <div class="file-name-label">ARCHIVO</div>
            <div class="file-name-text">${file.original_name}</div>
          </div>

          <!-- Separator -->
          <div class="detail-separator"></div>

          <!-- File Details -->
          <div class="file-details-grid">
            <div class="file-detail-row">
              <span class="detail-label">FECHA DE CARGA</span>
              <span class="detail-value">${new Date(file.created_at).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</span>
            </div>

            <div class="file-detail-row">
              <span class="detail-label">TAMAÑO DEL ARCHIVO</span>
              <span class="detail-value">${formatFileSize(file.file_size)}</span>
            </div>
          </div>

          <!-- Separator -->
          <div class="detail-separator"></div>

          <!-- Actions -->
          <div class="file-actions-list">
            ${file.storage_path ? `
              <button class="file-action-button primary" onclick="downloadFile('${file.id}', '${file.original_name}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Descargar Archivo
              </button>
            ` : ''}

            ${file.document_type !== 'vep' && transactionCount > 0 ? `
              <button class="file-action-button secondary" onclick="viewFileTransactions('${file.id}', '${escapeHtml(file.original_name)}')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                Ver Transacciones (${transactionCount})
              </button>
            ` : ''}

            <button class="file-action-button danger" onclick="confirmDeleteFile('${file.id}')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Eliminar Archivo
            </button>
          </div>
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

function viewFileTransactions(fileId, fileName) {
  closeRightSidebar();
  showSection('transacciones');

  // Wait for section to be visible, then apply file filter
  setTimeout(() => {
    // Uncheck "all files" checkbox
    const allFilesCheckbox = document.querySelector('#filter-file-options input[data-file-all]');
    if (allFilesCheckbox) {
      allFilesCheckbox.checked = false;
    }

    // Uncheck all file checkboxes first
    const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all])');
    fileCheckboxes.forEach(cb => cb.checked = false);

    // Find and check the specific file checkbox
    fileCheckboxes.forEach(cb => {
      if (cb.value === fileId) {
        cb.checked = true;
      }
    });

    // Update the file filter label
    updateFileLabel();

    // Apply the filters
    filterTransactions();
  }, 300);
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
    const headers = await getAuthHeaders();
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
  const activeConnectionsSection = document.getElementById('active-connections-section');
  const activeConnectionsContainer = document.getElementById('active-connections-container');
  const availableConnectionsContainer = document.getElementById('available-connections-container');

  // Separate active and inactive connections
  const activeConnections = connections.filter(conn => conn.status === 'active');
  const hasActiveConnections = activeConnections.length > 0;

  // Show/hide active connections section
  if (activeConnectionsSection) {
    activeConnectionsSection.style.display = hasActiveConnections ? 'block' : 'none';
  }

  // Process each provider
  const providers = ['mercadopago', 'mercury', 'eubanks'];

  providers.forEach(provider => {
    const connection = connections.find(conn => conn.provider === provider);
    const card = document.getElementById(`${provider}-card`);

    if (!card) return;

    const isConnected = connection && connection.status === 'active';

    // Move card to appropriate container
    if (isConnected && activeConnectionsContainer) {
      activeConnectionsContainer.appendChild(card);
    } else if (availableConnectionsContainer && card.parentElement !== availableConnectionsContainer) {
      availableConnectionsContainer.appendChild(card);
    }

    // Update card UI
    updateConnectionCard(provider, connection);
  });
}

// Helper function to update individual connection card
function updateConnectionCard(provider, connection) {
  const statusEl = document.getElementById(`${provider}-status`);
  const btnEl = document.getElementById(`${provider}-btn`);
  const cardEl = document.getElementById(`${provider}-card`);
  const userInfoEl = document.getElementById(`${provider}-user-info`);
  const emailEl = document.getElementById(`${provider}-email`);
  const lastSyncEl = document.getElementById(`${provider}-last-sync`);
  const avatarEl = document.getElementById(`${provider}-avatar`);

  const syncBtn = document.getElementById(`${provider}-sync-btn`);
  const disconnectBtn = document.getElementById(`${provider}-disconnect-btn`);

  const isConnected = connection && connection.status === 'active';

  if (isConnected) {
    // Connected state
    if (statusEl) {
      statusEl.textContent = 'Conectado';
      statusEl.className = 'connection-status connected';
      statusEl.style.display = 'none'; // Hide status when showing user info
    }

    // Show user info
    if (userInfoEl) {
      userInfoEl.style.display = 'flex';

      // Set avatar
      if (avatarEl && connection.metadata) {
        const thumbnail = connection.metadata.thumbnail || connection.metadata.logo;
        if (thumbnail) {
          avatarEl.innerHTML = `<img src="${thumbnail}" alt="Avatar" />`;
        } else {
          // Fallback to initials
          const email = connection.metadata.email || '';
          const initial = email.charAt(0).toUpperCase() || '?';
          avatarEl.innerHTML = `<div class="avatar-initials">${initial}</div>`;
        }
      }

      // Set email
      if (emailEl && connection.metadata) {
        const displayName = connection.metadata.email || connection.metadata.nickname || connection.metadata.bank_name || 'Usuario conectado';
        emailEl.textContent = displayName;
      }

      // Set last sync
      if (lastSyncEl && connection.last_synced_at) {
        const lastSync = new Date(connection.last_synced_at);
        const now = new Date();
        const diffMinutes = Math.floor((now - lastSync) / 1000 / 60);

        let syncText;
        if (diffMinutes < 1) {
          syncText = 'Sincronizado hace un momento';
        } else if (diffMinutes < 60) {
          syncText = `Sincronizado hace ${diffMinutes} min`;
        } else if (diffMinutes < 1440) {
          const hours = Math.floor(diffMinutes / 60);
          syncText = `Sincronizado hace ${hours}h`;
        } else {
          const days = Math.floor(diffMinutes / 1440);
          syncText = `Sincronizado hace ${days}d`;
        }
        lastSyncEl.textContent = syncText;
      } else if (lastSyncEl) {
        lastSyncEl.textContent = 'Nunca sincronizado';
      }
    }

    // Hide connect button, show sync and disconnect buttons
    if (btnEl) btnEl.style.display = 'none';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';

    if (cardEl) cardEl.classList.add('connected');

  } else {
    // Disconnected state
    if (statusEl) {
      statusEl.textContent = 'No conectado';
      statusEl.className = 'connection-status disconnected';
      statusEl.style.display = 'block';
    }

    // Hide user info
    if (userInfoEl) {
      userInfoEl.style.display = 'none';
    }

    // Show connect button, hide sync and disconnect buttons
    if (btnEl) btnEl.style.display = 'inline-flex';
    if (syncBtn) syncBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'none';

    if (cardEl) cardEl.classList.remove('connected');
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

  // Load connections when clicking on Conexiones menu item
  const conexionesMenuItem = document.querySelector('[data-section="conexiones"]');
  if (conexionesMenuItem) {
    conexionesMenuItem.addEventListener('click', () => {
      setTimeout(() => {
        loadConnections();
      }, 100);
    });
  }

  // Load email token when clicking on Configuración menu item
  const configuracionMenuItem = document.querySelector('[data-section="ajustes"]');
  if (configuracionMenuItem) {
    configuracionMenuItem.addEventListener('click', () => {
      setTimeout(() => {
        loadEmailUploadToken();
      }, 100);
    });
  }

  // Load connections on initial page load if on conexiones section
  if (hash.includes('conexiones')) {
    setTimeout(() => {
      loadConnections();
    }, 100);
  }

  // Load email token on initial page load if on ajustes section
  if (hash.includes('ajustes')) {
    setTimeout(() => {
      loadEmailUploadToken();
    }, 100);
  }
});
// ========================================
// ADVANCED FILTERS HELPERS
// ========================================

// Initialize advanced filters (categories and amount dropdowns)
function initializeAdvancedFilters() {
  // Category dropdown toggle
  const categoryBtn = document.getElementById('filter-category-btn');
  const categoryMenu = document.getElementById('filter-category-menu');

  if (categoryBtn && categoryMenu) {
    categoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = categoryMenu.style.display === 'block';
      closeAllFilterDropdowns();
      if (!isOpen) {
        categoryMenu.style.display = 'block';
        categoryBtn.classList.add('active');
      }
    });
  }

  // Amount dropdown toggle
  const amountBtn = document.getElementById('filter-amount-btn');
  const amountMenu = document.getElementById('filter-amount-menu');

  if (amountBtn && amountMenu) {
    amountBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = amountMenu.style.display === 'block';
      closeAllFilterDropdowns();
      if (!isOpen) {
        amountMenu.style.display = 'block';
        amountBtn.classList.add('active');
      }
    });
  }

  // File dropdown toggle
  const fileBtn = document.getElementById('filter-file-btn');
  const fileMenu = document.getElementById('filter-file-menu');

  if (fileBtn && fileMenu) {
    fileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = fileMenu.style.display === 'block';
      closeAllFilterDropdowns();
      if (!isOpen) {
        fileMenu.style.display = 'block';
        fileBtn.classList.add('active');
        // Load files on first open
        loadFilterFiles();
      }
    });
  }

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-dropdown-group')) {
      closeAllFilterDropdowns();
    }
  });

  // Category search functionality
  const categorySearch = document.getElementById('filter-category-search');
  if (categorySearch) {
    categorySearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const options = document.querySelectorAll('#filter-category-options label:not(:first-child)');

      options.forEach(option => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(searchTerm) ? 'flex' : 'none';
      });
    });

    // Prevent dropdown from closing when clicking search input
    categorySearch.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Handle "All categories" checkbox
  const allCategoriesCheckbox = document.querySelector('#filter-category-options input[data-category-all]');
  if (allCategoriesCheckbox) {
    allCategoriesCheckbox.addEventListener('change', (e) => {
      const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all])');
      categoryCheckboxes.forEach(cb => cb.checked = false);

      updateCategoryLabel();
    });
  }

  // Handle individual category checkboxes
  const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all])');
  categoryCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (allCategoriesCheckbox) {
        allCategoriesCheckbox.checked = false;
      }
      updateCategoryLabel();
    });
  });

  // Handle amount filter radio changes
  const amountRadios = document.querySelectorAll('input[name="amount-filter"]');
  amountRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      const customRange = document.getElementById('filter-amount-range');
      if (radio.value === 'custom' && customRange) {
        customRange.style.display = 'block';
      } else if (customRange) {
        customRange.style.display = 'none';
      }
      updateAmountLabel();
    });
  });

  // Handle custom amount range inputs - update label on change
  const amountMinInput = document.getElementById('filter-amount-min');
  const amountMaxInput = document.getElementById('filter-amount-max');

  if (amountMinInput) {
    amountMinInput.addEventListener('input', () => {
      updateAmountLabel();
    });
    amountMinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filterTransactions();
      }
    });
  }

  if (amountMaxInput) {
    amountMaxInput.addEventListener('input', () => {
      updateAmountLabel();
    });
    amountMaxInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filterTransactions();
      }
    });
  }

  // File search functionality
  const fileSearch = document.getElementById('filter-file-search');
  if (fileSearch) {
    fileSearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const options = document.querySelectorAll('#filter-file-options label:not(:first-child)');

      options.forEach(option => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(searchTerm) ? 'flex' : 'none';
      });
    });

    // Prevent dropdown from closing when clicking search input
    fileSearch.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Handle "All files" checkbox
  const allFilesCheckbox = document.querySelector('#filter-file-options input[data-file-all]');
  if (allFilesCheckbox) {
    allFilesCheckbox.addEventListener('change', (e) => {
      const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all])');
      fileCheckboxes.forEach(cb => cb.checked = false);

      updateFileLabel();
    });
  }

  // Handle individual file checkboxes
  const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all])');
  fileCheckboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (allFilesCheckbox) {
        allFilesCheckbox.checked = false;
      }
      updateFileLabel();
    });
  });

  // Load categories into filter
  loadCategoriesIntoFilter();
}

// Close all filter dropdowns
function closeAllFilterDropdowns() {
  const categoryMenu = document.getElementById('filter-category-menu');
  const amountMenu = document.getElementById('filter-amount-menu');
  const fileMenu = document.getElementById('filter-file-menu');
  const categoryBtn = document.getElementById('filter-category-btn');
  const amountBtn = document.getElementById('filter-amount-btn');
  const fileBtn = document.getElementById('filter-file-btn');

  if (categoryMenu) categoryMenu.style.display = 'none';
  if (amountMenu) amountMenu.style.display = 'none';
  if (fileMenu) fileMenu.style.display = 'none';
  if (categoryBtn) categoryBtn.classList.remove('active');
  if (fileBtn) fileBtn.classList.remove('active');
  if (amountBtn) amountBtn.classList.remove('active');
}

// Update category dropdown label
function updateCategoryLabel() {
  const selectedCategories = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all]):not([data-category-null]):checked');
  const noCategoryCheckbox = document.querySelector('#filter-category-options input[data-category-null]:checked');
  const label = document.getElementById('filter-category-label');

  if (!label) return;

  const totalSelected = selectedCategories.length + (noCategoryCheckbox ? 1 : 0);

  if (totalSelected === 0) {
    label.textContent = 'Categoría';
  } else if (totalSelected === 1) {
    label.textContent = '1 categoría';
  } else {
    label.textContent = `${totalSelected} categorías`;
  }
}

// Update amount dropdown label
function updateAmountLabel() {
  const selectedAmount = document.querySelector('input[name="amount-filter"]:checked');
  const label = document.getElementById('filter-amount-label');

  if (!label || !selectedAmount) return;

  if (selectedAmount.value === 'custom') {
    const minInput = document.getElementById('filter-amount-min');
    const maxInput = document.getElementById('filter-amount-max');
    const min = minInput ? minInput.value : '';
    const max = maxInput ? maxInput.value : '';

    if (min || max) {
      const parts = [];
      if (min) parts.push(`≥ ${min}`);
      if (max) parts.push(`≤ ${max}`);
      label.textContent = parts.join(' y ') || 'Rango personalizado';
    } else {
      label.textContent = 'Rango personalizado';
    }
  } else {
    const labelTexts = {
      'all': 'Monto',
      'positive': 'Solo ingresos',
      'negative': 'Solo egresos'
    };
    label.textContent = labelTexts[selectedAmount.value] || 'Monto';
  }
}

// Update file dropdown label
function updateFileLabel() {
  const selectedFiles = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all]):checked');
  const label = document.getElementById('filter-file-label');

  if (!label) return;

  const totalSelected = selectedFiles.length;

  if (totalSelected === 0) {
    label.textContent = 'Archivo';
  } else if (totalSelected === 1) {
    label.textContent = '1 archivo';
  } else {
    label.textContent = `${totalSelected} archivos`;
  }
}

// Load categories into filter dropdown
async function loadCategoriesIntoFilter() {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/categories', { headers });
    const result = await response.json();

    if (result.success && result.categories) {
      const optionsContainer = document.getElementById('filter-category-options');
      if (!optionsContainer) return;

      // Keep the "All categories" option and append the rest
      const existingAll = optionsContainer.querySelector('[data-category-all]').parentElement;

      // Clear all except the "All" option
      optionsContainer.innerHTML = '';
      optionsContainer.appendChild(existingAll);

      // Add "Sin categoría" option (for null categories)
      const noCategoryLabel = document.createElement('label');
      noCategoryLabel.className = 'filter-dropdown-option';

      const noCategoryCheckbox = document.createElement('input');
      noCategoryCheckbox.type = 'checkbox';
      noCategoryCheckbox.setAttribute('data-category-null', 'true');

      const noCategoryDot = document.createElement('span');
      noCategoryDot.className = 'category-color-dot';
      noCategoryDot.style.background = '#9CA3AF';

      const noCategorySpan = document.createElement('span');
      noCategorySpan.textContent = 'Sin categoría';

      noCategoryLabel.appendChild(noCategoryCheckbox);
      noCategoryLabel.appendChild(noCategoryDot);
      noCategoryLabel.appendChild(noCategorySpan);
      optionsContainer.appendChild(noCategoryLabel);

      // Add event listener for "Sin categoría"
      noCategoryCheckbox.addEventListener('change', () => {
        const allCheckbox = document.querySelector('#filter-category-options input[data-category-all]');
        if (allCheckbox) allCheckbox.checked = false;
        updateCategoryLabel();
      });

      // Sort categories alphabetically by name
      const sortedCategories = [...result.categories].sort((a, b) => {
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      });

      // Add each category
      sortedCategories.forEach(category => {
        const label = document.createElement('label');
        label.className = 'filter-dropdown-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = category.id;

        const colorDot = document.createElement('span');
        colorDot.className = 'category-color-dot';
        colorDot.style.background = category.color || '#9CA3AF';

        const span = document.createElement('span');
        span.textContent = category.name;

        label.appendChild(checkbox);
        label.appendChild(colorDot);
        label.appendChild(span);
        optionsContainer.appendChild(label);

        // Add event listener
        checkbox.addEventListener('change', () => {
          const allCheckbox = document.querySelector('#filter-category-options input[data-category-all]');
          if (allCheckbox) allCheckbox.checked = false;
          updateCategoryLabel();
        });
      });
    }
  } catch (error) {
    console.error('Error loading categories for filter:', error);
  }
}

// Load files into filter dropdown
async function loadFilterFiles() {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/files', { headers });

    const result = await response.json();

    if (result.success && result.files) {
      const optionsContainer = document.getElementById('filter-file-options');
      if (!optionsContainer) return;

      // Keep the "All files" option and append the rest
      const existingAll = optionsContainer.querySelector('[data-file-all]').parentElement;

      // Clear all except the "All" option
      optionsContainer.innerHTML = '';
      optionsContainer.appendChild(existingAll);

      // Sort files by date (most recent first)
      const sortedFiles = [...result.files].sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
      });

      // Add each file
      sortedFiles.forEach(file => {
        const label = document.createElement('label');
        label.className = 'filter-dropdown-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = file.id;
        checkbox.setAttribute('data-file-name', file.original_name || file.file_name || 'Archivo sin nombre');

        const span = document.createElement('span');
        span.textContent = file.original_name || file.file_name || 'Archivo sin nombre';

        label.appendChild(checkbox);
        label.appendChild(span);
        optionsContainer.appendChild(label);

        // Add event listener
        checkbox.addEventListener('change', () => {
          const allCheckbox = document.querySelector('#filter-file-options input[data-file-all]');
          if (allCheckbox) allCheckbox.checked = false;
          updateFileLabel();
        });
      });
    }
  } catch (error) {
    console.error('Error loading files for filter:', error);
  }
}

// Update active filters pills
function updateActiveFiltersPills() {
  const pillsContainer = document.getElementById('active-filters-pills');
  const activeFiltersDiv = document.getElementById('active-filters');

  if (!pillsContainer || !activeFiltersDiv) return;

  pillsContainer.innerHTML = '';
  let hasActiveFilters = false;

  // Date range pill
  if (currentFilters.dateFrom || currentFilters.dateTo) {
    const dateText = [];
    if (currentFilters.dateFrom) dateText.push(`desde ${currentFilters.dateFrom}`);
    if (currentFilters.dateTo) dateText.push(`hasta ${currentFilters.dateTo}`);

    pillsContainer.innerHTML += createFilterPill(dateText.join(' '), 'date');
    hasActiveFilters = true;
  }

  // Description pill
  if (currentFilters.description) {
    pillsContainer.innerHTML += createFilterPill(`"${currentFilters.description}"`, 'description');
    hasActiveFilters = true;
  }

  // Categories pill
  const hasCategoryFilters = (currentFilters.categories && currentFilters.categories.length > 0) || currentFilters.includeNoCategory;

  if (hasCategoryFilters) {
    const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all]):not([data-category-null]):checked');
    const noCategoryCheckbox = document.querySelector('#filter-category-options input[data-category-null]:checked');

    const categoryCount = categoryCheckboxes.length + (noCategoryCheckbox ? 1 : 0);

    const pillText = categoryCount === 1 ? '1 categoría' : `${categoryCount} categorías`;

    pillsContainer.innerHTML += createFilterPill(pillText, 'categories');
    hasActiveFilters = true;
  }

  // Amount pill
  if (currentFilters.amountType && currentFilters.amountType !== 'all') {
    let amountText = '';
    if (currentFilters.amountType === 'positive') {
      amountText = 'Solo ingresos';
    } else if (currentFilters.amountType === 'negative') {
      amountText = 'Solo egresos';
    } else if (currentFilters.amountType === 'custom') {
      const parts = [];
      if (currentFilters.amountMin) parts.push(`≥ ${currentFilters.amountMin}`);
      if (currentFilters.amountMax) parts.push(`≤ ${currentFilters.amountMax}`);
      amountText = parts.join(' y ');
    }

    pillsContainer.innerHTML += createFilterPill(amountText, 'amount');
    hasActiveFilters = true;
  }

  // Files pill
  if (currentFilters.files && currentFilters.files.length > 0) {
    const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all]):checked');
    const fileCount = fileCheckboxes.length;

    const pillText = fileCount === 1 ? '1 archivo' : `${fileCount} archivos`;

    pillsContainer.innerHTML += createFilterPill(pillText, 'files');
    hasActiveFilters = true;
  }

  // Show/hide active filters section
  activeFiltersDiv.style.display = hasActiveFilters ? 'flex' : 'none';

  // Attach event listeners to remove buttons using event delegation
  attachPillRemoveListeners();
}

// Create a filter pill HTML
function createFilterPill(text, filterType) {
  return `
    <span class="filter-pill">
      ${text}
      <button type="button" class="filter-pill-remove" data-filter-type="${filterType}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </span>
  `;
}

// Attach event listeners to filter pill remove buttons
function attachPillRemoveListeners() {
  const removeButtons = document.querySelectorAll('.filter-pill-remove');
  removeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filterType = e.currentTarget.getAttribute('data-filter-type');
      removeFilterByType(filterType);
    });
  });
}

// Remove filter by type
function removeFilterByType(filterType) {
  switch (filterType) {
    case 'date':
      document.getElementById('filter-date-from').value = '';
      document.getElementById('filter-date-to').value = '';
      currentFilters.dateFrom = '';
      currentFilters.dateTo = '';
      break;

    case 'description':
      document.getElementById('filter-description').value = '';
      currentFilters.description = '';
      break;

    case 'categories':
      const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all])');
      categoryCheckboxes.forEach(cb => cb.checked = false);
      const allCheckbox = document.querySelector('#filter-category-options input[data-category-all]');
      if (allCheckbox) allCheckbox.checked = true;
      currentFilters.categories = [];
      currentFilters.includeNoCategory = false;
      updateCategoryLabel();
      break;

    case 'amount':
      const allRadio = document.querySelector('input[name="amount-filter"][value="all"]');
      if (allRadio) allRadio.checked = true;
      document.getElementById('filter-amount-min').value = '';
      document.getElementById('filter-amount-max').value = '';
      const customRange = document.getElementById('filter-amount-range');
      if (customRange) customRange.style.display = 'none';
      currentFilters.amountType = 'all';
      currentFilters.amountMin = '';
      currentFilters.amountMax = '';
      updateAmountLabel();
      break;

    case 'files':
      const fileCheckboxes = document.querySelectorAll('#filter-file-options input[type="checkbox"]:not([data-file-all])');
      fileCheckboxes.forEach(cb => cb.checked = false);
      const allFilesCheckbox = document.querySelector('#filter-file-options input[data-file-all]');
      if (allFilesCheckbox) allFilesCheckbox.checked = true;
      currentFilters.files = [];
      updateFileLabel();
      break;
  }

  // Reload transactions with updated filters
  filterTransactions();
}

// ========================================
// DUPLICATE DETECTION NOTIFICATION
// ========================================

/**
 * Check if file processing completed with duplicates and show notification
 * @param {string} fileId - The file ID to check
 */
async function checkForDuplicatesNotification(fileId) {
  let attempts = 0;
  const maxAttempts = 20; // Check for up to 20 seconds
  const checkInterval = 1000; // Check every second

  const intervalId = setInterval(async () => {
    attempts++;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/files/${fileId}`, { headers });
      const result = await response.json();

      if (result.success && result.file) {
        const file = result.file;

        // If processing is complete
        if (file.processing_status === 'completed') {
          clearInterval(intervalId);

          // Show success notification
          const transactionCount = file.transaction_count || 0;
          if (transactionCount > 0) {
            showNotification(
              `Archivo procesado exitosamente: ${transactionCount} transacciones importadas.`,
              'success'
            );
          }
        } else if (file.processing_status === 'failed') {
          clearInterval(intervalId);
          showNotification('Error al procesar el archivo.', 'error');
        }
      }

      // Stop checking after max attempts
      if (attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    } catch (error) {
      console.error('Error checking file status:', error);
      // Don't stop on error, keep trying
    }
  }, checkInterval);
}

// ========================================

// TRANSACTION SPLITS FUNCTIONS
// ========================================

// Create or edit splits for a transaction
async function createSplits(transactionId) {
  const transaction = allTransactions.find(t => t.id === transactionId);
  if (!transaction) return;

  const totalAmount = Math.abs(transaction.amount);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-container split-editor-modal" data-total-amount="${totalAmount}">
      <div class="modal-header">
        <h3>Subdividir transacción</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="transaction-info-banner">
          <div class="info-row">
            <span class="label">Descripción:</span>
            <span class="value">${escapeHtml(transaction.description || '-')}</span>
          </div>
          <div class="info-row">
            <span class="label">Monto total:</span>
            <span class="value total-amount">${formatCurrency(totalAmount, transaction.currency || 'ARS')}</span>
          </div>
        </div>

        <div id="splits-container" class="splits-editor">
          <!-- Splits se agregarán aquí dinámicamente -->
        </div>

        <div class="split-summary">
          <div class="summary-row">
            <span>Suma de subdivisiones:</span>
            <span id="splits-sum" class="sum-value">$0.00</span>
          </div>
          <div class="summary-row">
            <span>Restante:</span>
            <span id="splits-remaining" class="remaining-value">
              ${formatCurrency(totalAmount, transaction.currency || 'ARS')}
            </span>
          </div>
        </div>

        <button class="btn-secondary btn-block" onclick="addSplitRow()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Agregar subdivisión
        </button>
      </div>

      <div class="custom-modal-actions">
        <button class="custom-modal-btn btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="custom-modal-btn btn-confirm" onclick="saveSplits('${transactionId}', ${totalAmount}, '${transaction.currency || 'ARS'}')">
          Guardar subdivisiones
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Inicializar con splits existentes o 2 vacíos
  window.splitCounter = 0;

  if (transaction.transaction_splits && transaction.transaction_splits.length > 0) {
    // Pre-cargar splits existentes
    transaction.transaction_splits.sort((a, b) => a.split_order - b.split_order).forEach(split => {
      addSplitRow(split);
    });
  } else {
    // Agregar 2 splits vacíos
    addSplitRow();
    addSplitRow();
  }

  updateSplitsSummary();
}

// Add a new split row to the editor
function addSplitRow(existingSplit = null) {
  window.splitCounter = (window.splitCounter || 0) + 1;
  const container = document.getElementById('splits-container');

  if (!container) {
    console.error('splits-container not found');
    return;
  }

  const categories = getCategories();
  const splitRow = document.createElement('div');
  splitRow.className = 'split-row';
  splitRow.dataset.splitId = window.splitCounter;

  splitRow.innerHTML = `
    <div class="split-row-number">${window.splitCounter}</div>
    <div class="split-row-fields">
      <div class="form-group">
        <label>Categoría</label>
        <select class="split-category" onchange="updateSplitsSummary()">
          <option value="">Sin categoría</option>
          ${categories.map(cat =>
            `<option value="${cat.id}" ${existingSplit && existingSplit.category_id === cat.id ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Descripción (opcional)</label>
        <input type="text" class="split-description" placeholder="Ej: Factura A" value="${existingSplit ? escapeHtml(existingSplit.description || '') : ''}">
      </div>
      <div class="form-group">
        <label>Monto</label>
        <input type="number" class="split-amount" step="0.01" min="0"
               oninput="updateSplitsSummary()" placeholder="0.00" value="${existingSplit ? existingSplit.amount : ''}">
      </div>
    </div>
    <button class="btn-icon-danger" onclick="removeSplitRow(${window.splitCounter})" title="Eliminar">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  `;

  container.appendChild(splitRow);
}

// Remove a split row from the editor
function removeSplitRow(splitId) {
  const row = document.querySelector(`[data-split-id="${splitId}"]`);
  if (row) {
    row.remove();
    updateSplitsSummary();

    // Renumerar splits restantes
    const allRows = document.querySelectorAll('.split-row');
    allRows.forEach((row, index) => {
      const numberEl = row.querySelector('.split-row-number');
      if (numberEl) numberEl.textContent = index + 1;
    });
  }
}

// Update the splits summary (sum and remaining)
let autoCompleteTimeout;
function updateSplitsSummary() {
  const amountInputs = Array.from(document.querySelectorAll('.split-amount'));
  const amounts = amountInputs.map(input => parseFloat(input.value) || 0);

  // Obtener el monto total del data-attribute
  const modalContainer = document.querySelector('.split-editor-modal');
  const totalAmount = parseFloat(modalContainer?.dataset.totalAmount || '0');

  const sum = amounts.reduce((total, amount) => total + amount, 0);
  const remaining = totalAmount - sum;

  document.getElementById('splits-sum').textContent = `$${sum.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  document.getElementById('splits-remaining').textContent = `$${remaining.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

  // Color rojo si remaining es negativo, verde si es cero, gris si es positivo
  const remainingEl = document.getElementById('splits-remaining');
  if (remainingEl) {
    remainingEl.style.color = remaining < 0 ? '#EF4444' : (remaining === 0 ? '#10B981' : '#6B7280');
  }

  // Cancelar timeout anterior
  if (autoCompleteTimeout) {
    clearTimeout(autoCompleteTimeout);
  }

  // Auto-completar después de 500ms de inactividad
  autoCompleteTimeout = setTimeout(() => {
    const currentAmounts = Array.from(document.querySelectorAll('.split-amount')).map(input => parseFloat(input.value) || 0);
    const currentSum = currentAmounts.reduce((total, amount) => total + amount, 0);
    const currentRemaining = totalAmount - currentSum;

    if (currentRemaining > 0 && amountInputs.length >= 2) {
      // Encontrar todos los inputs vacíos
      const emptyInputs = amountInputs.filter(input => !input.value || parseFloat(input.value) === 0);

      // Si hay exactamente UN input vacío, llenarlo con el restante
      if (emptyInputs.length === 1) {
        emptyInputs[0].value = currentRemaining.toFixed(2);

        // Recalcular después de auto-completar
        const newSum = amountInputs.reduce((total, input) => total + (parseFloat(input.value) || 0), 0);
        const newRemaining = totalAmount - newSum;

        document.getElementById('splits-sum').textContent = `$${newSum.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('splits-remaining').textContent = `$${newRemaining.toLocaleString('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        if (remainingEl) {
          remainingEl.style.color = newRemaining < 0 ? '#EF4444' : (newRemaining === 0 ? '#10B981' : '#6B7280');
        }
      }
    }
  }, 500);
}

// Save splits for a transaction
async function saveSplits(transactionId, totalAmount, currency) {
  const splitRows = document.querySelectorAll('.split-row');
  const splits = [];

  for (const row of splitRows) {
    const categoryValue = row.querySelector('.split-category').value;
    const categoryId = categoryValue && categoryValue !== '' ? categoryValue : null;
    const description = row.querySelector('.split-description').value.trim();
    const amount = parseFloat(row.querySelector('.split-amount').value);

    if (!amount || amount <= 0) {
      showNotification('Todos los montos deben ser mayores a 0', 'error');
      return;
    }

    splits.push({
      category_id: categoryId,
      description: description || null,
      amount: amount
    });
  }

  if (splits.length === 0) {
    showNotification('Debe agregar al menos una subdivisión', 'error');
    return;
  }

  // Validar que sumen el total
  const sum = splits.reduce((total, split) => total + split.amount, 0);
  if (Math.abs(sum - totalAmount) > 0.01) {
    showNotification(
      `La suma de subdivisiones ($${sum.toFixed(2)}) debe ser igual al total ($${totalAmount.toFixed(2)})`,
      'error'
    );
    return;
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/transactions/${transactionId}/splits`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ splits })
    });

    if (!response.ok) {
      let errorMessage = 'Error al guardar subdivisiones';
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (e) {
          errorMessage = `Error del servidor (${response.status}): ${response.statusText}`;
        }
      } else {
        errorMessage = `Error del servidor (${response.status}): ${response.statusText}`;
      }

      throw new Error(errorMessage);
    }

    showNotification('Subdivisiones guardadas correctamente', 'success');
    document.querySelector('.modal-overlay').remove();

    // Recargar transacciones
    await loadAllTransactions();

    // Reabrir detalle
    showTransactionDetail(transactionId);
  } catch (error) {
    console.error('Error al guardar splits:', error);
    showNotification(error.message, 'error');
  }
}

// Remove all splits from a transaction
async function removeSplits(transactionId) {
  const confirmed = await showCustomModal({
    title: 'Eliminar subdivisiones',
    message: '¿Estás seguro de eliminar todas las subdivisiones? Esta acción no se puede deshacer.',
    type: 'warning',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    danger: true
  });

  if (!confirmed) return;

  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/transactions/${transactionId}/splits`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      throw new Error('Error al eliminar subdivisiones');
    }

    showNotification('Subdivisiones eliminadas', 'success');
    await loadAllTransactions();
    showTransactionDetail(transactionId);
  } catch (error) {
    console.error('Error al eliminar splits:', error);
    showNotification('Error al eliminar subdivisiones', 'error');
  }
}
