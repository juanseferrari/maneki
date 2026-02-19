require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const processorService = require('./services/processor.service');
const uploadConfig = require('./config/upload.config');
const mercadoPagoOAuth = require('./services/oauth/mercadopago-oauth.service');
const eubanksOAuth = require('./services/oauth/eubanks-oauth.service');
const mercuryOAuth = require('./services/oauth/mercury-oauth.service');
const connectionsService = require('./services/connections.service');
const emailInboundService = require('./services/email-inbound.service');
const mercadoPagoSync = require('./services/sync/mercadopago-sync.service');
const mercurySync = require('./services/sync/mercury-sync.service');
const recurringServicesService = require('./services/recurring-services.service');
const ExchangeRateService = require('./services/exchange-rate.service');

const app = express();
const PORT = process.env.PORT || 3001;

// Temporary storage for OAuth states (use Redis in production)
const oauthStates = new Map();

// Initialize Supabase clients
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize Exchange Rate Service
const exchangeRateService = new ExchangeRateService(supabaseAdmin);

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: uploadConfig.getMaxFileSize()
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!uploadConfig.allowedExtensions.includes(ext)) {
      return cb(new Error(`Only ${uploadConfig.allowedExtensions.join(', ')} files are allowed`));
    }
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

// DESARROLLO: Simular usuario autenticado
// Este middleware inyecta un usuario fake para desarrollo local
async function devAuth(req, res, next) {
  // Buscar el usuario por email en Supabase Auth
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, error: 'Failed to authenticate dev user' });
  }

  const devUser = users.find(u => u.email === 'juansegundoferrari@gmail.com');

  if (!devUser) {
    return res.status(401).json({
      success: false,
      error: 'Dev user not found. Please login once in production first.'
    });
  }

  // Simular el objeto user que vendría de Supabase Auth
  req.user = {
    id: devUser.id,
    email: devUser.email,
    user_metadata: devUser.user_metadata
  };

  next();
}

// Home page
app.get('/', devAuth, async (req, res) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching files:', error);
    }

    res.render('index-supabase', {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      maxSizeMB: process.env.MAX_FILE_SIZE_MB || 10,
      allowedTypes: uploadConfig.allowedExtensions.join(', '),
      user: req.user,
      files: files || []
    });
  } catch (error) {
    console.error('Error loading page:', error);
    res.status(500).send('Error loading page');
  }
});

