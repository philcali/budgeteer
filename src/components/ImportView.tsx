import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, Clipboard, ArrowLeft, ArrowRight, CheckCircle, AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'
import { formatMoney } from '../utils/formatting'
import {
  parseCSV,
  autoMapColumns,
  cleanAmount,
  type ColumnMap,
  type ParsedRow,
} from '../utils/csvParser'
import { findDuplicates, type DedupResult } from '../utils/deduplication'
import { downloadCSV } from '../utils/csvExport'
import {
  extractPdfText,
  analyzePdfText,
  parseChaseStatement,
  type PdfAnalysis,
  type ParsedTransaction,
} from '../utils/pdfExtract'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 'upload' | 'map' | 'preview' | 'import'

interface MappedTransaction {
  originalRow: string[]
  date: string
  amount: string
  merchant: string
  category: string
  description: string
  type: 'income' | 'expense'
  isValid: boolean
  error?: string
}

// ---------------------------------------------------------------------------
// Helper: parse raw rows into mapped transactions using a ColumnMap
// ---------------------------------------------------------------------------

function rowsToTransactions(rows: string[][], colMap: ColumnMap): MappedTransaction[] {
  return rows.map((row, _idx) => {
    const dateIdx = colMap.date
    const amountIdx = colMap.amount
    const merchantIdx = colMap.merchant
    const categoryIdx = colMap.category

    const rawDate = dateIdx !== null && dateIdx < row.length ? row[dateIdx] : ''
    const rawAmount = amountIdx !== null && amountIdx < row.length ? row[amountIdx] : ''
    const rawMerchant = merchantIdx !== null && merchantIdx < row.length ? row[merchantIdx] : ''
    const rawCategory = categoryIdx !== null && categoryIdx < row.length ? row[categoryIdx] : ''

    const date = parseDate(rawDate)
    const cleanedAmount = cleanAmount(rawAmount)
    const isValidAmount = !isNaN(parseFloat(cleanedAmount)) && cleanedAmount !== '0'
    const amountNum = parseFloat(cleanedAmount) || 0
    const type = amountNum < 0 ? 'expense' as const : 'income' as const
    const isValid = date !== null && isValidAmount

    return {
      originalRow: row,
      date: date ?? '',
      amount: rawAmount,
      merchant: rawMerchant,
      category: rawCategory,
      description: '',
      type,
      isValid,
      error: date === null ? 'Invalid date' : !isValidAmount ? 'Invalid amount' : undefined,
    }
  })
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
  }
  const euMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (euMatch) {
    const [, day, month, year] = euMatch
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
  }
  return null
}

// ---------------------------------------------------------------------------
// ImportView
// ---------------------------------------------------------------------------

