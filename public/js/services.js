// =============================================
// RECURRING SERVICES MODULE - Frontend JS
// =============================================

// State
let servicesData = [];
let currentServiceId = null;

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
  // Load services when section becomes visible
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
  const listEl = document.getElementById('services-list');
  const emptyEl = document.getElementById('services-empty');
  const filterValue = document.getElementById('services-status-filter')?.value || 'active';

  let filteredServices = servicesData;
  if (filterValue === 'active') {
    filteredServices = servicesData.filter(s => s.status === 'active');
  } else if (filterValue === 'paused') {
    filteredServices = servicesData.filter(s => s.status === 'paused');
  }

  if (filteredServices.length === 0) {
    if (listEl) listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  if (listEl) {
    listEl.innerHTML = filteredServices.map(service => `
      <div class="service-card ${service.status}" onclick="openServiceDetail('${service.id}')" style="--service-color: ${service.color || categoryColors[service.category] || '#607D8B'}">
        <div class="service-color-bar"></div>
        <div class="service-info">
          <div class="service-header">
            <h4 class="service-name">${escapeHtml(service.name)}</h4>
            ${service.status === 'paused' ? '<span class="service-badge paused">Pausado</span>' : ''}
          </div>
          <div class="service-meta">
            <span class="service-category">${categoryLabels[service.category] || service.category}</span>
            <span class="service-frequency">${frequencyLabels[service.frequency] || service.frequency}</span>
          </div>
          <div class="service-amount">
            ${service.estimated_amount ? formatCurrency(service.estimated_amount, service.currency) : 'Monto variable'}
            ${service.amount_varies ? '<span class="amount-varies">(variable)</span>' : ''}
          </div>
          ${service.next_expected_date ? `
            <div class="service-next-date">
              Próximo: ${formatDate(service.next_expected_date)}
            </div>
          ` : ''}
        </div>
        <div class="service-actions">
          <button class="service-action-btn" onclick="event.stopPropagation(); toggleServiceStatus('${service.id}')" title="${service.status === 'active' ? 'Pausar' : 'Activar'}">
            ${service.status === 'active' ? `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ` : `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            `}
          </button>
        </div>
      </div>
    `).join('');
  }
}

function filterServices() {
  renderServicesList();
}

async function toggleServiceStatus(serviceId) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  const newStatus = service.status === 'active' ? 'paused' : 'active';

  try {
    const response = await fetch(`/api/services/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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
  document.getElementById('service-modal').classList.add('active');
}

function openEditServiceModal(serviceId) {
  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  currentServiceId = serviceId;
  document.getElementById('service-modal-title').textContent = 'Editar Servicio';
  document.getElementById('service-id').value = service.id;
  document.getElementById('service-name').value = service.name || '';
  document.getElementById('service-category').value = service.category || 'other';
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

  const serviceData = {
    name: document.getElementById('service-name').value,
    category: document.getElementById('service-category').value,
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
    let response;
    if (serviceId) {
      // Update existing
      response = await fetch(`/api/services/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      });
    } else {
      // Create new
      response = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceData)
      });
    }

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Error saving service');
    }

    closeServiceModal();
    await loadServices();
    showNotification(serviceId ? 'Servicio actualizado' : 'Servicio creado', 'success');

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
  const statusLabel = service.status === 'active' ? 'Activo' : service.status === 'paused' ? 'Pausado' : 'Cancelado';
  const statusClass = service.status;

  sidebarContent.innerHTML = `
    <div class="service-detail-sidebar">
      <!-- Header with logo -->
      <div class="service-detail-header">
        ${logoHtml}
        <div class="service-detail-info">
          <h2 class="service-detail-name">${escapeHtml(service.name)}</h2>
          <div class="service-detail-meta">
            <span class="service-category-badge" style="background: ${categoryColors[service.category] || categoryColors.other}20; color: ${categoryColors[service.category] || categoryColors.other}">
              ${categoryLabels[service.category] || service.category || 'Otro'}
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
        <h3 class="detail-section-title">Historial de Pagos</h3>
        <div class="service-payments-list" id="sidebar-payments-list">
          <div class="loading-small">Cargando historial...</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="service-detail-actions">
        <button class="btn-secondary" onclick="toggleServiceStatusFromSidebar()">
          ${service.status === 'active' ? 'Pausar' : 'Activar'}
        </button>
        <button class="btn-primary" onclick="editServiceFromSidebar()">
          Editar
        </button>
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
    const response = await fetch(`/api/services/${serviceId}/payments`, { headers });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading payments');
    }

    const payments = data.payments || [];

    if (payments.length === 0) {
      listEl.innerHTML = '<p class="no-payments">No hay pagos registrados</p>';
      return;
    }

    listEl.innerHTML = payments.map(payment => `
      <div class="payment-history-item ${payment.is_predicted ? 'predicted' : ''}">
        <div class="payment-info">
          <div class="payment-date">${formatDate(payment.payment_date)}</div>
          <div class="payment-status-text ${payment.status}">
            ${payment.is_predicted ? 'Predicho' : payment.status === 'paid' ? 'Pagado' : 'Pendiente'}
          </div>
        </div>
        <div class="payment-amount ${payment.amount < 0 ? 'negative' : ''}">${formatCurrency(Math.abs(payment.amount), payment.currency)}</div>
      </div>
    `).join('');

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
    const response = await fetch('/api/services/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
    const response = await fetch('/api/services/save-detected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch('/api/services/calendar/upcoming');
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
