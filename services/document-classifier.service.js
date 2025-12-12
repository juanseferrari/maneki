/**
 * Document Classifier Service
 * Detects document types and classifies them for proper processing
 */
class DocumentClassifierService {
  constructor() {
    // Document type patterns
    this.documentPatterns = {
      vep: {
        name: 'VEP',
        fullName: 'Volante Electrónico de Pago',
        patterns: [
          /volante\s+electr[oó]nico\s+de\s+pago/i,
          /\bVEP\b/,
          /Nro\.\s*VEP/i,
          /ARCA.*VEP|VEP.*ARCA/i
        ],
        priority: 100
      },
      bank_statement: {
        name: 'Extracto Bancario',
        fullName: 'Extracto de Cuenta Bancaria',
        patterns: [
          /movimientos?\s+del/i,
          /extracto\s+(?:de\s+)?(?:cuenta|bancario)/i,
          /estado\s+de\s+cuenta/i,
          /resumen\s+de\s+(?:cuenta|movimientos)/i,
          /saldo\s+(?:inicial|final|en\s+\$)/i,
          /CTE\s*\$\s*\*+\d+/i, // Account number format like "CTE $ ****7982"
          /caja\s+de\s+ahorro/i,
          /cuenta\s+corriente/i
        ],
        priority: 80
      },
      credit_card_statement: {
        name: 'Resumen Tarjeta',
        fullName: 'Resumen de Tarjeta de Crédito',
        patterns: [
          /resumen\s+(?:de\s+)?tarjeta/i,
          /ciclo\s+de\s+facturaci[oó]n/i,
          /tarjeta\s+(?:de\s+)?cr[eé]dito/i,
          /vencimiento\s+(?:m[ií]nimo|total)/i,
          /pago\s+m[ií]nimo/i,
          /l[ií]mite\s+de\s+(?:compra|cr[eé]dito)/i
        ],
        priority: 85
      },
      invoice: {
        name: 'Factura',
        fullName: 'Factura',
        patterns: [
          /factura\s*(?:tipo\s*)?[abc]/i,
          /factura\s+(?:electr[oó]nica|original)/i,
          /comprobante\s+(?:tipo|original)/i,
          /(?:C\.?U\.?I\.?T\.?|CUIT)\s*:?\s*\d{2}-?\d{8}-?\d/i,
          /(?:punto\s+de\s+venta|pto\.\s*vta)/i,
          /n[uú]mero\s+de\s+comprobante/i,
          /importe\s+(?:neto|total|iva)/i,
          /I\.?V\.?A\.?\s+(?:\d+(?:[.,]\d+)?%|\(\d+(?:[.,]\d+)?%\))/i
        ],
        priority: 90
      },
      receipt: {
        name: 'Recibo',
        fullName: 'Recibo de Pago',
        patterns: [
          /recibo\s+(?:de\s+)?(?:pago|cobro)/i,
          /comprobante\s+de\s+pago/i,
          /recib[ií]\s+de\s+conformidad/i,
          /pago\s+recibido/i
        ],
        priority: 70
      },
      payment_voucher: {
        name: 'Comprobante de Pago',
        fullName: 'Comprobante de Transferencia/Pago',
        patterns: [
          /comprobante\s+de\s+transferencia/i,
          /transferencia\s+(?:exitosa|realizada)/i,
          /operaci[oó]n\s+(?:exitosa|n[uú]mero)/i,
          /n[uú]mero\s+de\s+operaci[oó]n/i,
          /CVU|CBU/i
        ],
        priority: 75
      },
      subscription: {
        name: 'Suscripción',
        fullName: 'Factura de Suscripción/Servicio',
        patterns: [
          /suscripci[oó]n/i,
          /per[ií]odo\s+(?:de\s+)?facturaci[oó]n/i,
          /servicio\s+(?:mensual|anual)/i,
          /renovaci[oó]n\s+autom[aá]tica/i,
          /plan\s+(?:b[aá]sico|premium|pro)/i
        ],
        priority: 65
      },
      utility_bill: {
        name: 'Servicio',
        fullName: 'Factura de Servicios',
        patterns: [
          /(?:edenor|edesur|metrogas|aysa|telecom|movistar|personal|claro)/i,
          /consumo\s+(?:del\s+)?per[ií]odo/i,
          /lectura\s+(?:anterior|actual)/i,
          /kwh|m[³3]|minutos/i
        ],
        priority: 60
      },
      unknown: {
        name: 'Documento',
        fullName: 'Documento sin clasificar',
        patterns: [],
        priority: 0
      }
    };
  }

