// =============================================
// CATEGORIES MODULE - Frontend JS
// =============================================

// State
let categoriesData = [];
let currentCategoryId = null;
const MAX_CATEGORIES = 30;

// Initialize categories when section becomes visible
function initializeCategories() {
  loadCategories();
}

// Load all categories from API
async function loadCategories() {
  const loadingEl = document.getElementById('categories-loading');
  const emptyEl = document.getElementById('categories-empty');
  const listEl = document.getElementById('categories-list');
  const countEl = document.getElementById('categories-count');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (listEl) {
    listEl.style.display = 'none';
    listEl.innerHTML = '';
  }

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch('/api/categories', { headers });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading categories');
    }

    categoriesData = data.categories || [];

    // Update count
    if (countEl) {
      countEl.textContent = `${categoriesData.length} / ${MAX_CATEGORIES} categorías`;
    }

    if (categoriesData.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
    } else {
      renderCategoriesList();
    }

  } catch (error) {
    console.error('Error loading categories:', error);
    if (emptyEl) emptyEl.style.display = 'flex';
    if (typeof showNotification === 'function') {
      showNotification('Error al cargar categorías', 'error');
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// Render categories list as table
function renderCategoriesList() {
  const listEl = document.getElementById('categories-list');
  const emptyEl = document.getElementById('categories-empty');

  if (!listEl) return;

  if (categoriesData.length === 0) {
    listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = 'block';

  // Sort categories by sort_order
  const sortedCategories = [...categoriesData].sort((a, b) => {
    const orderA = a.sort_order !== undefined ? a.sort_order : 999;
    const orderB = b.sort_order !== undefined ? b.sort_order : 999;
    return orderA - orderB;
  });

  listEl.innerHTML = `
    <table class="categories-table">
      <thead>
        <tr>
          <th>Orden</th>
          <th>Color</th>
          <th>Nombre</th>
          <th>Descripción</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${sortedCategories.map(category => `
          <tr data-id="${category.id}">
            <td class="category-order-cell">
              ${category.sort_order !== undefined ? category.sort_order : '-'}
            </td>
            <td class="category-color-cell">
              <span class="category-color-dot" style="background-color: ${escapeHtml(category.color || '#9CA3AF')}"></span>
            </td>
            <td class="category-name-cell">
              ${escapeHtml(category.name)}
            </td>
            <td class="category-description-cell">
              ${category.description ? escapeHtml(category.description) : '<span class="text-muted">-</span>'}
            </td>
            <td class="category-actions-cell">
              <button class="action-btn" onclick="openEditCategoryModal('${category.id}')" title="Editar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="action-btn delete-btn" onclick="openDeleteCategoryModal('${category.id}')" title="Eliminar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Open modal to add new category
function openAddCategoryModal() {
  currentCategoryId = null;

  const modal = document.getElementById('category-modal');
  const title = document.getElementById('category-modal-title');
  const form = document.getElementById('category-form');

  if (title) title.textContent = 'Nueva Categoría';
  if (form) form.reset();

  // Reset color to default
  const colorInput = document.getElementById('category-color');
  if (colorInput) colorInput.value = '#9CA3AF';

  // Clear hidden id
  const idInput = document.getElementById('category-id');
  if (idInput) idInput.value = '';

  if (modal) modal.classList.add('active');
}

// Open modal to edit category
function openEditCategoryModal(categoryId) {
  const category = categoriesData.find(c => c.id === categoryId);
  if (!category) return;

  currentCategoryId = categoryId;

  const modal = document.getElementById('category-modal');
  const title = document.getElementById('category-modal-title');

  if (title) title.textContent = 'Editar Categoría';

  // Fill form fields
  const idInput = document.getElementById('category-id');
  const nameInput = document.getElementById('category-name');
  const colorInput = document.getElementById('category-color');
  const descInput = document.getElementById('category-description');
  const sortOrderInput = document.getElementById('category-sort-order');

  if (idInput) idInput.value = category.id;
  if (nameInput) nameInput.value = category.name;
  if (colorInput) colorInput.value = category.color || '#9CA3AF';
  if (descInput) descInput.value = category.description || '';
  if (sortOrderInput) sortOrderInput.value = category.sort_order !== undefined ? category.sort_order : 0;

  if (modal) modal.classList.add('active');
}

// Close category modal
function closeCategoryModal() {
  const modal = document.getElementById('category-modal');
  if (modal) modal.classList.remove('active');
  currentCategoryId = null;
}

// Set category color from preset
function setCategoryColor(color) {
  const colorInput = document.getElementById('category-color');
  if (colorInput) colorInput.value = color;
}

// Save category (create or update)
async function saveCategory(event) {
  event.preventDefault();

  const idInput = document.getElementById('category-id');
  const nameInput = document.getElementById('category-name');
  const colorInput = document.getElementById('category-color');
  const descInput = document.getElementById('category-description');
  const sortOrderInput = document.getElementById('category-sort-order');

  const categoryId = idInput?.value;
  const name = nameInput?.value?.trim();
  const color = colorInput?.value || '#9CA3AF';
  const description = descInput?.value?.trim() || null;
  const sort_order = sortOrderInput?.value ? parseInt(sortOrderInput.value, 10) : 0;

  if (!name) {
    showNotification('El nombre es requerido', 'error');
    return;
  }

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    headers['Content-Type'] = 'application/json';

    const url = categoryId ? `/api/categories/${categoryId}` : '/api/categories';
    const method = categoryId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify({ name, color, description, sort_order })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error saving category');
    }

    closeCategoryModal();
    loadCategories();
    showNotification(categoryId ? 'Categoría actualizada' : 'Categoría creada', 'success');

  } catch (error) {
    console.error('Error saving category:', error);
    showNotification(error.message || 'Error al guardar categoría', 'error');
  }
}

// Open delete confirmation modal
function openDeleteCategoryModal(categoryId) {
  const category = categoriesData.find(c => c.id === categoryId);
  if (!category) return;

  const modal = document.getElementById('delete-category-modal');
  const detailsEl = document.getElementById('delete-category-details');
  const idInput = document.getElementById('delete-category-id');

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div class="delete-category-preview">
        <span class="category-color-dot" style="background-color: ${escapeHtml(category.color || '#9CA3AF')}"></span>
        <span class="category-name">${escapeHtml(category.name)}</span>
      </div>
    `;
  }

  if (idInput) idInput.value = categoryId;
  if (modal) modal.classList.add('active');
}

// Close delete confirmation modal
function closeDeleteCategoryModal() {
  const modal = document.getElementById('delete-category-modal');
  if (modal) modal.classList.remove('active');
}

// Confirm and delete category
async function confirmDeleteCategory() {
  const idInput = document.getElementById('delete-category-id');
  const categoryId = idInput?.value;

  if (!categoryId) return;

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch(`/api/categories/${categoryId}`, {
      method: 'DELETE',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error deleting category');
    }

    closeDeleteCategoryModal();
    loadCategories();
    showNotification('Categoría eliminada', 'success');

  } catch (error) {
    console.error('Error deleting category:', error);
    showNotification(error.message || 'Error al eliminar categoría', 'error');
  }
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================
// EMAIL UPLOAD FUNCTIONS
// =============================================

// Load user's upload email address
async function loadUploadEmail() {
  const loadingEl = document.getElementById('email-upload-loading');
  const contentEl = document.getElementById('email-upload-content');
  const emailInput = document.getElementById('upload-email-address');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (contentEl) contentEl.style.display = 'none';

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch('/api/user/upload-email', { headers });

    if (!response.ok) {
      throw new Error('Error loading upload email');
    }

    const data = await response.json();

    if (emailInput && data.email) {
      emailInput.value = data.email;
    }

  } catch (error) {
    console.error('Error loading upload email:', error);
    // Generate a placeholder email based on user info
    if (emailInput && typeof currentUser !== 'undefined' && currentUser?.id) {
      const shortId = currentUser.id.substring(0, 8);
      emailInput.value = `upload-${shortId}@uploads.maneki.app`;
    }
  } finally {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
  }
}

// Copy upload email to clipboard
function copyUploadEmail() {
  const emailInput = document.getElementById('upload-email-address');
  if (!emailInput) return;

  emailInput.select();
  emailInput.setSelectionRange(0, 99999);

  navigator.clipboard.writeText(emailInput.value).then(() => {
    if (typeof showNotification === 'function') {
      showNotification('Email copiado al portapapeles', 'success');
    }
  }).catch(() => {
    document.execCommand('copy');
    if (typeof showNotification === 'function') {
      showNotification('Email copiado', 'success');
    }
  });
}

// Regenerate upload email
async function regenerateUploadEmail() {
  const emailInput = document.getElementById('upload-email-address');

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    headers['Content-Type'] = 'application/json';

    const response = await fetch('/api/user/upload-email/regenerate', {
      method: 'POST',
      headers
    });

    if (!response.ok) {
      throw new Error('Error regenerating email');
    }

    const data = await response.json();

    if (emailInput && data.email) {
      emailInput.value = data.email;
    }

    if (typeof showNotification === 'function') {
      showNotification('Email regenerado exitosamente', 'success');
    }

  } catch (error) {
    console.error('Error regenerating upload email:', error);
    if (typeof showNotification === 'function') {
      showNotification('Error al regenerar email', 'error');
    }
  }
}

// Expose functions globally
window.loadUploadEmail = loadUploadEmail;
window.copyUploadEmail = copyUploadEmail;
window.regenerateUploadEmail = regenerateUploadEmail;

// Initialize when ajustes section becomes visible
document.addEventListener('DOMContentLoaded', () => {
  // Check if we should initialize on page load
  const ajustesSection = document.getElementById('section-ajustes');
  if (ajustesSection && ajustesSection.classList.contains('active')) {
    initializeCategories();
    loadUploadEmail();
  }
});

// Listen for section changes to load categories when ajustes becomes visible
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#ajustes') {
    initializeCategories();
    loadUploadEmail();
  }
});

// Also expose initialization function globally for navigation
window.initializeCategories = initializeCategories;
