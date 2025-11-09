// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const uploadMessage = document.getElementById('uploadMessage');
const filesList = document.getElementById('filesList');
const transactionsModal = document.getElementById('transactionsModal');
const closeModal = document.getElementById('closeModal');
const transactionsContent = document.getElementById('transactionsContent');
const transactionsLoading = document.getElementById('transactionsLoading');

// Allowed file extensions
const allowedExtensions = ['.pdf', '.csv', '.xlsx', '.xls'];

// Auto-refresh interval for processing status
let refreshInterval = null;

// Browse button click
browseBtn.addEventListener('click', () => {
  fileInput.click();
});

// File input change
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

// Drag and drop events
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

// Handle file upload
function handleFile(file) {
  // Validate file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (!hasValidExtension) {
    showMessage(`Invalid file type. Please upload: ${allowedExtensions.join(', ')}`, 'error');
    return;
  }

  // Reset previous states
  hideMessage();
  uploadProgress.style.display = 'block';
  progressFill.style.width = '0%';
  progressText.textContent = 'Preparing upload...';

  // Create form data
  const formData = new FormData();
  formData.append('file', file);

  // Create XMLHttpRequest for progress tracking
  const xhr = new XMLHttpRequest();

  // Progress event
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percentComplete = (e.loaded / e.total) * 100;
      progressFill.style.width = percentComplete + '%';
      progressText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
    }
  });

  // Load event (upload complete)
  xhr.addEventListener('load', () => {
    if (xhr.status === 200) {
      try {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          progressFill.style.width = '100%';
          progressText.textContent = 'Upload complete! Processing file...';

          setTimeout(() => {
            uploadProgress.style.display = 'none';
            showMessage('File uploaded successfully! Processing in progress...', 'success');
            fileInput.value = ''; // Reset file input

            // Refresh the file list
            refreshFileList();

            // Refresh all transactions
            loadAllTransactions();

            // Start auto-refresh to check processing status
            startAutoRefresh();
          }, 1000);
        } else {
          uploadProgress.style.display = 'none';
          showMessage(response.error || 'Upload failed', 'error');
        }
      } catch (error) {
        uploadProgress.style.display = 'none';
        showMessage('Error processing response', 'error');
      }
    } else {
      uploadProgress.style.display = 'none';
      try {
        const response = JSON.parse(xhr.responseText);
        showMessage(response.error || 'Upload failed', 'error');
      } catch (error) {
        showMessage('Upload failed', 'error');
      }
    }
  });

  // Error event
  xhr.addEventListener('error', () => {
    uploadProgress.style.display = 'none';
    showMessage('Network error occurred', 'error');
  });

  // Send request
  xhr.open('POST', '/upload');
  xhr.send(formData);
}

// Show message
function showMessage(text, type) {
  uploadMessage.textContent = text;
  uploadMessage.className = `message alert alert-${type}`;
  uploadMessage.style.display = 'block';

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      hideMessage();
    }, 5000);
  }
}

// Hide message
function hideMessage() {
  uploadMessage.style.display = 'none';
}

// Refresh file list
async function refreshFileList() {
  try {
    const response = await fetch('/api/files');
    const data = await response.json();

    if (data.success && data.files) {
      if (data.files.length === 0) {
        filesList.innerHTML = '<p class="no-files">No files uploaded yet</p>';
      } else {
        filesList.innerHTML = data.files.map(file => {
          const statusBadge = getStatusBadge(file);
          const confidenceScore = file.confidence_score && file.processing_status === 'completed'
            ? `<span class="confidence-score">Confidence: ${Math.round(file.confidence_score)}%</span>`
            : '';

          // Determine action button based on document type
          let actionButton = '';
          if (file.processing_status === 'completed') {
            if (file.document_type === 'vep') {
              actionButton = `<button class="btn btn-sm btn-primary view-vep-btn" data-fileid="${file.id}">View VEP</button>`;
            } else {
              actionButton = `<button class="btn btn-sm btn-primary view-transactions-btn" data-fileid="${file.id}">View Transactions</button>`;
            }
          }

          // Add document type badge
          const docTypeBadge = file.document_type === 'vep'
            ? '<span class="doc-type-badge vep-badge">VEP</span>'
            : '<span class="doc-type-badge statement-badge">Bank Statement</span>';

          return `
            <div class="file-item" data-fileid="${file.id}" data-filename="${file.stored_name}">
              <div class="file-info">
                <div class="file-icon">
                  ${getFileIcon(file.original_name, file.document_type)}
                </div>
                <div class="file-details">
                  <p class="file-name">${file.original_name} ${docTypeBadge}</p>
                  <p class="file-meta">
                    ${(file.file_size / 1024).toFixed(2)} KB
                    ${file.created_at ? '• ' + new Date(file.created_at).toLocaleString() : ''}
                    ${file.bank_name ? '• ' + file.bank_name : ''}
                  </p>
                  <div class="file-status">
                    ${statusBadge}
                    ${confidenceScore}
                  </div>
                </div>
              </div>
              <div class="file-actions">
                ${actionButton}
                <a href="${file.public_url}" target="_blank" class="btn btn-sm btn-secondary">View File</a>
                <button class="btn btn-sm btn-danger delete-btn" data-filename="${file.stored_name}">Delete</button>
              </div>
            </div>
          `;
        }).join('');

        // Re-attach event listeners
        attachEventListeners();
      }

      // Check if any files are still processing
      const hasProcessing = data.files.some(f =>
        f.processing_status === 'pending' || f.processing_status === 'processing'
      );

      if (hasProcessing) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
        // Refresh transactions when processing is complete
        loadAllTransactions();
      }
    }
  } catch (error) {
    console.error('Error refreshing file list:', error);
  }
}

// Get status badge HTML
function getStatusBadge(file) {
  switch (file.processing_status) {
    case 'pending':
      return '<span class="status-badge status-pending">⏳ Pending</span>';
    case 'processing':
      return '<span class="status-badge status-processing">🔄 Processing</span>';
    case 'completed':
      return '<span class="status-badge status-completed">✓ Completed</span>';
    case 'failed':
      return `<span class="status-badge status-failed">✗ Failed</span>${file.processing_error ? '<span class="error-message">' + file.processing_error + '</span>' : ''}`;
    default:
      return '';
  }
}

// Get file icon based on extension and document type
function getFileIcon(filename, documentType) {
  if (documentType === 'vep') return '💰'; // Money bag for VEPs
  if (filename.endsWith('.pdf')) return '📄';
  if (filename.endsWith('.csv')) return '📊';
  return '📈';
}

// Delete file
async function deleteFile(fileName) {
  if (!confirm('Are you sure you want to delete this file?')) {
    return;
  }

  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      showMessage('File deleted successfully', 'success');
      refreshFileList();
    } else {
      showMessage(data.error || 'Failed to delete file', 'error');
    }
  } catch (error) {
    showMessage('Error deleting file', 'error');
    console.error('Delete error:', error);
  }
}

// View VEP details
async function viewVep(fileId) {
  transactionsModal.style.display = 'flex';
  transactionsLoading.style.display = 'block';
  transactionsContent.innerHTML = '';

  try {
    const response = await fetch(`/api/veps/file/${fileId}`);
    const data = await response.json();

    transactionsLoading.style.display = 'none';

    if (data.success && data.vep) {
      const vepHtml = createVepDetailsHtml(data.vep);
      transactionsContent.innerHTML = vepHtml;
    } else {
      transactionsContent.innerHTML = `<p class="error">Failed to load VEP: ${data.error || 'Unknown error'}</p>`;
    }
  } catch (error) {
    transactionsLoading.style.display = 'none';
    transactionsContent.innerHTML = '<p class="error">Error loading VEP</p>';
    console.error('Error loading VEP:', error);
  }
}

// View transactions
async function viewTransactions(fileId) {
  transactionsModal.style.display = 'flex';
  transactionsLoading.style.display = 'block';
  transactionsContent.innerHTML = '';

  try {
    const response = await fetch(`/api/files/${fileId}`);
    const data = await response.json();

    transactionsLoading.style.display = 'none';

    if (data.success && data.transactions) {
      if (data.transactions.length === 0) {
        transactionsContent.innerHTML = '<p class="no-transactions">No transactions found</p>';
      } else {
        const table = createTransactionsTable(data.transactions);
        transactionsContent.innerHTML = table;
      }
    } else {
      transactionsContent.innerHTML = `<p class="error">Failed to load transactions: ${data.error || 'Unknown error'}</p>`;
    }
  } catch (error) {
    transactionsLoading.style.display = 'none';
    transactionsContent.innerHTML = '<p class="error">Error loading transactions</p>';
    console.error('Error loading transactions:', error);
  }
}