function ImportView() {
  const [step, setStep] = useState<WizardStep>('upload')
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<ParsedRow | null>(null)
  const [colMap, setColMap] = useState<ColumnMap | null>(null)
  const [mapped, setMapped] = useState<MappedTransaction[]>([])
  const [showAllRows, setShowAllRows] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResults, setImportResults] = useState<('success' | 'error' | 'skipped')[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DedupResult[]>([])
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set())
  const [isPdfSource, setIsPdfSource] = useState(false)
  const [isScannedPdf, setIsScannedPdf] = useState(false)
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null)
  const [chaseTransactions, setChaseTransactions] = useState<ParsedTransaction[] | null>(null)
  const [bankHint, setBankHint] = useState('')
  const [detectedBank, setDetectedBank] = useState<'chase' | 'wells-fargo' | 'bofa' | 'capital-one' | 'unknown' | null>(null)
  const [showAllImportRows, setShowAllImportRows] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const addTransaction = useBudgetStore((s) => s.addTransaction)
  const fetchGoals = useBudgetStore((s) => s.fetchGoals)

  // -----------------------------------------------------------------------
  // Upload step handlers
  // -----------------------------------------------------------------------

  const handleFileUpload = useCallback(async (file: File) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setIsPdfSource(true)
      setIsScannedPdf(false)
      setPdfAnalysis(null)
      setChaseTransactions(null)
      setDetectedBank(null)
      setShowAllImportRows(false)

      const text = await extractPdfText(file)
      if (!text || text.trim().length < 50) {
        setIsScannedPdf(true)
        return
      }

      const analysis = analyzePdfText(text, bankHint)
      setPdfAnalysis(analysis)
      setDetectedBank(analysis.bank)

      if (analysis.textType === 'scanned') {
        setIsScannedPdf(true)
        return
      }

      if (analysis.bank === 'chase' && analysis.textType === 'prose') {
        const parsed = parseChaseStatement(text)
        if (parsed.length > 0) {
          setChaseTransactions(parsed)
        }
      }

      setRawText(text)
      return
    }

    setIsPdfSource(false)
    setIsScannedPdf(false)
    setPdfAnalysis(null)
    setChaseTransactions(null)
    setDetectedBank(null)
    setShowAllImportRows(false)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setRawText(text)
    }
    reader.readAsText(file)
  }, [bankHint])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (
        file &&
        (file.type === 'text/csv' ||
          file.type === 'text/tab-separated-values' ||
          file.name.endsWith('.csv') ||
          file.type === 'application/pdf' ||
          file.name.endsWith('.pdf'))
      ) {
        handleFileUpload(file)
      }
    },
    [handleFileUpload],
  )

  const handlePaste = useCallback(() => {
    navigator.clipboard.readText().then((text) => setRawText(text))
  }, [])

  const handleContinueFromUpload = useCallback(() => {
    if (!rawText.trim()) return

    if (chaseTransactions && chaseTransactions.length > 0) {
      setMapped(chaseTransactions)
      setStep('preview')
      return
    }

    const result = parseCSV(rawText)
    if (result.headers.length === 0) return
    setParsed(result)
    setColMap(autoMapColumns(result.headers))
    setStep('map')
  }, [rawText, chaseTransactions])

  // -----------------------------------------------------------------------
  // Map step handlers
  // -----------------------------------------------------------------------

  const handleMapChange = useCallback((field: keyof ColumnMap, value: number | null) => {
    setColMap((prev) => (prev ? { ...prev, [field]: value } : prev))
  }, [])

  const handleContinueFromMap = useCallback(() => {
    if (!parsed || !colMap) return
    const allMapped = rowsToTransactions(parsed.rows, colMap!)
    setMapped(allMapped)
    setStep('preview')
  }, [parsed, colMap])

  // Run when entering preview step — detect duplicates
  const allTransactions = useBudgetStore((s) => s.transactions)
  useEffect(() => {
    if (step === 'preview' && mapped.length > 0) {
      const dedupResults = findDuplicates(
        mapped.map((tx) => ({ date: tx.date, amount: tx.amount, merchant: tx.merchant })),
        allTransactions,
      )
      setDuplicates(dedupResults)
      setSkippedIndices(new Set())
    }
  }, [step, mapped, allTransactions])

  // -----------------------------------------------------------------------
  // Preview step handlers
  // -----------------------------------------------------------------------

  const handleImport = useCallback(async () => {
    setImporting(true)
    setImportProgress(0)
    setImportError(null)
    const results: ('success' | 'error' | 'skipped')[] = []

    try {
      for (let i = 0; i < mapped.length; i++) {
        const tx = mapped[i]
        const progress = ((i + 1) / mapped.length) * 100
        setImportProgress(Math.round(progress))

        if (!tx.isValid || skippedIndices.has(i)) {
          results.push(skippedIndices.has(i) ? 'skipped' as const : 'error')
          continue
        }
        try {
          await addTransaction({
            amount_cents: Math.round(parseFloat(cleanAmount(tx.amount)) * 100),
            type: tx.type,
            category: tx.category || 'Bank Import',
            merchant: tx.merchant || 'Unknown',
            date: tx.date,
            description: tx.description || undefined,
          })
          results.push('success')
        } catch {
          results.push('error')
        }
      }
      setImportResults(results)
      setStep('import')
      await fetchGoals()
    } catch {
      setImportError('Import failed. Please try again.')
    } finally {
      setImporting(false)
    }
  }, [mapped, addTransaction, fetchGoals])

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const totalIncome = mapped.filter((t) => t.type === 'income').reduce((s, t) => s + Math.max(0, parseFloat(cleanAmount(t.amount)) || 0), 0)
  const totalExpense = mapped.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(cleanAmount(t.amount)) || 0), 0)
  const net = totalIncome - totalExpense

  const displayRows = showAllRows ? mapped : mapped.slice(0, 20)

  const stepLabels: Record<WizardStep, string> = {
    upload: 'Upload',
    map: 'Map Columns',
    preview: 'Preview',
    import: 'Results',
  }

  const currentStepIndex = ['upload', 'map', 'preview', 'import'].indexOf(step)

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Import Transactions</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          {['upload', 'map', 'preview', 'import'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={'flex items-center justify-center rounded-full ' + (i < currentStepIndex ? 'bg-emerald-500 text-white' : i === currentStepIndex ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500')}
                style={{ width: 32, height: 32 }}
              >
                {i < currentStepIndex ? <CheckCircle size={18} /> : <span className="text-xs">{i + 1}</span>}
              </div>
              {i < 3 && (
                <div
                  className={'mx-2 ' + (i < currentStepIndex ? 'bg-emerald-400' : 'bg-slate-200')}
                  style={{ width: 40, height: 3 }}
                />
              )}
              <span className={'ml-2 text-sm ' + (i === currentStepIndex ? 'font-semibold' : 'text-slate-500')}>{stepLabels[s as WizardStep]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {step === 'upload' && (
          <div className="text-center">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Import from CSV, TSV, or PDF</h2>
            <div
              className="border-2 border-dashed border-slate-300 rounded-xl p-10 mb-3 cursor-pointer hover:border-blue-400 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} className="text-slate-400 mb-3 mx-auto" />
              <p className="text-slate-500 mb-2">Drag & drop a CSV or PDF file here, or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                }}
              />
            </div>

            {isScannedPdf && (
              <div className="flex items-start gap-3 mb-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-start" role="alert">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="text-amber-800">This PDF appears to be a scanned image</strong> — no text layer was found.
                  <ul className="mb-0 mt-1 text-sm text-amber-700">
                    <li>Most online banking exports are text-based and will work fine.</li>
                    <li>If your bank only provides scanned statements, you'll need to export as CSV instead.</li>
                  </ul>
                </div>
              </div>
            )}

            {isPdfSource && !isScannedPdf && chaseTransactions && chaseTransactions.length > 0 && (
              <div className="flex items-start gap-3 mb-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-start" role="alert">
                <CheckCircle size={18} className="flex-shrink-0 mt-0.5 text-emerald-600" />
                <div>
                  <strong className="text-emerald-800">Chase statement detected</strong> — we've parsed <strong>{chaseTransactions.length} transactions</strong> automatically.
                  <p className="mb-0 mt-1 text-sm text-emerald-700">Click Continue to review and import.</p>
                </div>
              </div>
            )}

            {isPdfSource && !isScannedPdf && chaseTransactions && chaseTransactions.length > 0 && (
              <div className="mb-3 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-semibold text-sm text-slate-500">Parsed Transactions ({chaseTransactions.length})</span>
                  <button
                    className="text-sm text-slate-500 hover:text-slate-700"
                    onClick={() => setShowAllImportRows(!showAllImportRows)}
                  >
                    {showAllImportRows ? 'Show fewer' : 'Show all ' + chaseTransactions.length + ' rows'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 px-3 font-medium text-slate-500" style={{ width: 110 }}>Date</th>
                        <th className="text-left py-2 px-3 font-medium text-slate-500">Merchant / Description</th>
                        <th className="text-right py-2 px-3 font-medium text-slate-500" style={{ width: 80 }}>Amount</th>
                        <th className="text-center py-2 px-3 font-medium text-slate-500" style={{ width: 70 }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllImportRows ? chaseTransactions : chaseTransactions.slice(0, 10)).map((tx, i) => (
                        <tr key={i} className={!tx.isValid ? 'bg-rose-50' : 'border-t border-slate-100'}>
                          <td className="py-2 px-3">{tx.date || '-'}</td>
                          <td className="py-2 px-3">{tx.merchant || '-'}</td>
                          <td className={'py-2 px-3 text-right font-mono ' + (tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600')}>{formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}</td>
                          <td className="text-center py-2 px-3">
                            <span className={'inline-flex px-2 py-0.5 rounded-md text-xs font-medium ' + (tx.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>{tx.type === 'expense' ? '−' : '+'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {isPdfSource && !isScannedPdf && pdfAnalysis && pdfAnalysis.bank === 'unknown' && (
              <div className="flex items-start gap-3 mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-start" role="alert">
                <ShieldAlert size={18} className="flex-shrink-0 mt-0.5 text-blue-600" />
                <div>
                  <strong className="text-blue-800">We couldn't auto-detect your bank.</strong>
                  <p className="mb-1 mt-1 text-sm text-blue-700">Try typing your bank name in the <strong>"Bank / Statement Source"</strong> field above (e.g. <em>Chase Bank</em>, <em>Wells Fargo</em>, <em>Bank of America</em>).</p>
                  <p className="mb-0 text-sm text-blue-700">Or paste the raw text below and we'll parse it using CSV rules.</p>
                </div>
              </div>
            )}

            {isPdfSource && !isScannedPdf && pdfAnalysis && pdfAnalysis.textType === 'csv-like' && (
              <div className="flex justify-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  PDF with structured data — will use CSV parsing
                </span>
              </div>
            )}

            {isPdfSource && !isScannedPdf && (
              <div className="mb-3 text-left">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Bank / Statement Source{' '}
                  <span className="text-slate-400 font-normal">(optional — helps us parse correctly)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Chase Bank, Wells Fargo, Bank of America"
                    value={bankHint}
                    onChange={(e) => setBankHint(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {detectedBank && detectedBank !== 'unknown' && (
                    <span className="inline-flex items-center px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-lg">
                      Detected: {detectedBank === 'chase' ? 'Chase' : detectedBank === 'wells-fargo' ? 'Wells Fargo' : detectedBank === 'bofa' ? 'Bank of America' : 'Capital One'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">Type your bank name to help us use the right parsing rules.</p>
              </div>
            )}

            <div className="flex justify-center gap-2 mb-3">
              <button onClick={handlePaste} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                <Clipboard size={16} />
                Paste from clipboard
              </button>
            </div>
            <div className="mb-3 text-left">
              <label className="block text-sm font-medium text-slate-700 mb-1">Or paste your data below</label>
              <textarea
                rows={6}
                placeholder="Date,Amount,Description\n2024-01-01,100,Groceries\n2024-01-02,-50,Transfer"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleContinueFromUpload}
              disabled={!rawText.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 'map' && parsed && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Map your columns</h2>
            <p className="text-slate-500 text-sm mb-4">We auto-detected your columns. Adjust any mappings below if needed.</p>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date Column</label>
                <select
                  value={colMap?.date ?? -1}
                  onChange={(e) => handleMapChange('date', e.target.value === '-1' ? null : Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={-1}>— skip —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount Column</label>
                <select
                  value={colMap?.amount ?? -1}
                  onChange={(e) => handleMapChange('amount', e.target.value === '-1' ? null : Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={-1}>— skip —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Merchant / Payee Column</label>
                <select
                  value={colMap?.merchant ?? -1}
                  onChange={(e) => handleMapChange('merchant', e.target.value === '-1' ? null : Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={-1}>— skip —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category Column</label>
                <select
                  value={colMap?.category ?? -1}
                  onChange={(e) => handleMapChange('category', e.target.value === '-1' ? null : Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={-1}>— skip —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Preview (first 5 rows)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Date</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Amount</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Merchant</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Category</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => {
                      const tx = rowsToTransactions([row], colMap!)[0]
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-2 px-3">{tx.date || '-'}</td>
                          <td className={'py-2 px-3 ' + (tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600')}>{formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}</td>
                          <td className="py-2 px-3">{tx.merchant || '-'}</td>
                          <td className="py-2 px-3">{tx.category || '-'}</td>
                          <td className="py-2 px-3">
                            <span className={'inline-flex px-2 py-0.5 rounded-md text-xs font-medium ' + (tx.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>{tx.type}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => { setStep('upload'); setIsPdfSource(false); setIsScannedPdf(false); setShowAllImportRows(false); }} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                <ArrowLeft size={16} />
                Back
              </button>
              <button onClick={handleContinueFromMap} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && mapped.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Preview imported transactions</h2>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-medium text-emerald-600">Total Income</p>
                <p className="text-xl font-bold text-emerald-700">{formatMoney(Math.round(totalIncome * 100))}</p>
              </div>
              <div className="text-center p-4 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-xs font-medium text-rose-600">Total Expenses</p>
                <p className="text-xl font-bold text-rose-700">{formatMoney(Math.round(totalExpense * 100))}</p>
              </div>
              <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs font-medium text-slate-600">Net</p>
                <p className={'text-xl font-bold ' + (net >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{formatMoney(Math.round(net * 100))}</p>
              </div>
            </div>

            {duplicates.length > 0 && (
              <div className="flex items-start gap-3 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <ShieldAlert size={18} className="flex-shrink-0 mt-0.5 text-blue-600" />
                <div className="w-full">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm text-blue-800">{duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''} detected</span>
                    <button
                      className="text-sm text-blue-700 hover:text-blue-900 px-3 py-1 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
                      onClick={() => {
                        const allSkipped = new Set(duplicates.map((d) => d.mappedIndex))
                        setSkippedIndices((prev) => (prev.size === allSkipped.size ? new Set() : allSkipped))
                      }}
                    >
                      {skippedIndices.size === duplicates.length ? 'Unskip All' : 'Skip All'}
                    </button>
                  </div>
                  <p className="text-sm text-blue-600">These rows match existing transactions by date, amount, or merchant. Click a row to skip it.</p>
                </div>
              </div>
            )}

            {mapped.some((t) => !t.isValid) && (
              <div className="flex items-center gap-3 mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={18} className="text-amber-600" />
                <span className="text-sm text-amber-800">
                  {mapped.filter((t) => !t.isValid).length} row{mapped.filter((t) => !t.isValid).length !== 1 ? 's' : ''} could not be parsed. Check the error column below.
                </span>
              </div>
            )}

            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Date</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Merchant</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Category</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Type</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Amount</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((tx, i) => {
                    const dup = duplicates.find((d) => d.mappedIndex === i)
                    const isSkipped = skippedIndices.has(i)
                    return (
                      <tr
                        key={i}
                        className={(isSkipped ? 'bg-slate-100' : !tx.isValid ? 'bg-rose-50' : 'border-t border-slate-100') + (dup ? ' cursor-pointer hover:bg-blue-50' : '')}
                        onClick={() => {
                          if (dup) {
                            setSkippedIndices((prev) => {
                              const next = new Set(prev)
                              if (next.has(i)) next.delete(i)
                              else next.add(i)
                              return next
                            })
                          }
                        }}
                        title={dup ? 'Click to ' + (isSkipped ? 'unskip' : 'skip') + ' — matches ' + dup.duplicate.existingMerchant + ' on ' + dup.duplicate.existingDate : undefined}
                      >
                        <td className="py-2 px-3">{tx.date || '-'}</td>
                        <td className="py-2 px-3">{tx.merchant || '-'}</td>
                        <td className="py-2 px-3">{tx.category || '-'}</td>
                        <td className="py-2 px-3">
                          <span className={'inline-flex px-2 py-0.5 rounded-md text-xs font-medium ' + (tx.type === 'expense' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700')}>{tx.type}</span>
                        </td>
                        <td className={'py-2 px-3 ' + (tx.type === 'expense' ? 'text-rose-600' : 'text-emerald-600')}>{formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}</td>
                        <td className="py-2 px-3">
                          {isSkipped ? (
                            <span className="text-slate-400" title="Skipped">⊘</span>
                          ) : dup ? (
                            <span
                              className={'inline-flex px-2 py-0.5 rounded-md text-xs font-medium ' + (dup.duplicate.confidence === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700')}
                              title={'Confidence: ' + dup.duplicate.confidence}
                            >
                              {dup.duplicate.confidence === 'high' ? '⚠' : 'ℹ'} Duplicate
                            </span>
                          ) : tx.isValid ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-rose-600" title={tx.error}>✗</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {mapped.length > 20 && (
              <div className="text-center mb-4">
                <button onClick={() => setShowAllRows(!showAllRows)} className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                  {showAllRows ? 'Show fewer' : 'Show all ' + mapped.length + ' rows'}
                </button>
              </div>
            )}

            {importing && (
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-500">Importing transactions...</span>
                  <span className="text-xs text-slate-500">{importProgress}%</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: String(importProgress) + '%' }} />
                </div>
                <div className="text-center">
                  <Loader2 size={16} className="text-blue-500" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep('map')} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                <ArrowLeft size={16} />
                Back to Mapping
              </button>
              <button onClick={handleImport} disabled={importing} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {importing ? 'Importing...' : 'Import Transactions'}
              </button>
            </div>
          </div>
        )}

        {step === 'import' && (
          <div className="text-center">
            <CheckCircle size={64} className="text-emerald-500 mb-3 mx-auto" />
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Import Complete</h2>

            <div className="mb-4">
              <p className="mb-1">{importResults.filter((r) => r === 'success').length} imported successfully</p>
              {importResults.filter((r) => r === 'skipped').length > 0 && (
                <p className="text-slate-500 mb-0 text-sm">{importResults.filter((r) => r === 'skipped').length} skipped (duplicates)</p>
              )}
              {importResults.filter((r) => r === 'error').length > 0 && (
                <p className="text-rose-600 mb-0 text-sm">{importResults.filter((r) => r === 'error').length} failed</p>
              )}
            </div>

            {importError && (
              <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm" role="alert">
                {importError}
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button onClick={() => { setStep('upload'); setIsPdfSource(false); setIsScannedPdf(false); setShowAllImportRows(false); }} className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">Import Another File</button>
              <button onClick={() => downloadCSV(allTransactions, undefined, 'budgeteer-export.csv')} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Export CSV</button>
              <button onClick={() => (window.location.href = '/transactions')} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">View Transactions</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImportView
