module.exports = {
  // Allowed file types
  allowedMimeTypes: [
    'application/pdf',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],

  // Allowed file extensions
  allowedExtensions: ['.pdf', '.csv', '.xlsx', '.xls'],

  // Maximum file size in bytes (configurable via .env)
  getMaxFileSize: () => {
    const maxSizeMB = process.env.MAX_FILE_SIZE_MB || 10;
    return maxSizeMB * 1024 * 1024; // Convert MB to bytes
  },

  // File naming strategy
  generateFileName: (originalName) => {
    const timestamp = Date.now();
    const cleanName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${timestamp}_${cleanName}`;
  }
};
