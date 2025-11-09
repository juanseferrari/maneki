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

  if (!accessToken) {
    showMessage('Not authenticated', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    uploadProgress.style.display = 'block';
    fileSelected.style.display = 'none';
    uploadMessage.textContent = '';

    const response = await fetch('/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
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
  if (!accessToken) return;

  try {
    const response = await fetch('/api/files', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

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

function displayFiles(files) {
  const filesList = document.getElementById('files-list');

  if (files.length === 0) {
    filesList.innerHTML = '<p>No hay archivos cargados aún</p>';
    return;
  }

  filesList.innerHTML = files.map(file => `
    <div class="file-card" data-file-id="${file.id}">
      <div class="file-header">
        <div class="file-icon">${file.document_type === 'vep' ? '📄' : '📁'}</div>
        <div class="file-info">
          <div class="file-name">${file.original_name}</div>
          <div class="file-meta">
            <span>${formatFileSize(file.file_size)}</span>
            <span>•</span>
            <span>${new Date(file.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="file-status status-${file.processing_status}">${file.processing_status}</div>
      </div>
      <div class="file-actions">
        ${file.processing_status === 'completed' ? `
          <button class="btn-view" onclick="viewFileDetails('${file.id}', '${file.document_type}')">Ver Detalles</button>
        ` : ''}
        <button class="btn-delete" onclick="deleteFile('${file.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

async function deleteFile(fileId) {
  if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
    return;
  }

  if (!accessToken) {
    showMessage('Not authenticated', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
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
  if (!accessToken) return;

  if (documentType === 'vep') {
    await viewVepDetails(fileId);
  } else {
    await viewTransactions(fileId);
  }
}

async function viewVepDetails(fileId) {
  try {
    const response = await fetch(`/api/files/${fileId}/vep`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

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
    const response = await fetch(`/api/files/${fileId}/transactions`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const result = await response.json();

    if (result.success) {
      alert(`Found ${result.transactions.length} transactions`);
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
  }
}

async function loadAllTransactions() {
  if (!accessToken) return;

  const container = document.getElementById('all-transactions-container');
  container.innerHTML = '<p>Cargando transacciones...</p>';

  try {
    const response = await fetch('/api/transactions', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const result = await response.json();

    if (result.success) {
      if (result.transactions.length === 0) {
        container.innerHTML = '<p>No hay transacciones disponibles</p>';
      } else {
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
                ${result.transactions.map(t => `
                  <tr>
                    <td>${new Date(t.transaction_date).toLocaleDateString()}</td>
                    <td>${t.description || '-'}</td>
                    <td class="${t.amount < 0 ? 'debit' : ''}">${t.amount < 0 ? '$' + Math.abs(t.amount).toFixed(2) : '-'}</td>
                    <td class="${t.amount > 0 ? 'credit' : ''}">${t.amount > 0 ? '$' + t.amount.toFixed(2) : '-'}</td>
                    <td>${t.balance ? '$' + t.balance.toFixed(2) : '-'}</td>
                    <td>${t.files?.original_name || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Error loading transactions:', error);
    container.innerHTML = '<p>Error al cargar transacciones</p>';
  }
}

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
