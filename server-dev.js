require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const processorService = require('./services/processor.service');
const uploadConfig = require('./config/upload.config');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase clients
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

// Get all transactions
app.get('/api/transactions', devAuth, async (req, res) => {
  try {
    const { data: transactions, error } = await supabaseAdmin
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'DEVELOPMENT',
    user: 'juansegundoferrari@gmail.com',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running in DEVELOPMENT MODE on port ${PORT}`);
  console.log(`👤 Simulated user: juansegundoferrari@gmail.com`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Open: http://localhost:${PORT}`);
});
