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

    // Build query params
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);
    if (typeFilter !== 'all') params.append('type', typeFilter);
    params.append('period', period);
    // Always group by category
    params.append('groupBy', 'category');

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

    // Always show category detail table
    const groupedContainer = document.getElementById('grouped-data-container');
    if (result.groupedData && result.groupedData.length > 0) {
      renderGroupedDataTable(result.groupedData);
      if (groupedContainer) groupedContainer.style.display = 'block';
    } else {
      // Show empty state in table
      const bodyEl = document.getElementById('grouped-data-body');
      if (bodyEl) {
        bodyEl.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #9CA3AF;">No hay datos para mostrar</td></tr>';
      }
      if (groupedContainer) groupedContainer.style.display = 'block';
    }

    // Load categories by month table
    loadCategoriesByMonthData();

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
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 0,
      borderRadius: 4,
      barPercentage: 0.7
    });
  }

  if (typeFilter === 'all' || typeFilter === 'expense') {
    datasets.push({
      label: 'Egresos',
      data: data.expenseData,
      backgroundColor: 'rgba(239, 68, 68, 0.8)',
      borderColor: 'rgba(239, 68, 68, 1)',
      borderWidth: 0,
      borderRadius: 4,
      barPercentage: 0.7
    });
  }

  salesChart = new Chart(ctx, {
    type: 'bar',
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

// Render grouped data table (always for categories)
function renderGroupedDataTable(groupedData) {
  const bodyEl = document.getElementById('grouped-data-body');

  if (!bodyEl) return;

  // Format currency helper
  var formatCurrency = function(val) {
    return '$' + val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Render table rows
  bodyEl.innerHTML = groupedData.map(function(item) {
    // Add color dot if color is available (for categories)
    var nameCell = item.color
      ? '<td><span class="category-color-dot" style="background-color: ' + item.color + '; display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>' + escapeHtml(item.name) + '</td>'
      : '<td>' + escapeHtml(item.name) + '</td>';

    return '<tr>' +
      nameCell +
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

// Load categories by month data (last 6 months)
async function loadCategoriesByMonthData() {
  try {
    const typeFilter = document.getElementById('dashboard-type')?.value || 'all';

    // Build query params for last 6 months
    const params = new URLSearchParams();
    params.append('months', '6');
    if (typeFilter !== 'all') params.append('type', typeFilter);

    const headers = await getAuthHeaders();
    const response = await fetch(`/api/dashboard/categories-by-month?${params.toString()}`, { headers });
    const result = await response.json();

    if (!result.success) {
      throw new Error('Failed to load categories by month');
    }

    renderCategoriesByMonthTable(result.data);

  } catch (error) {
    console.error('Error loading categories by month:', error);
    const container = document.getElementById('categories-by-month-container');
    if (container) container.style.display = 'none';
  }
}

// Render categories by month table
function renderCategoriesByMonthTable(data) {
  const container = document.getElementById('categories-by-month-container');
  const headerEl = document.getElementById('categories-month-header');
  const bodyEl = document.getElementById('categories-month-body');

  if (!container || !headerEl || !bodyEl || !data || !data.months || data.months.length === 0) {
    if (container) container.style.display = 'none';
    return;
  }

  // Format currency helper
  var formatCurrency = function(val) {
    if (val === 0) return '-';
    return '$' + val.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Render header (months)
  var headerHtml = '<tr><th>Categoría</th>';
  data.months.forEach(function(month) {
    // Parse YYYY-MM directly to avoid timezone issues
    var parts = month.split('-');
    var year = parseInt(parts[0]);
    var monthNum = parseInt(parts[1]) - 1; // JavaScript months are 0-indexed
    var monthDate = new Date(year, monthNum, 1);
    var monthLabel = monthDate.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
    headerHtml += '<th>' + monthLabel + '</th>';
  });
  headerHtml += '</tr>';
  headerEl.innerHTML = headerHtml;

  // Render body (categories)
  var bodyHtml = '';

  if (data.categories && data.categories.length > 0) {
    data.categories.forEach(function(category) {
      bodyHtml += '<tr>';

      // Category name with color dot
      if (category.color) {
        bodyHtml += '<td><span class="category-color-dot" style="background-color: ' + category.color + '; display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; vertical-align: middle;"></span>' + escapeHtml(category.name) + '</td>';
      } else {
        bodyHtml += '<td>' + escapeHtml(category.name) + '</td>';
      }

      // Monthly values
      data.months.forEach(function(month) {
        var value = category.monthlyTotals[month] || 0;
        bodyHtml += '<td>' + formatCurrency(value) + '</td>';
      });

      bodyHtml += '</tr>';
    });

    // Add total row
    bodyHtml += '<tr style="font-weight: bold; border-top: 2px solid #e5e7eb;">';
    bodyHtml += '<td>TOTAL</td>';
    data.months.forEach(function(month) {
      var total = data.monthlyTotals[month] || 0;
      bodyHtml += '<td>' + formatCurrency(total) + '</td>';
    });
    bodyHtml += '</tr>';
  } else {
    bodyHtml = '<tr><td colspan="' + (data.months.length + 1) + '" style="text-align: center; padding: 20px; color: #9CA3AF;">No hay datos para mostrar</td></tr>';
  }

  bodyEl.innerHTML = bodyHtml;
  container.style.display = 'block';
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
