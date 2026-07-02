const EXPENSE_CATEGORIES = [
  { value: 'groceries', label: 'Groceries' },
  { value: 'dining', label: 'Dining' },
  { value: 'transport', label: 'Transport' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'health', label: 'Health' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'other', label: 'Other' },
];

const PRICE_PATTERNS = [
  /\$\s*(\d{1,6}\.\d{2})/,
  /(\d{1,6}\.\d{2})\s*$/,
  /(\d{1,6},\d{2})\s*$/,
  /(\d{1,6}\.\d{2})\s*(?:USD|HKD|EUR|GBP)?/i,
];

const SKIP_KEYWORDS = [
  'total', 'subtotal', 'sub total', 'tax', 'vat', 'gst', 'change',
  'cash', 'card', 'visa', 'mastercard', 'debit', 'credit', 'balance',
  'thank you', 'receipt', 'invoice', 'date', 'time', 'tel', 'phone',
  'www', 'http', 'qty', 'quantity', 'amount due', 'grand total',
  'payment', 'tender', 'discount', 'savings', 'member', 'points',
];

const ReceiptParser = {
  categories: EXPENSE_CATEGORIES,

  async scanImage(imageDataUrl) {
    await GrokVision.checkStatus();

    if (GrokVision._status?.offline) {
      return this.scanWithTesseract(imageDataUrl);
    }

    if (!GrokVision.isConfigured()) {
      throw new Error('GROK_NOT_CONFIGURED');
    }

    try {
      const grokResult = await GrokVision.scanImage(imageDataUrl);
      return {
        merchant: grokResult.merchant || '',
        date: grokResult.date || new Date().toISOString().split('T')[0],
        total: grokResult.total ?? null,
        items: (grokResult.items || []).map((item) => ({
          name: item.name,
          qty: item.qty || 1,
          price: item.price,
          category: item.category || this.guessCategory(item.name),
        })),
        notes: grokResult.notes || '',
        source: 'grok',
        rawText: '',
      };
    } catch (err) {
      if (err.message === 'GROK_NOT_CONFIGURED') {
        throw err;
      }
      console.warn('Grok failed, falling back to Tesseract:', err);
      return this.scanWithTesseract(imageDataUrl);
    }
  },

  async scanWithTesseract(imageDataUrl) {
    const el = document.getElementById('ocrStatus');
    if (el) {
      el.hidden = false;
      el.querySelector('span').textContent = 'Grok unavailable — using basic OCR…';
    }

    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && el) {
          const pct = Math.round((m.progress || 0) * 100);
          el.querySelector('span').textContent = `Basic OCR… ${pct}%`;
        }
      },
    });
    const parsed = this.parseText(result.data.text);
    parsed.source = 'tesseract';
    return parsed;
  },

  parseText(text) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 1);

    const merchant = this.extractMerchant(lines);
    const date = this.extractDate(text);
    const total = this.extractTotal(lines);
    const items = this.extractItems(lines);

    return { merchant, date, total, items, rawText: text };
  },

  extractMerchant(lines) {
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length < 3 || line.length > 60) continue;
      if (this.isPriceLine(line)) continue;
      if (/^\d+$/.test(line)) continue;
      if (/date|time|receipt|invoice|tel|phone/i.test(line)) continue;
      return line;
    }
    return '';
  },

  extractDate(text) {
    const patterns = [
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/,
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})/,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let date;
          if (match[0].match(/[A-Za-z]/)) {
            date = new Date(match[0]);
          } else if (match[1].length === 4) {
            date = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
          } else {
            const year = match[3].length === 2 ? `20${match[3]}` : match[3];
            date = new Date(`${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`);
          }
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch {
          /* continue */
        }
      }
    }
    return new Date().toISOString().split('T')[0];
  },

  extractTotal(lines) {
    const totalKeywords = ['total', 'grand total', 'amount due', 'balance due', 'total due'];

    for (let i = lines.length - 1; i >= 0; i--) {
      const lower = lines[i].toLowerCase();
      if (totalKeywords.some((kw) => lower.includes(kw)) && !lower.includes('sub')) {
        const price = this.extractPrice(lines[i]);
        if (price !== null) return price;
      }
    }

    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 8); i--) {
      const price = this.extractPrice(lines[i]);
      if (price !== null && price > 0) return price;
    }

    return null;
  },

  extractItems(lines) {
    const items = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (SKIP_KEYWORDS.some((kw) => lower.includes(kw))) continue;
      if (lower.startsWith('***') || lower.startsWith('---')) continue;

      const price = this.extractPrice(line);
      if (price === null || price <= 0) continue;

      let name = line;
      for (const pattern of PRICE_PATTERNS) {
        name = name.replace(pattern, '').trim();
      }
      name = name.replace(/^\d+\s*x\s*/i, '').replace(/\s+/g, ' ').trim();

      if (name.length < 2 || name.length > 80) continue;
      if (/^[\d\s\.\-,]+$/.test(name)) continue;

      items.push({
        name,
        qty: 1,
        price,
        category: this.guessCategory(name),
      });
    }

    return this.deduplicateItems(items);
  },

  extractPrice(line) {
    for (const pattern of PRICE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val) && val > 0 && val < 100000) return val;
      }
    }
    return null;
  },

  isPriceLine(line) {
    const stripped = line.replace(/[\$\s]/g, '');
    return /^\d+[\.,]\d{2}$/.test(stripped);
  },

  guessCategory(name) {
    const lower = name.toLowerCase();
    const rules = [
      { cat: 'groceries', words: ['milk', 'bread', 'egg', 'fruit', 'vegetable', 'meat', 'cheese', 'grocery', 'produce', 'organic'] },
      { cat: 'dining', words: ['coffee', 'latte', 'burger', 'pizza', 'restaurant', 'cafe', 'sandwich', 'meal', 'drink', 'tea', 'soda'] },
      { cat: 'transport', words: ['gas', 'fuel', 'uber', 'lyft', 'taxi', 'parking', 'metro', 'bus', 'train', 'toll'] },
      { cat: 'shopping', words: ['shirt', 'pants', 'shoes', 'clothing', 'electronics', 'phone', 'accessory'] },
      { cat: 'utilities', words: ['electric', 'water', 'internet', 'phone bill', 'utility', 'cable'] },
      { cat: 'health', words: ['pharmacy', 'medicine', 'vitamin', 'doctor', 'dental', 'health'] },
      { cat: 'entertainment', words: ['movie', 'game', 'ticket', 'subscription', 'netflix', 'spotify', 'book'] },
    ];

    for (const rule of rules) {
      if (rule.words.some((w) => lower.includes(w))) return rule.cat;
    }
    return 'other';
  },

  deduplicateItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.name.toLowerCase()}-${item.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  categoryOptionsHtml(selected = 'other') {
    return EXPENSE_CATEGORIES.map(
      (c) => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>${c.label}</option>`
    ).join('');
  },
};