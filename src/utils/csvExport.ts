/**
 * CSV Export Utilities
 *
 * Exports transactions to CSV in a format compatible with the CSV parser
 * (roundtrip-safe).
 */

import type { Transaction } from '../types'
import { parseCSV } from './csvParser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportOptions {
  /** Filter by month (YYYY-MM). If omitted, exports all transactions. */
  month?: string
  /** Filter by type. If omitted, exports all types. */
  type?: Transaction['type']
  /** Filter by category. If omitted, exports all categories. */
  category?: string
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Escape a field for CSV output.
 * Wraps in quotes if it contains a comma, quote, or newline.
 * Doubles any internal quotes.
 */
function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Format an amount for CSV output.
 * Expenses get a negative sign, income is positive.
 * Always uses a dot as decimal separator.
 */
function formatAmount(cents: number, type: Transaction['type']): string {
  const dollars = cents / 100
  const formatted = type === 'expense' && dollars < 0
    ? `-${Math.abs(dollars).toFixed(2)}`
    : dollars.toFixed(2)
  return formatted
}

/**
 * Convert transactions to a CSV string.
 *
 * Output format:
 *   Date,Amount,Merchant,Category,Type
 *   2024-01-15,150.50,Target,Groceries,income
 *   2024-01-16,-42.30,Starbucks,Food,expense
 *
 * This format is compatible with parseCSV / cleanAmount for roundtrip.
 */
export function transactionsToCSV(transactions: Transaction[], options?: ExportOptions): string {
  const headers = ['Date', 'Amount', 'Merchant', 'Category', 'Type']

  let filtered = transactions

  if (options?.month) {
    filtered = filtered.filter((t) => t.date.startsWith(options.month!))
  }
  if (options?.type) {
    filtered = filtered.filter((t) => t.type === options.type)
  }
  if (options?.category) {
    filtered = filtered.filter((t) => t.category === options.category)
  }

  const rows = filtered.map((t) => {
    const fields = [
      escapeField(t.date),
      escapeField(formatAmount(t.amount_cents, t.type)),
      escapeField(t.merchant),
      escapeField(t.category),
      escapeField(t.type),
    ]
    return fields.join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

/**
 * Download a CSV file of transactions.
 */
export function downloadCSV(transactions: Transaction[], options?: ExportOptions, filename?: string): void {
  const csv = transactionsToCSV(transactions, options)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename ?? 'transactions.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Import (roundtrip helper)
// ---------------------------------------------------------------------------

/**
 * Parse a CSV string back into Transaction objects.
 * This is the inverse of transactionsToCSV, enabling roundtrip testing.
 */
export function csvToTransactions(csv: string): Transaction[] {
  const parsed = parseCSV(csv)
  if (parsed.headers.length === 0 || parsed.rows.length === 0) return []

  // Find column indices from header
  const dateIdx = parsed.headers.findIndex((h) => h.toLowerCase() === 'date')
  const amountIdx = parsed.headers.findIndex((h) => h.toLowerCase() === 'amount')
  const merchantIdx = parsed.headers.findIndex((h) => h.toLowerCase() === 'merchant')
  const categoryIdx = parsed.headers.findIndex((h) => h.toLowerCase() === 'category')
  const typeIdx = parsed.headers.findIndex((h) => h.toLowerCase() === 'type')

  return parsed.rows.map((row) => {
    const date = dateIdx !== -1 ? row[dateIdx] ?? '' : ''
    const rawAmount = amountIdx !== -1 ? row[amountIdx] ?? '0' : '0'
    const merchant = merchantIdx !== -1 ? row[merchantIdx] ?? '' : ''
    const category = categoryIdx !== -1 ? row[categoryIdx] ?? '' : ''
    const typeStr = typeIdx !== -1 ? row[typeIdx] ?? '' : ''

    // Clean amount: strip leading minus for absolute value calc, then reapply sign
    const isNegative = rawAmount.startsWith('-')
    const absAmount = rawAmount.replace(/^-/, '')
    const amount_cents = Math.round(parseFloat(absAmount) * 100) * (isNegative ? -1 : 1)

    return {
      id: '', // roundtrip doesn't preserve IDs
      date,
      amount_cents: isNaN(amount_cents) ? 0 : amount_cents,
      merchant,
      category,
      type: typeStr && typeStr !== '' ? (typeStr as Transaction['type']) : 'expense',
    }
  })
}
