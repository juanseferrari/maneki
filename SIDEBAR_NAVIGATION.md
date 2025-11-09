# Sidebar Navigation - Stripe-Inspired Design

## Overview
A sleek, professional left sidebar navigation has been added to the Maneki application, inspired by Stripe's design system.

## Features Implemented

### Visual Design
- **Dark sidebar** with Stripe's signature navy blue (#0a2540)
- **5 navigation items**:
  - 🏠 Inicio (Home)
  - 💲 Transacciones (Transactions)
  - 📄 Archivos (Files)
  - 📅 Calendario (Calendar)
  - ⚙️ Configuración (Settings)

### Design Details
- **Logo section** at the top with Maneki cat icon 🐱
- **Icon + text** menu items with smooth hover effects
- **Active state** highlighting with purple accent color
- **User profile section** at the bottom with avatar and email
- **Smooth transitions** on all interactive elements

### Color Scheme (Stripe-inspired)
```css
--sidebar-bg: #0a2540 (Navy blue)
--sidebar-text: #8898aa (Muted gray)
--sidebar-text-hover: #ffffff (White on hover)
--primary-color: #635bff (Stripe purple)
--sidebar-active-bg: rgba(99, 91, 255, 0.1) (Purple tint for active)
```

### Layout
- **Fixed sidebar**: 240px wide on desktop
- **Main content area**: Adjusted to accommodate sidebar
- **Responsive design**: Transforms to horizontal menu on mobile

## Files Modified

### 1. HTML Structure ([views/index.ejs](views/index.ejs))
Added:
- `<nav class="sidebar">` element with all menu items
- `<div class="main-content">` wrapper for page content
- SVG icons for each menu item
- User profile section in sidebar footer

### 2. CSS Styles ([public/css/style.css](public/css/style.css))
Added:
- Complete sidebar styling (lines 37-173)
- Main content area adjustments (lines 175-213)
- Responsive mobile styles (lines 819-895)
- Updated color scheme to match Stripe

### 3. JavaScript ([public/js/upload.js](public/js/upload.js:635-699))
Added:
- `initNavigation()` function for handling active states
- Click handlers for smooth scrolling
- Hash-based navigation support

## Responsive Behavior

### Desktop (> 1024px)
- Full sidebar with icons and text
- 240px fixed width
- User profile visible at bottom

### Tablet (769px - 1024px)
- Narrower sidebar (200px)
- Logo text hidden to save space
- Smaller menu text

### Mobile (< 768px)
- Sidebar transforms to horizontal top bar
- Icons stack vertically with text below
- Scrollable if needed
- User profile hidden

## Navigation Structure

```html
Sidebar
├── Header
│   └── Logo (🐱 Maneki)
├── Menu
│   ├── Inicio (/)
│   ├── Transacciones (#transactions)
│   ├── Archivos (#files)
│   ├── Calendario (#calendar)
│   └── Configuración (#settings)
└── Footer
    └── User Info
        ├── Avatar (M)
        ├── Name (Mi Cuenta)
        └── Email (usuario@maneki.com)
```

## Usage

### Active Menu Item
The first menu item (Inicio) is active by default. JavaScript automatically updates the active state based on:
1. Click events
2. URL hash changes
3. Initial page load

### Adding New Menu Items
To add a new menu item, insert this code in the `.sidebar-menu` section:

```html
<a href="#new-section" class="menu-item">
  <svg class="menu-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <!-- Add your SVG path here -->
  </svg>
  <span class="menu-text">New Section</span>
</a>
```

### Customization

#### Change Logo
Edit line 14 in [views/index.ejs](views/index.ejs:14):
```html
<span class="logo-icon">🐱</span> <!-- Change emoji -->
<span class="logo-text">Maneki</span> <!-- Change text -->
```

#### Change User Info
Edit lines 65-68 in [views/index.ejs](views/index.ejs:65-68):
```html
<div class="user-avatar">M</div> <!-- Change initial -->
<div class="user-name">Mi Cuenta</div> <!-- Change name -->
<div class="user-email">usuario@maneki.com</div> <!-- Change email -->
```

#### Change Sidebar Color
Edit in [public/css/style.css](public/css/style.css:19):
```css
--sidebar-bg: #0a2540; /* Change to your color */
```

## Key Features

### Hover Effects
- Menu items lighten on hover
- User profile highlights on hover
- Smooth color transitions (0.2s)

### Active State
- Purple background tint
- Purple icon color
- Persistent across page interactions

### Icons
All icons use Feather Icons style (24x24 SVG):
- Home: House icon
- Transactions: Dollar sign
- Files: File icon
- Calendar: Calendar grid
- Settings: Gear icon

## Browser Compatibility
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS/Android)

## Accessibility
- Semantic HTML (`<nav>`, `<a>`)
- Proper color contrast ratios
- Keyboard navigation support
- Screen reader friendly

## Next Steps

To fully implement section routing, you could:
1. Create separate route handlers in `server.js`
2. Use a frontend framework (React, Vue) for SPA routing
3. Add page transitions between sections
4. Implement user authentication for the profile section

## Design Credits
Inspired by [Stripe Dashboard](https://stripe.com) design system.
