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
const PORT = process.env.PORT || 3001;

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

// Update transaction category - Protected
app.put('/api/transactions/:transactionId/category', ensureAuthenticated, async (req, res) => {
  try {
    const { category } = req.body;
    const result = await supabaseService.updateTransactionCategory(req.params.transactionId, category, req.user.id);
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Update transaction category error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update category'
    });
  }
});

// Get all transactions with pagination and filters - Protected
app.get('/api/transactions', ensureAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const { dateFrom, dateTo, description, includeDeleted } = req.query;

    // Build base query for count
    let countQuery = supabaseService.supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Build base query for data
    let dataQuery = supabaseService.supabase
      .from('transactions')
      .select(`
        *,
        files:file_id (
          original_name,
          stored_name
        )
      `)
      .eq('user_id', req.user.id);

    // Filter out deleted transactions by default (unless includeDeleted is true)
    if (includeDeleted !== 'true') {
      countQuery = countQuery.or('status.is.null,status.neq.deleted');
      dataQuery = dataQuery.or('status.is.null,status.neq.deleted');
    }

    // Apply date filters
    if (dateFrom) {
      countQuery = countQuery.gte('transaction_date', dateFrom);
      dataQuery = dataQuery.gte('transaction_date', dateFrom);
    }
    if (dateTo) {
      countQuery = countQuery.lte('transaction_date', dateTo);
      dataQuery = dataQuery.lte('transaction_date', dateTo);
    }

    // Apply description filter (search in description field)
    if (description) {
      countQuery = countQuery.ilike('description', `%${description}%`);
      dataQuery = dataQuery.ilike('description', `%${description}%`);
    }

    // Get total count with filters
    const { count, error: countError } = await countQuery;

    if (countError) {
      throw countError;
    }

    // Get paginated transactions with filters
    const { data: transactions, error } = await dataQuery
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// Soft delete a transaction (mark as deleted)
app.delete('/api/transactions/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Update transaction status to 'deleted'
    const { data, error } = await supabaseService.supabase
      .from('transactions')
      .update({ status: 'deleted' })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    console.log(`[Transaction Deleted] User ${req.user.id}: Transaction ${id} marked as deleted`);

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete transaction'
    });
  }
});