// Upload endpoint
app.post('/upload', devAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const fileName = uploadConfig.generateFileName(req.file.originalname);
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    // Create file metadata record
    const { data: fileRecord, error: dbError } = await supabaseAdmin
      .from('files')
      .insert({
        original_name: req.file.originalname,
        stored_name: fileName,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        storage_path: uploadData.path,
        public_url: urlData.publicUrl,
        user_id: req.user.id,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    // Process file (async)
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
        path: uploadData.path,
        publicUrl: urlData.publicUrl
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

// List files endpoint
app.get('/api/files', devAuth, async (req, res) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Add transaction count to each file
    const filesWithCounts = await Promise.all(files.map(async (file) => {
      const { data: transactions, error: transError } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('file_id', file.id)
        .eq('user_id', req.user.id);

      return {
        ...file,
        transaction_count: transError ? 0 : (transactions?.length || 0)
      };
    }));

    res.json({
      success: true,
      files: filesWithCounts
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve files'
    });
  }
});

// Get file details
app.get('/api/files/:fileId', devAuth, async (req, res) => {
  try {
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', req.params.fileId)
      .eq('user_id', req.user.id)
      .single();

    if (fileError) {
      if (fileError.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'File not found'
        });
      }
      throw fileError;
    }

    // Get transaction count for the file
    const { data: transactions, error: transError } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('file_id', req.params.fileId)
      .eq('user_id', req.user.id);

    if (!transError && transactions) {
      file.transaction_count = transactions.length;
    }

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

// Get transactions for a file
app.get('/api/files/:fileId/transactions', devAuth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('file_id', req.params.fileId)
      .eq('user_id', req.user.id)
      .order('transaction_date', { ascending: true });

    if (error) {
      throw error;
    }

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

// Get transactions with pagination and filters
app.get('/api/transactions', devAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const {
      dateFrom,
      dateTo,
      description,
      includeDeleted,
      categories,        // New: array of category IDs
      includeNoCategory, // New: include transactions with null category
      amountType,        // New: 'all', 'positive', 'negative', 'custom'
      amountMin,         // New: minimum amount
      amountMax,         // New: maximum amount
      files              // New: array of file IDs
    } = req.query;

    console.log('[Transactions API] Filters received:', { categories, includeNoCategory, amountType, amountMin, amountMax, files });

    // Build base query for count
    let countQuery = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Build base query for data
    let dataQuery = supabaseAdmin
      .from('transactions')
      .select(`
        *,
        files:file_id (
          original_name,
          stored_name
        ),
        service_payments!service_payments_transaction_id_fkey (
          id
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

    // Apply category filter
    if (categories || includeNoCategory === 'true') {
      const categoryArray = categories ? (Array.isArray(categories) ? categories : [categories]) : [];

      if (categoryArray.length > 0 && includeNoCategory === 'true') {
        // Both specific categories AND null category selected
        countQuery = countQuery.or(`category_id.in.(${categoryArray.join(',')}),category_id.is.null`);
        dataQuery = dataQuery.or(`category_id.in.(${categoryArray.join(',')}),category_id.is.null`);
      } else if (categoryArray.length > 0) {
        // Only specific categories selected
        countQuery = countQuery.in('category_id', categoryArray);
        dataQuery = dataQuery.in('category_id', categoryArray);
      } else if (includeNoCategory === 'true') {
        // Only null category selected
        countQuery = countQuery.is('category_id', null);
        dataQuery = dataQuery.is('category_id', null);
      }
    }

    // Apply amount type filter
    if (amountType && amountType !== 'all') {
      if (amountType === 'positive') {
        // Only incomes (amount > 0)
        countQuery = countQuery.gt('amount', 0);
        dataQuery = dataQuery.gt('amount', 0);
      } else if (amountType === 'negative') {
        // Only expenses (amount < 0)
        countQuery = countQuery.lt('amount', 0);
        dataQuery = dataQuery.lt('amount', 0);
      } else if (amountType === 'custom') {
        // Custom range
        if (amountMin !== undefined && amountMin !== '') {
          const min = parseFloat(amountMin);
          if (!isNaN(min)) {
            countQuery = countQuery.gte('amount', min);
            dataQuery = dataQuery.gte('amount', min);
          }
        }
        if (amountMax !== undefined && amountMax !== '') {
          const max = parseFloat(amountMax);
          if (!isNaN(max)) {
            countQuery = countQuery.lte('amount', max);
            dataQuery = dataQuery.lte('amount', max);
          }
        }
      }
    }

    // Apply file filter
    if (files) {
      const fileArray = Array.isArray(files) ? files : [files];
      if (fileArray.length > 0) {
        countQuery = countQuery.in('file_id', fileArray);
        dataQuery = dataQuery.in('file_id', fileArray);
      }
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

    // Add has_service flag to each transaction
    const transactionsWithServiceInfo = transactions.map(t => ({
      ...t,
      has_service: t.service_payments && t.service_payments.length > 0
    }));

    res.json({
      success: true,
      transactions: transactionsWithServiceInfo,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all transactions error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// Soft delete a transaction (mark as deleted)
app.delete('/api/transactions/:id', devAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Update transaction status to 'deleted'
    const { data, error } = await supabaseAdmin
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

// Get aggregated dashboard stats (scalable - uses pagination loop for unlimited data)
app.get('/api/dashboard/stats', devAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, type, period = 'monthly', groupBy = 'none' } = req.query;
    const userId = req.user.id;

    // Determine which fields to fetch based on groupBy
    const selectFields = groupBy !== 'none'
      ? 'transaction_date, amount, description, category_id'
      : 'transaction_date, amount';

    // Fetch ALL transactions using pagination loop (no arbitrary limits)
    // Supabase has a max of 1000 rows per request, so we paginate until done
    const BATCH_SIZE = 1000;
    let allTransactions = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Clone the query for each batch (need to rebuild since query is mutated)
      let batchQuery = supabaseAdmin
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
        // If we got less than BATCH_SIZE, we've reached the end
        hasMore = batch.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    const transactions = allTransactions;
    console.log(`[Dashboard Stats] Fetched ${transactions.length} total transactions in ${Math.ceil(transactions.length / BATCH_SIZE)} batches`);

    // Fetch all categories for this user to map IDs to names/colors
    let categoriesMap = {};
    if (groupBy === 'category') {
      const { data: categories, error: catError } = await supabaseAdmin
        .from('categories')
        .select('id, name, color')
        .eq('user_id', userId);

      if (!catError && categories) {
        categoriesMap = categories.reduce((map, cat) => {
          map[cat.id] = { name: cat.name, color: cat.color };
          return map;
        }, {});
      }
    }

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
      const groupedByField = {};

      filteredTransactions.forEach(t => {
        let key, categoryColor;

        if (groupBy === 'category') {
          const categoryId = t.category_id;
          if (categoryId && categoriesMap[categoryId]) {
            key = categoryId; // Use ID as key to group properly
            categoryColor = categoriesMap[categoryId].color;
          } else {
            key = 'Sin categoría';
            categoryColor = '#9ca3af';
          }
        } else {
          key = t.description || 'Sin descripción';
        }

        if (!groupedByField[key]) {
          groupedByField[key] = {
            count: 0,
            total: 0,
            amounts: [],
            color: categoryColor // Store color for categories
          };
        }
        groupedByField[key].count += 1;
        groupedByField[key].total += Math.abs(t.amount);
        groupedByField[key].amounts.push(Math.abs(t.amount));
      });

      // Convert to array and sort by total descending
      groupedData = Object.entries(groupedByField)
        .map(([key, data]) => {
          // For categories, get the name from the map; for descriptions, use key as-is
          const name = groupBy === 'category'
            ? (categoriesMap[key]?.name || key)
            : key;

          return {
            name,
            count: data.count,
            total: data.total,
            average: data.total / data.count,
            color: data.color // Include color in response
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    console.log(`[Dashboard Stats] User ${userId}: ${transactions.length} transactions, ${timeSeries.length} periods`);

    res.json({
      success: true,
      summary: {
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
        transactionCount: transactions.length
      },
      timeSeries,
      groupedData
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve dashboard stats'
    });
  }
});

// Get categories by month data (for dashboard table)
app.get('/api/dashboard/categories-by-month', devAuth, async (req, res) => {
  try {
    const { months = 6, type } = req.query;
    const userId = req.user.id;
    const monthsCount = parseInt(months);

    // Calculate date range for last N months
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - (monthsCount - 1), 1);
    const dateFrom = startDate.toISOString().split('T')[0];

    // Fetch all transactions for the period
    const BATCH_SIZE = 1000;
    let allTransactions = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let batchQuery = supabaseAdmin
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
    const { data: categories, error: catError } = await supabaseAdmin
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
      // Parse date as YYYY-MM-DD (extract year and month directly to avoid timezone issues)
      const dateParts = t.transaction_date.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]);
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;

      // Only include months in our range
      if (!monthsList.includes(monthKey)) return;

      const categoryId = t.category_id || 'uncategorized';
      const amount = t.amount; // Keep original sign (negative for expenses, positive for income)

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
      categoryMonthData[categoryId].monthlyTotals[monthKey] += amount;
      categoryMonthData[categoryId].totalOverall += amount;

      // Add to overall monthly total
      if (!monthlyTotals[monthKey]) {
        monthlyTotals[monthKey] = 0;
      }
      monthlyTotals[monthKey] += amount;
    });

    // Convert to array and sort by total descending (by absolute value)
    const categoriesArray = Object.values(categoryMonthData)
      .sort((a, b) => Math.abs(b.totalOverall) - Math.abs(a.totalOverall))
      .filter(cat => cat.totalOverall !== 0); // Only include categories with transactions

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

// Get single transaction
app.get('/api/transactions/:transactionId', devAuth, async (req, res) => {
  try {
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        files:file_id (
          id,
          original_name,
          created_at,
          storage_path
        )
      `)
      .eq('id', req.params.transactionId)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }
      throw error;
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

// Update transaction notes
app.put('/api/transactions/:transactionId/notes', devAuth, async (req, res) => {
  try {
    const { notes } = req.body;
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update({ notes })
      .eq('id', req.params.transactionId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      result: transaction
    });
  } catch (error) {
    console.error('Update transaction notes error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update notes'
    });
  }
});

// Update transaction category
// Update transaction fields (description, etc.)
app.put('/api/transactions/:id', devAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['description', 'notes', 'merchant', 'transaction_date'];
    const updateData = {};

    // Only allow specific fields to be updated
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updateData[key] = req.body[key];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update transaction'
    });
  }
});

