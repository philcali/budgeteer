import { describe, it, expect } from 'vitest';
import {
  normalizeMerchant,
  merchantsMatch,
  calculateConfidence,
  daysBetween,
  findDuplicates,
} from './deduplication';
import type { Transaction } from '../types';

// ---------------------------------------------------------------------------
// normalizeMerchant
// ---------------------------------------------------------------------------

describe('normalizeMerchant', () => {
  it('lowercases the input', () => {
    expect(normalizeMerchant('WALMART SUPERCENTER')).toBe('walmart supercenter');
  });

  it('strips common suffixes', () => {
    expect(normalizeMerchant('WALMART SUPERCENTER POS')).toBe('walmart supercenter');
    expect(normalizeMerchant('AMAZON.COM DEBIT')).toBe('amazon.com');
    expect(normalizeMerchant('STARBUCKS CREDIT')).toBe('starbucks');
    expect(normalizeMerchant('TARGET TRANSFER')).toBe('target');
    expect(normalizeMerchant('WHOLE FOODS PAYMENT')).toBe('whole foods');
  });

  it('strips punctuation', () => {
    expect(normalizeMerchant('McDonald\'s #1234')).toBe('mcdonalds 1234');
    expect(normalizeMerchant('Costco Wholesale®')).toBe('costco wholesale');
    expect(normalizeMerchant('Home Depot (Store #567)')).toBe('home depot store 567');
  });

  it('collapses whitespace', () => {
    expect(normalizeMerchant('  Uber   Technologies  ')).toBe('uber technologies');
  });

  it('handles empty input', () => {
    expect(normalizeMerchant('')).toBe('');
    expect(normalizeMerchant('   ')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// merchantsMatch
// ---------------------------------------------------------------------------

describe('merchantsMatch', () => {
  it('matches exact normalized names', () => {
    expect(merchantsMatch('Walmart', 'WALMART SUPERCENTER POS')).toBe(true);
    expect(merchantsMatch('amazon.com', 'AMAZON.COM DEBIT')).toBe(true);
  });

  it('matches when one contains the other', () => {
    expect(merchantsMatch('Starbucks', 'Starbucks Coffee')).toBe(true);
    expect(merchantsMatch('Target', 'Target Store #1234')).toBe(true);
  });

  it('matches short names with Levenshtein distance < 3', () => {
    expect(merchantsMatch('Uber', 'Uber')).toBe(true);
    expect(merchantsMatch('Uber', 'Ubr')).toBe(true);
    expect(merchantsMatch('Starbucks', 'Starbuks')).toBe(true);
  });

  it('returns false for very different merchants', () => {
    expect(merchantsMatch('Walmart', 'Target')).toBe(false);
    expect(merchantsMatch('Amazon', 'Netflix')).toBe(false);
    expect(merchantsMatch('Grocery Store', 'Gas Station')).toBe(false);
  });

  it('handles empty merchant names', () => {
    expect(merchantsMatch('', 'Walmart')).toBe(false);
    expect(merchantsMatch('Walmart', '')).toBe(false);
    expect(merchantsMatch('', '')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// calculateConfidence
// ---------------------------------------------------------------------------

describe('calculateConfidence', () => {
  it('returns high confidence for matching date, amount, and merchant', () => {
    const result = calculateConfidence(
      'Walmart',
      'WALMART SUPERCENTER POS',
      '2024-01-15',
      '2024-01-15',
      5000,
      5000,
    );
    expect(result).toBe('high');
  });

  it('returns high confidence for merchant match within 1 day', () => {
    const result = calculateConfidence(
      'Walmart',
      'WALMART SUPERCENTER POS',
      '2024-01-15',
      '2024-01-16',
      5000,
      5000,
    );
    expect(result).toBe('high');
  });

  it('returns medium confidence when dates differ by more than 1 day', () => {
    const result = calculateConfidence(
      'Walmart',
      'WALMART SUPERCENTER POS',
      '2024-01-15',
      '2024-01-20',
      5000,
      5000,
    );
    expect(result).toBe('medium');
  });

  it('returns low confidence when only merchant matches', () => {
    const result = calculateConfidence(
      'Walmart',
      'WALMART SUPERCENTER POS',
      '2024-01-15',
      '2024-01-20',
      5000,
      6000,
    );
    expect(result).toBe('low');
  });

  it('returns low confidence when amounts are very different', () => {
    const result = calculateConfidence(
      'Walmart',
      'WALMART SUPERCENTER POS',
      '2024-01-15',
      '2024-01-15',
      5000,
      10000,
    );
    expect(result).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2024-01-15', '2024-01-15')).toBe(0);
  });

  it('returns positive number for future date', () => {
    expect(daysBetween('2024-01-15', '2024-01-20')).toBe(5);
  });

  it('returns negative number for past date', () => {
    expect(daysBetween('2024-01-20', '2024-01-15')).toBe(-5);
  });

  it('handles month boundaries', () => {
    expect(daysBetween('2024-01-31', '2024-02-01')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// findDuplicates
// ---------------------------------------------------------------------------

describe('findDuplicates', () => {
  const mockExisting: Transaction[] = [
    {
      id: 'tx-1',
      amount_cents: 5000,
      type: 'expense',
      category: 'Groceries',
      merchant: 'Walmart',
      date: '2024-01-15',
    },
    {
      id: 'tx-2',
      amount_cents: 10000,
      type: 'expense',
      category: 'Utilities',
      merchant: 'Electric Company',
      date: '2024-01-10',
    },
    {
      id: 'tx-3',
      amount_cents: 25000,
      type: 'income',
      category: 'Salary',
      merchant: 'Employer Inc',
      date: '2024-01-01',
    },
  ];

  it('detects high-confidence duplicates', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'WALMART SUPERCENTER POS' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.confidence).toBe('high');
    expect(results[0].duplicate.existingId).toBe('tx-1');
  });

  it('detects medium-confidence duplicates (date differs)', () => {
    const imported = [
      { date: '2024-01-20', amount: '50.00', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.confidence).toBe('medium');
  });

  it('ignores non-matching transactions', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'Target' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(0);
  });

  it('skips savings transactions', () => {
    const savingsTx: Transaction = {
      id: 'tx-savings',
      amount_cents: 5000,
      type: 'savings',
      category: 'Savings',
      merchant: 'Savings Goal',
      date: '2024-01-15',
      goalId: 'goal-1',
    };

    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, [...mockExisting, savingsTx]);
    // Should only match tx-1, not the savings transaction
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.existingId).toBe('tx-1');
  });

  it('reports multiple duplicates for different imported rows', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'Walmart' },
      { date: '2024-01-10', amount: '100.00', merchant: 'Electric Company' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(2);
    expect(results[0].duplicate.existingId).toBe('tx-1');
    expect(results[1].duplicate.existingId).toBe('tx-2');
  });

  it('only reports the first match per imported row', () => {
    // Create existing transactions that would both match
    const multiMatchExisting: Transaction[] = [
      {
        id: 'tx-1',
        amount_cents: 5000,
        type: 'expense',
        category: 'Groceries',
        merchant: 'Walmart',
        date: '2024-01-15',
      },
      {
        id: 'tx-2',
        amount_cents: 5000,
        type: 'expense',
        category: 'Groceries',
        merchant: 'Walmart',
        date: '2024-01-15',
      },
    ];

    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, multiMatchExisting);
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.existingId).toBe('tx-1');
  });

  it('handles empty imported array', () => {
    const results = findDuplicates([], mockExisting);
    expect(results).toHaveLength(0);
  });

  it('handles empty existing array', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.00', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, []);
    expect(results).toHaveLength(0);
  });

  it('handles amounts within 1 cent tolerance', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.01', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.confidence).toBe('high');
  });

  it('skips low-confidence matches (too noisy)', () => {
    const imported = [
      { date: '2024-01-15', amount: '50.05', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, mockExisting);
    // findDuplicates only reports medium+ confidence matches
    expect(results).toHaveLength(0);
  });

  it('returns medium confidence when merchant and amount match but dates differ', () => {
    const imported = [
      { date: '2024-01-20', amount: '50.00', merchant: 'Walmart' },
    ];

    const results = findDuplicates(imported, mockExisting);
    expect(results).toHaveLength(1);
    expect(results[0].duplicate.confidence).toBe('medium');
  });
});