// Get aggregated dashboard stats
app.get('/api/dashboard/stats', ensureAuthenticated, async (req, res) => {
  try {
    const { dateFrom, dateTo, type, period = 'monthly', groupBy = 'none' } = req.query;
    const userId = req.user.id;

    // Determine which fields to fetch based on groupBy
    const selectFields = groupBy !== 'none'
      ? 'transaction_date, amount, description, category'
      : 'transaction_date, amount';

    // Fetch ALL transactions using pagination loop
    const BATCH_SIZE = 1000;
    let allTransactions = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let batchQuery = supabaseService.supabase
        .from('transactions')
        .select(selectFields)
        .eq('user_id', userId)
        .or('status.is.null,status.neq.deleted'); // Exclude deleted transactions

      if (dateFrom) {
        batchQuery = batchQuery.gte('transaction_date', dateFrom);
      }
      if (dateTo) {
        batchQuery = batchQuery.lte('transaction_date', dateTo);
      }

      const { data: batch, error } = await batchQuery
        .order('transaction_date', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      if (batch && batch.length > 0) {
        allTransactions = allTransactions.concat(batch);
        offset += BATCH_SIZE;
        hasMore = batch.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    const transactions = allTransactions;

    // Calculate summary
    let filteredTransactions = transactions;
    if (type === 'income') {
      filteredTransactions = transactions.filter(t => t.amount > 0);
    } else if (type === 'expense') {
      filteredTransactions = transactions.filter(t => t.amount < 0);
    }

    const totalIncome = transactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = Math.abs(transactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));

    // Group by period for time series
    const grouped = {};

    filteredTransactions.forEach(t => {
      const date = new Date(t.transaction_date + 'T00:00:00');
      let key;

      if (period === 'daily') {
        key = t.transaction_date;
      } else if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else { // monthly
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      if (!grouped[key]) {
        grouped[key] = { income: 0, expense: 0 };
      }

      if (t.amount > 0) {
        grouped[key].income += t.amount;
      } else {
        grouped[key].expense += Math.abs(t.amount);
      }
    });

    // Convert to sorted array
    const sortedKeys = Object.keys(grouped).sort();
    const timeSeries = sortedKeys.map(key => ({
      period: key,
      income: type === 'expense' ? 0 : grouped[key].income,
      expense: type === 'income' ? 0 : grouped[key].expense
    }));

    // Calculate grouped data if groupBy is set
    let groupedData = null;
    if (groupBy !== 'none') {
      const groupMap = new Map();
      filteredTransactions.forEach(t => {
        const groupKey = groupBy === 'category' ? (t.category || 'Sin categoría') : (t.description || 'Sin descripción');
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, { total: 0, count: 0 });
        }
        const group = groupMap.get(groupKey);
        group.total += Math.abs(t.amount);
        group.count += 1;
      });

      groupedData = Array.from(groupMap.entries())
        .map(([name, data]) => ({
          name,
          total: data.total,
          count: data.count,
          average: data.total / data.count
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
    }

    res.json({
      success: true,
      summary: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        transactionCount: transactions.length
      },
      timeSeries,
      groupedData
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load dashboard stats'
    });
  }
});

// Get categories by month data (for dashboard table)
app.get('/api/dashboard/categories-by-month', ensureAuthenticated, async (req, res) => {
  try {
    const { months = 6, type } = req.query;
    const userId = req.user.id;
    const monthsCount = parseInt(months);

    // Calculate date range for last N months
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - (monthsCount - 1), 1);
    const dateFrom = startDate.toISOString().split('T')[0];

    // Fetch all transactions for the period (with pagination)
    const BATCH_SIZE = 1000;
    let allTransactions = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let batchQuery = supabase
        .from('transactions')
        .select('transaction_date, amount, category_id')
        .eq('user_id', userId)
        .gte('transaction_date', dateFrom)
        .or('status.is.null,status.neq.deleted');

      const { data: batch, error } = await batchQuery
        .order('transaction_date', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      if (batch && batch.length > 0) {
        allTransactions = allTransactions.concat(batch);
        offset += BATCH_SIZE;
        hasMore = batch.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    // Filter by type if specified
    let transactions = allTransactions;
    if (type === 'income') {
      transactions = allTransactions.filter(t => t.amount > 0);
    } else if (type === 'expense') {
      transactions = allTransactions.filter(t => t.amount < 0);
    }

    // Fetch all categories for this user
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('id, name, color')
      .eq('user_id', userId);

    if (catError) throw catError;

    const categoriesMap = categories.reduce((map, cat) => {
      map[cat.id] = { name: cat.name, color: cat.color };
      return map;
    }, {});

    // Generate last N months array (most recent first)
    const monthsList = [];
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsList.push(monthKey);
    }

    // Group transactions by category and month
    const categoryMonthData = {};
    const monthlyTotals = {};

    transactions.forEach(t => {
      const date = new Date(t.transaction_date + 'T00:00:00');
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      // Only include months in our range
      if (!monthsList.includes(monthKey)) return;

      const categoryId = t.category_id || 'uncategorized';
      const absAmount = Math.abs(t.amount);

      // Initialize category if needed
      if (!categoryMonthData[categoryId]) {
        categoryMonthData[categoryId] = {
          id: categoryId,
          name: categoryId === 'uncategorized' ? 'Sin categoría' : (categoriesMap[categoryId]?.name || 'Desconocida'),
          color: categoryId === 'uncategorized' ? '#9ca3af' : (categoriesMap[categoryId]?.color || '#9ca3af'),
          monthlyTotals: {},
          totalOverall: 0
        };
      }

      // Add to category's monthly total
      if (!categoryMonthData[categoryId].monthlyTotals[monthKey]) {
        categoryMonthData[categoryId].monthlyTotals[monthKey] = 0;
      }
      categoryMonthData[categoryId].monthlyTotals[monthKey] += absAmount;
      categoryMonthData[categoryId].totalOverall += absAmount;

      // Add to overall monthly total
      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = 0;
      }
      monthlyTotals[monthKey] += absAmount;
    });

    // Convert to array and sort by total descending
    const categoriesArray = Object.values(categoryMonthData)
      .sort((a, b) => b.totalOverall - a.totalOverall)
      .filter(cat => cat.totalOverall > 0); // Only include categories with transactions

    console.log(`[Categories by Month] User ${userId}: ${categoriesArray.length} categories across ${monthsList.length} months`);

    res.json({
      success: true,
      data: {
        months: monthsList,
        categories: categoriesArray,
        monthlyTotals
      }
    });
  } catch (error) {
    console.error('Get categories by month error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve categories by month'
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