app.put('/api/transactions/:transactionId/category', devAuth, async (req, res) => {
  try {
    const { category } = req.body;
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update({ category_id: category })
      .eq('id', req.params.transactionId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      result: transaction
    });
  } catch (error) {
    console.error('Update transaction category error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update category'
    });
  }
});

// Get VEP data for a file
app.get('/api/files/:fileId/vep', devAuth, async (req, res) => {
  try {
    const { data: vep, error } = await supabaseAdmin
      .from('veps')
      .select('*')
      .eq('file_id', req.params.fileId)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      vep
    });
  } catch (error) {
    console.error('Get VEP error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve VEP data'
    });
  }
});

// Delete file
app.delete('/api/files/:fileId', devAuth, async (req, res) => {
  try {
    // Get the file
    const { data: file, error: fileError } = await supabaseAdmin
      .from('files')
      .select('stored_name')
      .eq('id', req.params.fileId)
      .eq('user_id', req.user.id)
      .single();

    if (fileError) {
      throw fileError;
    }

    // Delete all associated transactions first (cascade delete)
    const { error: transactionsError } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('file_id', req.params.fileId)
      .eq('user_id', req.user.id);

    if (transactionsError) {
      console.error('Error deleting associated transactions:', transactionsError);
      throw transactionsError;
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET_NAME || 'uploads')
      .remove([file.stored_name]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
    }

    // Delete from database
    const { error: deleteError } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', req.params.fileId)
      .eq('user_id', req.user.id);

    if (deleteError) {
      throw deleteError;
    }

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete file'
    });
  }
});

// ==========================================
// OAuth Routes
// ==========================================

// Get all connections for user
app.get('/api/connections', devAuth, async (req, res) => {
  try {
    const connections = await connectionsService.getUserConnections(req.user.id);

    // Mask sensitive data
    const maskedConnections = connections.map(conn => ({
      id: conn.id,
      provider: conn.provider,
      provider_user_id: conn.provider_user_id,
      status: conn.status,
      created_at: conn.created_at,
      last_synced_at: conn.last_synced_at,
      metadata: conn.metadata
    }));

    res.json({
      success: true,
      connections: maskedConnections
    });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get connections'
    });
  }
});

// Initiate OAuth flow for Mercado Pago
app.get('/oauth/mercadopago/authorize', devAuth, (req, res) => {
  try {
    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with user ID
    oauthStates.set(state, {
      userId: req.user.id,
      provider: 'mercadopago',
      createdAt: Date.now()
    });

    // Clean up old states (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of oauthStates.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }

    // Get redirect URI from environment variable
    const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;

    // Get authorization URL
    const authUrl = mercadoPagoOAuth.getAuthorizationUrl(state, redirectUri);

    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate OAuth flow'
    });
  }
});

