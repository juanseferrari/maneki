// =============================================
// RECURRING SERVICES MODULE - Frontend JS
// =============================================

// State
let servicesData = [];
let currentServiceId = null;
let currentSortField = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Use shared global categories array (defined in categories.js)
// Ensure the global array exists
if (!window.categoriesGlobalData) {
  window.categoriesGlobalData = [];
}
// Note: categoriesData is declared in categories.js as window.categoriesGlobalData
// We access it directly via window.categoriesGlobalData to avoid redeclaration

// Category colors mapping
const categoryColors = {
  streaming: '#E91E63',
  utilities: '#4CAF50',
  telecommunications: '#2196F3',
  insurance: '#FF9800',
  subscriptions: '#9C27B0',
  memberships: '#00BCD4',
  housing: '#795548',
  loans: '#F44336',
  other: '#607D8B'
};

// Category labels
const categoryLabels = {
  streaming: 'Streaming',
  utilities: 'Servicios',
  telecommunications: 'Telecomunicaciones',
  insurance: 'Seguros',
  subscriptions: 'Suscripciones',
  memberships: 'Membresías',
  housing: 'Vivienda',
  loans: 'Préstamos',
  other: 'Otro'
};

// Frequency labels
const frequencyLabels = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual'
};

// Status labels and classes
const statusLabels = {
  active: 'Activo',
  up_to_date: 'Al día',
  due_soon: 'Próximo a vencer',
  overdue: 'Vencido',
  paused: 'Pausado',
  cancelled: 'Cancelado'
};

// Service logos - preconfigurados para servicios populares
const SERVICE_LOGOS = {
  // Streaming
  netflix: { url: 'https://cdn.simpleicons.org/netflix/E50914', color: '#E50914' },
  spotify: { url: 'https://cdn.simpleicons.org/spotify/1DB954', color: '#1DB954' },
  disney: { url: 'https://cdn.simpleicons.org/disneyplus/113CCF', color: '#113CCF' },
  'disney+': { url: 'https://cdn.simpleicons.org/disneyplus/113CCF', color: '#113CCF' },
  hbo: { url: 'https://cdn.simpleicons.org/hbomax/000000', color: '#5822B4' },
  'hbo max': { url: 'https://cdn.simpleicons.org/hbomax/000000', color: '#5822B4' },
  max: { url: 'https://cdn.simpleicons.org/hbomax/000000', color: '#5822B4' },
  prime: { url: 'https://cdn.simpleicons.org/primevideo/00A8E1', color: '#00A8E1' },
  'amazon prime': { url: 'https://cdn.simpleicons.org/primevideo/00A8E1', color: '#00A8E1' },
  youtube: { url: 'https://cdn.simpleicons.org/youtube/FF0000', color: '#FF0000' },
  'youtube premium': { url: 'https://cdn.simpleicons.org/youtube/FF0000', color: '#FF0000' },
  crunchyroll: { url: 'https://cdn.simpleicons.org/crunchyroll/F47521', color: '#F47521' },
  twitch: { url: 'https://cdn.simpleicons.org/twitch/9146FF', color: '#9146FF' },

  // Servicios AR
  edenor: { color: '#00529B' },
  edesur: { color: '#003366' },
  metrogas: { color: '#E31837' },
  aysa: { color: '#0066B3' },
  telecentro: { color: '#FF6600' },
  personal: { color: '#00A0DF' },
  movistar: { color: '#019DF4' },
  claro: { color: '#DA291C' },
  fibertel: { color: '#FF6600' },
  cablevision: { color: '#FF6600' },
  flow: { color: '#FF6600' },
  directv: { color: '#00A7E1' },

  // Fintech / Pagos
  mercadopago: { url: 'https://cdn.simpleicons.org/mercadopago/00B1EA', color: '#00B1EA' },
  'mercado pago': { url: 'https://cdn.simpleicons.org/mercadopago/00B1EA', color: '#00B1EA' },
  ualá: { color: '#EC1C24' },
  uala: { color: '#EC1C24' },
  brubank: { color: '#201547' },
  naranja: { color: '#FF6600' },

  // Transporte
  uber: { url: 'https://cdn.simpleicons.org/uber/000000', color: '#000000' },
  cabify: { color: '#7B61FF' },
  rappi: { color: '#FF441F' },
  pedidosya: { color: '#D6006E' },
  'pedidos ya': { color: '#D6006E' },

  // Gaming
  playstation: { url: 'https://cdn.simpleicons.org/playstation/003791', color: '#003791' },
  xbox: { url: 'https://cdn.simpleicons.org/xbox/107C10', color: '#107C10' },
  steam: { url: 'https://cdn.simpleicons.org/steam/000000', color: '#000000' },
  nintendo: { url: 'https://cdn.simpleicons.org/nintendo/E60012', color: '#E60012' },

  // Software / Cloud
  google: { url: 'https://cdn.simpleicons.org/google/4285F4', color: '#4285F4' },
  'google one': { url: 'https://cdn.simpleicons.org/google/4285F4', color: '#4285F4' },
  icloud: { url: 'https://cdn.simpleicons.org/icloud/3693F3', color: '#3693F3' },
  apple: { url: 'https://cdn.simpleicons.org/apple/000000', color: '#000000' },
  microsoft: { url: 'https://cdn.simpleicons.org/microsoft/00A4EF', color: '#00A4EF' },
  office: { url: 'https://cdn.simpleicons.org/microsoftoffice/D83B01', color: '#D83B01' },
  dropbox: { url: 'https://cdn.simpleicons.org/dropbox/0061FF', color: '#0061FF' },
  adobe: { url: 'https://cdn.simpleicons.org/adobe/FF0000', color: '#FF0000' },
  canva: { url: 'https://cdn.simpleicons.org/canva/00C4CC', color: '#00C4CC' },
  notion: { url: 'https://cdn.simpleicons.org/notion/000000', color: '#000000' },

  // Fitness
  gym: { color: '#FF5722' },
  megatlon: { color: '#1E88E5' },
  sportclub: { color: '#43A047' },
};

