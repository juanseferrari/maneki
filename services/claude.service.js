const Anthropic = require('@anthropic-ai/sdk');

/**
 * Claude API Service
 * Uses Claude AI to extract structured transaction data from bank statements
 */
class ClaudeService {
  constructor() {
    this.client = null;
    this.isAvailable = false;

    // Initialize Claude client if API key is available
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key') {
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      this.isAvailable = true;
      console.log('[Claude] Claude API initialized successfully');
    } else {
      console.log('[Claude] No API key found, Claude AI extraction will be disabled');
    }
  }

  /**
   * Check if Claude API is available
   * @returns {boolean}
   */
  isClaudeAvailable() {
    return this.isAvailable;
  }

  /**
   * Extract transactions from text using Claude AI
   * @param {string} textContent - Raw text extracted from file
   * @param {string} fileName - Original file name
   * @returns {Promise<Object>} Extraction result with transactions and metadata
   */
  async extractTransactions(textContent, fileName) {
    if (!this.isAvailable) {
      throw new Error('Claude API is not configured. Please add ANTHROPIC_API_KEY to .env');
    }

    try {
      console.log('[Claude] Sending request to Claude API...');

      const prompt = this.buildExtractionPrompt(textContent, fileName);

      // Try different model versions in order of preference
      const models = [
        'claude-sonnet-4-5-20250929',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620',
        'claude-3-sonnet-20240229',
        'claude-3-opus-20240229'
      ];

      let message;
      let lastError;

      for (const model of models) {
        try {
          console.log(`[Claude] Trying model: ${model}`);
          message = await this.client.messages.create({
            model: model,
            max_tokens: 16384,
            temperature: 0,
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          });
          console.log(`[Claude] Successfully using model: ${model}`);
          break; // Success, exit loop
        } catch (error) {
          lastError = error;
          if (error.status === 404) {
            console.log(`[Claude] Model ${model} not available, trying next...`);
            continue; // Try next model
          } else {
            // Other error, throw immediately
            throw error;
          }
        }
      }

      if (!message) {
        throw lastError || new Error('No available Claude model found');
      }

      const responseText = message.content[0].text;
      console.log('[Claude] Received response from Claude API');

      // Parse the JSON response
      const result = this.parseClaudeResponse(responseText);

      return result;
    } catch (error) {
      console.error('[Claude] Error calling Claude API:', error);
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Build the extraction prompt for Claude
   * @param {string} textContent
   * @param {string} fileName
   * @returns {string}
   */
  buildExtractionPrompt(textContent, fileName) {
    return `You are a financial document analysis expert. Extract transaction data from this bank statement.

FILE NAME: ${fileName}

DOCUMENT CONTENT:
${textContent}

INSTRUCTIONS:
1. Extract ALL transactions from the document
2. For each transaction, identify:
   - fecha (date in YYYY-MM-DD format)
   - referencia (reference number if available)
   - descripcion (description/merchant)
   - dolares (amount in USD, 0 if in pesos)
   - pesos (amount in ARS, 0 if in USD)
3. Identify the bank name if mentioned
4. Handle "Reverso" transactions (refunds/reversals) as NEGATIVE amounts

IMPORTANT RULES:
- Dates must be in YYYY-MM-DD format
- Amounts: Use positive for charges/debits, negative for reversals/refunds (when "Reverso" appears)
- If a transaction is in pesos, dolares should be 0.00
- If a transaction is in dollars, pesos should be 0.00
- Extract the merchant/description accurately
- Include ALL transactions, don't skip any

OUTPUT FORMAT (respond with ONLY valid JSON, no markdown):
{
  "banco": "bank name or null",
  "fecha_estado": "statement date or null",
  "movimientos": [
    {
      "fecha": "YYYY-MM-DD",
      "referencia": "reference number or null",
      "descripcion": "description",
      "dolares": 0.00,
      "pesos": 0.00
    }
  ]
}

Return ONLY the JSON object, no additional text or markdown formatting.`;
  }

  /**
   * Parse Claude's JSON response
   * @param {string} responseText
   * @returns {Object}
   */
  parseClaudeResponse(responseText) {
    try {
      // Remove markdown code blocks if present
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }

      const data = JSON.parse(jsonText);

      // Validate the response structure
      if (!data.movimientos || !Array.isArray(data.movimientos)) {
        throw new Error('Invalid response format: missing movimientos array');
      }

      // Transform to our internal format
      const transactions = data.movimientos.map(mov => {
        // Determine the amount (prefer pesos, but use dollars if pesos is 0)
        const amount = mov.pesos !== 0 ? mov.pesos : mov.dolares;

        return {
          transaction_date: mov.fecha,
          description: mov.descripcion || 'Unknown',
          merchant: this.extractMerchant(mov.descripcion),
          amount: amount,
          transaction_type: amount < 0 ? 'debit' : 'credit',
          reference_number: mov.referencia ? mov.referencia.toString() : null,
          raw_data: mov,
          confidence_score: 95.0 // Claude provides high confidence
        };
      });

      return {
        transactions,
        bankName: data.banco,
        statementDate: data.fecha_estado,
        confidenceScore: 95.0,
        totalTransactions: transactions.length
      };
    } catch (error) {
      console.error('[Claude] Failed to parse response:', error);
      console.error('[Claude] Response text:', responseText);
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  /**
   * Extract merchant name from description
   * @param {string} description
   * @returns {string|null}
   */
  extractMerchant(description) {
    if (!description) return null;

    // Remove common prefixes/suffixes
    let merchant = description
      .replace(/cuota \d+ de \d+/gi, '')
      .replace(/reverso\s*-?\s*/gi, '')
      .replace(/^-\s*/, '')
      .trim();

    // Take first meaningful part
    const parts = merchant.split(/\s+-\s+/);
    return parts[0] || merchant;
  }

  /**
   * Enhanced extraction with smart categorization, metadata, and installment detection
   * This method is used when template matching fails (confidence < 60%)
   *
   * @param {string} textContent - Raw text extracted from file OR empty if using Vision
   * @param {string} fileName - Original file name
   * @param {string} userId - User ID for fetching their categories
   * @param {Buffer} fileBuffer - Optional: PDF buffer for Vision API (scanned PDFs)
   * @returns {Promise<Object>} Enhanced extraction result
   */
  async extractTransactionsEnhanced(textContent, fileName, userId, fileBuffer = null) {
    if (!this.isAvailable) {
      throw new Error('Claude API is not configured. Please add ANTHROPIC_API_KEY to .env');
    }

    try {
      console.log('[Claude] Starting enhanced extraction...');

      // Fetch user's categories for smart categorization
      const supabaseService = require('./supabase.service');
      const categories = await supabaseService.getUserCategories(userId);

      // Truncate text if too long (cost optimization)
      const MAX_CHARS = 50000;
      let processedText = textContent;
      if (textContent.length > MAX_CHARS) {
        console.log(`[Claude] Truncating text from ${textContent.length} to ${MAX_CHARS} characters`);
        processedText = textContent.substring(0, MAX_CHARS);
      }

      // Obtener ejemplos previos del mismo banco
      const bankId = fileName.toLowerCase().includes('santander') ? 'santander' :
                    fileName.toLowerCase().includes('galicia') ? 'galicia' :
                    fileName.toLowerCase().includes('hipotecario') ? 'hipotecario' :
                    fileName.toLowerCase().includes('macro') ? 'macro' :
                    fileName.toLowerCase().includes('bbva') ? 'bbva' :
                    fileName.toLowerCase().includes('brubank') ? 'brubank' : null;

      const previousExamples = bankId ? await this.getPreviousExamples(bankId, userId) : [];
      if (previousExamples.length > 0) {
        console.log(`[Claude] Incluyendo ${previousExamples.length} ejemplos previos de ${bankId} en el prompt`);
      }

      // Build enhanced prompt
      const prompt = this.buildEnhancedExtractionPrompt(processedText, fileName, categories, previousExamples);

      // Log first 1000 characters of content being sent to Claude
      console.log('[Claude] === CONTENT BEING SENT TO CLAUDE (first 1000 chars) ===');
      console.log(processedText.substring(0, 1000));
      console.log('[Claude] === END CONTENT PREVIEW ===');

      // Prepare message content - use Vision API for PDF images
      let messageContent;
      if (fileBuffer && processedText.trim().length < 100) {
        // Use Vision API for scanned PDFs
        console.log('[Claude] 📷 Using Vision API for scanned PDF');
        const base64Pdf = fileBuffer.toString('base64');
        messageContent = [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Pdf
            }
          },
          {
            type: 'text',
            text: prompt
          }
        ];
      } else {
        // Use text-only for CSV/XLSX or text-based PDFs
        console.log('[Claude] 📝 Using text-based extraction');
        messageContent = prompt;
      }

      // Try different model versions
      const models = [
        'claude-sonnet-4-5-20250929',
        'claude-3-5-sonnet-20241022'
      ];

      let message;
      let lastError;

      for (const model of models) {
        try {
          console.log(`[Claude] Trying model: ${model}`);
          message = await this.client.messages.create({
            model: model,
            max_tokens: 16384,
            temperature: 0,
            messages: [{ role: 'user', content: messageContent }]
          });
          console.log(`[Claude] Successfully using model: ${model}`);
          break;
        } catch (error) {
          lastError = error;
          if (error.status === 404) {
            console.log(`[Claude] Model ${model} not available, trying next...`);
            continue;
          } else {
            throw error;
          }
        }
      }

      if (!message) {
        throw lastError || new Error('No available Claude model found');
      }

      const responseText = message.content[0].text;
      console.log('[Claude] Received enhanced response from Claude API');
      console.log('[Claude] === RAW CLAUDE RESPONSE (first 2000 chars) ===');
      console.log(responseText.substring(0, 2000));
      console.log('[Claude] === END CLAUDE RESPONSE ===');

      // Parse enhanced response
      const result = this.parseEnhancedClaudeResponse(responseText);

      return result;
    } catch (error) {
      console.error('[Claude] Error in enhanced extraction:', error);
      throw new Error(`Claude enhanced extraction error: ${error.message}`);
    }
  }

  /**
   * Obtener ejemplos de transacciones previas del mismo banco para contexto
   * @param {string} bankId - ID del banco
   * @param {string} userId - ID del usuario
   * @returns {Promise<Array>} Ejemplos de transacciones
   */
  async getPreviousExamples(bankId, userId) {
    try {
      const supabaseService = require('./supabase.service');

      // Buscar archivos previos del mismo banco con alta confianza
      const { data: files, error } = await supabaseService.supabase
        .from('files')
        .select('id, original_name, bank_name, confidence_score')
        .eq('user_id', userId)
        .ilike('bank_name', `%${bankId}%`)
        .gte('confidence_score', 80)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error || !files || files.length === 0) return [];

      // Obtener transacciones de ejemplo de estos archivos
      const examples = [];

      for (const file of files) {
        const { data: transactions, error: txError } = await supabaseService.supabase
          .from('transactions')
          .select('transaction_date, description, amount, transaction_type')
          .eq('file_id', file.id)
          .limit(5);

        if (!txError && transactions && transactions.length > 0) {
          examples.push({
            fileName: file.original_name,
            transactions: transactions
          });
        }
      }

      return examples;
    } catch (error) {
      console.error('[Claude] Error obteniendo ejemplos previos:', error);
      return [];
    }
  }

  /**
   * Build enhanced extraction prompt with category context
   * @param {string} textContent
   * @param {string} fileName
   * @param {Array} categories - User's existing categories
   * @param {Array} previousExamples - Previous transactions from same bank
   * @returns {string}
   */
  buildEnhancedExtractionPrompt(textContent, fileName, categories, previousExamples = []) {
    // Build category list for smart matching
    const categoryList = categories.map(cat => {
      const keywords = cat.keywords || [];
      return `- ID: ${cat.id} | Name: "${cat.name}" | Keywords: [${keywords.map(k => `"${k}"`).join(', ')}]`;
    }).join('\n');

    // === NUEVO: Generar sección de ejemplos previos ===
    let examplesSection = '';
    if (previousExamples && previousExamples.length > 0) {
      examplesSection = '\n\nEXISTING TRANSACTION EXAMPLES FROM THIS BANK (for reference):\n';
      for (const example of previousExamples) {
        examplesSection += `\nFrom file: ${example.fileName}\n`;
        for (const tx of example.transactions) {
          examplesSection += `  - ${tx.transaction_date} | ${tx.description} | ${tx.amount} | ${tx.transaction_type}\n`;
        }
      }
      examplesSection += '\nUse these examples to understand the typical format and structure of transactions from this bank.\n';
    }
    // === FIN NUEVO ===

    return `You are an expert financial analyst and accountant specializing in bank reconciliation and transaction extraction from Mexican and Argentine financial documents.

FILE NAME: ${fileName}

EXISTING USER CATEGORIES (match transactions to these by ID):
${categoryList}
${examplesSection}
DOCUMENT CONTENT:
${textContent}

CRITICAL INSTRUCTIONS - READ CAREFULLY AS A PROFESSIONAL ACCOUNTANT:

1. **EXTRACT EVERY SINGLE TRANSACTION** - Do not skip or summarize
   - Each row = ONE transaction
   - Extract EXACT date, description, amount from each row
   - Do NOT invent, modify, or summarize

2. **DATE PRECISION** - Extract dates EXACTLY as shown
   - Format: YYYY-MM-DD (convert if needed: DD/MM/YYYY → YYYY-MM-DD)
   - 21/ENE/26 → 2026-01-21, 04/FEB/26 → 2026-02-04
   - NEVER use today's date or invent dates

3. **AMOUNT PRECISION** - Extract EXACT amounts
   - Mexican: 1,234.56 (comma thousands, period decimal)
   - Argentine: 1.234,56 (period thousands, comma decimal)
   - Negative/red = expense, Positive/green = income

4. **DESCRIPTION ACCURACY** - Copy VERBATIM
   - Keep ALL text as-is (SPEI, STP, BNET, reference numbers)
   - Do NOT translate or summarize

5. **TYPE DETECTION**
   - "ENVIADO"/"CARGO"/negative = "expense"
   - "RECIBIDO"/"ABONO"/positive = "income"

6. **CURRENCY DETECTION** - CRITICAL: Detect currency PER TRANSACTION
   - Check which column the amount comes from (PESOS vs DÓLARES)
   - If amount is in PESOS column = "ARS"
   - If amount is in DÓLARES/USD column = "USD"
   - If description contains "USD", "DÓLARES", "MT1DT...USD" = "USD"
   - Default currency for document:
     * Mexican banks (Banamex, BBVA México, Santander México) = "MXN"
     * Argentine banks (Brubank, Santander Argentina, Galicia, Macro, BBVA Argentina, Hipotecario, Naranja) = "ARS"
     * Mercado Pago Argentina = "ARS"

OUTPUT FORMAT (respond with ONLY valid JSON, no markdown):
{
  "documento": {
    "banco": "Banco Santander",
    "numero_cuenta": "1234-5678-90",
    "tipo_cuenta": "Cuenta Corriente",
    "periodo": "2026-01",
    "saldo_inicial": 15000.50,
    "saldo_final": 12000.75,
    "moneda": "ARS"
  },
  "transacciones": [
    {
      "fecha": "2026-01-15",
      "descripcion": "Compra en Coto Supermercado",
      "monto": 5420.30,
      "tipo": "expense",
      "moneda": "ARS",
      "category_id": "uuid-from-above-list",
      "confianza": 95,
      "cuota": {
        "numero": 1,
        "total": 12,
        "grupo_id": "uuid-same-for-related-installments"
      }
    }
  ]
}

IMPORTANT RULES:
- Dates must be in YYYY-MM-DD format
- Amounts are positive numbers, tipo field indicates "income" or "expense"
- If no matching category found, use null for category_id
- Only include cuota field if installment detected in description
- All installments from same purchase MUST share the same grupo_id (generate new UUID per purchase)
- confianza: Your confidence score 0-100 for each transaction
- **moneda field is REQUIRED for EACH transaction** - detect from column (PESOS=ARS, DÓLARES=USD)
- documento.moneda: Default currency for the account (MXN for Mexico, ARS for Argentina)
- documento fields can be null if not found in document
- Handle refunds/reversals by marking tipo as "income" if it's money back

Return ONLY the JSON object, no additional text or markdown formatting.`;
  }

  /**
   * Parse enhanced Claude response with validation
   * @param {string} responseText
   * @returns {Object}
   */
  parseEnhancedClaudeResponse(responseText) {
    try {
      // Remove markdown code blocks if present
      let jsonText = responseText.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
      }

      const data = JSON.parse(jsonText);

      // Validate response structure
      if (!data.transacciones || !Array.isArray(data.transacciones)) {
        throw new Error('Invalid response format: missing transacciones array');
      }

      if (!data.documento) {
        console.warn('[Claude] Missing documento metadata in response');
        data.documento = {};
      }

      // Get default currency from document metadata
      const defaultCurrency = data.documento?.moneda || 'ARS';

      // Transform to internal format
      const transactions = data.transacciones.map((tx, index) => {
        // Validate required fields
        if (!tx.fecha || !tx.descripcion || tx.monto === undefined) {
          console.warn(`[Claude] Transaction ${index} missing required fields, skipping`);
          return null;
        }

        // Use transaction-specific currency if provided, otherwise use document default
        const txCurrency = tx.moneda || defaultCurrency;

        const transformed = {
          transaction_date: tx.fecha, // YYYY-MM-DD format
          description: tx.descripcion,
          amount: Math.abs(tx.monto), // Store as positive, type determines direction
          transaction_type: tx.tipo === 'income' ? 'credit' : 'debit', // Map to debit/credit
          category_id: tx.category_id || null,
          confidence_score: tx.confianza || 85,
          processed_by_claude: true,
          needs_review: true,
          currency: txCurrency // Use transaction-specific currency or default
        };

        // Add installment data if present
        if (tx.cuota && tx.cuota.numero && tx.cuota.total && tx.cuota.grupo_id) {
          transformed.installment_data = {
            installment_number: tx.cuota.numero,
            total_installments: tx.cuota.total,
            group_id: tx.cuota.grupo_id
          };
        }

        return transformed;
      }).filter(tx => tx !== null); // Remove invalid transactions

      // Calculate overall confidence
      const avgConfidence = transactions.length > 0
        ? transactions.reduce((sum, tx) => sum + tx.confidence_score, 0) / transactions.length
        : 0;

      return {
        transactions,
        documentMetadata: {
          banco: data.documento.banco || null,
          numero_cuenta: data.documento.numero_cuenta || null,
          tipo_cuenta: data.documento.tipo_cuenta || null,
          periodo: data.documento.periodo || null,
          saldo_inicial: data.documento.saldo_inicial || null,
          saldo_final: data.documento.saldo_final || null
        },
        confidenceScore: Math.round(avgConfidence),
        totalTransactions: transactions.length,
        processingMethod: 'claude'
      };
    } catch (error) {
      console.error('[Claude] Failed to parse enhanced response:', error);
      console.error('[Claude] Response text:', responseText.substring(0, 500));
      throw new Error(`Failed to parse Claude enhanced response: ${error.message}`);
    }
  }
}

module.exports = new ClaudeService();
