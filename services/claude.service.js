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
}

module.exports = new ClaudeService();
