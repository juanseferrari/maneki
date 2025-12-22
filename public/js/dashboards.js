// ========================================
// DASHBOARDS FUNCTIONALITY
// ========================================

let salesChart = null;

// Initialize dashboard when section is shown
function initDashboard() {
  // Set default dates (last 30 days)
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dateFrom = document.getElementById('dashboard-date-from');
  const dateTo = document.getElementById('dashboard-date-to');

  if (dateFrom && !dateFrom.value) {
    dateFrom.value = thirtyDaysAgo.toISOString().split('T')[0];
  }
  if (dateTo && !dateTo.value) {
    dateTo.value = today.toISOString().split('T')[0];
  }

  // Add event listener for apply button
  const applyBtn = document.getElementById('apply-dashboard-filters');
  if (applyBtn && !applyBtn.hasAttribute('data-initialized')) {
    applyBtn.setAttribute('data-initialized', 'true');
    applyBtn.addEventListener('click', loadDashboardChartData);
  }

  // Load initial data
  loadDashboardChartData();
}

// Load and process dashboard data from aggregated API
async function loadDashboardChartData() {
  const chartLoading = document.getElementById('chart-loading');
  const chartEmpty = document.getElementById('chart-empty');
  const chartWrapper = document.querySelector('.chart-wrapper');

  if (chartLoading) chartLoading.style.display = 'flex';
  if (chartEmpty) chartEmpty.style.display = 'none';

  try {
    // Get filter values
    const dateFrom = document.getElementById('dashboard-date-from')?.value || '';
    const dateTo = document.getElementById('dashboard-date-to')?.value || '';
    const typeFilter = document.getElementById('dashboard-type')?.value || 'all';
    const period = document.getElementById('dashboard-period')?.value || 'monthly';
    const groupBy = document.getElementById('dashboard-group-by')?.value || 'none';

    // Build query params
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (typeFilter !== 'all') params.append('type', typeFilter);
    params.append('period', period);
    if (groupBy !== 'none') params.append('groupBy', groupBy);

    const headers = await getAuthHeaders();
    const response = await fetch(`/api/dashboard/stats?${params.toString()}`, { headers });
    const result = await response.json();

    if (!result.success) {
      throw new Error('Failed to load dashboard stats');
    }

    // Update summary cards with pre-calculated data
    updateSummaryCards(result.summary);

    // Process time series data for chart
    const chartData = processTimeSeriesData(result.timeSeries, period);

    // Render chart
    renderSalesChart(chartData);

    if (chartLoading) chartLoading.style.display = 'none';

    if (result.timeSeries.length === 0) {
      if (chartEmpty) chartEmpty.style.display = 'flex';
      if (chartWrapper) chartWrapper.style.display = 'none';
    } else {
      if (chartEmpty) chartEmpty.style.display = 'none';
      if (chartWrapper) chartWrapper.style.display = 'block';
    }

    // Show grouped data table if groupBy is set
    const groupedContainer = document.getElementById('grouped-data-container');
    if (groupBy !== 'none' && result.groupedData && result.groupedData.length > 0) {
      renderGroupedDataTable(result.groupedData, groupBy);
      if (groupedContainer) groupedContainer.style.display = 'block';
    } else {
      if (groupedContainer) groupedContainer.style.display = 'none';
    }

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    if (chartLoading) chartLoading.style.display = 'none';
    if (chartEmpty) chartEmpty.style.display = 'flex';
  }
}

// Update summary cards with pre-calculated totals
function updateSummaryCards(summary) {
  var formatCurrency = function(val) {
    return '$' + val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const incomeEl = document.getElementById('total-income');
  const expenseEl = document.getElementById('total-expense');
  const balanceEl = document.getElementById('net-balance');
  const countEl = document.getElementById('transaction-count');

  if (incomeEl) incomeEl.textContent = formatCurrency(summary.totalIncome);
  if (expenseEl) expenseEl.textContent = formatCurrency(summary.totalExpense);
  if (balanceEl) {
    balanceEl.textContent = (summary.netBalance >= 0 ? '+' : '') + formatCurrency(summary.netBalance);
    balanceEl.style.color = summary.netBalance >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
  }
  if (countEl) countEl.textContent = summary.transactionCount.toLocaleString();
}

// Process time series data from API for chart
function processTimeSeriesData(timeSeries, period) {
  // Format labels based on period
  const labels = timeSeries.map(function(item) {
    const key = item.period;
    if (period === 'daily') {
      const date = new Date(key + 'T00:00:00');
      return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } else if (period === 'weekly') {
      const date = new Date(key + 'T00:00:00');
      return 'Sem ' + date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    } else {
      const parts = key.split('-');
      const date = new Date(parts[0], parts[1] - 1, 1);
      return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
    }
  });

  const incomeData = timeSeries.map(function(item) { return item.income; });
  const expenseData = timeSeries.map(function(item) { return item.expense; });

  return { labels: labels, incomeData: incomeData, expenseData: expenseData };
}

// Render the sales chart
function renderSalesChart(data) {
  const canvas = document.getElementById('sales-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Destroy existing chart
  if (salesChart) {
    salesChart.destroy();
  }

  const typeFilter = document.getElementById('dashboard-type')?.value || 'all';

  const datasets = [];

  if (typeFilter === 'all' || typeFilter === 'income') {
    datasets.push({
      label: 'Ingresos',
      data: data.incomeData,
      backgroundColor: 'rgba(16, 185, 129, 0.2)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    });
  }

  if (typeFilter === 'all' || typeFilter === 'expense') {
    datasets.push({
      label: 'Egresos',
      data: data.expenseData,
      backgroundColor: 'rgba(239, 68, 68, 0.2)',
      borderColor: 'rgba(239, 68, 68, 1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4
    });
  }

  salesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            padding: 20,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 37, 64, 0.9)',
          padding: 12,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 },
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return context.dataset.label + ': $' + value.toLocaleString('es-AR', { minimumFractionDigits: 2 });
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            font: { size: 11 },
            color: '#8898aa'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            font: { size: 11 },
            color: '#8898aa',
            callback: function(value) {
              if (value >= 1000000) {
                return '$' + (value / 1000000).toFixed(1) + 'M';
              } else if (value >= 1000) {
                return '$' + (value / 1000).toFixed(0) + 'K';
              }
              return '$' + value;
            }
          }
        }
      }
    }
  });

  // Update legend
  updateChartLegend();
}

// Update chart legend
function updateChartLegend() {
  const legendEl = document.getElementById('chart-legend');
  if (!legendEl) return;

  const typeFilter = document.getElementById('dashboard-type')?.value || 'all';
  let html = '';

  if (typeFilter === 'all' || typeFilter === 'income') {
    html += '<div class="chart-legend-item">' +
      '<span class="chart-legend-dot" style="background: rgba(16, 185, 129, 1)"></span>' +
      'Ingresos' +
      '</div>';
  }

  if (typeFilter === 'all' || typeFilter === 'expense') {
    html += '<div class="chart-legend-item">' +
      '<span class="chart-legend-dot" style="background: rgba(239, 68, 68, 1)"></span>' +
      'Egresos' +
      '</div>';
  }

  legendEl.innerHTML = html;
}

// Render grouped data table
function renderGroupedDataTable(groupedData, groupBy) {
  const labelEl = document.getElementById('grouped-by-label');
  const bodyEl = document.getElementById('grouped-data-body');

  if (!bodyEl) return;

  // Update label
  if (labelEl) {
    labelEl.textContent = groupBy === 'category' ? 'Categoría' : 'Descripción';
  }

  // Format currency helper
  var formatCurrency = function(val) {
    return '$' + val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Render table rows
  bodyEl.innerHTML = groupedData.map(function(item) {
    return '<tr>' +
      '<td>' + escapeHtml(item.name) + '</td>' +
      '<td>' + item.count.toLocaleString() + '</td>' +
      '<td>' + formatCurrency(item.total) + '</td>' +
      '<td>' + formatCurrency(item.average) + '</td>' +
      '</tr>';
  }).join('');
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add dashboard section listener
document.addEventListener('DOMContentLoaded', function() {
  const dashboardMenuItem = document.querySelector('[data-section="dashboards"]');
  if (dashboardMenuItem) {
    dashboardMenuItem.addEventListener('click', function() {
      setTimeout(initDashboard, 100);
    });
  }

  // Initialize dashboard on page load if it's the default/active section or URL has hash
  const dashboardSection = document.getElementById('section-dashboards');
  const isDefaultSection = !window.location.hash || window.location.hash === '#dashboards';

  if (window.location.hash.includes('dashboards') || (isDefaultSection && dashboardSection?.classList.contains('active'))) {
    setTimeout(initDashboard, 500);
  }
});
