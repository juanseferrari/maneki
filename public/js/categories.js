// =============================================
// CATEGORIES MODULE - Frontend JS
// =============================================

// Shared global state (can be accessed by other modules)
if (!window.categoriesGlobalData) {
  window.categoriesGlobalData = [];
}
let categoriesData = window.categoriesGlobalData;
let currentCategoryId = null;
const MAX_CATEGORIES = 30;
let isCategoriesLoading = false; // Prevent duplicate calls

// Initialize categories when section becomes visible
function initializeCategories() {
  // Only load if not already loading or loaded
  if (!isCategoriesLoading && categoriesData.length === 0) {
    loadCategories();
  } else if (categoriesData.length > 0) {
    // Just render if already loaded
    renderCategoriesList();
    const countEl = document.getElementById('categories-count');
    if (countEl) {
      countEl.textContent = `${categoriesData.length} / ${MAX_CATEGORIES} categorías`;
    }
  }
}

// Load all categories from API
async function loadCategories() {
  // Prevent duplicate calls
  if (isCategoriesLoading) {
    console.log('[Categories] Already loading, skipping...');
    return;
  }

  isCategoriesLoading = true;

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
    console.log('[Categories] Fetching from API...');
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

    // Update global array while maintaining reference
    window.categoriesGlobalData.length = 0; // Clear existing
    window.categoriesGlobalData.push(...(data.categories || [])); // Add new categories
    console.log('[Categories] Loaded', categoriesData.length, 'categories');

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
    isCategoriesLoading = false; // Reset flag to allow future loads
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
              <button class="action-btn" onclick="openKeywordsModal('${category.id}')" title="Gestionar keywords">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 7h16M4 12h16M4 17h16"></path>
                </svg>
              </button>
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

// =============================================
// KEYWORDS MANAGEMENT FUNCTIONS
// =============================================

let currentKeywordsCategoryId = null;
let categoryRules = [];

// Open keywords management modal
async function openKeywordsModal(categoryId) {
  const category = categoriesData.find(c => c.id === categoryId);
  if (!category) return;

  currentKeywordsCategoryId = categoryId;

  const modal = document.getElementById('keywords-modal');
  const title = document.getElementById('keywords-modal-title');
  const loadingEl = document.getElementById('keywords-loading');
  const contentEl = document.getElementById('keywords-content');

  if (title) {
    title.textContent = `Keywords: ${category.name}`;
  }

  if (modal) modal.classList.add('active');
  if (loadingEl) loadingEl.style.display = 'flex';
  if (contentEl) contentEl.style.display = 'none';

  // Load keywords for this category
  await loadCategoryKeywords(categoryId);
}

// Close keywords modal
function closeKeywordsModal() {
  const modal = document.getElementById('keywords-modal');
  if (modal) modal.classList.remove('active');
  currentKeywordsCategoryId = null;
  categoryRules = [];
}

// Load keywords for a category
async function loadCategoryKeywords(categoryId) {
  const loadingEl = document.getElementById('keywords-loading');
  const contentEl = document.getElementById('keywords-content');
  const emptyEl = document.getElementById('keywords-empty');
  const listEl = document.getElementById('keywords-list');

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch(`/api/category-rules/category/${categoryId}`, { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading keywords');
    }

    categoryRules = data.rules || [];

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    renderKeywordsList();

  } catch (error) {
    console.error('Error loading keywords:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    if (typeof showNotification === 'function') {
      showNotification('Error al cargar keywords', 'error');
    }
  }
}

// Render keywords list
function renderKeywordsList() {
  const emptyEl = document.getElementById('keywords-empty');
  const listEl = document.getElementById('keywords-list');

  if (!listEl) return;

  if (categoryRules.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    listEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  listEl.style.display = 'block';

  // Sort by priority descending
  const sortedRules = [...categoryRules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  listEl.innerHTML = sortedRules.map(rule => `
    <div class="keyword-item">
      <span class="keyword-text">${escapeHtml(rule.keyword)}</span>
      <button class="keyword-delete-btn" onclick="deleteKeyword('${rule.id}')" title="Eliminar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  `).join('');
}

// Add a new keyword
async function addKeyword(event) {
  event.preventDefault();

  const keywordInput = document.getElementById('keyword-input');
  const keyword = keywordInput?.value?.trim();

  if (!keyword) {
    if (typeof showNotification === 'function') {
      showNotification('La palabra clave es requerida', 'error');
    }
    return;
  }

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    headers['Content-Type'] = 'application/json';

    const response = await fetch('/api/category-rules', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        category_id: currentKeywordsCategoryId,
        keyword,
        match_field: 'both',        // Siempre buscar en ambos campos
        priority: 0,                 // Prioridad por defecto
        case_sensitive: false,       // Siempre case insensitive
        is_regex: false              // No regex por defecto
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error adding keyword');
    }

    // Reset form
    if (keywordInput) keywordInput.value = '';

    // Reload keywords
    await loadCategoryKeywords(currentKeywordsCategoryId);

    if (typeof showNotification === 'function') {
      showNotification('Palabra clave agregada', 'success');
    }

  } catch (error) {
    console.error('Error adding keyword:', error);
    if (typeof showNotification === 'function') {
      showNotification(error.message || 'Error al agregar palabra clave', 'error');
    }
  }
}

// Delete a keyword
async function deleteKeyword(ruleId) {
  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch(`/api/category-rules/${ruleId}`, {
      method: 'DELETE',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error deleting keyword');
    }

    // Reload keywords
    await loadCategoryKeywords(currentKeywordsCategoryId);

    if (typeof showNotification === 'function') {
      showNotification('Keyword eliminado', 'success');
    }

  } catch (error) {
    console.error('Error deleting keyword:', error);
    if (typeof showNotification === 'function') {
      showNotification(error.message || 'Error al eliminar keyword', 'error');
    }
  }
}

// Expose functions globally
window.openKeywordsModal = openKeywordsModal;
window.closeKeywordsModal = closeKeywordsModal;
window.addKeyword = addKeyword;
window.deleteKeyword = deleteKeyword;