// OAuth callback for Mercado Pago
app.get('/oauth/mercadopago/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Check for OAuth errors
    if (oauthError) {
      return res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(oauthError)}`);
    }

    // Validate state
    const stateData = oauthStates.get(state);
    if (!stateData) {
      return res.redirect('/?error=invalid_state');
    }

    // Delete used state
    oauthStates.delete(state);

    // Exchange code for tokens
    const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;
    const tokenData = await mercadoPagoOAuth.exchangeCodeForToken(code, redirectUri);

    // Get user info from Mercado Pago
    const userInfo = await mercadoPagoOAuth.getUserInfo(tokenData.access_token);

    // Save connection
    await connectionsService.upsertConnection(stateData.userId, 'mercadopago', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      user_id: userInfo.id,
      metadata: {
        email: userInfo.email,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name,
        nickname: userInfo.nickname,
        thumbnail: userInfo.thumbnail,
        logo: userInfo.logo,
        country_id: userInfo.country_id,
        site_id: userInfo.site_id,
        public_key: tokenData.public_key,
        live_mode: tokenData.live_mode
      }
    });

    // Redirect to success page
    res.redirect('/#configuracion?connection=success&provider=mercadopago');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/?error=connection_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// ==========================================
// Enable Banking (EuBanks) OAuth Routes
// ==========================================

// Get available countries from Enable Banking
app.get('/api/eubanks/countries', devAuth, async (req, res) => {
  try {
    // Enable Banking supports these European countries
    const countries = [
      { code: 'FI', name: 'Finland' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'DE', name: 'Germany' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'FR', name: 'France' },
      { code: 'ES', name: 'Spain' },
      { code: 'IT', name: 'Italy' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'BE', name: 'Belgium' },
      { code: 'AT', name: 'Austria' },
      { code: 'PL', name: 'Poland' },
      { code: 'PT', name: 'Portugal' },
      { code: 'IE', name: 'Ireland' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'GR', name: 'Greece' },
      { code: 'HU', name: 'Hungary' },
      { code: 'RO', name: 'Romania' },
      { code: 'BG', name: 'Bulgaria' },
      { code: 'HR', name: 'Croatia' },
      { code: 'SI', name: 'Slovenia' },
      { code: 'SK', name: 'Slovakia' },
      { code: 'LT', name: 'Lithuania' },
      { code: 'LV', name: 'Latvia' },
      { code: 'EE', name: 'Estonia' }
    ];

    res.json({
      success: true,
      countries
    });
  } catch (error) {
    console.error('Get countries error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve countries'
    });
  }
});

// Get available banks for a country
app.get('/api/eubanks/banks/:country', devAuth, async (req, res) => {
  try {
    const { country } = req.params;

    // Fetch banks from Enable Banking API
    const banks = await eubanksOAuth.getAvailableBanks(country);

    res.json({
      success: true,
      banks
    });
  } catch (error) {
    console.error('Get banks error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve banks'
    });
  }
});

// Initiate OAuth flow for Enable Banking
app.post('/oauth/eubanks/authorize', devAuth, async (req, res) => {
  try {
    console.log('🏦 [SERVER] ========== EUBANKS AUTHORIZE REQUEST ==========');
    console.log('🏦 [SERVER] Request body:', req.body);

    const { bankName, country } = req.body;

    console.log('🏦 [SERVER] Extracted - bankName:', bankName);
    console.log('🏦 [SERVER] Extracted - country:', country);

    if (!bankName || !country) {
      console.log('🏦 [SERVER] ❌ Missing bankName or country');
      return res.status(400).json({
        success: false,
        error: 'Bank name and country are required'
      });
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');
    console.log('🏦 [SERVER] Generated state token:', state);

    // Store state with user ID and bank info
    oauthStates.set(state, {
      userId: req.user.id,
      provider: 'eubanks',
      bankName,
      country,
      createdAt: Date.now()
    });

    // Clean up old states
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, value] of oauthStates.entries()) {
      if (value.createdAt < tenMinutesAgo) {
        oauthStates.delete(key);
      }
    }

    // Get redirect URI from environment variable
    const redirectUri = `${process.env.BASE_URL}/oauth/eubanks/callback`;
    console.log('🏦 [SERVER] Redirect URI:', redirectUri);

    // Initiate authorization with Enable Banking
    console.log('🏦 [SERVER] Calling eubanksOAuth.initiateAuthorization with:');
    console.log('🏦 [SERVER] - aspspName:', bankName);
    console.log('🏦 [SERVER] - aspspCountry:', country);
    console.log('🏦 [SERVER] - redirectUri:', redirectUri);
    console.log('🏦 [SERVER] - state:', state);

    const authResult = await eubanksOAuth.initiateAuthorization({
      aspspName: bankName,
      aspspCountry: country,
      redirectUri: redirectUri,
      state: state
    });

    console.log('🏦 [SERVER] ✅ Authorization initiated successfully!');
    console.log('🏦 [SERVER] Auth result:', authResult);

    // Store session ID for later use
    oauthStates.set(state, {
      ...oauthStates.get(state),
      sessionId: authResult.sessionId
    });

    console.log('🏦 [SERVER] Sending response with authUrl:', authResult.authUrl);

    res.json({
      success: true,
      authUrl: authResult.authUrl
    });
  } catch (error) {
    console.error('🏦 [SERVER] ❌ EuBanks OAuth authorize error:', error);
    console.error('🏦 [SERVER] Error details:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate OAuth flow'
    });
  }
});

// OAuth callback for Enable Banking
app.get('/oauth/eubanks/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Check for OAuth errors
    if (oauthError) {
      return res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(oauthError)}`);
    }

    // Validate state
    const stateData = oauthStates.get(state);
    if (!stateData) {
      return res.redirect('/?error=invalid_state');
    }

    // Delete used state
    oauthStates.delete(state);

    // Exchange code for session data
    const redirectUri = `${process.env.BASE_URL}/oauth/eubanks/callback`;
    const sessionData = await eubanksOAuth.exchangeCodeForToken(code, redirectUri);

    // Get user info from Enable Banking
    const userInfo = await eubanksOAuth.getUserInfo(sessionData.sessionId || stateData.sessionId);

    // Save connection
    await connectionsService.upsertConnection(stateData.userId, 'eubanks', {
      access_token: sessionData.sessionId || stateData.sessionId,
      session_id: sessionData.sessionId || stateData.sessionId,
      user_id: userInfo.uid || stateData.sessionId,
      metadata: {
        bank_name: stateData.bankName,
        country: stateData.country,
        accounts: userInfo.accounts || [],
        aspsp: stateData.bankName
      }
    });

    // Redirect to success page
    res.redirect('/#configuracion?connection=success&provider=eubanks');
  } catch (error) {
    console.error('EuBanks OAuth callback error:', error);
    res.redirect(`/?error=connection_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// Disconnect a provider
app.delete('/api/connections/:provider', devAuth, async (req, res) => {
  try {
    const { provider } = req.params;

    // Get connection to revoke token
    const connection = await connectionsService.getConnection(req.user.id, provider);

    if (connection) {
      // Try to revoke token based on provider
      if (provider === 'mercadopago') {
        await mercadoPagoOAuth.revokeToken(connection.access_token);
      } else if (provider === 'eubanks') {
        await eubanksOAuth.revokeToken(connection.session_id || connection.access_token);
      }
    }

    // Delete connection from database
    await connectionsService.deleteConnection(req.user.id, provider);

    res.json({
      success: true,
      message: 'Connection deleted successfully'
    });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete connection'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'DEVELOPMENT',
    user: 'juansegundoferrari@gmail.com',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// Email Inbound Routes
// ==========================================

// Get user's email upload token
app.get('/api/email/token', devAuth, async (req, res) => {
  try {
    const token = await emailInboundService.getOrCreateEmailToken(req.user.id);
    const uploadEmail = `admin+${token}@sheetscentral.com`;

    res.json({
      success: true,
      token,
      uploadEmail
    });
  } catch (error) {
    console.error('Get email token error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get email token'
    });
  }
});

// Regenerate user's email upload token
app.post('/api/email/token/regenerate', devAuth, async (req, res) => {
  try {
    const token = await emailInboundService.regenerateEmailToken(req.user.id);
    const uploadEmail = `admin+${token}@sheetscentral.com`;

    res.json({
      success: true,
      token,
      uploadEmail
    });
  } catch (error) {
    console.error('Regenerate email token error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to regenerate email token'
    });
  }
});

// Public webhook endpoint for Google Apps Script
app.post('/api/email/inbound', async (req, res) => {
  try {
    const { secret, token, fromEmail, subject, attachments } = req.body;

    console.log(`📧 [Email Inbound] Received webhook from: ${fromEmail}`);

    // Verify webhook secret
    if (!emailInboundService.verifyWebhookSecret(secret)) {
      console.error('📧 [Email Inbound] Invalid webhook secret');
      return res.status(401).json({ success: false, error: 'Invalid secret' });
    }

    // Get user ID from token
    const userId = await emailInboundService.getUserIdFromToken(token);
    if (!userId) {
      console.error(`📧 [Email Inbound] Invalid token: ${token}`);
      return res.status(400).json({ success: false, error: 'Invalid upload token' });
    }

    console.log(`📧 [Email Inbound] User found: ${userId}`);

    // Validate attachments
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return res.status(400).json({ success: false, error: 'No attachments provided' });
    }

    const processedFiles = [];
    const errors = [];

    // Process each attachment
    for (const attachment of attachments) {
      try {
        const { filename, content, mimeType } = attachment;

        if (!emailInboundService.isFileSupported(filename)) {
          errors.push({ filename, error: 'Unsupported file type' });
          continue;
        }

        const fileBuffer = Buffer.from(content, 'base64');
        const fileMimeType = mimeType || emailInboundService.getMimeType(filename);
        const storedName = uploadConfig.generateFileName(filename);
        const bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';

        console.log(`📧 [Email Inbound] Processing attachment: ${filename}`);

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(storedName, fileBuffer, {
            contentType: fileMimeType,
            upsert: false
          });

        if (uploadError) {
          errors.push({ filename, error: uploadError.message });
          continue;
        }

        const { data: urlData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(storedName);

        const { data: fileRecord, error: dbError } = await supabaseAdmin
          .from('files')
          .insert({
            original_name: filename,
            stored_name: storedName,
            file_size: fileBuffer.length,
            mime_type: fileMimeType,
            storage_path: uploadData.path,
            public_url: urlData.publicUrl,
            user_id: userId,
            processing_status: 'pending',
            upload_source: 'email',
            upload_metadata: { from_email: fromEmail, subject: subject }
          })
          .select()
          .single();

        if (dbError) {
          errors.push({ filename, error: dbError.message });
          continue;
        }

        processorService.processFile(fileRecord, fileBuffer)
          .then(result => console.log(`📧 [Email Inbound] File processed: ${filename}`, result))
          .catch(error => console.error(`📧 [Email Inbound] Processing failed: ${filename}`, error));

        processedFiles.push({ filename, fileId: fileRecord.id, status: 'processing' });
      } catch (attachmentError) {
        errors.push({ filename: attachment.filename, error: attachmentError.message });
      }
    }

    console.log(`📧 [Email Inbound] Completed. Processed: ${processedFiles.length}, Errors: ${errors.length}`);

    res.json({
      success: true,
      processed: processedFiles.length,
      errors: errors.length,
      files: processedFiles,
      errorDetails: errors
    });
  } catch (error) {
    console.error('📧 [Email Inbound] Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Transaction Sync Routes
// ==========================================

// Sync Mercado Pago transactions
app.post('/api/sync/mercadopago', devAuth, async (req, res) => {
  try {
    // Get connection
    const connection = await connectionsService.getConnection(req.user.id, 'mercadopago');

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Mercado Pago connection not found. Please connect first.'
      });
    }

    if (connection.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Connection is not active. Please reconnect.'
      });
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (connection.expires_at && new Date() >= new Date(connection.expires_at)) {
      console.log('[Sync] Refreshing expired Mercado Pago token');
      try {
        const refreshed = await mercadoPagoOAuth.refreshAccessToken(connection.refresh_token);
        await connectionsService.updateConnectionTokens(connection.id, refreshed);
        accessToken = refreshed.access_token;
      } catch (refreshError) {
        console.error('[Sync] Token refresh failed:', refreshError);
        await connectionsService.updateConnectionStatus(connection.id, 'expired');
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please reconnect Mercado Pago.'
        });
      }
    }

    // Parse date range from request (optional)
    const options = {};
    if (req.body.fromDate) {
      options.fromDate = new Date(req.body.fromDate);
    }
    if (req.body.toDate) {
      options.toDate = new Date(req.body.toDate);
    }

    // Sync transactions
    const result = await mercadoPagoSync.syncPayments(
      req.user.id,
      accessToken,
      connection.id,
      options
    );

    // Update last synced timestamp
    await connectionsService.updateLastSynced(connection.id);

    // Create sync log
    await connectionsService.createSyncLog(connection.id, req.user.id, {
      sync_type: 'transactions',
      status: 'success',
      records_synced: result.syncedCount,
      metadata: {
        skipped: result.skippedCount,
        totalFetched: result.totalFetched
      }
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Mercado Pago sync error:', error);

    // Log the failed sync
    try {
      const connection = await connectionsService.getConnection(req.user.id, 'mercadopago');
      if (connection) {
        await connectionsService.createSyncLog(connection.id, req.user.id, {
          sync_type: 'transactions',
          status: 'error',
          error_message: error.message
        });
      }
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync transactions'
    });
  }
});

// Sync Mercury transactions
app.post('/api/sync/mercury', devAuth, async (req, res) => {
  try {
    // Get connection
    const connection = await connectionsService.getConnection(req.user.id, 'mercury');

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Mercury connection not found. Please connect first.'
      });
    }

    if (connection.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Connection is not active. Please reconnect.'
      });
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (connection.expires_at && new Date() >= new Date(connection.expires_at)) {
      console.log('[Sync] Refreshing expired Mercury token');
      try {
        const refreshed = await mercuryOAuth.refreshAccessToken(connection.refresh_token);
        await connectionsService.updateConnectionTokens(connection.id, refreshed);
        accessToken = refreshed.access_token;
      } catch (refreshError) {
        console.error('[Sync] Token refresh failed:', refreshError);
        await connectionsService.updateConnectionStatus(connection.id, 'expired');
        return res.status(401).json({
          success: false,
          error: 'Token expired. Please reconnect Mercury.'
        });
      }
    }

    // Parse date range from request (optional)
    const options = {};
    if (req.body.fromDate) {
      options.fromDate = new Date(req.body.fromDate);
    }
    if (req.body.toDate) {
      options.toDate = new Date(req.body.toDate);
    }

    // Sync transactions
    const result = await mercurySync.syncTransactions(
      req.user.id,
      accessToken,
      connection.id,
      options
    );

    // Update last synced timestamp
    await connectionsService.updateLastSynced(connection.id);

    // Create sync log
    await connectionsService.createSyncLog(connection.id, req.user.id, {
      sync_type: 'transactions',
      status: 'success',
      records_synced: result.syncedCount,
      metadata: {
        skipped: result.skippedCount,
        accountsProcessed: result.accountsProcessed
      }
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Mercury sync error:', error);

    // Log the failed sync
    try {
      const connection = await connectionsService.getConnection(req.user.id, 'mercury');
      if (connection) {
        await connectionsService.createSyncLog(connection.id, req.user.id, {
          sync_type: 'transactions',
          status: 'error',
          error_message: error.message
        });
      }
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync transactions'
    });
  }
});

// ==========================================
// Recurring Services Routes
// ==========================================

// IMPORTANT: Specific routes must come BEFORE parameterized routes (:id)

// Detect recurring services from transactions
app.post('/api/services/detect', devAuth, async (req, res) => {
  try {
    const { minOccurrences, lookbackMonths } = req.body;
    const detected = await recurringServicesService.detectRecurringServices(req.user.id, {
      minOccurrences: minOccurrences || 2,
      lookbackMonths: lookbackMonths || 12
    });

    res.json({
      success: true,
      detected,
      count: detected.length
    });
  } catch (error) {
    console.error('Detect services error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect services'
    });
  }
});

// Save detected services (confirm and create)
app.post('/api/services/save-detected', devAuth, async (req, res) => {
  try {
    const { services } = req.body;

    if (!services || !Array.isArray(services)) {
      return res.status(400).json({
        success: false,
        error: 'Services array is required'
      });
    }

    const results = await recurringServicesService.saveDetectedServices(req.user.id, services);

    res.json({
      success: true,
      ...results
    });
  } catch (error) {
    console.error('Save detected services error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save services'
    });
  }
});

// Get upcoming payments (calendar view)
app.get('/api/services/calendar/upcoming', devAuth, async (req, res) => {
  try {
    const { months } = req.query;
    const predictions = await recurringServicesService.getUpcomingPayments(req.user.id, {
      months: parseInt(months) || 3
    });

    res.json({
      success: true,
      predictions
    });
  } catch (error) {
    console.error('Get upcoming payments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get upcoming payments'
    });
  }
});

// Get payments for a specific month
app.get('/api/services/calendar/:year/:month', devAuth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const payments = await recurringServicesService.getMonthPayments(
      req.user.id,
      parseInt(year),
      parseInt(month)
    );

    res.json({
      success: true,
      ...payments
    });
  } catch (error) {
    console.error('Get month payments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get month payments'
    });
  }
});

// Unlink a payment
app.delete('/api/services/payments/:paymentId', devAuth, async (req, res) => {
  try {
    await recurringServicesService.unlinkTransaction(req.user.id, req.params.paymentId);

    res.json({
      success: true,
      message: 'Payment unlinked'
    });
  } catch (error) {
    console.error('Unlink payment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unlink payment'
    });
  }
});

// Get all recurring services for user
app.get('/api/services', devAuth, async (req, res) => {
  try {
    const { status, includePayments } = req.query;
    const services = await recurringServicesService.getServices(req.user.id, {
      status: status || 'all',
      includePayments: includePayments === 'true'
    });

    res.json({
      success: true,
      services
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get services'
    });
  }
});

// Create a new service
app.post('/api/services', devAuth, async (req, res) => {
  try {
    const service = await recurringServicesService.createService(req.user.id, req.body);

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create service'
    });
  }
});

// Get a single service (parameterized route - must come after specific routes)
app.get('/api/services/:id', devAuth, async (req, res) => {
  try {
    const service = await recurringServicesService.getService(req.user.id, req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get service'
    });
  }
});

// Update a service
app.put('/api/services/:id', devAuth, async (req, res) => {
  try {
    const service = await recurringServicesService.updateService(req.user.id, req.params.id, req.body);

    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update service'
    });
  }
});

// Delete a service
app.delete('/api/services/:id', devAuth, async (req, res) => {
  try {
    await recurringServicesService.deleteService(req.user.id, req.params.id);

    res.json({
      success: true,
      message: 'Service deleted'
    });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete service'
    });
  }
});

// Get payments for a service
app.get('/api/services/:id/payments', devAuth, async (req, res) => {
  try {
    const { limit, includeTransactionDetails } = req.query;
    const payments = await recurringServicesService.getServicePayments(req.user.id, req.params.id, {
      limit: parseInt(limit) || 50,
      includeTransactionDetails: includeTransactionDetails === 'true'
    });

    res.json({
      success: true,
      payments
    });
  } catch (error) {
    console.error('Get service payments error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payments'
    });
  }
});

// Link a transaction to a service
app.post('/api/services/:id/link', devAuth, async (req, res) => {
  try {
    const { transactionId, paymentData } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Transaction ID is required'
      });
    }

    const payment = await recurringServicesService.linkTransactionToService(
      req.user.id,
      req.params.id,
      transactionId,
      paymentData
    );

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Link transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to link transaction'
    });
  }
});

// Get service linked to a transaction
app.get('/api/transactions/:id/service', devAuth, async (req, res) => {
  try {
    const servicePayment = await recurringServicesService.getTransactionService(
      req.user.id,
      req.params.id
    );

    res.json({
      success: true,
      service: servicePayment ? servicePayment.recurring_services : null,
      payment: servicePayment
    });
  } catch (error) {
    console.error('Get transaction service error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transaction service'
    });
  }
});

// Find potential service matches for a transaction
app.get('/api/transactions/:id/matches', devAuth, async (req, res) => {
  try {
    const matches = await recurringServicesService.findPotentialMatches(
      req.user.id,
      req.params.id
    );

    res.json({
      success: true,
      matches
    });
  } catch (error) {
    console.error('Find matches error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to find matches'
    });
  }
});

// Unlink transaction from service (by payment ID)
app.delete('/api/services/payments/:paymentId/unlink', devAuth, async (req, res) => {
  try {
    // Get payment to extract service_id before deleting
    const { data: payment } = await supabaseAdmin
      .from('service_payments')
      .select('service_id')
      .eq('id', req.params.paymentId)
      .eq('user_id', req.user.id)
      .single();

    const serviceId = payment?.service_id;

    // Unlink the transaction
    await recurringServicesService.unlinkTransaction(req.user.id, req.params.paymentId);

    // Recalculate service status if we have service_id
    if (serviceId) {
      await recurringServicesService.recalculateServiceStatus(req.user.id, serviceId);
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Unlink transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to unlink transaction'
    });
  }
});

// Link transaction to service (create payment)
app.post('/api/services/:serviceId/payments', devAuth, async (req, res) => {
  try {
    const { transaction_id, matched_by, match_confidence } = req.body;

    if (!transaction_id) {
      return res.status(400).json({
        success: false,
        error: 'transaction_id is required'
      });
    }

    // Get transaction to extract payment details
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', transaction_id)
      .eq('user_id', req.user.id)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Check if transaction is already linked to a service
    const { data: existingPayment } = await supabaseAdmin
      .from('service_payments')
      .select('id')
      .eq('transaction_id', transaction_id)
      .eq('user_id', req.user.id)
      .single();

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        error: 'Transaction is already linked to a service'
      });
    }

    // Create service payment
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('service_payments')
      .insert({
        service_id: req.params.serviceId,
        transaction_id: transaction_id,
        user_id: req.user.id,
        payment_date: transaction.transaction_date,
        amount: transaction.amount,
        currency: transaction.currency || 'ARS',
        status: 'paid',
        is_predicted: false,
        match_confidence: match_confidence || 100,
        matched_by: matched_by || 'manual'
      })
      .select()
      .single();

    if (paymentError) {
      throw paymentError;
    }

    // Recalculate service status and next payment date automatically
    await recurringServicesService.recalculateServiceStatus(req.user.id, req.params.serviceId);

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Link transaction error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to link transaction'
    });
  }
});

// Recalculate all services for a user
app.post('/api/services/recalculate-all', devAuth, async (req, res) => {
  try {
    const result = await recurringServicesService.recalculateAllServices(req.user.id);

    res.json(result);
  } catch (error) {
    console.error('Recalculate all services error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to recalculate services'
    });
  }
});

// =============================================
// CATEGORIES API ENDPOINTS
// =============================================

// Get all categories for user
app.get('/api/categories', devAuth, async (req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('user_id', req.user.id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      categories: categories || []
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching categories'
    });
  }
});

// Create a new category
app.post('/api/categories', devAuth, async (req, res) => {
  try {
    const { name, color, description, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es requerido'
      });
    }

    // Check category limit (max 30)
    const { count, error: countError } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (countError) throw countError;

    if (count >= 30) {
      return res.status(400).json({
        success: false,
        error: 'Has alcanzado el límite máximo de 30 categorías'
      });
    }

    // Determine sort_order: use provided value or get next available
    let finalSortOrder;
    if (sort_order !== undefined && sort_order !== null) {
      finalSortOrder = parseInt(sort_order, 10);
    } else {
      const { data: maxOrder } = await supabaseAdmin
        .from('categories')
        .select('sort_order')
        .eq('user_id', req.user.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      finalSortOrder = (maxOrder?.sort_order || 0) + 1;
    }

    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
        color: color || '#9CA3AF',
        description: description?.trim() || null,
        sort_order: finalSortOrder,
        is_system: false
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Ya existe una categoría con ese nombre'
        });
      }
      throw error;
    }

    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating category'
    });
  }
});

// Update a category
app.put('/api/categories/:id', devAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, description, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El nombre es requerido'
      });
    }

    const updateData = {
      name: name.trim(),
      color: color || '#9CA3AF',
      description: description?.trim() || null
    };

    // Only update sort_order if provided
    if (sort_order !== undefined && sort_order !== null) {
      updateData.sort_order = parseInt(sort_order, 10);
    }

    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({
          success: false,
          error: 'Ya existe una categoría con ese nombre'
        });
      }
      throw error;
    }

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'Categoría no encontrada'
      });
    }

    res.json({
      success: true,
      category
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error updating category'
    });
  }
});

// Delete a category
app.delete('/api/categories/:id', devAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Categoría eliminada'
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error deleting category'
    });
  }
});

// =============================================
// CATEGORY RULES ENDPOINTS (Auto-categorization)
// =============================================

const categorizationService = require('./services/categorization.service');

// Get all category rules for the authenticated user
app.get('/api/category-rules', devAuth, async (req, res) => {
  try {
    const rules = await categorizationService.getCategoryRules(req.user.id);

    res.json({
      success: true,
      rules: rules || []
    });
  } catch (error) {
    console.error('Error fetching category rules:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching category rules'
    });
  }
});

// Get rules for a specific category
app.get('/api/category-rules/category/:categoryId', devAuth, async (req, res) => {
  try {
    const { categoryId } = req.params;
    const rules = await categorizationService.getRulesByCategory(categoryId, req.user.id);

    res.json({
      success: true,
      rules: rules || []
    });
  } catch (error) {
    console.error('Error fetching category rules:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error fetching category rules'
    });
  }
});

// Add a new category rule
app.post('/api/category-rules', devAuth, async (req, res) => {
  try {
    const { category_id, keyword, match_field, priority, case_sensitive, is_regex } = req.body;

    if (!category_id || !keyword || !keyword.trim()) {
      return res.status(400).json({
        success: false,
        error: 'category_id and keyword are required'
      });
    }

    const ruleData = {
      user_id: req.user.id,
      category_id,
      keyword: keyword.trim(),
      match_field: match_field || 'both',
      priority: priority !== undefined ? parseInt(priority, 10) : 0,
      case_sensitive: case_sensitive || false,
      is_regex: is_regex || false
    };

    const rule = await categorizationService.addCategoryRule(ruleData);

    res.json({
      success: true,
      rule
    });
  } catch (error) {
    console.error('Error creating category rule:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error creating category rule'
    });
  }
});

// Delete a category rule
app.delete('/api/category-rules/:ruleId', devAuth, async (req, res) => {
  try {
    const { ruleId } = req.params;

    await categorizationService.deleteCategoryRule(ruleId, req.user.id);

    res.json({
      success: true,
      message: 'Regla eliminada'
    });
  } catch (error) {
    console.error('Error deleting category rule:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error deleting category rule'
    });
  }
});

// =============================================
// USER UPLOAD EMAIL ENDPOINTS
// =============================================

// Get user's upload email
app.get('/api/user/upload-email', devAuth, async (req, res) => {
  try {
    const token = req.user.id.substring(0, 8);
    const email = `upload-${token}@uploads.maneki.app`;
    res.json({ success: true, email });
  } catch (error) {
    console.error('Error getting upload email:', error);
    res.status(500).json({
      success: false,
      error: 'Error getting upload email'
    });
  }
});

// Regenerate user's upload email
app.post('/api/user/upload-email/regenerate', devAuth, async (req, res) => {
  try {
    const crypto = require('crypto');
    const token = crypto.randomBytes(4).toString('hex');
    const email = `upload-${token}@uploads.maneki.app`;
    res.json({ success: true, email });
  } catch (error) {
    console.error('Error regenerating upload email:', error);
    res.status(500).json({
      success: false,
      error: 'Error regenerating upload email'
    });
  }
});

// =====================================================
// CRON JOBS
// =====================================================

/**
 * Daily cron job to update exchange rates and process unconverted transactions
 * Runs every day at 2:00 AM (server time)
 */
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Starting daily exchange rate update job...');
  try {
    const result = await exchangeRateService.processDailyCron();
    console.log(`[CRON] Daily exchange rate job completed: ${result.processed} transactions processed, ${result.failed} failed`);
  } catch (error) {
    console.error('[CRON] Daily exchange rate job failed:', error);
  }
});

console.log('[CRON] Daily exchange rate job scheduled: 2:00 AM every day');

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running in DEVELOPMENT MODE on port ${PORT}`);
  console.log(`👤 Simulated user: juansegundoferrari@gmail.com`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Open: http://localhost:${PORT}`);
});

//start server dev: npm run dev:auth
