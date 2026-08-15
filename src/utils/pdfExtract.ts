/**
 * PDF Text Extraction & Bank-Specific Parsing
 *
 * Extracts the text layer from PDF files using pdf.js, detects the bank
 * source, and provides bank-specific parsers where available.
 *
 * Supported banks:
 * - Chase (JPMorgan Chase) — automatic transaction extraction
 *
 * For unsupported banks, the raw text is returned for the user to
 * export as CSV from their bank's website.
 */

import * as pdfjs from 'pdfjs-dist'

// Configure the pdf.js worker (runs in a Web Worker for performance)
// Uses Cloudflare CDN — swap for a bundled path in production if needed
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What kind of content the PDF text layer contains */
export type PdfTextType = 'scanned' | 'prose' | 'csv-like'

/** Supported bank identifiers */
export type BankType = 'chase' | 'wells-fargo' | 'bofa' | 'capital-one' | 'unknown'

/** Result of analyzing a PDF file */
export interface PdfAnalysis {
  /** What kind of content the text layer contains */
  textType: PdfTextType
  /** Detected bank source */
  bank: BankType
  /** The extracted text */
  text: string
}

/** A parsed transaction from a bank-specific extractor */
export interface ParsedTransaction {
  date: string          // YYYY-MM-DD
  amount: string        // with sign (e.g. "-205.17" or "12710.79")
  merchant: string
  category: string
  description: string
  type: 'income' | 'expense'
  isValid: boolean
  originalRow: string[]
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Extract all text content from a PDF file.
 *
 * @param file - The PDF file to extract text from
 * @returns The concatenated text from all pages, or null on failure
 */
export async function extractPdfText(file: File): Promise<string | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()

    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const textParts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      // Sort items by position (bottom-to-top, left-to-right) for natural reading order
      const items = textContent.items
        .map((item: any) => ({
          str: item.str ?? '',
          y: item.transform[5],
          x: item.transform[4],
        }))
        .sort((a: any, b: any) => {
          // Group by Y (row), then sort by X (column)
          if (Math.abs(a.y - b.y) > 2) return b.y - a.y
          return a.x - b.x
        })

      // Join items in reading order, adding spaces between items on the same line
      let currentY = items.length > 0 ? items[0].y : 0
      let lineText = ''

      for (const item of items) {
        if (Math.abs(item.y - currentY) > 2) {
          // New line
          if (lineText) textParts.push(lineText.trim())
          lineText = item.str
          currentY = item.y
        } else {
          lineText += ' ' + item.str
        }
      }
      if (lineText) textParts.push(lineText.trim())
    }

    return textParts.join('\n')
  } catch (err) {
    console.error('Failed to extract text from PDF:', err)
    return null
  }
}

/**
 * Check if a PDF file has a text layer (is not a scanned image).
 *
 * @param file - The PDF file to check
 * @returns true if the PDF has extractable text
 */
export async function hasPdfTextLayer(file: File): Promise<boolean> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)
    const textContent = await page.getTextContent()

    // Check if any text item has actual content
    return textContent.items.some(
      (item: any) => (item.str ?? '').trim().length > 0,
    )
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Analyze extracted PDF text to determine text type and bank source.
 */
export function analyzePdfText(text: string, hint?: string): PdfAnalysis {
  // Check for scanned (no meaningful text)
  const hasMeaningfulText = text.trim().length > 50
  if (!hasMeaningfulText) {
    return { textType: 'scanned', bank: 'unknown', text }
  }

  // Check for CSV-like structure (lines with consistent delimiters)
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const commaRatio = lines.filter((l) => (l.match(/,/g) || []).length >= 2).length / lines.length
  const tabRatio = lines.filter((l) => l.includes('\t')).length / lines.length

  const textType = commaRatio > 0.3 || tabRatio > 0.3 ? 'csv-like' : 'prose'

  // Detect bank source (hint takes priority)
  const bank = detectBank(text, hint)

  return { textType, bank, text }
}

/**
 * Detect the bank source from the PDF text.
 *
 * Supports both text-based detection (scanning the PDF content) and
 * user-provided hints (e.g. "Chase Bank").
 */