// Get service logo info based on service name
function getServiceLogo(service) {
  const name = (service.name || '').toLowerCase().trim();
  const normalizedName = (service.normalized_name || '').toLowerCase().trim();

  // Check if icon is explicitly set
  if (service.icon && SERVICE_LOGOS[service.icon]) {
    return SERVICE_LOGOS[service.icon];
  }

  // Try to match by name
  for (const [key, logo] of Object.entries(SERVICE_LOGOS)) {
    if (name.includes(key) || normalizedName.includes(key)) {
      return logo;
    }
  }

  // Return default based on category
  return {
    color: categoryColors[service.category] || categoryColors.other
  };
}

// Render service logo HTML
function renderServiceLogo(service, size = 60) {
  const logo = getServiceLogo(service);
  const initial = (service.name || 'S').charAt(0).toUpperCase();

  if (logo.url) {
    return `
      <div class="service-logo-container" style="width: ${size}px; height: ${size}px;">
        <img src="${logo.url}" alt="${escapeHtml(service.name)}" class="service-logo"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="service-logo-placeholder" style="display: none; background: ${logo.color};">
          ${initial}
        </div>
      </div>
    `;
  }

  return `
    <div class="service-logo-container" style="width: ${size}px; height: ${size}px;">
      <div class="service-logo-placeholder" style="background: ${logo.color};">
        ${initial}
      </div>
    </div>
  `;
}

// =============================================
// INITIALIZATION
// =============================================

async function initServicesModule() {
  // Load categories first, then services
  await loadCategories();
  await loadServices();

  // Add click-outside-to-close for detected modal
  const detectedModal = document.getElementById('detected-modal');
  if (detectedModal) {
    detectedModal.addEventListener('click', (e) => {
      if (e.target === detectedModal) {
        closeDetectedModal();
      }
    });
  }

  // Add click-outside-to-close for service modal
  const serviceModal = document.getElementById('service-modal');
  if (serviceModal) {
    serviceModal.addEventListener('click', (e) => {
      if (e.target === serviceModal) {
        closeServiceModal();
      }
    });
  }
}

/**
 * Load categories from API
 */
async function loadCategories() {
  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch('/api/categories', { headers });

    if (!response.ok) {
      throw new Error('Error loading categories');
    }

    const data = await response.json();

    // Update global array while maintaining reference
    window.categoriesGlobalData.length = 0; // Clear existing
    window.categoriesGlobalData.push(...(data.categories || [])); // Add new categories

    // Populate category dropdown in the modal
    populateCategoryDropdown();

  } catch (error) {
    console.error('Error loading categories:', error);
    // Clear array on error
    window.categoriesGlobalData.length = 0;
  }
}

/**
 * Populate the category dropdown in the service modal
 */
function populateCategoryDropdown() {
  const dropdown = document.getElementById('service-category');
  if (!dropdown) return;

  // Clear existing options
  dropdown.innerHTML = '';

  // Add categories from database
  window.categoriesGlobalData.forEach(category => {
    const option = document.createElement('option');
    option.value = category.id; // Use UUID instead of text
    option.textContent = category.name;
    option.setAttribute('data-color', category.color);
    dropdown.appendChild(option);
  });

  // If no categories, add a default option
  if (window.categoriesGlobalData.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sin categoría';
    dropdown.appendChild(option);
  }
}

// =============================================
// SERVICES CRUD
// =============================================

