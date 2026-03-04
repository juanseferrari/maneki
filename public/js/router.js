/**
 * Client-Side Router for Manni App
 * Handles clean URL routing with History API
 */

const Router = {
  routes: {},
  currentRoute: null,
  onRouteChangeCallback: null,

  /**
   * Initialize router with route configuration
   * @param {Object} config - Configuration object
   * @param {Object} config.routes - Route mapping (path: sectionName)
   * @param {Function} config.onRouteChange - Callback for route changes
   */
  init(config) {
    this.routes = config.routes || {};
    this.onRouteChangeCallback = config.onRouteChange;

    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
      const path = window.location.pathname;
      this.handleRoute(path, { fromPopState: true });
    });

    // Intercept clicks on internal links
    document.addEventListener('click', (e) => {
      // Find closest anchor tag
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');

      // Only handle internal navigation links (not external or API calls)
      if (href.startsWith('/') && !href.startsWith('/api') && !href.startsWith('/uploads')) {
        e.preventDefault();
        this.navigate(href);
      }
    });

    // Load initial route
    const initialPath = window.location.pathname;
    this.handleRoute(initialPath, { replace: true });
  },

  /**
   * Navigate to a new route
   * @param {String} path - Path to navigate to (e.g., '/transacciones')
   * @param {Object} options - Navigation options
   * @param {Boolean} options.replace - Replace current history entry instead of push
   */
  navigate(path, options = {}) {
    // Don't navigate if already on this path
    if (path === window.location.pathname && !options.force) {
      return;
    }

    // Update browser history
    if (options.replace) {
      window.history.replaceState({ path }, '', path);
    } else {
      window.history.pushState({ path }, '', path);
    }

    // Handle the route change
    this.handleRoute(path, options);
  },

  /**
   * Handle route change and show appropriate section
   * @param {String} path - Path to handle
   * @param {Object} options - Options
   */
  handleRoute(path, options = {}) {
    // Get section name from route mapping
    const sectionName = this.routes[path];

    if (!sectionName) {
      console.warn(`[Router] No route found for path: ${path}, defaulting to dashboard`);
      // Default to dashboard for unknown routes
      this.navigate('/', { replace: true });
      return;
    }

    // Store current route
    this.currentRoute = path;

    // Update active menu item
    this.updateActiveMenuItem(sectionName);

    // Show the section
    this.showSection(sectionName);

    // Call onRouteChange callback if provided
    if (this.onRouteChangeCallback && typeof this.onRouteChangeCallback === 'function') {
      this.onRouteChangeCallback(sectionName, path, options);
    }

    // Dispatch custom event for other modules to listen
    window.dispatchEvent(new CustomEvent('routechange', {
      detail: { path, sectionName, options }
    }));
  },

  /**
   * Show a specific section
   * @param {String} sectionName - Section name (e.g., 'transacciones')
   */
  showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => section.classList.remove('active'));

    // Show target section
    const targetSection = document.getElementById(`section-${sectionName}`);
    if (targetSection) {
      targetSection.classList.add('active');
    } else {
      console.error(`[Router] Section not found: section-${sectionName}`);
    }
  },

  /**
   * Update active state on menu items
   * @param {String} sectionName - Section name
   */
  updateActiveMenuItem(sectionName) {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
      if (item.dataset.section === sectionName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  },

  /**
   * Get current route path
   * @returns {String} Current path (e.g., '/transacciones')
   */
  getCurrentRoute() {
    return this.currentRoute || window.location.pathname;
  },

  /**
   * Get current section name
   * @returns {String} Current section name (e.g., 'transacciones')
   */
  getCurrentSection() {
    const path = this.getCurrentRoute();
    return this.routes[path] || null;
  },

  /**
   * Get path for a section name
   * @param {String} sectionName - Section name
   * @returns {String} Path for the section
   */
  getPathForSection(sectionName) {
    for (const [path, section] of Object.entries(this.routes)) {
      if (section === sectionName) {
        return path;
      }
    }
    return '/';
  }
};

// Make Router available globally
window.Router = Router;