export function detectBank(text: string, hint?: string): BankType {
  const lower = text.toLowerCase()

  // --- User hint takes priority ---
  if (hint?.trim()) {
    const h = hint.toLowerCase()
    if (/chase|jpmorgan/i.test(h)) return 'chase'
    if (/wells\s*fargo|wellsfargo/i.test(h)) return 'wells-fargo'
    if (/bank\s*of\s*america|bofa/i.test(h)) return 'bofa'
    if (/capital\s*one/i.test(h)) return 'capital-one'
  }

  // --- Text-based detection ---

  // Chase / JPMorgan Chase
  if (
    /jpmorgan\s*chase|chase\.com|chase\s*premier|chase\s*savings|chase\s*checking|chase\s*credit\s*card/i.test(lower)
  ) {
    return 'chase'
  }

  // Wells Fargo
  if (/wells\s*fargo|wellsfargo/i.test(lower)) return 'wells-fargo'

  // Bank of America
  if (/bank\s*of\s*america|bofa/i.test(lower)) return 'bofa'

  // Capital One
  if (/capital\s*one/i.test(lower)) return 'capital-one'

  return 'unknown'
}

// ---------------------------------------------------------------------------
// Chase-specific parser
// ---------------------------------------------------------------------------

/**
 * Parse a Chase bank statement PDF's text into structured transactions.
 *
 * Handles both deposits and withdrawals. Extracts date, description, and
 * amount from the flattened text layout.
 *
 * @param text - The extracted text from the PDF
 * @returns Array of parsed transactions
 */
