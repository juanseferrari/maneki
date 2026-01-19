require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
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

// Temporary storage for OAuth states (use Redis in production)
const oauthStates = new Map();

// Clean up expired states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) { // 10 minutes
      oauthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client for backend operations (bypasses RLS)
// Use service_role key for admin operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Initialize Supabase client for auth verification (uses anon key)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configure multer for memory storage
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

// Middleware to verify Supabase session
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  req.user = user;
  next();
}

// ==========================================
// Routes
// ==========================================

// Home page
app.get('/', (req, res) => {
  res.render('index-supabase', {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    maxSizeMB: process.env.MAX_FILE_SIZE_MB || 10,
    allowedTypes: uploadConfig.allowedExtensions.join(', ')
  });
});

// Upload endpoint - Protected
app.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }

    const fileName = uploadConfig.generateFileName(req.file.originalname);
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';

    // Step 1: Upload file to Supabase Storage (use admin client)
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

    // Step 2: Create file metadata record in database (use admin client)
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

// List files endpoint - Protected
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const { data: files, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false});

    if (error) {
      throw error;
    }

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

// Get single file by ID - Protected
app.get('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    const { data: file, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', req.params.fileId)
      .eq('user_id', req.user.id)
      .single();

    if (error) {
      throw error;
    }

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.json({
      success: true,
      file
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve file'
    });
  }
});

