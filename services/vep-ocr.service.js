/**
 * VEP OCR Service
 * Specialized service for extracting structured data from VEP (Volante Electrónico de Pago) documents
 * VEPs are electronic payment vouchers issued by ARCA and other Argentine tax agencies
 */
class VepOcrService {
  constructor() {
    this.vepKeywords = [
      'volante electrónico de pago',
      'vep',
      'nro. vep',
      'nro vep',
      'organismo recaudador',
      'arca'
    ];
  }

  /**
   * Detect if a document is a VEP
   * @param {string} text - Document text content
   * @returns {boolean}
   */
  isVepDocument(text) {
    if (!text) return false;

    const textLower = text.toLowerCase();

    // Check for VEP-specific keywords
    const hasVepKeywords = this.vepKeywords.some(keyword =>
      textLower.includes(keyword)
    );

    // Check for typical VEP structure patterns
    const hasVepNumber = /nro\.?\s*vep\s*:?\s*\d+/i.test(text);
    const hasOrganismoRecaudador = /organismo\s+recaudador/i.test(text);

    return hasVepKeywords && (hasVepNumber || hasOrganismoRecaudador);
  }

  /**
   * Parse date from various formats
   * @param {string} dateStr - Date string
   * @returns {string|null} ISO date format (YYYY-MM-DD)
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Remove extra spaces and clean
    dateStr = dateStr.trim();

    // Try YYYY-MM-DD format (already correct)
    let match = dateStr.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    // Try DD/MM/YYYY format
    match = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }

    // Try DD/MM/YY format
    match = dateStr.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{2})/);
    if (match) {
      const year = parseInt(match[3]) + 2000;
      return `${year}-${match[2]}-${match[1]}`;
    }

    return null;
  }

  /**
   * Parse period (YYYY-MM format)
   * @param {string} periodStr - Period string
   * @returns {string|null} Period in YYYY-MM format
   */
  parsePeriod(periodStr) {
    if (!periodStr) return null;

    periodStr = periodStr.trim();

    // Match YYYY-MM format
    const match = periodStr.match(/(\d{4})[\/\-](\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    return periodStr;
  }

  /**
   * Parse amount from string (handles Argentine number format)
   * @param {string} amountStr - Amount string
   * @returns {number} Parsed amount
   */
  parseAmount(amountStr) {
    if (!amountStr) return 0;

    // Remove currency symbols, spaces, and extract numbers
    let cleaned = amountStr
      .replace(/[$\s]/g, '')
      .replace(/[^\d.,-]/g, '');

    // Argentine format uses . for thousands and , for decimals
    // Example: 1.058.223,38
    if (cleaned.includes(',')) {
      // Remove dots (thousands separator) and replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // If no comma, remove dots that are thousands separators
      // Keep only the last dot if it looks like a decimal separator
      const parts = cleaned.split('.');
      if (parts.length > 2) {
        // Multiple dots, they're thousands separators
        cleaned = cleaned.replace(/\./g, '');
      }
    }

    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  }

  /**
   * Extract field value from text using various patterns
   * @param {string} text - Document text
   * @param {Array<RegExp>} patterns - Array of regex patterns to try
   * @returns {string|null} Extracted value
   */
  extractField(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract line items from VEP
   * @param {string} text - Document text
   * @returns {Array} Array of line items with description, code, and amount
   */
  extractLineItems(text) {
    const items = [];

    // Common VEP line item patterns
    // Examples:
    // CONTRIBUCIONES SEG. SOCIAL (351) $1.058.223,38
    // EMPLEADOR-APORTES SEG. SOCIAL (301) $804.013,71
    const patterns = [
      // Pattern 1: DESCRIPTION (CODE) $AMOUNT
      /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.\/\-]+)\s+\((\d+)\)\s+\$?([\d.,]+)$/gm,
      // Pattern 2: DESCRIPTION CODE $AMOUNT (without parentheses)
      /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.\/\-]+)\s+(\d+)\s+\$?([\d.,]+)$/gm
    ];

    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex
      while ((match = pattern.exec(text)) !== null) {
        const [, description, code, amount] = match;

        // Skip if description looks like a header
        if (description.length < 5 || description.toLowerCase().includes('importe total')) {
          continue;
        }

        items.push({
          descripcion: description.trim(),
          codigo: code.trim(),
          monto: this.parseAmount(amount)
        });
      }
    }

    return items;
  }

  /**
   * Extract VEP data from document text
   * @param {string} textContent - Raw text from document
   * @param {string} fileName - Original file name
   * @returns {Object} Extracted VEP data
   */
  async extractVepData(textContent, fileName) {
    try {
      console.log('[VEP-OCR] Starting VEP extraction...');

      // Verify this is a VEP document
      if (!this.isVepDocument(textContent)) {
        throw new Error('This does not appear to be a VEP document');
      }

      // Extract VEP Number
      const nroVep = this.extractField(textContent, [
        /nro\.?\s*vep\s*:?\s*(\d+)/i,
        /vep\s*:?\s*(\d+)/i
      ]);

      // Extract Organismo Recaudador
      const organismoRecaudador = this.extractField(textContent, [
        /organismo\s+recaudador\s*:?\s*([A-Za-z]+)/i,
        /organismo\s*:?\s*([A-Za-z]+)/i
      ]);

      // Extract Tipo de Pago
      const tipoPago = this.extractField(textContent, [
        /tipo\s+de\s+pago\s*:?\s*(.+?)(?:\n|descripci[oó]n)/i,
        /tipo\s+pago\s*:?\s*(.+?)(?:\n|descripci[oó]n)/i
      ]);

      // Extract Descripción Reducida
      const descripcionReducida = this.extractField(textContent, [
        /descripci[oó]n\s+reducida\s*:?\s*([A-Za-z0-9\/\-]+)/i,
        /descripci[oó]n\s*:?\s*([A-Za-z0-9\/\-]+)/i
      ]);

      // Extract CUIT
      const cuit = this.extractField(textContent, [
        /cuit\s*:?\s*(\d{2}[\/\-]\d{8}[\/\-]\d)/i,
        /cuit\s*:?\s*(\d{11})/i
      ]);

      // Extract Concepto
      const concepto = this.extractField(textContent, [
        /concepto\s*:?\s*(.+?)(?:\n|subconcepto)/i
      ]);

      // Extract Subconcepto
      const subconcepto = this.extractField(textContent, [
        /subconcepto\s*:?\s*(.+?)(?:\n|per[ií]odo)/i
      ]);

      // Extract Periodo
      const periodoRaw = this.extractField(textContent, [
        /per[ií]odo\s*:?\s*(\d{4}[\/\-]\d{2})/i,
        /periodo\s*:?\s*(\d{4}[\/\-]\d{2})/i
      ]);
      const periodo = this.parsePeriod(periodoRaw);

      // Extract Generado por el Usuario
      const generadoPorUsuario = this.extractField(textContent, [
        /generado\s+por\s+(?:el\s+)?usuario\s*:?\s*(\d+)/i,
        /usuario\s*:?\s*(\d+)/i
      ]);

      // Extract Fecha Generación
      const fechaGeneracionRaw = this.extractField(textContent, [
        /fecha\s+generaci[oó]n\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i,
        /fecha\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i
      ]);
      const fechaGeneracion = this.parseDate(fechaGeneracionRaw);

      // Extract Día de Expiración
      const diaExpiracionRaw = this.extractField(textContent, [
        /d[ií]a\s+de\s+expiraci[oó]n\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i,
        /expiraci[oó]n\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i,
        /vencimiento\s*:?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i
      ]);
      const diaExpiracion = this.parseDate(diaExpiracionRaw);

      // Extract Importe Total a Pagar
      const importeTotalRaw = this.extractField(textContent, [
        /importe\s+total\s+a\s+pagar\s*:?\s*\$?([\d.,]+)/i,
        /total\s+a\s+pagar\s*:?\s*\$?([\d.,]+)/i,
        /importe\s*:?\s*\$?([\d.,]+)/i
      ]);
      const importeTotalPagar = this.parseAmount(importeTotalRaw);

      // Extract line items (detailed breakdown)
      const itemsDetalle = this.extractLineItems(textContent);

      console.log(`[VEP-OCR] Successfully extracted VEP data for VEP #${nroVep}`);
      console.log(`[VEP-OCR] Found ${itemsDetalle.length} line items`);

      // Calculate confidence score based on how many fields were successfully extracted
      const totalFields = 12; // Number of main fields we're extracting
      let extractedFields = 0;

      if (nroVep) extractedFields++;
      if (organismoRecaudador) extractedFields++;
      if (tipoPago) extractedFields++;
      if (descripcionReducida) extractedFields++;
      if (cuit) extractedFields++;
      if (concepto) extractedFields++;
      if (subconcepto) extractedFields++;
      if (periodo) extractedFields++;
      if (generadoPorUsuario) extractedFields++;
      if (fechaGeneracion) extractedFields++;
      if (diaExpiracion) extractedFields++;
      if (importeTotalPagar > 0) extractedFields++;

      const confidenceScore = (extractedFields / totalFields) * 100;

      const vepData = {
        nro_vep: nroVep,
        organismo_recaudador: organismoRecaudador,
        tipo_pago: tipoPago,
        descripcion_reducida: descripcionReducida,
        cuit: cuit,
        concepto: concepto,
        subconcepto: subconcepto,
        periodo: periodo,
        generado_por_usuario: generadoPorUsuario,
        fecha_generacion: fechaGeneracion,
        dia_expiracion: diaExpiracion,
        importe_total_pagar: importeTotalPagar,
        items_detalle: itemsDetalle,
        confidence_score: confidenceScore,
        raw_data: {
          fileName: fileName,
          extractedAt: new Date().toISOString(),
          textLength: textContent.length
        }
      };

      return {
        success: true,
        vepData: vepData,
        confidenceScore: confidenceScore
      };
    } catch (error) {
      console.error('[VEP-OCR] Extraction error:', error);
      throw new Error(`VEP OCR error: ${error.message}`);
    }
  }

  /**
   * Check if VEP OCR is available
   * @returns {boolean}
   */
  isAvailable() {
    return true; // Always available since it's local
  }
}

module.exports = new VepOcrService();