async function loadServices() {
  const loadingEl = document.getElementById('services-loading');
  const emptyEl = document.getElementById('services-empty');
  const listEl = document.getElementById('services-list');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (listEl) listEl.innerHTML = '';

  try {
    // Get auth headers if available
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    const response = await fetch('/api/services', { headers });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server returned non-JSON response');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading services');
    }

    servicesData = data.services || [];

    if (servicesData.length === 0) {
      if (emptyEl) emptyEl.style.display = 'flex';
    } else {
      renderServicesList();
    }

    // Also load upcoming payments
    loadUpcomingPayments();

  } catch (error) {
    console.error('Error loading services:', error);
    // Show empty state on error
    if (emptyEl) emptyEl.style.display = 'flex';
    if (typeof showNotification === 'function') {
      showNotification('Error al cargar servicios', 'error');
    }
  } finally {
    // Always hide loading regardless of success or error
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

function renderServicesList() {
  const tableBody = document.getElementById('services-table-body');
  const tableContainer = document.getElementById('services-table-container');
  const emptyEl = document.getElementById('services-empty');
  const filterValue = document.getElementById('services-status-filter')?.value || 'all';

  let filteredServices = servicesData;

  // Filter by status (if not 'all', filter to matching status)
  if (filterValue !== 'all') {
    filteredServices = servicesData.filter(s => s.status === filterValue);
  }

  // Apply sorting if a field is selected
  if (currentSortField) {
    filteredServices = [...filteredServices].sort((a, b) => {
      let aValue, bValue;

      switch (currentSortField) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'category':
          aValue = (a.category_name || categoryLabels[a.category] || '').toLowerCase();
          bValue = (b.category_name || categoryLabels[b.category] || '').toLowerCase();
          break;
        case 'frequency':
          // Sort by frequency order: weekly, biweekly, monthly, bimonthly, quarterly, semiannual, annual
          const frequencyOrder = { weekly: 1, biweekly: 2, monthly: 3, bimonthly: 4, quarterly: 5, semiannual: 6, annual: 7 };
          aValue = frequencyOrder[a.frequency] || 999;
          bValue = frequencyOrder[b.frequency] || 999;
          break;
        case 'amount':
          aValue = a.estimated_amount || 0;
          bValue = b.estimated_amount || 0;
          break;
        case 'next_date':
          aValue = a.next_expected_date ? new Date(a.next_expected_date).getTime() : 0;
          bValue = b.next_expected_date ? new Date(b.next_expected_date).getTime() : 0;
          break;
        case 'status':
          // Sort by status priority: overdue, due_soon, up_to_date, active, paused, cancelled
          const statusOrder = { overdue: 1, due_soon: 2, up_to_date: 3, active: 4, paused: 5, cancelled: 6 };
          aValue = statusOrder[a.status] || 999;
          bValue = statusOrder[b.status] || 999;
          break;
        default:
          return 0;
      }

      // Compare values
      if (aValue < bValue) return currentSortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return currentSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  if (filteredServices.length === 0) {
    if (tableBody) tableBody.innerHTML = '';
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'block';

  if (tableBody) {
    tableBody.innerHTML = filteredServices.map(service => {
      const statusLabel = statusLabels[service.status] || service.status || 'Activo';
      const statusClass = service.status || 'active';

      // Use category data from JOIN (category_name, category_color) or fallback to old fields
      const categoryName = service.category_name || categoryLabels[service.category] || service.category || 'Otro';
      const categoryColor = service.category_color || service.color || categoryColors[service.category] || '#607D8B';

      return `
        <tr class="service-row ${statusClass}" onclick="openServiceDetail('${service.id}')">
          <td class="service-name-cell">
            <div class="service-name-wrapper">
              <span class="service-color-dot" style="background: ${categoryColor}"></span>
              <span class="service-name-text">${escapeHtml(service.name)}</span>
            </div>
          </td>
          <td>
            <span class="service-category-badge" style="background: ${categoryColor}20; color: ${categoryColor}">
              ${categoryName}
            </span>
          </td>
          <td>${frequencyLabels[service.frequency] || service.frequency}</td>
          <td class="service-amount-cell">
            ${service.estimated_amount ? formatCurrency(service.estimated_amount, service.currency) : 'Variable'}
          </td>
          <td>${service.next_expected_date ? formatDate(service.next_expected_date) : '-'}</td>
          <td>
            <span class="service-status-badge ${statusClass}">${statusLabel}</span>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function filterServices() {
  renderServicesList();
}

/**
 * Sort services by field
 */
function sortServices(field) {
  // Toggle direction if clicking the same field
  if (currentSortField === field) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortDirection = 'asc';
  }

  // Update sort icons
  updateSortIcons();

  // Re-render with sorted data
  renderServicesList();
}

/**
 * Update sort icons in table headers
 */
function updateSortIcons() {
  // Clear all icons
  document.querySelectorAll('.sort-icon').forEach(icon => {
    icon.innerHTML = '';
  });

  // Set active icon
  if (currentSortField) {
    const icon = document.getElementById(`sort-icon-${currentSortField}`);
    if (icon) {
      icon.innerHTML = currentSortDirection === 'asc' ? '▲' : '▼';
    }
  }
}

async function toggleServiceStatus(serviceId) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  const newStatus = service.status === 'active' ? 'paused' : 'active';

  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch(`/api/services/${serviceId}`, {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (!response.ok) {
      throw new Error('Error updating service');
    }

    service.status = newStatus;
    renderServicesList();
    showNotification(`Servicio ${newStatus === 'active' ? 'activado' : 'pausado'}`, 'success');

  } catch (error) {
    console.error('Error toggling service status:', error);
    showNotification('Error al actualizar el servicio', 'error');
  }
}

// =============================================
// ADD/EDIT SERVICE MODAL
// =============================================

function openAddServiceModal() {
  currentServiceId = null;
  document.getElementById('service-modal-title').textContent = 'Agregar Servicio';
  document.getElementById('service-form').reset();
  document.getElementById('service-id').value = '';
  document.getElementById('service-color').value = '#607D8B';

  // Populate category dropdown
  populateCategoryDropdown();

  document.getElementById('service-modal').classList.add('active');
}

function openEditServiceModal(serviceId) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  currentServiceId = serviceId;
  document.getElementById('service-modal-title').textContent = 'Editar Servicio';
  document.getElementById('service-id').value = service.id;
  document.getElementById('service-name').value = service.name || '';

  // Populate category dropdown before setting value
  populateCategoryDropdown();

  // Use category_id
  const categoryValue = service.category_id || '';
  document.getElementById('service-category').value = categoryValue;

  document.getElementById('service-frequency').value = service.frequency || 'monthly';
  document.getElementById('service-day').value = service.typical_day_of_month || '';
  document.getElementById('service-amount').value = service.estimated_amount || '';
  document.getElementById('service-currency').value = service.currency || 'ARS';
  document.getElementById('service-amount-varies').checked = service.amount_varies || false;
  document.getElementById('service-payment-method').value = service.payment_method || '';
  document.getElementById('service-color').value = service.color || categoryColors[service.category] || '#607D8B';
  document.getElementById('service-notes').value = service.notes || '';
  document.getElementById('service-modal').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('service-modal').classList.remove('active');
  currentServiceId = null;
}

async function saveService(event) {
  event.preventDefault();

  const categoryValue = document.getElementById('service-category').value;

  const serviceData = {
    name: document.getElementById('service-name').value,
    category_id: categoryValue || null, // Use category_id (UUID)
    frequency: document.getElementById('service-frequency').value,
    typical_day_of_month: parseInt(document.getElementById('service-day').value) || null,
    estimated_amount: parseFloat(document.getElementById('service-amount').value) || null,
    currency: document.getElementById('service-currency').value,
    amount_varies: document.getElementById('service-amount-varies').checked,
    payment_method: document.getElementById('service-payment-method').value || null,
    color: document.getElementById('service-color').value,
    notes: document.getElementById('service-notes').value || null
  };

  const serviceId = document.getElementById('service-id').value;

  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    let response;
    if (serviceId) {
      // Update existing
      response = await fetch(`/api/services/${serviceId}`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      });
    } else {
      // Create new
      response = await fetch('/api/services', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      });
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error saving service');
    }

    const result = await response.json();
    const createdServiceId = serviceId || result.service?.id;

    closeServiceModal();
    await loadServices();

    // If there's a pending transaction to link (from transaction detail)
    if (!serviceId && window.pendingTransactionToLink && createdServiceId) {
      try {
        // Automatically link the transaction to the newly created service
        const linkResponse = await fetch(`/api/services/${createdServiceId}/payments`, {
          method: 'POST',
          headers: { ...authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transaction_id: window.pendingTransactionToLink,
            matched_by: 'manual',
            match_confidence: 100
          })
        });

        const linkResult = await linkResponse.json();

        if (linkResult.success) {
          showNotification('Servicio creado y transacción vinculada correctamente', 'success');

          // Reload the transaction detail if the function exists
          if (typeof showTransactionDetail === 'function') {
            showTransactionDetail(window.pendingTransactionToLink);
          }
        } else {
          showNotification('Servicio creado, pero error al vincular transacción', 'warning');
        }

        // Clear pending transaction
        window.pendingTransactionToLink = null;

      } catch (linkError) {
        console.error('Error linking transaction to new service:', linkError);
        showNotification('Servicio creado, pero error al vincular transacción', 'warning');
        window.pendingTransactionToLink = null;
      }
    } else {
      showNotification(serviceId ? 'Servicio actualizado' : 'Servicio creado', 'success');
    }

  } catch (error) {
    console.error('Error saving service:', error);
    showNotification('Error al guardar el servicio', 'error');
  }
}

// =============================================
// SERVICE DETAIL SIDEBAR (reusing right-sidebar)
// =============================================

async function openServiceDetail(serviceId) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  currentServiceId = serviceId;

  // Use the existing right-sidebar from upload-supabase.js
  const rightSidebar = document.getElementById('right-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const sidebarTitle = document.getElementById('right-sidebar-title');
  const sidebarContent = document.getElementById('right-sidebar-content');

  if (!rightSidebar || !sidebarContent) {
    console.error('Right sidebar not found');
    return;
  }

  // Open sidebar
  rightSidebar.classList.add('open');
  sidebarOverlay.classList.add('active');
  sidebarTitle.textContent = 'Detalle del Servicio';

  // Show loading
  sidebarContent.innerHTML = '<div class="detail-loading"><div class="spinner"></div><span>Cargando...</span></div>';

  // Render service detail
  const logoHtml = renderServiceLogo(service, 60);
  const statusLabel = statusLabels[service.status] || service.status || 'Activo';
  const statusClass = service.status || 'active';

  // Use category data from JOIN or fallback
  const categoryName = service.category_name || categoryLabels[service.category] || service.category || 'Otro';
  const categoryColor = service.category_color || service.color || categoryColors[service.category] || '#607D8B';

  sidebarContent.innerHTML = `
    <div class="service-detail-sidebar">
      <!-- Header with logo -->
      <div class="service-detail-header">
        ${logoHtml}
        <div class="service-detail-info">
          <h2 class="service-detail-name editable-service-field" onclick="editServiceField('${service.id}', 'name', this)">
            ${escapeHtml(service.name)}
            <svg class="edit-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-left: 8px; opacity: 0.6;">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </h2>
          <div class="service-detail-meta">
            <span class="service-category-badge editable-service-field"
                  style="background: ${categoryColor}20; color: ${categoryColor}; cursor: pointer;"
                  onclick="editServiceCategory('${service.id}', this)"
                  data-category-id="${service.category_id || ''}"
                  data-category-name="${categoryName}">
              ${categoryName}
              <svg class="edit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-left: 6px; opacity: 0.7;">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </span>
            <span class="service-frequency-badge">${frequencyLabels[service.frequency] || service.frequency}</span>
          </div>
        </div>
      </div>

      <!-- Summary Grid -->
      <div class="service-summary-section">
        <h3 class="detail-section-title">Resumen</h3>
        <div class="service-summary-grid">
          <div class="summary-card">
            <div class="summary-label">Monto estimado</div>
            <div class="summary-value">${service.estimated_amount ? formatCurrency(service.estimated_amount, service.currency) : 'Variable'}${service.amount_varies ? ' <span class="varies-badge">variable</span>' : ''}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Próximo pago</div>
            <div class="summary-value">${service.next_expected_date ? formatDate(service.next_expected_date) : 'No programado'}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Estado</div>
            <div class="summary-value"><span class="status-badge ${statusClass}">${statusLabel}</span></div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Día de cobro</div>
            <div class="summary-value">${service.typical_day_of_month ? `Día ${service.typical_day_of_month}` : 'No especificado'}</div>
          </div>
        </div>
      </div>

      <!-- Additional Info -->
      <div class="service-info-section">
        <div class="info-row">
          <span class="info-label">Método de pago</span>
          <span class="info-value">${getPaymentMethodLabel(service.payment_method)}</span>
        </div>
        ${service.min_amount && service.max_amount ? `
        <div class="info-row">
          <span class="info-label">Rango de montos</span>
          <span class="info-value">${formatCurrency(service.min_amount, service.currency)} - ${formatCurrency(service.max_amount, service.currency)}</span>
        </div>
        ` : ''}
        ${service.first_payment_date ? `
        <div class="info-row">
          <span class="info-label">Primer pago registrado</span>
          <span class="info-value">${formatDate(service.first_payment_date)}</span>
        </div>
        ` : ''}
        ${service.last_payment_date ? `
        <div class="info-row">
          <span class="info-label">Último pago</span>
          <span class="info-value">${formatDate(service.last_payment_date)}</span>
        </div>
        ` : ''}
        ${service.notes ? `
        <div class="info-row notes-row">
          <span class="info-label">Notas</span>
          <span class="info-value">${escapeHtml(service.notes)}</span>
        </div>
        ` : ''}
      </div>

      <!-- Payment History -->
      <div class="service-payments-section">
        <div class="section-header-with-action">
          <h3 class="detail-section-title">Historial de Pagos</h3>
          <button class="btn-link-small" onclick="openLinkTransactionModal('${service.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Vincular transacción
          </button>
        </div>
        <div class="service-payments-list" id="sidebar-payments-list">
          <div class="loading-small">Cargando historial...</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="service-detail-actions">
        <button class="btn-danger" onclick="deleteServiceFromSidebar()">
          Eliminar
        </button>
      </div>
    </div>
  `;

  // Load payment history
  await loadServicePaymentsSidebar(serviceId);
}

async function loadServicePaymentsSidebar(serviceId) {
  const listEl = document.getElementById('sidebar-payments-list');
  if (!listEl) return;

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch(`/api/services/${serviceId}/payments?includeTransactionDetails=true`, { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading payments');
    }

    const payments = data.payments || [];

    if (payments.length === 0) {
      listEl.innerHTML = '<p class="no-payments">No hay pagos registrados aún. Vincula transacciones para ver el historial.</p>';
      return;
    }

    listEl.innerHTML = payments.map(payment => {
      const isLinked = !!payment.transaction_id;
      const matchedByAuto = payment.matched_by === 'auto';
      const confidence = payment.match_confidence || 0;

      return `
        <div class="payment-history-item ${payment.is_predicted ? 'predicted' : ''} ${isLinked ? 'linked' : ''}">
          <div class="payment-main-info">
            <div class="payment-info">
              <div class="payment-date">${formatDate(payment.payment_date)}</div>
              <div class="payment-meta">
                <span class="payment-status-text ${payment.status}">
                  ${payment.is_predicted ? '⏳ Predicho' : payment.status === 'paid' ? '✅ Pagado' : '⏳ Pendiente'}
                </span>
                ${isLinked ? `
                  <span class="payment-link-badge">
                    🔗 ${matchedByAuto ? `Auto (${confidence}%)` : 'Manual'}
                  </span>
                ` : ''}
              </div>
            </div>
            <div class="payment-amount ${payment.amount < 0 ? 'negative' : ''}">${formatCurrency(Math.abs(payment.amount), payment.currency)}</div>
          </div>
          ${isLinked ? `
            <div class="payment-actions">
              <button class="btn-link-tiny" onclick="showTransactionFromPayment('${payment.transaction_id}')" title="Ver transacción">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                Ver
              </button>
              <button class="btn-link-tiny danger" onclick="unlinkPayment('${payment.id}', '${serviceId}')" title="Desvincular">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Desvincular
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading payments:', error);
    listEl.innerHTML = '<p class="error">Error al cargar historial</p>';
  }
}

function closeServiceDetailSidebar() {
  const rightSidebar = document.getElementById('right-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (rightSidebar) rightSidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  currentServiceId = null;
}

function editServiceFromSidebar() {
  if (currentServiceId) {
    closeServiceDetailSidebar();
    openEditServiceModal(currentServiceId);
  }
}

async function toggleServiceStatusFromSidebar() {
  if (!currentServiceId) return;
  const service = servicesData.find(s => s.id === currentServiceId);
  if (!service) return;

  const newStatus = service.status === 'active' ? 'paused' : 'active';
  await toggleServiceStatus(currentServiceId, newStatus);
  closeServiceDetailSidebar();
}

async function deleteServiceFromSidebar() {
  if (!currentServiceId) return;

  if (!confirm('¿Estás seguro de que quieres eliminar este servicio?')) return;

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch(`/api/services/${currentServiceId}`, {
      method: 'DELETE',
      headers
    });

    if (!response.ok) {
      throw new Error('Error deleting service');
    }

    closeServiceDetailSidebar();
    await loadServices();
    showNotification('Servicio eliminado', 'success');

  } catch (error) {
    console.error('Error deleting service:', error);
    showNotification('Error al eliminar el servicio', 'error');
  }
}

// =============================================
// AUTO-DETECTION
// =============================================

async function detectRecurringServices() {
  showNotification('Analizando transacciones...', 'info');

  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch('/api/services/detect', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error detecting services');
    }

    const detected = data.detected || [];

    if (detected.length === 0) {
      showNotification('No se encontraron nuevos servicios recurrentes', 'info');
      return;
    }

    renderDetectedServices(detected);
    document.getElementById('detected-modal').classList.add('active');

  } catch (error) {
    console.error('Error detecting services:', error);
    showNotification('Error al detectar servicios', 'error');
  }
}

function renderDetectedServices(detected) {
  const listEl = document.getElementById('detected-services-list');

  listEl.innerHTML = detected.map((service, index) => {
    const confidence = service.auto_detection_confidence || service.confidence || 0;
    return `
    <div class="detected-service-item" data-index="${index}">
      <label class="detected-checkbox">
        <input type="checkbox" checked data-service='${JSON.stringify(service)}'>
      </label>
      <div class="detected-info">
        <h4>${escapeHtml(service.name)}</h4>
        <div class="detected-meta">
          <span>${frequencyLabels[service.frequency] || service.frequency}</span>
          <span>${formatCurrency(service.estimated_amount, service.currency)}</span>
          <span>${service.occurrence_count} ocurrencias</span>
        </div>
        <div class="detected-confidence">
          ${Math.round(confidence)}% confianza
        </div>
      </div>
    </div>
  `;
  }).join('');
}

function closeDetectedModal() {
  document.getElementById('detected-modal').classList.remove('active');
}

async function saveSelectedDetected() {
  const checkboxes = document.querySelectorAll('#detected-services-list input[type="checkbox"]:checked');
  const selectedServices = [];

  checkboxes.forEach(cb => {
    const serviceData = JSON.parse(cb.dataset.service);
    selectedServices.push(serviceData);
  });

  if (selectedServices.length === 0) {
    showNotification('Selecciona al menos un servicio', 'warning');
    return;
  }

  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch('/api/services/save-detected', {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ services: selectedServices })
    });

    if (!response.ok) {
      throw new Error('Error saving detected services');
    }

    closeDetectedModal();
    await loadServices();
    showNotification(`${selectedServices.length} servicio(s) agregado(s)`, 'success');

  } catch (error) {
    console.error('Error saving detected services:', error);
    showNotification('Error al guardar servicios', 'error');
  }
}

// =============================================
// UPCOMING PAYMENTS
// =============================================

async function loadUpcomingPayments() {
  const listEl = document.getElementById('upcoming-payments-list');
  if (!listEl) return;

  try {
    const authHeaders = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch('/api/services/calendar/upcoming', { headers: authHeaders });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading upcoming payments');
    }

    const payments = data.payments || [];

    if (payments.length === 0) {
      listEl.innerHTML = '<p class="no-upcoming">No hay pagos próximos</p>';
      return;
    }

    listEl.innerHTML = payments.map(p => `
      <div class="upcoming-payment-item">
        <div class="upcoming-date">
          <span class="upcoming-day">${new Date(p.payment_date).getDate()}</span>
          <span class="upcoming-month">${new Date(p.payment_date).toLocaleDateString('es-AR', { month: 'short' })}</span>
        </div>
        <div class="upcoming-info">
          <span class="upcoming-name">${escapeHtml(p.service_name)}</span>
          <span class="upcoming-amount">${formatCurrency(p.amount, p.currency)}</span>
        </div>
        ${p.is_predicted ? '<span class="predicted-tag">Est.</span>' : ''}
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading upcoming payments:', error);
  }
}

// =============================================
// INLINE EDITING
// =============================================

async function editServiceField(serviceId, fieldName, element) {
  const currentValue = element.textContent.trim();

  await createInlineEditField({
    elementId: serviceId,
    fieldName: fieldName,
    element: element,
    currentValue: currentValue,
    onSave: async (field, newValue) => {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/services/${serviceId}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [field]: newValue })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Error desconocido');
      }

      // Update the service in the local array
      const service = servicesData.find(s => s.id === serviceId);
      if (service) {
        service[field] = newValue;
      }
    },
    onSuccess: async () => {
      // Reload the services list to reflect the change
      await loadServices();
    }
  });
}

/**
 * Edit service category with custom dropdown selector
 */
async function editServiceCategory(serviceId, element) {
  const currentCategoryId = element.getAttribute('data-category-id') || '';

  // Use the badge element itself as the container
  const categoryDisplay = element;

  // Sort categories alphabetically
  const sortedCategories = [...window.categoriesGlobalData].sort((a, b) => {
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  // Create custom dropdown
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
      <div class="category-edit-option ${!currentCategoryId ? 'selected' : ''}" data-category-id="">
        <span class="category-dot" style="background: #9CA3AF"></span>
        <span>Sin categoría</span>
      </div>
    </div>
  `;

  const originalHTML = categoryDisplay.innerHTML;
  categoryDisplay.innerHTML = '';
  categoryDisplay.appendChild(dropdown);

  const searchInput = dropdown.querySelector('.category-search-input');
  const options = dropdown.querySelectorAll('.category-edit-option');

  // Focus search input
  setTimeout(() => searchInput.focus(), 10);

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    options.forEach(option => {
      const text = option.textContent.toLowerCase();
      option.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
  });

  // Click outside to close
  const closeDropdown = (e) => {
    if (!categoryDisplay.contains(e.target)) {
      categoryDisplay.innerHTML = originalHTML;
      document.removeEventListener('click', closeDropdown);
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);

  // Category selection
  options.forEach(option => {
    option.addEventListener('click', async () => {
      const newCategoryId = option.getAttribute('data-category-id');

      // If unchanged, just close
      if (newCategoryId === currentCategoryId) {
        categoryDisplay.innerHTML = originalHTML;
        document.removeEventListener('click', closeDropdown);
        return;
      }

      // Show loading
      categoryDisplay.innerHTML = '<div class="spinner"></div>';
      document.removeEventListener('click', closeDropdown);

      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`/api/services/${serviceId}`, {
          method: 'PUT',
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ category_id: newCategoryId || null })
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Error desconocido');
        }

        // Reload service detail
        await openServiceDetail(serviceId);
        showNotification('Categoría actualizada correctamente', 'success');

      } catch (error) {
        categoryDisplay.innerHTML = originalHTML;
        console.error('Error updating category:', error);
        showNotification('Error al actualizar categoría: ' + error.message, 'error');
      }
    });
  });

  // Escape key to cancel
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      categoryDisplay.innerHTML = originalHTML;
      document.removeEventListener('click', closeDropdown);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// =============================================
// UTILITIES
// =============================================

function formatCurrency(amount, currency = 'ARS') {
  if (amount === null || amount === undefined) return '-';

  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return formatter.format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPaymentMethodLabel(method) {
  const labels = {
    debit_auto: 'Débito automático',
    credit_card: 'Tarjeta de crédito',
    manual: 'Pago manual',
    transfer: 'Transferencia'
  };
  return labels[method] || 'No especificado';
}

// Use the global showNotification from the main app if available
if (typeof window.showNotification !== 'function') {
  window.showNotification = function(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // Simple fallback notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 12px 24px; border-radius: 8px; z-index: 10000; animation: fadeIn 0.3s;';
    if (type === 'success') notification.style.background = '#4CAF50';
    else if (type === 'error') notification.style.background = '#f44336';
    else if (type === 'warning') notification.style.background = '#FF9800';
    else notification.style.background = '#2196F3';
    notification.style.color = 'white';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
  };
}

// =============================================
// SECTION INITIALIZATION
// =============================================

// Initialize services when section is shown
// =============================================
// SERVICE-TRANSACTION LINKING FUNCTIONS
// =============================================

/**
 * Show transaction detail from payment
 */
function showTransactionFromPayment(transactionId) {
  // Close service sidebar
  closeServiceDetailSidebar();

  // Open transaction detail (from upload-supabase.js)
  if (typeof showTransactionDetail === 'function') {
    showTransactionDetail(transactionId);
  }
}

/**
 * Unlink a payment from service
 */
async function unlinkPayment(paymentId, serviceId) {
  if (!confirm('¿Desvincular esta transacción del servicio?')) {
    return;
  }

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch(`/api/services/payments/${paymentId}/unlink`, {
      method: 'DELETE',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al desvincular');
    }

    showNotification('Transacción desvinculada correctamente', 'success');

    // Reload payment history
    await loadServicePaymentsSidebar(serviceId);
  } catch (error) {
    console.error('Error unlinking payment:', error);
    showNotification('Error al desvincular: ' + error.message, 'error');
  }
}

/**
 * Open modal to link transaction to service
 */
async function openLinkTransactionModal(serviceId) {
  // Create modal HTML
  const modalHTML = `
    <div class="modal-overlay" id="link-transaction-modal">
      <div class="modal-container">
        <div class="modal-header">
          <h2>Vincular Transacción</h2>
          <button class="modal-close" onclick="closeLinkTransactionModal()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p>Busca y selecciona una transacción para vincular a este servicio:</p>

          <div class="search-input-group">
            <input type="text" id="link-tx-search" placeholder="Buscar por descripción..." class="search-input">
            <input type="date" id="link-tx-date-from" class="date-input" placeholder="Desde">
            <input type="date" id="link-tx-date-to" class="date-input" placeholder="Hasta">
          </div>

          <div id="link-tx-results" class="link-tx-results">
            <div class="loading-small">Cargando transacciones...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Append to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);

  // Load transactions
  await loadTransactionsForLinking(serviceId);

  // Add event listeners
  document.getElementById('link-tx-search').addEventListener('input', () => filterLinkTransactions(serviceId));
  document.getElementById('link-tx-date-from').addEventListener('change', () => filterLinkTransactions(serviceId));
  document.getElementById('link-tx-date-to').addEventListener('change', () => filterLinkTransactions(serviceId));
}

/**
 * Close link transaction modal
 */
function closeLinkTransactionModal() {
  const modal = document.getElementById('link-transaction-modal');
  if (modal) modal.remove();
}

/**
 * Load transactions for linking
 */
async function loadTransactionsForLinking(serviceId) {
  const resultsDiv = document.getElementById('link-tx-results');
  if (!resultsDiv) return;

  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};

    // Get transactions (last 90 days, unlinked only)
    const response = await fetch('/api/transactions?limit=100', { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading transactions');
    }

    window.linkTransactionsData = data.transactions || [];
    await filterLinkTransactions(serviceId);

  } catch (error) {
    console.error('Error loading transactions:', error);
    resultsDiv.innerHTML = '<p class="error">Error al cargar transacciones</p>';
  }
}

/**
 * Filter and render transactions for linking
 */
async function filterLinkTransactions(serviceId) {
  const resultsDiv = document.getElementById('link-tx-results');
  if (!resultsDiv || !window.linkTransactionsData) return;

  const search = document.getElementById('link-tx-search')?.value.toLowerCase() || '';
  const dateFrom = document.getElementById('link-tx-date-from')?.value || '';
  const dateTo = document.getElementById('link-tx-date-to')?.value || '';

  let filtered = window.linkTransactionsData.filter(tx => {
    if (search && !tx.description.toLowerCase().includes(search)) return false;
    if (dateFrom && tx.transaction_date < dateFrom) return false;
    if (dateTo && tx.transaction_date > dateTo) return false;
    return true;
  });

  if (filtered.length === 0) {
    resultsDiv.innerHTML = '<p class="no-results">No se encontraron transacciones</p>';
    return;
  }

  resultsDiv.innerHTML = filtered.slice(0, 20).map(tx => {
    const isNegative = tx.amount < 0;
    return `
      <div class="link-tx-item" onclick="linkTransactionToService('${serviceId}', '${tx.id}', ${Math.abs(tx.amount)}, '${tx.transaction_date}')">
        <div class="link-tx-info">
          <div class="link-tx-desc">${escapeHtml(tx.description || 'Sin descripción')}</div>
          <div class="link-tx-date">${formatDate(tx.transaction_date)}</div>
        </div>
        <div class="link-tx-amount ${isNegative ? 'negative' : 'positive'}">
          ${isNegative ? '-' : '+'}${formatCurrency(Math.abs(tx.amount), tx.currency || 'ARS')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Link transaction to service
 */
async function linkTransactionToService(serviceId, transactionId, amount, date) {
  try {
    const headers = typeof getAuthHeaders === 'function' ? await getAuthHeaders() : {};
    const response = await fetch(`/api/services/${serviceId}/link`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transactionId,
        paymentData: {
          payment_date: date,
          amount: amount,
          currency: 'ARS',
          status: 'paid',
          matched_by: 'manual',
          match_confidence: 100
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al vincular');
    }

    showNotification('Transacción vinculada correctamente', 'success');
    closeLinkTransactionModal();

    // Reload payment history
    await loadServicePaymentsSidebar(serviceId);

  } catch (error) {
    console.error('Error linking transaction:', error);
    showNotification('Error al vincular: ' + error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const serviciosMenuItem = document.querySelector('[data-section="servicios"]');
  if (serviciosMenuItem) {
    serviciosMenuItem.addEventListener('click', function() {
      setTimeout(initServicesModule, 100);
    });
  }

  // Check if URL has servicios hash
  if (window.location.hash.includes('servicios')) {
    setTimeout(initServicesModule, 500);
  }
});
