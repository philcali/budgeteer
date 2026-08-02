import { describe, it, expect } from 'vitest';
import {
  transactionsToCSV,
  csvToTransactions,
} from './csvExport';
import type { Transaction } from '../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'test-id',
    date: '2024-01-15',
    amount_cents: 15000,
    type: 'income',
    category: 'Paycheck',
    merchant: 'Acme Corp',
    ...overrides,
  };
}

const SAMPLE_TRANSACTIONS: Transaction[] = [
  makeTx({ id: '1', date: '2024-01-15', amount_cents: 15000, type: 'income', category: 'Paycheck', merchant: 'Acme Corp' }),
  makeTx({ id: '2', date: '2024-01-16', amount_cents: -4230, type: 'expense', category: 'Groceries', merchant: 'Whole Foods' }),
  makeTx({ id: '3', date: '2024-01-17', amount_cents: -1200, type: 'expense', category: 'Coffee', merchant: 'Starbucks' }),
  makeTx({ id: '4', date: '2024-02-01', amount_cents: 15000, type: 'income', category: 'Paycheck', merchant: 'Acme Corp' }),
  makeTx({ id: '5', date: '2024-02-02', amount_cents: -50000, type: 'expense', category: 'Rent', merchant: 'Landlord LLC' }),
];

// ---------------------------------------------------------------------------
// transactionsToCSV
// ---------------------------------------------------------------------------

describe('transactionsToCSV', () => {
  it('exports all transactions with correct headers', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Amount,Merchant,Category,Type');
    expect(lines.length).toBe(SAMPLE_TRANSACTIONS.length + 1);
  });

  it('formats amounts correctly — income positive, expense negative', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS);
    expect(csv).toContain('150.00');
    expect(csv).toContain('-42.30');
    expect(csv).toContain('-12.00');
  });

  it('uses ISO date format', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS);
    expect(csv).toContain('2024-01-15');
    expect(csv).toContain('2024-02-01');
  });

  it('filters by month', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS, { month: '2024-01' });
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(4); // header + 3 january rows
  });

  it('filters by type', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS, { type: 'income' });
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(3); // header + 2 income rows
  });

  it('filters by category', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS, { category: 'Paycheck' });
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(3); // header + 2 paycheck rows
  });

  it('combines filters', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS, { month: '2024-01', type: 'expense' });
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(3); // header + 2 january expense rows
  });

  it('escapes fields containing commas', () => {
    const tx = makeTx({ merchant: 'Store, Inc.', category: 'A, B, C' });
    const csv = transactionsToCSV([tx]);
    expect(csv).toContain('"Store, Inc."');
    expect(csv).toContain('"A, B, C"');
  });

  it('escapes fields containing quotes', () => {
    const tx = makeTx({ merchant: 'He said "hello"' });
    const csv = transactionsToCSV([tx]);
    expect(csv).toContain('"He said ""hello"""');
  });

  it('returns empty CSV (headers only) for empty input', () => {
    const csv = transactionsToCSV([]);
    expect(csv).toBe('Date,Amount,Merchant,Category,Type');
  });

  it('zero amount formats as 0.00', () => {
    const tx = makeTx({ amount_cents: 0 });
    const csv = transactionsToCSV([tx]);
    expect(csv).toContain('0.00');
  });

  it('round-trips via csvToTransactions', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS);
    const parsed = csvToTransactions(csv);

    expect(parsed.length).toBe(SAMPLE_TRANSACTIONS.length);

    for (let i = 0; i < SAMPLE_TRANSACTIONS.length; i++) {
      const original = SAMPLE_TRANSACTIONS[i];
      const restored = parsed[i];

      expect(restored.date).toBe(original.date);
      expect(restored.amount_cents).toBe(original.amount_cents);
      expect(restored.merchant).toBe(original.merchant);
      expect(restored.category).toBe(original.category);
      expect(restored.type).toBe(original.type);
    }
  });

  it('round-trips with filters applied then removed', () => {
    const janCsv = transactionsToCSV(SAMPLE_TRANSACTIONS, { month: '2024-01' });
    const janParsed = csvToTransactions(janCsv);
    expect(janParsed.length).toBe(3);

    // All data from january is preserved
    for (const tx of janParsed) {
      expect(tx.date.startsWith('2024-01')).toBe(true);
    }
  });

  it('round-trips with special characters in merchant', () => {
    const tx = makeTx({ merchant: "McDonald's #1234" });
    const csv = transactionsToCSV([tx]);
    const parsed = csvToTransactions(csv);
    expect(parsed[0].merchant).toBe("McDonald's #1234");
  });

  it('round-trips with cents precision', () => {
    const tx = makeTx({ amount_cents: 12345 });
    const csv = transactionsToCSV([tx]);
    const parsed = csvToTransactions(csv);
    expect(parsed[0].amount_cents).toBe(12345);
  });
});

// ---------------------------------------------------------------------------
// csvToTransactions
// ---------------------------------------------------------------------------

describe('csvToTransactions', () => {
  it('parses a simple CSV', () => {
    const csv = `Date,Amount,Merchant,Category,Type
2024-01-15,150.00,Target,Groceries,income
2024-01-16,-42.30,Starbucks,Coffee,expense`;
    const result = csvToTransactions(csv);
    expect(result.length).toBe(2);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].amount_cents).toBe(15000);
    expect(result[0].type).toBe('income');
    expect(result[1].amount_cents).toBe(-4230);
    expect(result[1].type).toBe('expense');
  });

  it('handles quoted fields', () => {
    const csv = `Date,Amount,Merchant,Category,Type
2024-01-15,100.00,"Store, Inc.",Shopping,income`;
    const result = csvToTransactions(csv);
    expect(result[0].merchant).toBe('Store, Inc.');
  });

  it('handles escaped quotes in fields', () => {
    const csv = `Date,Amount,Merchant,Category,Type
2024-01-15,100.00,"He said ""hello""",Info,income`;
    const result = csvToTransactions(csv);
    expect(result[0].merchant).toBe('He said "hello"');
  });

  it('skips empty lines', () => {
    const csv = `Date,Amount,Merchant,Category,Type

2024-01-15,100.00,Target,Groceries,income

`;
    const result = csvToTransactions(csv);
    expect(result.length).toBe(1);
  });

  it('returns empty array for CSV with no data rows', () => {
    expect(csvToTransactions('Date,Amount,Merchant,Category,Type')).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(csvToTransactions('')).toEqual([]);
  });

  it('defaults type to expense when missing', () => {
    const csv = `Date,Amount,Merchant,Category,Type
2024-01-15,100.00,Target,Groceries,`;
    const result = csvToTransactions(csv);
    expect(result[0].type).toBe('expense');
  });

  it('round-trips the full sample dataset', () => {
    const csv = transactionsToCSV(SAMPLE_TRANSACTIONS);
    const parsed = csvToTransactions(csv);

    expect(parsed.length).toBe(SAMPLE_TRANSACTIONS.length);

    for (let i = 0; i < SAMPLE_TRANSACTIONS.length; i++) {
      expect(parsed[i].date).toBe(SAMPLE_TRANSACTIONS[i].date);
      expect(parsed[i].amount_cents).toBe(SAMPLE_TRANSACTIONS[i].amount_cents);
      expect(parsed[i].merchant).toBe(SAMPLE_TRANSACTIONS[i].merchant);
      expect(parsed[i].category).toBe(SAMPLE_TRANSACTIONS[i].category);
      expect(parsed[i].type).toBe(SAMPLE_TRANSACTIONS[i].type);
    }
  });
});
