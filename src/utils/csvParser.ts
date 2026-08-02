/**
 * CSV Parsing Utilities
 *
 * Handles parsing, delimiter detection, and currency cleanup
 * for bank statement imports.
 */

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

export type Delimiter = ',' | '\t' | ';'

function detectDelimiter(text: string): Delimiter {
  // Count occurrences of each candidate in the first 10 lines
  const candidates: Delimiter[] = [',', '\t', ';']
  const firstLines = text.split('\n').slice(0, 10).join('\n')

  let best: Delimiter = ','
  let bestScore = 0

  for (const d of candidates) {
    // Count occurrences outside of quoted fields
    const count = countOutsideQuotes(firstLines, d)
    if (count > bestScore) {
      bestScore = count
      best = d
    }
  }

  return best
}

function countOutsideQuotes(text: string, delimiter: Delimiter): number {
  let count = 0
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && ch === delimiter) {
      count++
    }
  }

  return count
}

// ---------------------------------------------------------------------------
// CSV row parser (handles quoted fields, embedded commas, escaped quotes)
// ---------------------------------------------------------------------------

function parseRow(line: string, delimiter: Delimiter): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip next quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }

  fields.push(current.trim())
  return fields
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ParsedRow {
  headers: string[]
  rows: string[][]
}

export function parseCSV(text: string): ParsedRow {
  if (!text.trim()) {
    return { headers: [], rows: [] }
  }

  const delimiter = detectDelimiter(text)
  const lines = text.split('\n').map((line) => line.trimEnd()).filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { headers: [], rows: [] }
  }

  const headers = parseRow(lines[0], delimiter)
  const rows = lines.slice(1).map((line) => parseRow(line, delimiter))

  return { headers, rows }
}

// ---------------------------------------------------------------------------
// Currency / amount cleanup
// ---------------------------------------------------------------------------

/**
 * Strip currency symbols, commas, and whitespace from a raw amount string.
 * Handles formats like:
 *   "$1,234.56"   → "1234.56"
 *   "€1.234,56"   → "1234.56" (European: dot as thousands, comma as decimal)
 *   "(123.45)"    → "-123.45" (parentheses = negative)
 *   "1.234,56 €"  → "1234.56"
 */
export function cleanAmount(raw: string): string {
  let s = raw.trim()

  if (s === '' || s === '-' || s === '0') return '0'

  // Parentheses indicate negative
  const isNegative = /^\s*\(.+\)\s*$/.test(s)
  if (isNegative) {
    s = s.replace(/[()]/g, '').trim()
  }

  // Detect European format: last comma is decimal separator, dots are thousands
  // Heuristic: only European if there's at least one dot AND the last comma
  // comes after the last dot. A comma with no dot is US thousands formatting.
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastDot !== -1 && lastComma > lastDot) {
    // European format — remove dots (thousands), replace last comma with dot (decimal)
    s = s.replace(/\./g, '')
    s = s.replace(',', '.')
  } else {
    // Standard US format — remove commas (thousands separators)
    s = s.replace(/,/g, '')
  }

  // Remove any remaining currency symbols and whitespace
  s = s.replace(/[^\d.\-+]/g, '')

  return isNegative && !s.startsWith('-') ? `-${s}` : s
}

/**
 * Guess whether a column header looks like a date field.
 */
export function isDateColumn(header: string): boolean {
  const h = header.toLowerCase().trim()
  return (
    h === 'date' ||
    h.includes('date') ||
    h.includes('posting') ||
    h.includes('transaction') ||
    h.includes('posted')
  )
}

/**
 * Guess whether a column header looks like an amount field.
 */
export function isAmountColumn(header: string): boolean {
  const h = header.toLowerCase().trim()
  return (
    h.includes('amount') ||
    h.includes('debit') ||
    h.includes('credit') ||
    h.includes('withdrawal') ||
    h.includes('deposit') ||
    h.includes('total') ||
    h.includes('balance')
  )
}

/**
 * Guess whether a column header looks like a merchant / payee field.
 */
export function isMerchantColumn(header: string): boolean {
  const h = header.toLowerCase().trim()
  return (
    h.includes('payee') ||
    h.includes('merchant') ||
    h.includes('vendor') ||
    h.includes('description') ||
    h.includes('details') ||
    h.includes('memo') ||
    h.includes('narrative') ||
    h.includes('payee') ||
    h.includes('counterpart')
  )
}

/**
 * Guess whether a column header looks like a category field.
 */
export function isCategoryColumn(header: string): boolean {
  const h = header.toLowerCase().trim()
  return (
    h === 'category' ||
    h.includes('category') ||
    h.includes('type') ||
    h.includes('class') ||
    h.includes('classification') ||
    h.includes('tags')
  )
}

// ---------------------------------------------------------------------------
// Column auto-mapping
// ---------------------------------------------------------------------------

export interface ColumnMap {
  date: number | null
  amount: number | null
  merchant: number | null
  category: number | null
  description: number | null
}

/**
 * Given parsed headers, auto-detect which index maps to which field.
 * Returns a ColumnMap with indices (0-based) or null if not detected.
 */
export function autoMapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {
    date: null,
    amount: null,
    merchant: null,
    category: null,
    description: null,
  }

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]

    if (map.date === null && isDateColumn(h)) {
      map.date = i
    }
    if (map.amount === null && isAmountColumn(h)) {
      map.amount = i
    }
    if (map.merchant === null && isMerchantColumn(h)) {
      map.merchant = i
    }
    if (map.category === null && isCategoryColumn(h)) {
      map.category = i
    }
    // Description often overlaps with merchant or is labeled "memo"/"details"
    // If we haven't found a description column, fall back to the first
    // unmatched text column during the preview step.
  }

  return map
}
