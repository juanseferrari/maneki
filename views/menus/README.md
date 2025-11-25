# Menus Structure

This folder contains modular view components for each section of the application.

## Files:

- **dashboard.ejs** - Main dashboard with stats and recent activity
- **transactions.ejs** - Transactions list with filters
- **files.ejs** - File upload and management section
- **calendar.ejs** - Calendar view (coming soon)
- **settings.ejs** - User settings and account management

## Usage:

These files are included in `index-supabase.ejs` using EJS include syntax:

```ejs
<%- include('menus/dashboard') %>
<%- include('menus/transactions') %>
<%- include('menus/files') %>
<%- include('menus/calendar') %>
<%- include('menus/settings') %>
```

## Benefits:

- **Modularity**: Each section is isolated and easy to maintain
- **Reusability**: Components can be reused across different views
- **Clean code**: Main index file is much cleaner and organized
- **Easier collaboration**: Multiple developers can work on different sections
