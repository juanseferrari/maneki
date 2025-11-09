# Maneki - Bank Statement Processor

A web application that automatically processes and normalizes bank statements from PDF, CSV, and XLSX files into a standardized database format.

## Features

- **Drag & Drop Upload**: Easy file upload interface
- **Multiple Format Support**: PDF, CSV, and XLSX files
- **Automatic Processing**: Extracts and normalizes transactions immediately after upload
- **Real-time Status Updates**: Monitor processing status with auto-refresh
- **Transaction Viewer**: View extracted transactions in a clean table format
- **Confidence Scoring**: See how confident the system is about the extraction
- **Multi-user Ready**: Architecture supports multiple users (auth to be added later)

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: EJS templates, Vanilla JavaScript
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **File Parsing**: pdf-parse, csv-parse, xlsx

## Project Structure

```
maneki/
├── config/
│   └── upload.config.js          # Upload configuration
├── services/
│   ├── supabase.service.js       # Supabase database & storage operations
│   ├── parser.service.js         # File parsing (PDF/CSV/XLSX)
│   ├── extractor.service.js      # Transaction extraction logic
│   └── processor.service.js      # Orchestrates parsing & extraction
├── public/
│   ├── css/
│   │   └── style.css             # Styling
│   └── js/
│       └── upload.js             # Client-side logic
├── views/
│   └── index.ejs                 # Main page template
├── .env                          # Environment variables
├── .env.example                  # Environment template
├── server.js                     # Express server
├── supabase-schema.sql           # Database schema
├── supabase-setup.sql            # Storage RLS policies
└── package.json                  # Dependencies
```

## Setup Instructions

### 1. Prerequisites

- Node.js (v16 or higher)
- A Supabase account

### 2. Clone and Install

```bash
git clone <your-repo-url>
cd maneki
npm install
```

### 3. Configure Supabase

#### A. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note your project URL and anon key

#### B. Set Up Database Tables

1. Go to **SQL Editor** in your Supabase dashboard
2. Run the SQL script from [supabase-schema.sql](supabase-schema.sql)
3. This creates the `files` and `transactions` tables

#### C. Set Up Storage

1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket named `uploads`
3. Make the bucket **public**

#### D. Set Up Storage Policies

1. Go to **SQL Editor** again
2. Run the SQL script from [supabase-setup.sql](supabase-setup.sql)
3. This creates RLS policies to allow public uploads

### 4. Configure Environment Variables

1. Copy the `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_BUCKET_NAME=uploads
   PORT=3000
   MAX_FILE_SIZE_MB=10
   ```

### 5. Run the Application

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

The application will be available at: http://localhost:3000

## Usage

1. **Upload a File**: Drag and drop a bank statement (PDF, CSV, or XLSX) or click "Browse Files"
2. **Wait for Processing**: The file will be processed automatically
3. **View Results**: Once completed, you'll see:
   - Processing status (Completed/Failed)
   - Confidence score (how accurate the extraction is)
   - Bank name (if detected)
4. **View Transactions**: Click "View Transactions" to see all extracted transactions
5. **View Original**: Click "View File" to see the original uploaded file

## Configuration

### File Size Limit

Edit `MAX_FILE_SIZE_MB` in [.env](.env) to change the maximum file size (in MB).

### Allowed File Types

Edit [config/upload.config.js](config/upload.config.js) to add or remove allowed file types:

```javascript
allowedMimeTypes: [
  'application/pdf',
  'text/csv',
  // Add more MIME types here
],
allowedExtensions: ['.pdf', '.csv', '.xlsx', '.xls']
```

## Database Schema

### Files Table

Stores metadata about uploaded files and their processing status.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| original_name | TEXT | Original filename |
| stored_name | TEXT | Stored filename (with timestamp) |
| file_size | INTEGER | File size in bytes |
| mime_type | TEXT | MIME type |
| storage_path | TEXT | Path in Supabase Storage |
| public_url | TEXT | Public URL |
| processing_status | TEXT | pending/processing/completed/failed |
| confidence_score | DECIMAL | Extraction confidence (0-100) |
| bank_name | TEXT | Detected bank name |
| statement_date | DATE | Statement date |
| user_id | UUID | User ID (for future auth) |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Update timestamp |

### Transactions Table

Stores normalized transaction data extracted from files.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| file_id | UUID | Foreign key to files table |
| transaction_date | DATE | Transaction date |
| description | TEXT | Transaction description |
| merchant | TEXT | Merchant name |
| amount | DECIMAL | Amount (negative for debits) |
| transaction_type | TEXT | debit or credit |
| balance | DECIMAL | Account balance after transaction |
| reference_number | TEXT | Transaction reference |
| card_number | TEXT | Card number |
| category | TEXT | Transaction category (future use) |
| raw_data | JSONB | Original extracted data |
| confidence_score | DECIMAL | Extraction confidence |
| user_id | UUID | User ID (for future auth) |
| created_at | TIMESTAMP | Creation timestamp |

## Upgrading to Claude API

The current implementation uses rule-based extraction. To upgrade to Claude API for better accuracy:

1. Get a Claude API key from [console.anthropic.com](https://console.anthropic.com)

2. Add to [.env](.env):
   ```env
   ANTHROPIC_API_KEY=your_api_key
   ```

3. Install the Anthropic SDK:
   ```bash
   npm install @anthropic-ai/sdk
   ```

4. Update [services/extractor.service.js](services/extractor.service.js) to use Claude API instead of rule-based extraction

## Future Enhancements

- [ ] User authentication (Supabase Auth)
- [ ] Transaction categorization (AI-powered)
- [ ] Multi-bank support with bank-specific parsers
- [ ] Export transactions to CSV/Excel
- [ ] Transaction search and filtering
- [ ] Dashboard with spending analytics
- [ ] Recurring transaction detection
- [ ] Budget tracking
- [ ] Receipt image upload and OCR
- [ ] Mobile app

## Troubleshooting

### Files not uploading
- Check that your Supabase Storage bucket is public
- Verify RLS policies are set up correctly using [supabase-setup.sql](supabase-setup.sql)

### Processing fails
- Check server logs for errors
- Verify file format is valid
- Ensure file is not corrupted

### Transactions not extracted
- The rule-based extractor may not work for all bank statement formats
- Consider upgrading to Claude API for better accuracy
- You may need to customize extraction rules in [services/extractor.service.js](services/extractor.service.js)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

ISC
