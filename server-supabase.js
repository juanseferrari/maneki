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
const connectionsService = require('./services/connections.service');

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

// Get transactions for a file - Protected
app.get('/api/files/:fileId/transactions', requireAuth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
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

// Get all transactions - Protected
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        files:file_id (
          original_name,
          stored_name
        )
      `)
      .eq('user_id', req.user.id)
      .order('transaction_date', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error('Get all transactions error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve transactions'
    });
  }
});

// Get VEP data for a file - Protected
app.get('/api/files/:fileId/vep', requireAuth, async (req, res) => {
  try {
    const { data: vep, error } = await supabase
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
        nickname: userInfo.nickname,
        country_id: userInfo.country_id,
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
// Health Check
// ==========================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Using Supabase Auth`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
});
