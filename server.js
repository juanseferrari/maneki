require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const passport = require('./config/passport.config');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const supabaseService = require('./services/supabase.service');
const processorService = require('./services/processor.service');
const uploadConfig = require('./config/upload.config');
const { ensureAuthenticated, ensureGuest, attachUser } = require('./middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool for sessions
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection settings to handle IPv6/IPv4 issues
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: uploadConfig.getMaxFileSize()
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    // Check if file extension is allowed
    if (!uploadConfig.allowedExtensions.includes(ext)) {
      return cb(new Error(`Only ${uploadConfig.allowedExtensions.join(', ')} files are allowed`));
    }

    // Check if MIME type is allowed
    if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type'));
    }

    cb(null, true);
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'sessions',
      createTableIfMissing: false // We created it manually in our schema
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // true in production with HTTPS
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Attach user to templates
app.use(attachUser);

// ==========================================
// Authentication Routes
// ==========================================

// Login page
app.get('/login', ensureGuest, (req, res) => {
  res.render('login', {
    error: req.session.error || null
  });
  delete req.session.error;
});

// Google OAuth login
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.redirect('/login');
    });
  });
});

// ==========================================
// Protected Routes (Require Authentication)
// ==========================================

// Home page - Protected
app.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const files = await supabaseService.getFiles(req.user.id);
    const maxSizeMB = process.env.MAX_FILE_SIZE_MB || 10;

    res.render('index', {
      files,
      maxSizeMB,
      allowedTypes: uploadConfig.allowedExtensions.join(', ')
    });
  } catch (error) {
    console.error('Error loading page:', error);
    res.render('index', {
      files: [],
      maxSizeMB: process.env.MAX_FILE_SIZE_MB || 10,
      allowedTypes: uploadConfig.allowedExtensions.join(', '),
      error: 'Failed to load files. Please check your Supabase configuration.'
    });
  }
});

// Upload endpoint - Protected
app.post('/upload', ensureAuthenticated, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const fileName = uploadConfig.generateFileName(req.file.originalname);

    // Step 1: Upload file to storage
    const uploadResult = await supabaseService.uploadFile(
      req.file.buffer,
      fileName,
      req.file.mimetype
    );

    // Step 2: Create file metadata record in database
    const fileRecord = await supabaseService.createFileRecord({
      originalName: req.file.originalname,
      storedName: fileName,
      size: req.file.size,
      mimeType: req.file.mimetype,
      path: uploadResult.path,
      publicUrl: uploadResult.publicUrl,
      userId: req.user.id // Set current user ID
    });

    // Step 3: Process file immediately (async)
    console.log(`Starting to process file: ${fileName}`);
    processorService.processFile(fileRecord, req.file.buffer)
      .then(result => {
        console.log(`File processed successfully: ${fileName}`, result);
      })
      .catch(error => {
        console.error(`File processing failed: ${fileName}`, error);
      });

    res.json({
      success: true,
      message: 'File uploaded and processing started',
      file: {
        id: fileRecord.id,
        name: fileName,
        originalName: req.file.originalname,
        size: req.file.size,
        processingStatus: fileRecord.processing_status,
        ...uploadResult
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload file'
    });
  }
});

// List files endpoint - Protected
app.get('/api/files', ensureAuthenticated, async (req, res) => {
  try {
    const files = await supabaseService.getFiles(req.user.id);
    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve files'
    });
  }
});

// Get file details - Protected
app.get('/api/files/:fileId', ensureAuthenticated, async (req, res) => {
  try {
    const file = await supabaseService.getFileById(req.params.fileId, req.user.id);
    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Get transaction count for the file
    const transactions = await supabaseService.getTransactionsByFile(req.params.fileId, req.user.id);
    file.transaction_count = transactions.length;

    res.json({
      success: true,
      file
    });
  } catch (error) {
    console.error('Get file details error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve file'
    });
  }
});

// Get file transactions - Protected
app.get('/api/files/:fileId/transactions', ensureAuthenticated, async (req, res) => {
  try {
    const transactions = await supabaseService.getTransactionsByFile(req.params.fileId, req.user.id);
    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Get file transactions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// Get single transaction - Protected
app.get('/api/transactions/:transactionId', ensureAuthenticated, async (req, res) => {
  try {
    const transaction = await supabaseService.getTransactionById(req.params.transactionId, req.user.id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transaction'
    });
  }
});

// Update transaction notes - Protected
app.put('/api/transactions/:transactionId/notes', ensureAuthenticated, async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await supabaseService.updateTransactionNotes(req.params.transactionId, notes, req.user.id);
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Update transaction notes error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update notes'
    });
  }
});

// Get all transactions - Protected
app.get('/api/transactions', ensureAuthenticated, async (req, res) => {
  try {
    const transactions = await supabaseService.getAllTransactions(req.user.id);
    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// ==========================================
// VEP Endpoints - Protected
// ==========================================

// Get all VEPs
app.get('/api/veps', ensureAuthenticated, async (req, res) => {
  try {
    const veps = await supabaseService.getVeps(req.user.id);
    res.json({
      success: true,
      veps
    });
  } catch (error) {
    console.error('Get VEPs error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve VEPs'
    });
  }
});

// Get VEP by file ID
app.get('/api/veps/file/:fileId', ensureAuthenticated, async (req, res) => {
  try {
    const vep = await supabaseService.getVepByFile(req.params.fileId, req.user.id);
    if (!vep) {
      return res.status(404).json({
        success: false,
        error: 'VEP not found for this file'
      });
    }
    res.json({
      success: true,
      vep
    });
  } catch (error) {
    console.error('Get VEP by file error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve VEP'
    });
  }
});

// Get VEP by VEP number
app.get('/api/veps/:nroVep', ensureAuthenticated, async (req, res) => {
  try {
    const vep = await supabaseService.getVepByNumber(req.params.nroVep, req.user.id);
    if (!vep) {
      return res.status(404).json({
        success: false,
        error: 'VEP not found'
      });
    }
    res.json({
      success: true,
      vep
    });
  } catch (error) {
    console.error('Get VEP by number error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve VEP'
    });
  }
});

// Delete file endpoint - Protected
app.delete('/api/files/:fileName', ensureAuthenticated, async (req, res) => {
  try {
    const result = await supabaseService.deleteFile(req.params.fileName, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: `File size exceeds the maximum limit of ${process.env.MAX_FILE_SIZE_MB || 10}MB`
      });
    }
  }

  res.status(500).json({
    success: false,
    error: error.message || 'An error occurred'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Max file size: ${process.env.MAX_FILE_SIZE_MB || 10}MB`);
  console.log(`Allowed file types: ${uploadConfig.allowedExtensions.join(', ')}`);
});