export function parseChaseStatement(text: string): ParsedTransaction[] {
  const lines = text.split('\n')
  const transactions: ParsedTransaction[] = []

  // Extract statement period for the year
  const periodMatch = text.match(
    /([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})\s+through\s+([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/,
  )

  // Month name → number mapping
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  // Reverse: number → month name (1-indexed)
  const monthNamesRev = [
    null, 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  // Extract start/end dates and determine the statement year
  let startMonthName: string | null = null
  let startDay: number | null = null
  let endMonthName: string | null = null
  let endDay: number | null = null
  let year: number | null = null

  if (periodMatch) {
    startMonthName = periodMatch[1]
    startDay = parseInt(periodMatch[2])
    endMonthName = periodMatch[4]
    endDay = parseInt(periodMatch[5])
    const startMonthNum = monthNames.indexOf(periodMatch[1]) + 1
    const startNum = `${startMonthNum.toString().padStart(2, '0')}/${parseInt(periodMatch[2]).toString().padStart(2, '0')}`
    const endMonthNum = monthNames.indexOf(periodMatch[4]) + 1
    const endNum = `${endMonthNum.toString().padStart(2, '0')}/${parseInt(periodMatch[5]).toString().padStart(2, '0')}`
    const startYear = parseInt(periodMatch[3])
    const endYear = parseInt(periodMatch[6])
    // For cross-year statements (end < start), use the end year
    year = endNum < startNum ? endYear : startYear
  }

  // Fallback: Chase credit card statements use "06/26/26 - 07/25/26" format (MM/DD/YY - MM/DD/YY)
  // pdf.js may insert spaces between characters, so we use \d\s*\d to match "0 6" or "06"
  // Also detect the period line so we can skip it during transaction parsing
  let periodLinePattern: string | null = null
  if (!year) {
    const d = (s: string) => parseInt(s.replace(/\s/g, ''))

    // Strategy 1: Search near "Opening/Closing Date" label
    let context: string | null = null
    const openingLabelIdx = text.search(/Opening\/?Closing\s*Date/i)
    if (openingLabelIdx !== -1) {
      context = text.substring(openingLabelIdx, openingLabelIdx + 80)
    }

    // Strategy 2: Search near "Statement Period" or "Billing Period" label
    if (!context) {
      const stmtIdx = text.search(/Statement\s+Period|Billing\s+Period/i)
      if (stmtIdx !== -1) {
        context = text.substring(stmtIdx, stmtIdx + 80)
      }
    }

    // Strategy 3: Check each line for the date range pattern (period lines have two dates)
    if (!context) {
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.match(/\d{2}\/\d{2}\/\d{2}\s*[-–—]\s*\d{2}\/\d{2}\/\d{2}/)) {
          context = line
          break
        }
      }
    }

    if (context) {
      // Try MM/DD/YYYY - MM/DD/YYYY (4-digit year on second date)
      let m = context.match(/(\d\s*\d)\/(\d\s*\d)\/(\d\s*\d)\s*[-–—]\s*(\d\s*\d)\/(\d\s*\d)\/(\d{4})/)
      if (m) {
        const startMonthNum = d(m[1])
        const startDayNum = d(m[2])
        const startNum = `${startMonthNum.toString().padStart(2, '0')}/${startDayNum.toString().padStart(2, '0')}`
        const endMonthNum = d(m[4])
        const endDayNum = d(m[5])
        const endNum = `${endMonthNum.toString().padStart(2, '0')}/${endDayNum.toString().padStart(2, '0')}`
        const isCrossYear = endNum < startNum

        year = isCrossYear ? d(m[6]) : d(m[3])
        startMonthName = monthNamesRev[startMonthNum]
        startDay = startDayNum
        endMonthName = monthNamesRev[endMonthNum]
        endDay = endDayNum
        periodLinePattern = m[0]
      }

      // Try MM/DD/YY - MM/DD/YY (two-digit years on both)
      if (!year) {
        m = context.match(/(\d\s*\d)\/(\d\s*\d)\/(\d\s*\d)\s*[-–—]\s*(\d\s*\d)\/(\d\s*\d)\/(\d\s*\d)/)
        if (m) {
          const startMonthNum = d(m[1])
          const startDayNum = d(m[2])
          const startYY = d(m[3])
          const startNum = `${startMonthNum.toString().padStart(2, '0')}/${startDayNum.toString().padStart(2, '0')}`

          const endMonthNum = d(m[4])
          const endDayNum = d(m[5])
          const endYY = d(m[6])
          const endNum = `${endMonthNum.toString().padStart(2, '0')}/${endDayNum.toString().padStart(2, '0')}`
          const isCrossYear = endNum < startNum

          year = isCrossYear ? (endYY >= 50 ? 1900 + endYY : 2000 + endYY) : (startYY >= 50 ? 1900 + startYY : 2000 + startYY)
          startMonthName = monthNamesRev[startMonthNum]
          startDay = startDayNum
          endMonthName = monthNamesRev[endMonthNum]
          endDay = endDayNum
          periodLinePattern = m[0]
        }
      }

      // Try MM/DD/YY - MM/DD/YYYY (mixed)
      if (!year) {
        m = context.match(/(\d\s*\d)\/(\d\s*\d)\/(\d\s*\d)\s*[-–—]\s*(\d\s*\d)\/(\d\s*\d)\/(\d{4})/)
        if (m) {
          const endMonthNum = d(m[4])
          const endDayNum = d(m[5])
          const endNum = `${endMonthNum.toString().padStart(2, '0')}/${endDayNum.toString().padStart(2, '0')}`
          const startMonthNum = d(m[1])
          const startDayNum = d(m[2])
          const startNum = `${startMonthNum.toString().padStart(2, '0')}/${startDayNum.toString().padStart(2, '0')}`
          const isCrossYear = endNum < startNum

          year = isCrossYear ? d(m[6]) : (d(m[3]) >= 50 ? 1900 + d(m[3]) : 2000 + d(m[3]))
          startMonthName = monthNamesRev[startMonthNum]
          startDay = startDayNum
          endMonthName = monthNamesRev[endMonthNum]
          endDay = endDayNum
          periodLinePattern = m[0]
        }
      }
    }
  }

  // Track current section for type inference
  let currentSection: 'deposit' | 'withdrawal' = 'withdrawal'

  for (const line of lines) {
    // Skip the period line (e.g. "06/26/26 - 07/25/26")
    if (periodLinePattern && line.includes(periodLinePattern)) continue

    // Track section headers for type inference
    if (/DEPOSITS\s*AND\s*ADDITIONS/i.test(line)) {
      currentSection = 'deposit'
    }
    if (/ELECTRONIC\s*WITHDRAWALS/i.test(line)) {
      currentSection = 'withdrawal'
    }

    // Match transaction lines: MM/DD description amount
    // The amount is always at the end of the line.
    // Strategy: use $ as anchor when present, otherwise split on known ID patterns.
    const dateMatch = line.match(/^(\d{2}\/\d{2})\s*(.+)$/)
    if (!dateMatch) continue

    const dateStr = dateMatch[1]
    const rest = dateMatch[2]
    const [month, day] = dateStr.split('/')

    // Convert MM/DD to YYYY-MM-DD using statement period year
    let date: string
    if (year && startMonthName && startDay) {
      const startMonthNum = monthNames.indexOf(startMonthName) + 1
      const dateNum = `${parseInt(month).toString().padStart(2, '0')}/${parseInt(day).toString().padStart(2, '0')}`
      const startNum = `${startMonthNum.toString().padStart(2, '0')}/${startDay.toString().padStart(2, '0')}`

      let effectiveYear = year

      // Check if statement spans across years (end date < start date)
      if (endMonthName && endDay) {
        const endMonthNum = monthNames.indexOf(endMonthName) + 1
        const endNum = `${endMonthNum.toString().padStart(2, '0')}/${endDay.toString().padStart(2, '0')}`

        if (endNum < startNum) {
          // Cross-year statement (e.g., Dec 15 → Jan 14): year is the END year (statement year)
          // Dates before the end date are in the statement year
          // Dates on or after the end date are in the previous year
          if (dateNum < endNum) {
            effectiveYear = year
          } else {
            effectiveYear = year - 1
          }
        } else {
          // Normal statement: if date is before start, it's in the previous year
          if (dateNum < startNum) {
            effectiveYear = year - 1
          }
        }
      } else if (dateNum < startNum) {
        // No end date info — fall back to original heuristic
        effectiveYear = year - 1
      }

      date = `${effectiveYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    } else {
      // No period info — just use the date as-is (MM/DD)
      date = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Extract description and amount from the rest of the line
    let cleanDesc = rest
    let rawAmount = ''

    // Strategy 1: $ is the anchor — split on it
    const dollarIdx = rest.lastIndexOf('$')
    if (dollarIdx !== -1) {
      cleanDesc = rest.slice(0, dollarIdx)
      rawAmount = rest.slice(dollarIdx + 1)
    } else {
      // Strategy 2: look for PPD ID: / Web ID: / CCD ID: pattern
      // Chase transaction IDs are always 10 digits, and run into the amount
      // without a separator when there's no $ prefix.
      const idMatch = rest.match(/(PPD|Web|CCD)\s*ID:\s*(\d{10})([\d,]+(?:\.\d{2})?)$/)
      if (idMatch) {
        // Find the label ("PPD ID:", "Web ID:", etc.) to trim the description
        const labelPattern = new RegExp(`${idMatch[1]}\\s*ID:\\s*`)
        const labelIdx = rest.search(labelPattern)
        cleanDesc = rest.slice(0, labelIdx).replace(/\s*$/, '')
        rawAmount = idMatch[3]
      } else {
        // Strategy 3: amount is at the very end, no ID pattern
        // Match the last number with 2 decimal places
        const amountOnlyMatch = rest.match(/([\d,]+(?:\.\d{2})?)\s*$/)
        if (amountOnlyMatch) {
          cleanDesc = rest.slice(0, rest.length - amountOnlyMatch[1].length)
          rawAmount = amountOnlyMatch[1]
        } else {
          continue
        }
      }
    }

    // Clean description: remove ID patterns and extra whitespace
    cleanDesc = cleanDesc
      .replace(/\s*(PPD|Web|CCD)\s*ID:\s*\d+\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Clean amount: remove commas
    const cleanAmount = rawAmount.replace(/,/g, '')
    const amountNum = parseFloat(cleanAmount)

    // Determine sign based on section
    const isPositive = currentSection === 'deposit' && amountNum > 0
    const signedAmount = isPositive ? cleanAmount : `-${cleanAmount}`

    transactions.push({
      date,
      amount: signedAmount,
      merchant: cleanDesc || 'Unknown',
      category: '',
      description: cleanDesc || '',
      type: isPositive ? 'income' : 'expense',
      isValid: true,
      originalRow: [dateStr, cleanDesc, rawAmount],
    })
  }

  return transactions
}

