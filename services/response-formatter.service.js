/**
 * Response Formatter Service
 *
 * Standardizes all file processing responses into a consistent JSON format
 * regardless of processing method (template, claude, or hybrid)
 */

class ResponseFormatterService {
  /**
   * Format file processing result into standardized JSON response
   *
   * @param {Object} fileMetadata - File metadata from database
   * @param {Object} extractionResult - Result from extractor or Claude
   * @param {string} processingMethod - 'template', 'claude', or 'hybrid'
   * @returns {Object} Standardized response
   */
  formatResponse(fileMetadata, extractionResult, processingMethod = 'template') {
    // Calculate summary statistics
    const summary = this.calculateSummary(extractionResult.transactions);

    return {
      success: true,
      file: {
        id: fileMetadata.id,
        name: fileMetadata.original_name,
        processing_method: processingMethod,
        confidence_score: extractionResult.confidenceScore || 0,
        uploaded_at: fileMetadata.created_at,
        file_size: fileMetadata.file_size
      },
      extraction: {
        document_metadata: this.formatDocumentMetadata(extractionResult),
        transactions: this.formatTransactions(extractionResult.transactions),
        summary: summary
      },
      metadata: {
        processing_time: this.calculateProcessingTime(fileMetadata),
        needs_review: extractionResult.transactions?.some(t => t.needs_review) || false,
        duplicate_count: extractionResult.duplicatesSkipped || 0
      }
    };
  }

  /**
   * Format document metadata
   */
  formatDocumentMetadata(extractionResult) {
    // Try to get metadata from Claude result first
    if (extractionResult.documentMetadata) {
      return {
        banco: extractionResult.documentMetadata.banco || null,
        numero_cuenta: extractionResult.documentMetadata.numero_cuenta || null,
        tipo_cuenta: extractionResult.documentMetadata.tipo_cuenta || null,
        periodo: extractionResult.documentMetadata.periodo || null,
        saldo_inicial: extractionResult.documentMetadata.saldo_inicial || null,
        saldo_final: extractionResult.documentMetadata.saldo_final || null
      };
    }

    // Fallback to basic metadata
    return {
      banco: extractionResult.bankName || null,
      numero_cuenta: null,
      tipo_cuenta: null,
      periodo: extractionResult.statementDate || null,
      saldo_inicial: null,
      saldo_final: null
    };
  }

  /**
   * Format transactions array
   */
  formatTransactions(transactions) {
    if (!transactions || !Array.isArray(transactions)) {
      return [];
    }

    return transactions.map(tx => {
      const formatted = {
        date: tx.date || tx.transaction_date,
        description: tx.description,
        amount: Math.abs(tx.amount || 0),
        type: tx.type || tx.transaction_type || 'expense',
        category_id: tx.category_id || null,
        confidence: tx.confidence_score || 0
      };

      // Add installment info if present
      if (tx.installment_data) {
        formatted.installment = {
          number: tx.installment_data.installment_number,
          total: tx.installment_data.total_installments,
          group_id: tx.installment_data.group_id
        };
      }

      return formatted;
    });
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(transactions) {
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return {
        total_transactions: 0,
        total_income: 0,
        total_expenses: 0,
        net_balance: 0
      };
    }

    let totalIncome = 0;
    let totalExpenses = 0;

    transactions.forEach(tx => {
      const amount = Math.abs(tx.amount || 0);
      const type = tx.type || tx.transaction_type;

      if (type === 'income' || type === 'credit') {
        totalIncome += amount;
      } else {
        totalExpenses += amount;
      }
    });

    return {
      total_transactions: transactions.length,
      total_income: Math.round(totalIncome * 100) / 100,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      net_balance: Math.round((totalIncome - totalExpenses) * 100) / 100
    };
  }

  /**
   * Calculate processing time
   */
  calculateProcessingTime(fileMetadata) {
    if (!fileMetadata.processing_started_at) {
      return null;
    }

    const startTime = new Date(fileMetadata.processing_started_at);
    const endTime = fileMetadata.processing_completed_at
      ? new Date(fileMetadata.processing_completed_at)
      : new Date();

    const durationMs = endTime - startTime;
    const durationSeconds = Math.round(durationMs / 1000 * 10) / 10;

    return `${durationSeconds}s`;
  }

