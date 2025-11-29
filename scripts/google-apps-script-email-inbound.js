/**
 * ============================================
 * MANEKI - Email Inbound Processor
 * Google Apps Script
 * ============================================
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to script.google.com
 * 2. Create a new project
 * 3. Copy this entire code
 * 4. Update the CONFIG section below with your values
 * 5. Run setupTrigger() once to create the time-based trigger
 * 6. Authorize the script when prompted
 *
 * HOW IT WORKS:
 * - Runs every 5 minutes
 * - Searches for emails sent to admin+ANYTHING@sheetscentral.com
 * - Extracts the token from the +ANYTHING part
 * - Sends attachments to your API webhook
 * - Labels processed emails to avoid reprocessing
 */

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const CONFIG = {
  // Your API webhook URL (production)
  WEBHOOK_URL: 'https://maneki-36d85d517656.herokuapp.com/api/email/inbound',

  // Secret key for webhook authentication (generate a random string)
  // IMPORTANT: Set the same value in your Heroku config: EMAIL_WEBHOOK_SECRET
  WEBHOOK_SECRET: 'CHANGE_THIS_TO_A_RANDOM_SECRET_STRING',

  // Email address pattern to monitor (the base email without the +token part)
  BASE_EMAIL: 'admin@sheetscentral.com',

  // Gmail label for processed emails (will be created automatically)
  PROCESSED_LABEL: 'Maneki/Processed',

  // Gmail label for failed emails
  FAILED_LABEL: 'Maneki/Failed',

  // Maximum attachment size in bytes (10MB)
  MAX_ATTACHMENT_SIZE: 10 * 1024 * 1024,

  // Supported file extensions
  SUPPORTED_EXTENSIONS: ['.pdf', '.csv', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'],

  // How many minutes to look back for emails
  LOOKBACK_MINUTES: 30
};

// ============================================
// MAIN FUNCTION - Processes incoming emails
// ============================================
function processIncomingEmails() {
  console.log('🚀 Starting email processing...');

  try {
    // Get or create labels
    const processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL);
    const failedLabel = getOrCreateLabel(CONFIG.FAILED_LABEL);

    // Build search query
    // Matches emails like: admin+abc123@sheetscentral.com
    const baseEmailParts = CONFIG.BASE_EMAIL.split('@');
    const searchQuery = `to:(${baseEmailParts[0]}+*@${baseEmailParts[1]}) -label:${CONFIG.PROCESSED_LABEL.replace('/', '-')} -label:${CONFIG.FAILED_LABEL.replace('/', '-')} newer_than:${CONFIG.LOOKBACK_MINUTES}m`;

    console.log('📧 Search query:', searchQuery);

    // Search for matching emails
    const threads = GmailApp.search(searchQuery, 0, 50);
    console.log(`📬 Found ${threads.length} threads to process`);

    if (threads.length === 0) {
      console.log('✅ No new emails to process');
      return;
    }

    // Process each thread
    for (const thread of threads) {
      const messages = thread.getMessages();

      for (const message of messages) {
        try {
          processMessage(message, processedLabel, failedLabel);
        } catch (error) {
          console.error('❌ Error processing message:', error);
          thread.addLabel(failedLabel);
        }
      }
    }

    console.log('✅ Email processing completed');
  } catch (error) {
    console.error('❌ Fatal error in processIncomingEmails:', error);
  }
}

// ============================================
// Process a single email message
// ============================================
function processMessage(message, processedLabel, failedLabel) {
  const messageId = message.getId();
  const subject = message.getSubject();
  const fromEmail = message.getFrom();
  const toEmail = message.getTo();

  console.log(`\n📨 Processing message: ${subject}`);
  console.log(`   From: ${fromEmail}`);
  console.log(`   To: ${toEmail}`);

  // Extract token from the "to" address
  // Format: admin+TOKEN@sheetscentral.com
  const token = extractToken(toEmail);

  if (!token) {
    console.log('⚠️ Could not extract token from address:', toEmail);
    message.getThread().addLabel(failedLabel);
    return;
  }

  console.log(`   Token: ${token}`);

  // Get attachments
  const attachments = message.getAttachments();

  if (attachments.length === 0) {
    console.log('⚠️ No attachments found in email');
    message.getThread().addLabel(processedLabel);
    return;
  }

  console.log(`   Attachments: ${attachments.length}`);

  // Filter and prepare attachments
  const validAttachments = [];

  for (const attachment of attachments) {
    const filename = attachment.getName();
    const size = attachment.getSize();
    const mimeType = attachment.getContentType();

    console.log(`   - ${filename} (${formatBytes(size)}, ${mimeType})`);

    // Check file extension
    const ext = getFileExtension(filename);
    if (!CONFIG.SUPPORTED_EXTENSIONS.includes(ext.toLowerCase())) {
      console.log(`     ⚠️ Skipping: unsupported extension ${ext}`);
      continue;
    }

    // Check file size
    if (size > CONFIG.MAX_ATTACHMENT_SIZE) {
      console.log(`     ⚠️ Skipping: file too large (max ${formatBytes(CONFIG.MAX_ATTACHMENT_SIZE)})`);
      continue;
    }

    // Convert to base64
    const content = Utilities.base64Encode(attachment.getBytes());

    validAttachments.push({
      filename: filename,
      content: content,
      mimeType: mimeType,
      size: size
    });
  }

  if (validAttachments.length === 0) {
    console.log('⚠️ No valid attachments to process');
    message.getThread().addLabel(processedLabel);
    return;
  }

  // Send to webhook
  const payload = {
    secret: CONFIG.WEBHOOK_SECRET,
    token: token,
    fromEmail: cleanEmailAddress(fromEmail),
    subject: subject,
    messageId: messageId,
    attachments: validAttachments
  };

  const result = sendToWebhook(payload);

  if (result.success) {
    console.log(`✅ Successfully sent to API. Processed: ${result.processed} files`);
    message.getThread().addLabel(processedLabel);
  } else {
    console.log(`❌ API error: ${result.error}`);
    message.getThread().addLabel(failedLabel);
  }
}