// Get transactions for a file - Protected
app.get('/api/files/:fileId/transactions', requireAuth, async (req, res) => {
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

// Get all transactions with pagination and filters - Protected
app.get('/api/transactions', requireAuth, async (req, res) => {
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
      amountMax          // New: maximum amount
    } = req.query;

    console.log('[Transactions API] Filters received:', { categories, amountType, amountMin, amountMax });

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
        countQuery = countQuery.or(`category.in.(${categoryArray.join(',')}),category.is.null`);
        dataQuery = dataQuery.or(`category.in.(${categoryArray.join(',')}),category.is.null`);
      } else if (categoryArray.length > 0) {
        // Only specific categories selected
        countQuery = countQuery.in('category', categoryArray);
        dataQuery = dataQuery.in('category', categoryArray);
      } else if (includeNoCategory === 'true') {
        // Only null category selected
        countQuery = countQuery.is('category', null);
        dataQuery = dataQuery.is('category', null);
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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// Soft delete a transaction (mark as deleted)
app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete by setting status to 'deleted'
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

    res.json({
      success: true,
      message: 'Transaction deleted successfully',
      transaction: data
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
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  try {
    const { dateFrom, dateTo, type, period = 'monthly', groupBy = 'none' } = req.query;
    const userId = req.user.id;

    // Determine which fields to fetch based on groupBy
    const selectFields = groupBy !== 'none'
      ? 'transaction_date, amount, description, category'
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
          const categoryId = t.category;
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

// Get single transaction - Protected
app.get('/api/transactions/:transactionId', requireAuth, async (req, res) => {
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

// Update transaction category - Protected
app.put('/api/transactions/:transactionId/category', requireAuth, async (req, res) => {
  try {
    const { category } = req.body;
    const { data: transaction, error } = await supabaseAdmin
      .from('transactions')
      .update({ category })
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

// Update transaction fields (description, merchant, notes) - Protected
app.put('/api/transactions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = ['description', 'notes', 'merchant'];
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

// Get VEP data for a file - Protected
app.get('/api/files/:fileId/vep', requireAuth, async (req, res) => {
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

// Delete file - Protected
app.delete('/api/files/:fileId', requireAuth, async (req, res) => {
  try {
    // First get the file to get the stored name
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('stored_name')
      .eq('id', req.params.fileId)
      .eq('user_id', req.user.id)
      .single();

    if (fileError) {
      throw fileError;
    }

    // Delete from storage
    const { error: storageError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET_NAME || 'uploads')
      .remove([file.stored_name]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
    }

    // Delete from database (will cascade delete transactions and veps)
    const { error: deleteError } = await supabase
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
app.get('/api/connections', requireAuth, async (req, res) => {
  try {
    const connections = await connectionsService.getUserConnections(req.user.id);

    // Don't send sensitive tokens to frontend
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
      error: error.message || 'Failed to retrieve connections'
    });
  }
});

// Initiate Mercado Pago OAuth flow
app.get('/oauth/mercadopago/authorize', requireAuth, (req, res) => {
  try {
    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state temporarily (in production, use Redis)
    oauthStates.set(state, {
      userId: req.user.id,
      provider: 'mercadopago',
      createdAt: Date.now()
    });

    // Get the callback URL from environment variable
    const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;

    // Get authorization URL from Mercado Pago
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

// Mercado Pago OAuth callback
app.get('/oauth/mercadopago/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Check for OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(oauthError)}`);
    }

    // Validate state token
    const stateData = oauthStates.get(state);
    if (!stateData) {
      console.error('Invalid or expired state token');
      return res.redirect('/?error=invalid_state');
    }

    // Remove used state token
    oauthStates.delete(state);

    // Exchange code for tokens
    const redirectUri = `${process.env.BASE_URL}/oauth/mercadopago/callback`;
    const tokenData = await mercadoPagoOAuth.exchangeCodeForToken(code, redirectUri);

    // Get user info from Mercado Pago
    const userInfo = await mercadoPagoOAuth.getUserInfo(tokenData.access_token);

    // Save connection to database
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

    // Redirect back to settings with success message
    res.redirect('/#configuracion?connection=success&provider=mercadopago');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// ==========================================
// Enable Banking (EuBanks) OAuth Routes
// ==========================================

// Get available countries from Enable Banking
app.get('/api/eubanks/countries', requireAuth, async (req, res) => {
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
app.get('/api/eubanks/banks/:country', requireAuth, async (req, res) => {
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
app.post('/oauth/eubanks/authorize', requireAuth, async (req, res) => {
  try {
    const { bankName, country } = req.body;

    if (!bankName || !country) {
      return res.status(400).json({
        success: false,
        error: 'Bank name and country are required'
      });
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

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

    // Initiate authorization with Enable Banking
    const authResult = await eubanksOAuth.initiateAuthorization({
      aspspName: bankName,
      aspspCountry: country,
      redirectUri: redirectUri,
      state: state
    });

    // Store session ID for later use
    oauthStates.set(state, {
      ...oauthStates.get(state),
      sessionId: authResult.sessionId
    });

    res.json({
      success: true,
      authUrl: authResult.authUrl
    });
  } catch (error) {
    console.error('EuBanks OAuth authorize error:', error);
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
    const userInfo = await eubanksOAuth.getUserInfo(sessionData.session_id || stateData.sessionId);

    // Save connection
    await connectionsService.upsertConnection(stateData.userId, 'eubanks', {
      access_token: sessionData.session_id || stateData.sessionId,
      session_id: sessionData.session_id || stateData.sessionId,
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
app.delete('/api/connections/:provider', requireAuth, async (req, res) => {
  try {
    const provider = req.params.provider;

    // Get connection to revoke token
    const connection = await connectionsService.getConnection(req.user.id, provider);

    if (connection) {
      // Revoke token with provider
      if (provider === 'mercadopago') {
        try {
          await mercadoPagoOAuth.revokeToken(connection.access_token);
        } catch (error) {
          console.error('Error revoking token:', error);
          // Continue with deletion even if revoke fails
        }
      } else if (provider === 'eubanks') {
        try {
          await eubanksOAuth.revokeToken(connection.session_id || connection.access_token);
        } catch (error) {
          console.error('Error revoking token:', error);
          // Continue with deletion even if revoke fails
        }
      } else if (provider === 'mercury') {
        try {
          await mercuryOAuth.revokeToken(connection.access_token);
        } catch (error) {
          console.error('Error revoking token:', error);
          // Continue with deletion even if revoke fails
        }
      }
    }

    // Delete from database
    await connectionsService.deleteConnection(req.user.id, provider);

    res.json({
      success: true,
      message: 'Connection deleted successfully'
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect provider'
    });
  }
});

// ==========================================
// Mercury OAuth Routes
// ==========================================

// Initiate Mercury OAuth flow
app.get('/oauth/mercury/authorize', requireAuth, (req, res) => {
  try {
    // Generate state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');

    // Store state temporarily
    oauthStates.set(state, {
      userId: req.user.id,
      provider: 'mercury',
      createdAt: Date.now()
    });

    // Get the callback URL
    const redirectUri = `${process.env.BASE_URL}/oauth/mercury/callback`;

    // Get authorization URL from Mercury
    const authUrl = mercuryOAuth.getAuthorizationUrl(state, redirectUri);

    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('Mercury OAuth authorize error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate OAuth flow'
    });
  }
});

// Mercury OAuth callback
app.get('/oauth/mercury/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // Check for OAuth errors
    if (oauthError) {
      console.error('Mercury OAuth error:', oauthError);
      return res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(oauthError)}`);
    }

    // Validate state token
    const stateData = oauthStates.get(state);
    if (!stateData) {
      console.error('Invalid or expired state token');
      return res.redirect('/?error=invalid_state');
    }

    // Remove used state token
    oauthStates.delete(state);

    // Exchange code for tokens
    const redirectUri = `${process.env.BASE_URL}/oauth/mercury/callback`;
    const tokenData = await mercuryOAuth.exchangeCodeForToken(code, redirectUri);

    // Get user/account info from Mercury
    const userInfo = await mercuryOAuth.getUserInfo(tokenData.access_token);

    // Save connection to database
    await connectionsService.upsertConnection(stateData.userId, 'mercury', {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      user_id: userInfo.id,
      metadata: {
        company_name: userInfo.company_name,
        primary_account_id: userInfo.primary_account_id,
        accounts: userInfo.accounts
      }
    });

    // Redirect back to settings with success message
    res.redirect('/#configuracion?connection=success&provider=mercury');
  } catch (error) {
    console.error('Mercury OAuth callback error:', error);
    res.redirect(`/?error=oauth_failed&message=${encodeURIComponent(error.message)}`);
  }
});

// ==========================================
// Transaction Sync Routes
// ==========================================

// Sync Mercado Pago transactions
app.post('/api/sync/mercadopago', requireAuth, async (req, res) => {
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
app.post('/api/sync/mercury', requireAuth, async (req, res) => {
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

// Get Mercury account balances
app.get('/api/mercury/balances', requireAuth, async (req, res) => {
  try {
    const connection = await connectionsService.getConnection(req.user.id, 'mercury');

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Mercury connection not found'
      });
    }

    const balances = await mercurySync.getBalances(connection.access_token);

    res.json({
      success: true,
      balances
    });
  } catch (error) {
    console.error('Get Mercury balances error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get balances'
    });
  }
});

// Get Mercado Pago balance
app.get('/api/mercadopago/balance', requireAuth, async (req, res) => {
  try {
    const connection = await connectionsService.getConnection(req.user.id, 'mercadopago');

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Mercado Pago connection not found'
      });
    }

    const balance = await mercadoPagoSync.getBalance(connection.access_token);

    res.json({
      success: true,
      balance
    });
  } catch (error) {
    console.error('Get Mercado Pago balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get balance'
    });
  }
});

// ==========================================
// Email Inbound Webhook (Public - secured by secret)
// ==========================================

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
      await emailInboundService.logEmailEvent({
        userId: null,
        fromEmail,
        subject,
        attachmentCount: attachments?.length || 0,
        status: 'failed',
        errorMessage: 'Invalid upload token'
      });
      return res.status(400).json({ success: false, error: 'Invalid upload token' });
    }

    console.log(`📧 [Email Inbound] User found: ${userId}`);

    // Validate attachments
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      await emailInboundService.logEmailEvent({
        userId,
        fromEmail,
        subject,
        attachmentCount: 0,
        status: 'failed',
        errorMessage: 'No attachments found'
      });
      return res.status(400).json({ success: false, error: 'No attachments provided' });
    }

    const processedFiles = [];
    const errors = [];

    // Process each attachment
    for (const attachment of attachments) {
      try {
        const { filename, content, mimeType } = attachment;

        // Validate file type
        if (!emailInboundService.isFileSupported(filename)) {
          errors.push({ filename, error: 'Unsupported file type' });
          continue;
        }

        // Decode base64 content
        const fileBuffer = Buffer.from(content, 'base64');
        const fileMimeType = mimeType || emailInboundService.getMimeType(filename);

        // Generate unique filename
        const storedName = uploadConfig.generateFileName(filename);
        const bucketName = process.env.SUPABASE_BUCKET_NAME || 'uploads';

        console.log(`📧 [Email Inbound] Processing attachment: ${filename}`);

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from(bucketName)
          .upload(storedName, fileBuffer, {
            contentType: fileMimeType,
            upsert: false
          });

        if (uploadError) {
          console.error(`📧 [Email Inbound] Upload error for ${filename}:`, uploadError);
          errors.push({ filename, error: uploadError.message });
          continue;
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from(bucketName)
          .getPublicUrl(storedName);

        // Create file record in database
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
            upload_metadata: {
              from_email: fromEmail,
              subject: subject
            }
          })
          .select()
          .single();

        if (dbError) {
          console.error(`📧 [Email Inbound] DB error for ${filename}:`, dbError);
          errors.push({ filename, error: dbError.message });
          continue;
        }

        console.log(`📧 [Email Inbound] File record created: ${fileRecord.id}`);

        // Process file with OCR Manager (async)
        processorService.processFile(fileRecord, fileBuffer)
          .then(result => {
            console.log(`📧 [Email Inbound] File processed: ${filename}`, result);
          })
          .catch(error => {
            console.error(`📧 [Email Inbound] Processing failed: ${filename}`, error);
          });

        processedFiles.push({
          filename,
          fileId: fileRecord.id,
          status: 'processing'
        });
      } catch (attachmentError) {
        console.error(`📧 [Email Inbound] Error processing attachment:`, attachmentError);
        errors.push({ filename: attachment.filename, error: attachmentError.message });
      }
    }

    // Log the email event
    await emailInboundService.logEmailEvent({
      userId,
      fromEmail,
      subject,
      attachmentCount: attachments.length,
      processedFiles,
      status: processedFiles.length > 0 ? 'success' : 'failed',
      errorMessage: errors.length > 0 ? JSON.stringify(errors) : null
    });

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
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process email'
    });
  }
});

// Get user's email upload token
app.get('/api/email/token', requireAuth, async (req, res) => {
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
app.post('/api/email/token/regenerate', requireAuth, async (req, res) => {
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

// ==========================================
// Recurring Services Routes
// ==========================================

// IMPORTANT: Specific routes must come BEFORE parameterized routes (:id)

// Detect recurring services from transactions
app.post('/api/services/detect', requireAuth, async (req, res) => {
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
app.post('/api/services/save-detected', requireAuth, async (req, res) => {
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
app.get('/api/services/calendar/upcoming', requireAuth, async (req, res) => {
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
app.get('/api/services/calendar/:year/:month', requireAuth, async (req, res) => {
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
app.delete('/api/services/payments/:paymentId', requireAuth, async (req, res) => {
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
app.get('/api/services', requireAuth, async (req, res) => {
  try {
    const { status, includePayments } = req.query;
    const services = await recurringServicesService.getServices(req.user.id, {
      status: status || 'active',
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
app.post('/api/services', requireAuth, async (req, res) => {
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
app.get('/api/services/:id', requireAuth, async (req, res) => {
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
app.put('/api/services/:id', requireAuth, async (req, res) => {
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
app.delete('/api/services/:id', requireAuth, async (req, res) => {
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
app.get('/api/services/:id/payments', requireAuth, async (req, res) => {
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
app.post('/api/services/:id/link', requireAuth, async (req, res) => {
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
app.get('/api/transactions/:id/service', requireAuth, async (req, res) => {
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
app.get('/api/transactions/:id/matches', requireAuth, async (req, res) => {
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
app.delete('/api/services/payments/:paymentId/unlink', requireAuth, async (req, res) => {
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
app.post('/api/services/:serviceId/payments', requireAuth, async (req, res) => {
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
app.post('/api/services/recalculate-all', requireAuth, async (req, res) => {
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

// ==========================================
// Categories API
// ==========================================

const MAX_CATEGORIES_PER_USER = 30;

// Get all categories for user
app.get('/api/categories', requireAuth, async (req, res) => {
  try {
    const { data: categories, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('user_id', req.user.id)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // If user has no categories, create defaults
    if (!categories || categories.length === 0) {
      const { data: newCategories, error: createError } = await supabaseAdmin.rpc(
        'create_default_categories_for_user',
        { p_user_id: req.user.id }
      );

      if (createError) {
        console.error('Error creating default categories:', createError);
      }

      // Fetch the newly created categories
      const { data: createdCategories, error: fetchError } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('user_id', req.user.id)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;

      return res.json({ success: true, categories: createdCategories || [] });
    }

    res.json({ success: true, categories });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create category
app.post('/api/categories', requireAuth, async (req, res) => {
  try {
    const { name, color, icon, description, parent_id, sort_order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    // Check category limit
    const { count, error: countError } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (countError) throw countError;

    if (count >= MAX_CATEGORIES_PER_USER) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_CATEGORIES_PER_USER} categories allowed per user`
      });
    }

    // Determine sort_order: use provided value or get next available
    let finalSortOrder;
    if (sort_order !== undefined && sort_order !== null) {
      finalSortOrder = parseInt(sort_order, 10);
    } else {
      const { data: maxOrderResult } = await supabaseAdmin
        .from('categories')
        .select('sort_order')
        .eq('user_id', req.user.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      finalSortOrder = (maxOrderResult?.sort_order || 0) + 1;
    }

    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .insert({
        user_id: req.user.id,
        name: name.trim(),
        color: color || '#9CA3AF',
        icon: icon || null,
        description: description || null,
        parent_id: parent_id || null,
        sort_order: finalSortOrder,
        is_system: false
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ success: false, error: 'A category with this name already exists' });
      }
      throw error;
    }

    res.json({ success: true, category });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update category
app.put('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    const { name, color, icon, description, parent_id, sort_order } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    if (description !== undefined) updateData.description = description;
    if (parent_id !== undefined) updateData.parent_id = parent_id;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .update(updateData)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'A category with this name already exists' });
      }
      throw error;
    }

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    res.json({ success: true, category });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete category
app.delete('/api/categories/:id', requireAuth, async (req, res) => {
  try {
    // First check if this is a system category
    const { data: existing, error: checkError } = await supabaseAdmin
      .from('categories')
      .select('is_system, name')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    // Prevent deleting "Sin categoría" (the default category)
    if (existing.name === 'Sin categoría') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the default category'
      });
    }

    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reorder categories
app.put('/api/categories/reorder', requireAuth, async (req, res) => {
  try {
    const { categoryIds } = req.body;

    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ success: false, error: 'categoryIds must be an array' });
    }

    // Update sort_order for each category
    const updates = categoryIds.map((id, index) =>
      supabaseAdmin
        .from('categories')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('user_id', req.user.id)
    );

    await Promise.all(updates);

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder categories error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// User Upload Email API
// ==========================================

// Get user's upload email
app.get('/api/user/upload-email', requireAuth, async (req, res) => {
  try {
    // For now, generate email based on user ID (can be enhanced with custom table later)
    const token = req.user.id.substring(0, 8);
    const email = `upload-${token}@uploads.maneki.app`;
    res.json({ success: true, email });
  } catch (error) {
    console.error('Get upload email error:', error);
    const token = req.user.id.substring(0, 8);
    const email = `upload-${token}@uploads.maneki.app`;
    res.json({ success: true, email });
  }
});

// Regenerate user's upload email (placeholder - actual implementation needs custom table)
app.post('/api/user/upload-email/regenerate', requireAuth, async (req, res) => {
  try {
    const crypto = require('crypto');
    const token = crypto.randomBytes(4).toString('hex');
    const email = `upload-${token}@uploads.maneki.app`;
    res.json({ success: true, email });
  } catch (error) {
    console.error('Regenerate upload email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// Health Check
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using Supabase Auth`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
