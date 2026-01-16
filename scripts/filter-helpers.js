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

  // Load categories into filter
  loadCategoriesIntoFilter();
}

// Close all filter dropdowns
function closeAllFilterDropdowns() {
  const categoryMenu = document.getElementById('filter-category-menu');
  const amountMenu = document.getElementById('filter-amount-menu');
  const categoryBtn = document.getElementById('filter-category-btn');
  const amountBtn = document.getElementById('filter-amount-btn');

  if (categoryMenu) categoryMenu.style.display = 'none';
  if (amountMenu) amountMenu.style.display = 'none';
  if (categoryBtn) categoryBtn.classList.remove('active');
  if (amountBtn) amountBtn.classList.remove('active');
}

// Update category dropdown label
function updateCategoryLabel() {
  const selectedCategories = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all]):checked');
  const label = document.getElementById('filter-category-label');

  if (!label) return;

  if (selectedCategories.length === 0) {
    label.textContent = 'Categoría';
  } else if (selectedCategories.length === 1) {
    label.textContent = '1 categoría';
  } else {
    label.textContent = `${selectedCategories.length} categorías`;
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

      // Add each category
      result.categories.forEach(category => {
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
  if (currentFilters.categories && currentFilters.categories.length > 0) {
    const categoryCheckboxes = document.querySelectorAll('#filter-category-options input[type="checkbox"]:not([data-category-all]):checked');
    const categoryCount = categoryCheckboxes.length;

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
  }

  // Reload transactions with updated filters
  filterTransactions();
}
