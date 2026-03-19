/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.html",
    "./public/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        'maneki-purple': '#2c0c6b',
        'maneki-purple-hover': '#413581',
        'maneki-purple-light': '#918dd7',
      },
    },
  },
  plugins: [
    require('daisyui'),
  ],
  daisyui: {
    themes: [
      {
        maneki: {
          "primary": "#2c0c6b",
          "primary-focus": "#413581",
          "primary-content": "#ffffff",
          "secondary": "#918dd7",
          "accent": "#10b981",
          "neutral": "#413581",
          "base-100": "#ffffff",
          "base-200": "#e5e7f0",
          "base-300": "#dbd8ed",
          "info": "#3b82f6",
          "success": "#10b981",
          "warning": "#f59e0b",
          "error": "#ef4444",
        },
      },
      "light",
      "dark",
    ],
    base: true,
    styled: true,
    utils: true,
  },
}
