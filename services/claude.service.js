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
   * @param {string} textContent - Raw text extracted from file
   * @param {string} fileName - Original file name
   * @param {string} userId - User ID for fetching their categories
   * @returns {Promise<Object>} Enhanced extraction result
   */
  async extractTransactionsEnhanced(textContent, fileName, userId) {
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

      // Build enhanced prompt
      const prompt = this.buildEnhancedExtractionPrompt(processedText, fileName, categories);

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
            messages: [{ role: 'user', content: prompt }]
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

      // Parse enhanced response
      const result = this.parseEnhancedClaudeResponse(responseText);

      return result;
    } catch (error) {
      console.error('[Claude] Error in enhanced extraction:', error);
      throw new Error(`Claude enhanced extraction error: ${error.message}`);
    }
  }

  /**
   * Build enhanced extraction prompt with category context
   * @param {string} textContent
   * @param {string} fileName
   * @param {Array} categories - User's existing categories
   * @returns {string}
   */
  buildEnhancedExtractionPrompt(textContent, fileName, categories) {
    // Build category list for smart matching
    const categoryList = categories.map(cat => {
      const keywords = cat.keywords || [];
      return `- ID: ${cat.id} | Name: "${cat.name}" | Keywords: [${keywords.map(k => `"${k}"`).join(', ')}]`;
    }).join('\n');

    return `You are a financial document analysis expert specializing in extracting transaction data from bank statements.

FILE NAME: ${fileName}

EXISTING USER CATEGORIES (match transactions to these by ID):
${categoryList}

DOCUMENT CONTENT:
${textContent}

YOUR TASK:
1. Extract ALL transactions with complete details (dates, descriptions, amounts)
2. Smart categorization: Match each transaction to the most relevant category by ID (semantic matching based on description and keywords)
3. Document metadata: Extract bank name, account number, account type, period, and balances
4. Installment detection: Find patterns like "Cuota 1/12", "1 de 12", "Installment 1 of 12", "1/12", etc.
5. Group related installments: Assign the same group_id UUID to all installments from the same purchase

OUTPUT FORMAT (respond with ONLY valid JSON, no markdown):
{
  "documento": {
    "banco": "Banco Santander",
    "numero_cuenta": "1234-5678-90",
    "tipo_cuenta": "Cuenta Corriente",
    "periodo": "2026-01",
    "saldo_inicial": 15000.50,
    "saldo_final": 12000.75
  },
  "transacciones": [
    {
      "fecha": "2026-01-15",
      "descripcion": "Compra en Coto Supermercado",
      "monto": 5420.30,
      "tipo": "expense",
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

      // Transform to internal format
      const transactions = data.transacciones.map((tx, index) => {
        // Validate required fields
        if (!tx.fecha || !tx.descripcion || tx.monto === undefined) {
          console.warn(`[Claude] Transaction ${index} missing required fields, skipping`);
          return null;
        }

        const transformed = {
          date: tx.fecha,
          description: tx.descripcion,
          amount: Math.abs(tx.monto), // Store as positive, type determines direction
          type: tx.tipo === 'income' ? 'income' : 'expense',
          category_id: tx.category_id || null,
          confidence_score: tx.confianza || 85,
          processed_by_claude: true,
          needs_review: true
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
