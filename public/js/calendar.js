// =============================================
// CALENDAR PAGE MODULE - Frontend JS
// =============================================

// State
let calendarPageDate = new Date();
let calendarPagePayments = {};
let calendarSelectedDate = null;

// =============================================
// INITIALIZATION
// =============================================

async function initCalendarModule() {
  calendarPageDate = new Date();
  calendarSelectedDate = null;

  // Render initial calendar
  renderCalendarPage();

  // Load payments data
  await loadCalendarPagePayments();
  renderCalendarPage();

  // Load upcoming payments
  await loadCalendarUpcoming();

  // Update month summary
  updateMonthSummary();
}

// =============================================
// CALENDAR RENDERING
// =============================================

function changeCalendarMonth(delta) {
  calendarPageDate.setMonth(calendarPageDate.getMonth() + delta);
  calendarSelectedDate = null;
  loadCalendarPagePayments().then(() => {
    renderCalendarPage();
    updateMonthSummary();
  });

  // Reset selected day view
  const titleEl = document.getElementById('calendar-selected-day-title');
  const contentEl = document.getElementById('calendar-selected-day-content');
  if (titleEl) titleEl.textContent = 'Selecciona un día';
  if (contentEl) contentEl.innerHTML = '<p class="no-selection">Haz clic en un día para ver los pagos programados</p>';
}

function renderCalendarPage() {
  const year = calendarPageDate.getFullYear();
  const month = calendarPageDate.getMonth();

  // Update title
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const titleEl = document.getElementById('calendar-page-month-title');
  if (titleEl) titleEl.textContent = `${monthNames[month]} ${year}`;

  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Build calendar days
  const daysContainer = document.getElementById('calendar-page-days');
  if (!daysContainer) return;

  let html = '';

  // Empty cells for days before first day of month
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const payments = calendarPagePayments[dateStr] || [];
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const isSelected = calendarSelectedDate === dateStr;
    const isPast = new Date(dateStr) < new Date(today.toDateString());

    let dayClass = 'calendar-day';
    if (isToday) dayClass += ' today';
    if (isSelected) dayClass += ' selected';
    if (payments.length > 0) dayClass += ' has-payments';
    if (isPast && payments.length > 0) dayClass += ' past';

    html += `
      <div class="${dayClass}" onclick="selectCalendarDay('${dateStr}')">
        <span class="day-number">${day}</span>
        ${payments.length > 0 ? `
          <div class="day-payments-preview">
            ${payments.slice(0, 2).map(p => `
              <div class="payment-preview-item">
                <span class="payment-preview-dot" style="background-color: ${p.service_color || '#607D8B'}"></span>
                <span>${escapeHtmlCalendar(p.service_name)}</span>
              </div>
            `).join('')}
            ${payments.length > 2 ? `<span class="payment-preview-more">+${payments.length - 2} más</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  daysContainer.innerHTML = html;
}

function selectCalendarDay(dateStr) {
  calendarSelectedDate = dateStr;
  renderCalendarPage();
  showSelectedDayPayments(dateStr);
}

function showSelectedDayPayments(dateStr) {
  const payments = calendarPagePayments[dateStr] || [];
  const titleEl = document.getElementById('calendar-selected-day-title');
  const contentEl = document.getElementById('calendar-selected-day-content');

  const date = new Date(dateStr + 'T12:00:00');
  const formattedDate = date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  if (titleEl) titleEl.textContent = `Pagos del ${formattedDate}`;

  if (payments.length === 0) {
    if (contentEl) contentEl.innerHTML = '<p class="no-selection">No hay pagos programados para este día</p>';
    return;
  }

  if (contentEl) {
    contentEl.innerHTML = payments.map(p => `
      <div class="selected-payment-item">
        <div class="selected-payment-color" style="--service-color: ${p.service_color || '#607D8B'}"></div>
        <div class="selected-payment-info">
          <div class="selected-payment-name">${escapeHtmlCalendar(p.service_name)}</div>
          <div class="selected-payment-amount">${formatCurrencyCalendar(p.amount, p.currency)}</div>
        </div>
        ${p.is_predicted ? '<span class="predicted-badge">Est.</span>' : ''}
      </div>
    `).join('');
  }
}

// =============================================
// DATA LOADING
// =============================================

async function loadCalendarPagePayments() {
  const year = calendarPageDate.getFullYear();
  const month = calendarPageDate.getMonth() + 1;

  try {
    const response = await fetch(`/api/services/calendar/${year}/${month}`);
    const data = await response.json();

    if (response.ok) {
      calendarPagePayments = {};
      (data.payments || []).forEach(payment => {
        const dateKey = payment.payment_date.split('T')[0];
        if (!calendarPagePayments[dateKey]) {
          calendarPagePayments[dateKey] = [];
        }
        calendarPagePayments[dateKey].push(payment);
      });
    }
  } catch (error) {
    console.error('Error loading calendar payments:', error);
  }
}

async function loadCalendarUpcoming() {
  const listEl = document.getElementById('calendar-upcoming-list');
  if (!listEl) return;

  try {
    const response = await fetch('/api/services/calendar/upcoming?months=1');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error loading upcoming payments');
    }

    // Filter to only show next 7 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const payments = (data.predictions || data.payments || []).filter(p => {
      const paymentDate = new Date(p.payment_date);
      paymentDate.setHours(0, 0, 0, 0);
      return paymentDate >= today && paymentDate <= nextWeek;
    });

    if (payments.length === 0) {
      listEl.innerHTML = '<p class="calendar-upcoming-empty">No hay pagos en los próximos 7 días</p>';
      return;
    }

    listEl.innerHTML = payments.map(p => {
      const date = new Date(p.payment_date);
      return `
        <div class="calendar-upcoming-item" onclick="selectCalendarDay('${p.payment_date.split('T')[0]}')">
          <div class="calendar-upcoming-date">
            <span class="day">${date.getDate()}</span>
            <span class="month">${date.toLocaleDateString('es-AR', { month: 'short' })}</span>
          </div>
          <div class="calendar-upcoming-info">
            <div class="calendar-upcoming-name">${escapeHtmlCalendar(p.service_name)}</div>
            <div class="calendar-upcoming-amount">${formatCurrencyCalendar(p.amount, p.currency)}</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading upcoming payments:', error);
    if (listEl) listEl.innerHTML = '<p class="calendar-upcoming-empty">Error al cargar pagos</p>';
  }
}

function updateMonthSummary() {
  const totalPaymentsEl = document.getElementById('month-total-payments');
  const servicesCountEl = document.getElementById('month-services-count');

  let totalAmount = 0;
  const serviceNames = new Set();

  Object.values(calendarPagePayments).forEach(dayPayments => {
    dayPayments.forEach(p => {
      totalAmount += p.amount || 0;
      if (p.service_name) serviceNames.add(p.service_name);
    });
  });

  if (totalPaymentsEl) {
    totalPaymentsEl.textContent = formatCurrencyCalendar(totalAmount, 'ARS');
  }

  if (servicesCountEl) {
    servicesCountEl.textContent = serviceNames.size.toString();
  }
}

// =============================================
// UTILITIES
// =============================================

function formatCurrencyCalendar(amount, currency = 'ARS') {
  if (amount === null || amount === undefined) return '-';

  const formatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  return formatter.format(amount);
}

function escapeHtmlCalendar(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