  /**
   * Format error response
   */
  formatError(fileMetadata, error) {
    return {
      success: false,
      file: {
        id: fileMetadata?.id || null,
        name: fileMetadata?.original_name || null,
        processing_method: null,
        confidence_score: 0
      },
      error: {
        message: error.message || 'Unknown error',
        type: error.name || 'Error',
        details: error.stack ? error.stack.split('\n')[0] : null
      },
      extraction: {
        document_metadata: null,
        transactions: [],
        summary: {
          total_transactions: 0,
          total_income: 0,
          total_expenses: 0,
          net_balance: 0
        }
      }
    };
  }

  /**
   * Generate human-readable summary text
   */
  generateSummaryText(formattedResponse) {
    const { extraction, file } = formattedResponse;
    const { summary, document_metadata } = extraction;

    let text = `📄 Análisis de ${file.name}\n\n`;

    // Document info
    if (document_metadata?.banco) {
      text += `🏦 Banco: ${document_metadata.banco}\n`;
    }
    if (document_metadata?.numero_cuenta) {
      text += `💳 Cuenta: ${document_metadata.numero_cuenta}\n`;
    }
    if (document_metadata?.periodo) {
      text += `📅 Período: ${document_metadata.periodo}\n`;
    }

    text += `\n📊 Resumen:\n`;
    text += `- Total de transacciones: ${summary.total_transactions}\n`;
    text += `- Ingresos: $${summary.total_income.toLocaleString()}\n`;
    text += `- Gastos: $${summary.total_expenses.toLocaleString()}\n`;
    text += `- Balance neto: $${summary.net_balance.toLocaleString()}\n`;

    text += `\n🤖 Procesado con: ${file.processing_method.toUpperCase()}`;
    text += ` (${file.confidence_score}% confianza)\n`;

    return text;
  }

  /**
   * Generate markdown report
   */
  generateMarkdownReport(formattedResponse) {
    const { extraction, file } = formattedResponse;
    const { summary, document_metadata, transactions } = extraction;

    let md = `# Análisis de Extracto Bancario\n\n`;

    // File info
    md += `## 📄 Información del Archivo\n\n`;
    md += `- **Nombre**: ${file.name}\n`;
    md += `- **Método de procesamiento**: ${file.processing_method}\n`;
    md += `- **Confianza**: ${file.confidence_score}%\n`;
    md += `- **Subido**: ${new Date(file.uploaded_at).toLocaleString('es-AR')}\n\n`;

    // Document metadata
    if (document_metadata?.banco) {
      md += `## 🏦 Información del Documento\n\n`;
      if (document_metadata.banco) md += `- **Banco**: ${document_metadata.banco}\n`;
      if (document_metadata.numero_cuenta) md += `- **Número de cuenta**: ${document_metadata.numero_cuenta}\n`;
      if (document_metadata.tipo_cuenta) md += `- **Tipo de cuenta**: ${document_metadata.tipo_cuenta}\n`;
      if (document_metadata.periodo) md += `- **Período**: ${document_metadata.periodo}\n`;
      if (document_metadata.saldo_inicial !== null) md += `- **Saldo inicial**: $${document_metadata.saldo_inicial.toLocaleString()}\n`;
      if (document_metadata.saldo_final !== null) md += `- **Saldo final**: $${document_metadata.saldo_final.toLocaleString()}\n`;
      md += `\n`;
    }

    // Summary
    md += `## 📊 Resumen\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `|---------|-------|\n`;
    md += `| Total de transacciones | ${summary.total_transactions} |\n`;
    md += `| Ingresos | $${summary.total_income.toLocaleString()} |\n`;
    md += `| Gastos | $${summary.total_expenses.toLocaleString()} |\n`;
    md += `| Balance neto | $${summary.net_balance.toLocaleString()} |\n\n`;

    // Transactions
    if (transactions.length > 0) {
      md += `## 💰 Transacciones\n\n`;
      md += `| Fecha | Descripción | Monto | Tipo |\n`;
      md += `|-------|-------------|-------|------|\n`;

      transactions.forEach(tx => {
        const amount = tx.type === 'income' ? `+$${tx.amount}` : `-$${tx.amount}`;
        const type = tx.type === 'income' ? '📈' : '📉';
        md += `| ${tx.date} | ${tx.description} | ${amount} | ${type} |\n`;
      });
    }

    return md;
  }
}

module.exports = new ResponseFormatterService();
