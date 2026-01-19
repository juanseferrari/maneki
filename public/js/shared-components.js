// =============================================
// SHARED UI COMPONENTS
// Reusable components across the application
// =============================================

/**
 * Create an inline editable field with consistent styling and behavior
 * @param {Object} config - Configuration object
 * @param {string} config.elementId - ID of the element being edited
 * @param {string} config.fieldName - Name of the field to update
 * @param {HTMLElement} config.element - DOM element to make editable
 * @param {string} config.currentValue - Current value of the field
 * @param {Function} config.onSave - Async function to save the value, receives (fieldName, newValue)
 * @param {Function} config.onSuccess - Optional callback after successful save
 * @returns {Promise<void>}
 */
async function createInlineEditField(config) {
  const {
    elementId,
    fieldName,
    element,
    currentValue,
    onSave,
    onSuccess
  } = config;

  // Remove the edit icon from the current value
  const iconEl = element.querySelector('.edit-icon');
  if (iconEl) iconEl.remove();

  const value = currentValue.trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.className = 'edit-input';

  const originalHTML = element.innerHTML;
  element.innerHTML = '';
  element.appendChild(input);
  input.focus();
  input.select();

  const saveEdit = async () => {
    const newValue = input.value.trim();
    if (newValue === value || newValue === '') {
      element.innerHTML = originalHTML;
      return;
    }

    // Show loading spinner
    element.innerHTML = createLoadingSpinner();

    try {
      await onSave(fieldName, newValue);

      // Update the element with the new value
      element.innerHTML = `${escapeHtml(newValue)} <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>`;

      if (onSuccess) {
        await onSuccess(newValue);
      }

      showNotification('Campo actualizado correctamente', 'success');
    } catch (error) {
      element.innerHTML = originalHTML;
      console.error('Error updating field:', error);
      showNotification('Error al actualizar: ' + error.message, 'error');
    }
  };

  const cancelEdit = () => {
    element.innerHTML = originalHTML;
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });
}

/**
 * Create a loading spinner HTML
 * @param {string} size - Size of the spinner (small, medium, large)
 * @returns {string} HTML string for the spinner
 */
function createLoadingSpinner(size = 'small') {
  const dimensions = {
    small: { width: 16, height: 16 },
    medium: { width: 24, height: 24 },
    large: { width: 32, height: 32 }
  };

  const { width, height } = dimensions[size] || dimensions.small;

  return `
    <svg class="loading-spinner" width="${width}" height="${height}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.75"></path>
    </svg>
  `;
}

/**
 * Create an editable field wrapper with hover effect
 * @param {string} content - The content to display
 * @param {string} onClick - The onclick handler function name
 * @param {string} additionalClasses - Additional CSS classes
 * @returns {string} HTML string for the editable field
 */
function createEditableFieldHTML(content, onClick, additionalClasses = '') {
  return `
    <div class="editable-field ${additionalClasses}" onclick="${onClick}">
      <span class="editable-field-content">
        ${content}
        <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </span>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Make functions globally available
if (typeof window !== 'undefined') {
  window.createInlineEditField = createInlineEditField;
  window.createLoadingSpinner = createLoadingSpinner;
  window.createEditableFieldHTML = createEditableFieldHTML;
  if (!window.escapeHtml) {
    window.escapeHtml = escapeHtml;
  }
}