// ============================================
// Send data to webhook
// ============================================
function sendToWebhook(payload) {
  try {
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 60 // 60 seconds timeout
    };

    console.log(`   📤 Sending to webhook: ${CONFIG.WEBHOOK_URL}`);

    const response = UrlFetchApp.fetch(CONFIG.WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    console.log(`   📥 Response code: ${responseCode}`);

    if (responseCode >= 200 && responseCode < 300) {
      const responseData = JSON.parse(responseText);
      return {
        success: true,
        processed: responseData.processed || 0,
        data: responseData
      };
    } else {
      console.error(`   ❌ Webhook error: ${responseText}`);
      return {
        success: false,
        error: `HTTP ${responseCode}: ${responseText}`
      };
    }
  } catch (error) {
    console.error('   ❌ Webhook request failed:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract token from email address
 * admin+abc123@sheetscentral.com -> abc123
 */
function extractToken(emailAddress) {
  // Handle format: "Name <email@domain.com>" or just "email@domain.com"
  const emailMatch = emailAddress.match(/<([^>]+)>/) || [null, emailAddress];
  const email = emailMatch[1] || emailAddress;

  // Extract token from user+token@domain format
  const tokenMatch = email.match(/\+([a-z0-9]+)@/i);

  return tokenMatch ? tokenMatch[1].toLowerCase() : null;
}

/**
 * Clean email address (remove name, keep just email)
 */
function cleanEmailAddress(emailAddress) {
  const match = emailAddress.match(/<([^>]+)>/);
  return match ? match[1] : emailAddress.trim();
}

/**
 * Get file extension
 */
function getFileExtension(filename) {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '';
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Get or create a Gmail label
 */
function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);

  if (!label) {
    // For nested labels, create parent first
    const parts = labelName.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      label = GmailApp.getUserLabelByName(currentPath);

      if (!label) {
        label = GmailApp.createLabel(currentPath);
        console.log(`📁 Created label: ${currentPath}`);
      }
    }
  }

  return label;
}

// ============================================
// SETUP FUNCTIONS - Run these manually once
// ============================================

/**
 * Setup the time-based trigger to run every 5 minutes
 * RUN THIS ONCE to set up automatic processing
 */
function setupTrigger() {
  // Delete existing triggers for this function
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'processIncomingEmails') {
      ScriptApp.deleteTrigger(trigger);
      console.log('🗑️ Deleted existing trigger');
    }
  }

  // Create new trigger - runs every 5 minutes
  ScriptApp.newTrigger('processIncomingEmails')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('✅ Trigger created! Script will run every 5 minutes.');
  console.log('📧 Monitoring emails to:', CONFIG.BASE_EMAIL);
}

/**
 * Remove all triggers
 */
function removeTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    ScriptApp.deleteTrigger(trigger);
  }
  console.log('✅ All triggers removed');
}

/**
 * Test function - process emails manually
 */
function testProcess() {
  console.log('🧪 Running manual test...');
  console.log('Config:', {
    WEBHOOK_URL: CONFIG.WEBHOOK_URL,
    BASE_EMAIL: CONFIG.BASE_EMAIL,
    SUPPORTED_EXTENSIONS: CONFIG.SUPPORTED_EXTENSIONS
  });
  processIncomingEmails();
}

/**
 * Test webhook connection
 */
function testWebhook() {
  console.log('🧪 Testing webhook connection...');

  const testPayload = {
    secret: CONFIG.WEBHOOK_SECRET,
    token: 'test123',
    fromEmail: 'test@example.com',
    subject: 'Test Email',
    attachments: []
  };

  const result = sendToWebhook(testPayload);
  console.log('Result:', result);
}