// Create VEP details HTML
function createVepDetailsHtml(vep) {
  const itemsTable = vep.items_detalle && vep.items_detalle.length > 0
    ? `
      <div class="vep-items">
        <h3>Detalle de Conceptos</h3>
        <table class="vep-items-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Código</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            ${vep.items_detalle.map(item => `
              <tr>
                <td>${escapeHtml(item.descripcion)}</td>
                <td>${escapeHtml(item.codigo)}</td>
                <td class="positive-amount">${formatCurrency(item.monto)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

  return `
    <div class="vep-details">
      <h2>VEP - Volante Electrónico de Pago</h2>

      <div class="vep-header">
        <div class="vep-field">
          <label>Número de VEP:</label>
          <span class="vep-value vep-number">${escapeHtml(vep.nro_vep || '-')}</span>
        </div>
        <div class="vep-field">
          <label>Organismo Recaudador:</label>
          <span class="vep-value">${escapeHtml(vep.organismo_recaudador || '-')}</span>
        </div>
      </div>

      <div class="vep-section">
        <h3>Información del Pago</h3>
        <div class="vep-grid">
          <div class="vep-field">
            <label>Tipo de Pago:</label>
            <span class="vep-value">${escapeHtml(vep.tipo_pago || '-')}</span>
          </div>
          <div class="vep-field">
            <label>Descripción:</label>
            <span class="vep-value">${escapeHtml(vep.descripcion_reducida || '-')}</span>
          </div>
          <div class="vep-field">
            <label>CUIT:</label>
            <span class="vep-value">${escapeHtml(vep.cuit || '-')}</span>
          </div>
          <div class="vep-field">
            <label>Período:</label>
            <span class="vep-value">${escapeHtml(vep.periodo || '-')}</span>
          </div>
          <div class="vep-field">
            <label>Concepto:</label>
            <span class="vep-value">${escapeHtml(vep.concepto || '-')}</span>
          </div>
          <div class="vep-field">
            <label>Subconcepto:</label>
            <span class="vep-value">${escapeHtml(vep.subconcepto || '-')}</span>
          </div>
        </div>
      </div>

      <div class="vep-section">
        <h3>Fechas</h3>
        <div class="vep-grid">
          <div class="vep-field">
            <label>Generado por Usuario:</label>
            <span class="vep-value">${escapeHtml(vep.generado_por_usuario || '-')}</span>
          </div>
          <div class="vep-field">
            <label>Fecha de Generación:</label>
            <span class="vep-value">${formatDate(vep.fecha_generacion)}</span>
          </div>
          <div class="vep-field">
            <label>Día de Expiración:</label>
            <span class="vep-value vep-expiration">${formatDate(vep.dia_expiracion)}</span>
          </div>
        </div>
      </div>

      ${itemsTable}

      <div class="vep-total">
        <label>Importe Total a Pagar:</label>
        <span class="vep-amount">${formatCurrency(vep.importe_total_pagar)}</span>
      </div>
    </div>
  `;
}

// Create transactions table HTML
function createTransactionsTable(transactions) {
  const rows = transactions.map(t => `
    <tr>
      <td>${formatDate(t.transaction_date)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td>${t.merchant ? escapeHtml(t.merchant) : '-'}</td>
      <td class="${t.amount < 0 ? 'negative-amount' : 'positive-amount'}">
        ${formatCurrency(t.amount)}
      </td>
      <td><span class="transaction-type">${t.transaction_type || '-'}</span></td>
    </tr>
  `).join('');

  return `
    <table class="transactions-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Merchant</th>
          <th>Amount</th>
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

// Format date
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

// Format currency
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS'
  }).format(amount);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close modal
closeModal.addEventListener('click', () => {
  transactionsModal.style.display = 'none';
});

// Close modal when clicking outside
transactionsModal.addEventListener('click', (e) => {
  if (e.target === transactionsModal) {
    transactionsModal.style.display = 'none';
  }
});

// Auto-refresh functions
function startAutoRefresh() {
  if (refreshInterval) return; // Already running

  refreshInterval = setInterval(() => {
    refreshFileList();
  }, 5000); // Refresh every 5 seconds
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Attach event listeners
function attachEventListeners() {
  // Delete buttons
  const deleteButtons = document.querySelectorAll('.delete-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fileName = e.target.dataset.filename;
      deleteFile(fileName);
    });
  });

  // View transactions buttons
  const viewButtons = document.querySelectorAll('.view-transactions-btn');
  viewButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fileId = e.target.dataset.fileid;
      viewTransactions(fileId);
    });
  });

  // View VEP buttons
  const viewVepButtons = document.querySelectorAll('.view-vep-btn');
  viewVepButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fileId = e.target.dataset.fileid;
      viewVep(fileId);
    });
  });
}

// Load all transactions
async function loadAllTransactions() {
  const allTransactionsLoading = document.getElementById('allTransactionsLoading');
  const allTransactionsContent = document.getElementById('allTransactionsContent');

  allTransactionsLoading.style.display = 'block';
  allTransactionsContent.innerHTML = '';

  try {
    const response = await fetch('/api/transactions');
    const data = await response.json();

    allTransactionsLoading.style.display = 'none';

    if (data.success && data.transactions) {
      if (data.transactions.length === 0) {
        allTransactionsContent.innerHTML = '<p class="no-transactions">No transactions yet. Upload a bank statement to get started.</p>';
      } else {
        const table = createAllTransactionsTable(data.transactions);
        allTransactionsContent.innerHTML = table;
      }
    } else {
      allTransactionsContent.innerHTML = `<p class="error">Failed to load transactions: ${data.error || 'Unknown error'}</p>`;
    }
  } catch (error) {
    allTransactionsLoading.style.display = 'none';
    allTransactionsContent.innerHTML = '<p class="error">Error loading transactions</p>';
    console.error('Error loading all transactions:', error);
  }
}

// Create all transactions table HTML with file info
function createAllTransactionsTable(transactions) {
  const rows = transactions.map(t => {
    // Get file name from nested files object
    const fileName = t.files?.original_name || '-';
    const bankName = t.files?.bank_name || '';

    return `
      <tr>
        <td>${formatDate(t.transaction_date)}</td>
        <td>${escapeHtml(t.description)}</td>
        <td>${t.merchant ? escapeHtml(t.merchant) : '-'}</td>
        <td class="${t.amount < 0 ? 'negative-amount' : 'positive-amount'}">
          ${formatCurrency(t.amount)}
        </td>
        <td><span class="transaction-type">${t.transaction_type || '-'}</span></td>
        <td>${t.reference_number || '-'}</td>
        <td class="file-cell">
          <div>${escapeHtml(fileName)}</div>
          ${bankName ? `<small class="bank-name">${escapeHtml(bankName)}</small>` : ''}
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="table-container">
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Merchant</th>
            <th>Amount</th>
            <th>Type</th>
            <th>Reference</th>
            <th>File</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Navigation active state handling
function initNavigation() {
  const menuItems = document.querySelectorAll('.menu-item');
  const sections = document.querySelectorAll('.content-section');

  // Function to show a specific section
  function showSection(sectionName) {
    // Hide all sections
    sections.forEach(section => {
      section.classList.remove('active');
    });

    // Show the target section
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) {
      targetSection.classList.add('active');

      // Load transactions when switching to transactions section
      if (sectionName === 'transacciones') {
        loadAllTransactions();
      }
    }

    // Update active menu item
    menuItems.forEach(item => {
      item.classList.remove('active');
      if (item.dataset.section === sectionName) {
        item.classList.add('active');
      }
    });

    // Update URL hash
    window.location.hash = sectionName;
  }

  // Handle menu item clicks
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const sectionName = item.dataset.section;
      showSection(sectionName);
    });
  });

  // Handle hash changes (browser back/forward)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1); // Remove the #
    if (hash) {
      showSection(hash);
    } else {
      showSection('inicio');
    }
  });

  // Set initial section based on hash or default to 'inicio'
  const initialHash = window.location.hash.substring(1) || 'inicio';
  showSection(initialHash);
}

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  attachEventListeners();
  initNavigation();

  // Check if any files are processing on page load
  const processingFiles = document.querySelectorAll('.status-processing, .status-pending');
  if (processingFiles.length > 0) {
    startAutoRefresh();
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});
