/**
 * Deduplication utilities for bulk import.
 *
 * Compares imported transactions against existing ones using fuzzy matching
 * on date, amount, and merchant name.
 */

import { Transaction } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateCandidate {
  existingId: string
  existingMerchant: string
  existingDate: string
  existingAmount: number
  confidence: 'high' | 'medium' | 'low'
}

export interface DedupResult {
  /** Index in the original mapped array */
  mappedIndex: number
  /** The existing transaction that matches */
  duplicate: DuplicateCandidate
}

// ---------------------------------------------------------------------------
// Fuzzy merchant matching
// ---------------------------------------------------------------------------

/**
 * Normalize a merchant name for comparison.
 * - lowercase
 * - strip common suffixes (POS, DEBIT, CREDIT, TRANSFER, etc.)
 * - collapse whitespace
 * - strip punctuation
 */
export function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pos|debit|credit|transfer|payment|transaction)\b/g, '')
    .replace(/[^a-z0-9\s.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Check if two merchant names are similar enough to be the same.
 * Uses a combination of:
 * - Exact match on normalized names
 * - One contains the other (with normalized names)
 * - Levenshtein distance < 3 for short names
 */
export function merchantsMatch(a: string, b: string): boolean {
  const na = normalizeMerchant(a)
  const nb = normalizeMerchant(b)

  if (na.length === 0 || nb.length === 0) return false
  if (na === nb) return true

  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true

  // Short names: use Levenshtein distance
  const minLen = Math.min(na.length, nb.length)
  if (minLen <= 10) {
    const distance = levenshteinDistance(na, nb)
    return distance < 3
  }

  return false
}

/**
 * Simple Levenshtein distance implementation.
 * Only used for short strings (≤10 chars) for performance.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  if (m === 0) return n
  if (n === 0) return m

  const matrix: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return matrix[m][n]
}

// ---------------------------------------------------------------------------
// Confidence scoring
// ---------------------------------------------------------------------------

/**
 * Determine the confidence level of a potential duplicate match.
 *
 * Confidence criteria:
 * - **high**: same normalized merchant + same date + same amount
 * - **medium**: same normalized merchant + same amount (date within 1 day)
 * - **low**: same normalized merchant only, or same date + amount (merchant differs)
 */
export function calculateConfidence(
  existingMerchant: string,
  importedMerchant: string,
  existingDate: string,
  importedDate: string,
  existingAmount: number,
  importedAmount: number,
): 'high' | 'medium' | 'low' {
  const merchantMatch = merchantsMatch(existingMerchant, importedMerchant)
  const amountMatch = Math.abs(existingAmount - importedAmount) <= 1 // within 1 cent
  const dateDiff = Math.abs(daysBetween(existingDate, importedDate))

  if (merchantMatch && amountMatch && dateDiff <= 1) return 'high'
  if (merchantMatch && amountMatch) return 'medium'
  if (merchantMatch || amountMatch) return 'low'

  return 'low'
}

/**
 * Calculate the number of days between two ISO date strings.
 */
export function daysBetween(a: string, b: string): number {
  const dateA = new Date(a + 'T00:00:00')
  const dateB = new Date(b + 'T00:00:00')
  const diffMs = dateB.getTime() - dateA.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check imported transactions against existing ones for duplicates.
 *
 * @param imported - The mapped transactions from the import wizard
 * @param existing - The existing transactions in the store
 * @returns Array of dedup results showing which imported rows match existing ones
 */
export function findDuplicates(
  imported: { date: string; amount: string; merchant: string; amount_cents?: number }[],
  existing: Transaction[],
): DedupResult[] {
  const results: DedupResult[] = []

  for (let i = 0; i < imported.length; i++) {
    const imp = imported[i]
    const amountCents = Math.round(parseFloat(cleanAmount(imp.amount)) * 100)

    for (const existingTx of existing) {
      if (existingTx.type === 'savings') continue // skip savings transactions

      const confidence = calculateConfidence(
        existingTx.merchant,
        imp.merchant,
        existingTx.date,
        imp.date,
        existingTx.amount_cents,
        amountCents,
      )

      if (confidence !== 'low') {
        results.push({
          mappedIndex: i,
          duplicate: {
            existingId: existingTx.id,
            existingMerchant: existingTx.merchant,
            existingDate: existingTx.date,
            existingAmount: existingTx.amount_cents,
            confidence,
          },
        })
        break // only report the first match per imported row
      }
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Re-export cleanAmount since this module uses it
// ---------------------------------------------------------------------------

import { cleanAmount } from './csvParser'