  /**
   * Classify document type from text content
   * @param {string} textContent - Document text
   * @returns {Object} Classification result with type and confidence
   */
  classifyDocument(textContent) {
    if (!textContent || textContent.trim().length === 0) {
      return {
        type: 'unknown',
        name: this.documentPatterns.unknown.name,
        fullName: this.documentPatterns.unknown.fullName,
        confidence: 0,
        matchedPatterns: []
      };
    }

    const results = [];

    for (const [typeKey, typeConfig] of Object.entries(this.documentPatterns)) {
      if (typeKey === 'unknown') continue;

      const matchedPatterns = [];
      let matchCount = 0;

      for (const pattern of typeConfig.patterns) {
        if (pattern.test(textContent)) {
          matchCount++;
          matchedPatterns.push(pattern.source);
        }
      }

      if (matchCount > 0) {
        // Calculate confidence based on matches and priority
        const patternMatchRatio = matchCount / typeConfig.patterns.length;
        const confidence = Math.min(
          (patternMatchRatio * 50) + (typeConfig.priority / 2) + (matchCount * 5),
          100
        );

        results.push({
          type: typeKey,
          name: typeConfig.name,
          fullName: typeConfig.fullName,
          confidence: Math.round(confidence),
          matchedPatterns,
          matchCount
        });
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    if (results.length > 0) {
      return results[0];
    }

    return {
      type: 'unknown',
      name: this.documentPatterns.unknown.name,
      fullName: this.documentPatterns.unknown.fullName,
      confidence: 0,
      matchedPatterns: []
    };
  }

  /**
   * Detect bank from text content
   * @param {string} textContent - Document text
   * @returns {Object} Bank detection result
   */
  detectBank(textContent) {
    const textLower = textContent.toLowerCase();

    const banks = [
      { id: 'hipotecario', name: 'Banco Hipotecario', patterns: ['hipotecario', 'banco hipotecario'] },
      { id: 'santander', name: 'Santander', patterns: ['santander', 'banco santander'] },
      { id: 'galicia', name: 'Banco Galicia', patterns: ['galicia', 'banco galicia'] },
      { id: 'bbva', name: 'BBVA', patterns: ['bbva', 'frances'] },
      { id: 'macro', name: 'Banco Macro', patterns: ['macro', 'banco macro'] },
      { id: 'nacion', name: 'Banco Nación', patterns: ['nacion', 'banco nación', 'banco de la nación'] },
      { id: 'provincia', name: 'Banco Provincia', patterns: ['provincia', 'banco provincia'] },
      { id: 'ciudad', name: 'Banco Ciudad', patterns: ['ciudad', 'banco ciudad'] },
      { id: 'brubank', name: 'Brubank', patterns: ['brubank', 'bru bank'] },
      { id: 'mercadopago', name: 'Mercado Pago', patterns: ['mercado pago', 'mercadopago'] },
      { id: 'uala', name: 'Ualá', patterns: ['uala', 'ualá'] },
      { id: 'naranja', name: 'Naranja X', patterns: ['naranja', 'naranja x'] },
      { id: 'icbc', name: 'ICBC', patterns: ['icbc', 'industrial and commercial'] },
      { id: 'hsbc', name: 'HSBC', patterns: ['hsbc'] },
      { id: 'credicoop', name: 'Credicoop', patterns: ['credicoop', 'banco credicoop'] },
      { id: 'supervielle', name: 'Supervielle', patterns: ['supervielle'] },
      { id: 'patagonia', name: 'Banco Patagonia', patterns: ['patagonia', 'banco patagonia'] },
      { id: 'comafi', name: 'Banco Comafi', patterns: ['comafi'] },
      { id: 'itau', name: 'Itaú', patterns: ['itau', 'itaú'] }
    ];

    for (const bank of banks) {
      for (const pattern of bank.patterns) {
        if (textLower.includes(pattern)) {
          return {
            id: bank.id,
            name: bank.name,
            detected: true
          };
        }
      }
    }

    return {
      id: 'unknown',
      name: 'Desconocido',
      detected: false
    };
  }

  /**
   * Get full document classification including type and bank
   * @param {string} textContent - Document text
   * @returns {Object} Complete classification
   */
  getFullClassification(textContent) {
    const documentType = this.classifyDocument(textContent);
    const bank = this.detectBank(textContent);

    return {
      documentType,
      bank,
      isProcessable: documentType.type !== 'unknown' || bank.detected
    };
  }
}

module.exports = new DocumentClassifierService();
