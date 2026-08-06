import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  cleanAmount,
  isDateColumn,
  isAmountColumn,
  isMerchantColumn,
  isCategoryColumn,
  autoMapColumns,
} from './csvParser';
import { analyzePdfText, parseChaseStatement } from './pdfExtract';

// ---------------------------------------------------------------------------
// parseCSV
// ---------------------------------------------------------------------------

describe('parseCSV', () => {
  it('returns empty result for empty input', () => {
    expect(parseCSV('')).toEqual({ headers: [], rows: [] });
    expect(parseCSV('   ')).toEqual({ headers: [], rows: [] });
    expect(parseCSV('\n\n')).toEqual({ headers: [], rows: [] });
  });

  it('parses a simple comma-delimited CSV', () => {
    const csv = 'Date,Amount,Description\n2024-01-01,100,Groceries\n2024-01-02,-50,Transfer';
    const result = parseCSV(csv);

    expect(result.headers).toEqual(['Date', 'Amount', 'Description']);
    expect(result.rows).toEqual([
      ['2024-01-01', '100', 'Groceries'],
      ['2024-01-02', '-50', 'Transfer'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    const csv = 'Date,Amount,Description\n2024-01-01,100,"Groceries, Bakery, Deli"';
    const result = parseCSV(csv);
    expect(result.rows[0][2]).toBe('Groceries, Bakery, Deli');
  });

  it('handles escaped quotes inside quoted fields', () => {
    const csv = 'Date,Amount,Description\n2024-01-01,100,"He said ""hello""";';
    const result = parseCSV(csv);
    expect(result.rows[0][2]).toBe('He said "hello";');
  });

  it('handles tab-delimited input', () => {
    const csv = 'Date\tAmount\tDescription\n2024-01-01\t100\tGroceries';
    const result = parseCSV(csv);

    expect(result.headers).toEqual(['Date', 'Amount', 'Description']);
    expect(result.rows).toEqual([['2024-01-01', '100', 'Groceries']]);
  });

  it('handles semicolon-delimited input', () => {
    const csv = 'Date;Amount;Description\n2024-01-01;100;Groceries';
    const result = parseCSV(csv);

    expect(result.headers).toEqual(['Date', 'Amount', 'Description']);
    expect(result.rows).toEqual([['2024-01-01', '100', 'Groceries']]);
  });

  it('skips blank lines between rows', () => {
    const csv = 'Date,Amount\n2024-01-01,100\n\n2024-01-02,200';
    const result = parseCSV(csv);
    expect(result.rows.length).toBe(2);
  });

  it('trims trailing whitespace from rows', () => {
    const csv = 'Date,Amount\n2024-01-01,100  ';
    const result = parseCSV(csv);
    expect(result.rows[0][1]).toBe('100');
  });
});

// ---------------------------------------------------------------------------
// cleanAmount
// ---------------------------------------------------------------------------

describe('cleanAmount', () => {
  it('handles empty, dash, and zero inputs', () => {
    expect(cleanAmount('')).toBe('0');
    expect(cleanAmount('-')).toBe('0');
    expect(cleanAmount('0')).toBe('0');
  });

  it('strips dollar sign and commas (US format)', () => {
    expect(cleanAmount('$1,234.56')).toBe('1234.56');
    expect(cleanAmount('$10,000')).toBe('10000');
    expect(cleanAmount('$0.99')).toBe('0.99');
  });

  it('handles European format (dots as thousands, comma as decimal)', () => {
    expect(cleanAmount('1.234,56')).toBe('1234.56');
    expect(cleanAmount('10.000,00')).toBe('10000.00');
  });

  it('treats comma-only amounts as US thousands separator (ambiguous without locale)', () => {
    // '99,99' is ambiguous — could be European 99.99 or US 9999.
    // Without a dot to anchor the heuristic, we default to US format.
    expect(cleanAmount('99,99')).toBe('9999');
  });

  it('handles European format with currency symbol', () => {
    expect(cleanAmount('€1.234,56')).toBe('1234.56');
    expect(cleanAmount('1.234,56 €')).toBe('1234.56');
  });

  it('handles negative amounts with parentheses', () => {
    expect(cleanAmount('(123.45)')).toBe('-123.45');
    expect(cleanAmount('(1,000.00)')).toBe('-1000.00');
    expect(cleanAmount('(1.234,56)')).toBe('-1234.56');
  });

  it('handles whitespace around amounts', () => {
    expect(cleanAmount('  $100.00  ')).toBe('100.00');
  });

  it('leaves plain numbers untouched', () => {
    expect(cleanAmount('42')).toBe('42');
    expect(cleanAmount('3.14')).toBe('3.14');
    expect(cleanAmount('-50')).toBe('-50');
  });

  it('handles negative plain numbers', () => {
    expect(cleanAmount('-100')).toBe('-100');
  });
});

// ---------------------------------------------------------------------------
// Column detection helpers
// ---------------------------------------------------------------------------

describe('isDateColumn', () => {
  const cases: [string, boolean][] = [
    ['date', true],
    ['Transaction Date', true],
    ['Posting Date', true],
    ['Posted', true],
    ['amount', false],
    ['merchant', false],
    ['category', false],
  ];

  for (const [header, expected] of cases) {
    it(`${header} → ${expected}`, () => {
      expect(isDateColumn(header)).toBe(expected);
    });
  }
});

describe('isAmountColumn', () => {
  const cases: [string, boolean][] = [
    ['amount', true],
    ['debit', true],
    ['credit', true],
    ['withdrawal', true],
    ['deposit', true],
    ['total amount', true],
    ['balance', true],
    ['date', false],
    ['merchant', false],
  ];

  for (const [header, expected] of cases) {
    it(`${header} → ${expected}`, () => {
      expect(isAmountColumn(header)).toBe(expected);
    });
  }
});

describe('isMerchantColumn', () => {
  const cases: [string, boolean][] = [
    ['payee', true],
    ['merchant', true],
    ['vendor', true],
    ['description', true],
    ['details', true],
    ['memo', true],
    ['narrative', true],
    ['counterpart', true],
    ['date', false],
    ['amount', false],
  ];

  for (const [header, expected] of cases) {
    it(`${header} → ${expected}`, () => {
      expect(isMerchantColumn(header)).toBe(expected);
    });
  }
});

describe('isCategoryColumn', () => {
  const cases: [string, boolean][] = [
    ['category', true],
    ['classification', true],
    ['tags', true],
    ['type', true],
    ['class', true],
    ['date', false],
    ['amount', false],
    ['merchant', false],
  ];

  for (const [header, expected] of cases) {
    it(`${header} → ${expected}`, () => {
      expect(isCategoryColumn(header)).toBe(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// autoMapColumns
// ---------------------------------------------------------------------------

describe('autoMapColumns', () => {
  it('maps a standard bank statement header row', () => {
    const headers = ['Date', 'Amount', 'Payee', 'Category', 'Description'];
    const map = autoMapColumns(headers);

    expect(map.date).toBe(0);
    expect(map.amount).toBe(1);
    expect(map.merchant).toBe(2);
    expect(map.category).toBe(3);
    expect(map.description).toBeNull();
  });

  it('handles tab-delimited headers (lowercase)', () => {
    const headers = ['posting date', 'debit', 'vendor', 'type'];
    const map = autoMapColumns(headers);

    expect(map.date).toBe(0);
    expect(map.amount).toBe(1);
    expect(map.merchant).toBe(2);
    expect(map.category).toBe(3);
  });

  it('returns all nulls for unrecognizable headers', () => {
    const map = autoMapColumns(['col1', 'col2', 'col3']);
    expect(map).toEqual({ date: null, amount: null, merchant: null, category: null, description: null });
  });

  it('handles empty headers', () => {
    const map = autoMapColumns([]);
    expect(map).toEqual({ date: null, amount: null, merchant: null, category: null, description: null });
  });
});

// ---------------------------------------------------------------------------
// analyzePdfText
// ---------------------------------------------------------------------------

describe('analyzePdfText', () => {
  it('detects scanned PDFs (no meaningful text)', () => {
    const result = analyzePdfText('   \n\n  ');
    expect(result.textType).toBe('scanned');
    expect(result.bank).toBe('unknown');
  });

  it('detects Chase bank from text', () => {
    const text = 'JPMorgan Chase Bank, N.A.\nChase.com\nChase Premier Plus Checking';
    const result = analyzePdfText(text);
    expect(result.bank).toBe('chase');
  });

  it('detects unknown bank for non-Chase financial text', () => {
    const text = 'Wells Fargo Bank\nBank of America';
    const result = analyzePdfText(text);
    expect(result.bank).toBe('unknown');
  });

  it('detects CSV-like text structure', () => {
    const text = 'Date,Amount,Description\n2024-01-01,100,Groceries\n2024-01-02,-50,Transfer';
    const result = analyzePdfText(text);
    expect(result.textType).toBe('csv-like');
  });

  it('detects prose text (no delimiters)', () => {
    const text = 'This is a paragraph of text from a PDF.\nIt has multiple lines.\n';
    const result = analyzePdfText(text);
    expect(result.textType).toBe('prose');
  });
});

// ---------------------------------------------------------------------------
// parseChaseStatement
// ---------------------------------------------------------------------------

describe('parseChaseStatement', () => {
  it('parses a Chase withdrawal line', () => {
    const text = `June 01, 2026 through July 01, 2026
ELECTRONIC WITHDRAWALS
06/09Acme Utilities  Billpay                    PPD ID: 1234567890$205.17`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-06-09');
    expect(result[0].amount).toBe('-205.17');
    expect(result[0].type).toBe('expense');
  });

  it('parses a Chase deposit line', () => {
    const text = `June 01, 2026 through July 01, 2026
DEPOSITS AND ADDITIONS
06/30Payroll Depo                  PPD ID: 0987654321$12710.79`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-06-30');
    expect(result[0].amount).toBe('12710.79');
    expect(result[0].type).toBe('income');
  });

  it('parses lines without $ prefix', () => {
    const text = `June 01, 2026 through July 01, 2026
ELECTRONIC WITHDRAWALS
07/08Interest Payment0.44`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-07-08');
    expect(result[0].amount).toBe('-0.44');
  });

  it('parses Web ID and CCD ID transaction types', () => {
    const text = `June 01, 2026 through July 01, 2026
ELECTRONIC WITHDRAWALS
06/22Telecom Co           Pcs Svc    1234567         Web ID: 0000123456160.84
06/25Gas Company       Payment    320005522943    CCD ID: 4530162882156.00`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe('-160.84');
    expect(result[1].amount).toBe('-156.00');
  });

  it('handles comma-formatted amounts', () => {
    const text = `June 01, 2026 through July 01, 2026
ELECTRONIC WITHDRAWALS
06/23Card Auto Pay                PPD ID: 47600392245,148.06`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe('-5148.06');
  });

  it('handles multi-line Chase statement', () => {
    const text = `June 01, 2026 through July 01, 2026
DEPOSITS AND ADDITIONS
06/30Payroll Depo                  PPD ID: 0987654321$12710.79
07/08Interest Payment0.44
ELECTRONIC WITHDRAWALS
06/09Acme Utilities  Billpay                    PPD ID: 1234567890$205.17
06/15Card Auto Pay                PPD ID: 4760039224253.22
07/07Invest Co        Payment    18139774-1      Web ID: 15418162461,000.00`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(5);

    // First two are deposits
    expect(result[0].date).toBe('2026-06-30');
    expect(result[0].type).toBe('income');
    expect(result[1].date).toBe('2026-07-08');
    expect(result[1].type).toBe('income');

    // Last three are withdrawals
    expect(result[2].date).toBe('2026-06-09');
    expect(result[2].type).toBe('expense');
    expect(result[3].date).toBe('2026-06-15');
    expect(result[3].type).toBe('expense');
    expect(result[4].date).toBe('2026-07-07');
    expect(result[4].type).toBe('expense');
  });

  it('returns empty array for non-transaction text', () => {
    const text = 'This is just a regular paragraph.\nNo transactions here.';
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(0);
  });

  it('handles cross-year statement dates', () => {
    const text = `December 15, 2025 through January 14, 2026
ELECTRONIC WITHDRAWALS
01/05Online Store                            PPD ID: 1234567890$99.99`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    // Cross-year: end (01/14) < start (12/15), so year (2025) is the START year
    // 01/05 >= 01/14 is false → stays in start year + 1 = 2026
    expect(result[0].date).toBe('2026-01-05');
  });

  it('parses Chase credit card statement with MM/DD/YY - MM/DD/YY period format', () => {
    const text = `06/26/26 - 07/25/26
ELECTRONIC WITHDRAWALS
07/22RECURRING PAYMENT-1,234.56
DEPOSITS AND ADDITIONS
06/27RETAIL STORE12.34
06/27ONLINE SHOP56.78
ELECTRONIC WITHDRAWALS
07/01UTILITY COMPANY99.99`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(4);
    expect(result[0].date).toBe('2026-07-22');
    expect(result[0].amount).toBe('-1234.56');
    expect(result[1].date).toBe('2026-06-27');
    expect(result[1].amount).toBe('12.34');
    expect(result[2].date).toBe('2026-06-27');
    expect(result[2].amount).toBe('56.78');
    expect(result[3].date).toBe('2026-07-01');
    expect(result[3].amount).toBe('-99.99');
  });

  it('handles cross-year with MM/DD/YY - MM/DD/YY format', () => {
    const text = `12/15/25 - 01/14/26
ELECTRONIC WITHDRAWALS
01/05Online Store                            PPD ID: 1234567890$99.99`;
    const result = parseChaseStatement(text);
    expect(result).toHaveLength(1);
    // Cross-year: end (01/14) < start (12/15), so year (2026) is the END year
    // 01/05 < 01/14 → stays in end year = 2026
    expect(result[0].date).toBe('2026-01-05');
  });
});
