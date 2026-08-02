import { useState, useCallback, useRef, useEffect } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Table from 'react-bootstrap/Table'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import ProgressBar from 'react-bootstrap/ProgressBar'
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

    // Try to parse the date — accept YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY
    const date = parseDate(rawDate)

    // Clean the amount
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

  // Try MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (usMatch) {
    const [, month, day, year] = usMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try DD/MM/YYYY
  const euMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (euMatch) {
    const [, day, month, year] = euMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
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
        // No meaningful text — likely a scanned PDF
        setIsScannedPdf(true)
        return
      }

      // Analyze the text (pass bank hint)
      const analysis = analyzePdfText(text, bankHint)
      setPdfAnalysis(analysis)
      setDetectedBank(analysis.bank)

      if (analysis.textType === 'scanned') {
        setIsScannedPdf(true)
        return
      }

      // Bank-specific parsing — use hint to drive which parser
      if (analysis.bank === 'chase' && analysis.textType === 'prose') {
        const parsed = parseChaseStatement(text)
        if (parsed.length > 0) {
          setChaseTransactions(parsed)
        }
      }

      setRawText(text)
      return
    }

    // CSV / TSV
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

    // Chase parsed transactions — skip straight to preview
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
      <Row className="align-items-center mb-4">
        <Col xs={6}>
          <h2>Import Transactions</h2>
        </Col>
      </Row>

      {/* Step indicator */}
      <div className="mb-4">
        <div className="d-flex align-items-center gap-2">
          {['upload', 'map', 'preview', 'import'].map((s, i) => (
            <div key={s} className="d-flex align-items-center">
              <div
                className={`d-flex align-items-center justify-content-center rounded-circle ${
                  i < currentStepIndex
                    ? 'bg-success text-white'
                    : i === currentStepIndex
                    ? 'bg-primary text-white'
                    : 'bg-secondary text-white'
                }`}
                style={{ width: 32, height: 32 }}
              >
                {i < currentStepIndex ? <CheckCircle size={18} /> : <span className="small">{i + 1}</span>}
              </div>
              {i < 3 && (
                <div
                  className={`mx-2 ${i < currentStepIndex ? 'bg-success' : 'bg-secondary'}`}
                  style={{ width: 40, height: 3 }}
                />
              )}
              <span className={`ms-2 small ${i === currentStepIndex ? 'fw-bold' : ''}`}>{stepLabels[s as WizardStep]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <Card>
        <Card.Body>
          {step === 'upload' && (
            <div className="text-center">
              <Card.Title className="mb-3">Import from CSV, TSV, or PDF</Card.Title>
              <div
                className="border border-2 border-dashed rounded p-5 mb-3"
                style={{ cursor: 'pointer' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={48} className="text-muted mb-3" />
                <p className="text-muted mb-2">Drag & drop a CSV or PDF file here, or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.pdf,text/csv,application/pdf"
                  className="d-none"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                  }}
                />
              </div>

              {/* Scanned PDF warning */}
              {isScannedPdf && (
                <div className="alert alert-warning d-flex align-items-start gap-2 mb-3 text-start" role="alert">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-1" />
                  <div>
                    <strong>This PDF appears to be a scanned image</strong> — no text layer was found.
                    <ul className="mb-0 mt-1">
                      <li>Most online banking exports are text-based and will work fine.</li>
                      <li>If your bank only provides scanned statements, you'll need to export as CSV instead.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Chase auto-parsed success */}
              {isPdfSource && !isScannedPdf && chaseTransactions && chaseTransactions.length > 0 && (
                <div className="alert alert-success d-flex align-items-start gap-2 mb-3 text-start" role="alert">
                  <CheckCircle size={18} className="flex-shrink-0 mt-1" />
                  <div>
                    <strong>Chase statement detected</strong> — we've parsed{' '}
                    <strong>{chaseTransactions.length} transactions</strong> automatically.
                    <p className="mb-0 mt-1 small">
                      Click Continue to review and import. You can edit descriptions and categories in the next step.
                    </p>
                  </div>
                </div>
              )}

              {/* Parsed transactions preview table (bank-specific parsing) */}
              {isPdfSource && !isScannedPdf && chaseTransactions && chaseTransactions.length > 0 && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-bold small text-muted">
                      Parsed Transactions ({chaseTransactions.length})
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-muted"
                      onClick={() => setShowAllImportRows(!showAllImportRows)}
                    >
                      {showAllImportRows ? 'Show fewer' : `Show all ${chaseTransactions.length} rows`}
                    </Button>
                  </div>
                  <div className="table-responsive">
                    <Table striped hover size="sm" className="mb-0">
                      <thead>
                        <tr>
                          <th style={{ width: 110 }}>Date</th>
                          <th>Merchant / Description</th>
                          <th style={{ width: 80, textAlign: 'right' }}>Amount</th>
                          <th style={{ width: 70, textAlign: 'center' }}>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(showAllImportRows ? chaseTransactions : chaseTransactions.slice(0, 10)).map((tx, i) => (
                          <tr key={i} className={!tx.isValid ? 'table-danger' : ''}>
                            <td>{tx.date || '-'}</td>
                            <td>{tx.merchant || '-'}</td>
                            <td className={tx.type === 'expense' ? 'text-danger' : 'text-success'} style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                              {formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}
                            </td>
                            <td className="text-center">
                              <span className={`badge bg-${tx.type === 'expense' ? 'danger' : 'success'}`}>
                                {tx.type === 'expense' ? '−' : '+'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Unsupported bank warning */}
              {isPdfSource && !isScannedPdf && pdfAnalysis && pdfAnalysis.bank === 'unknown' && (
                <div className="alert alert-info d-flex align-items-start gap-2 mb-3 text-start" role="alert">
                  <ShieldAlert size={18} className="flex-shrink-0 mt-1" />
                  <div>
                    <strong>We couldn't auto-detect your bank.</strong>
                    <p className="mb-1 mt-1">
                      Try typing your bank name in the <strong>"Bank / Statement Source"</strong> field above
                      (e.g. <em>Chase Bank</em>, <em>Wells Fargo</em>, <em>Bank of America</em>).
                    </p>
                    <p className="mb-0">
                      Or paste the raw text below and we'll parse it using CSV rules.
                    </p>
                  </div>
                </div>
              )}

              {/* CSV-like PDF badge */}
              {isPdfSource && !isScannedPdf && pdfAnalysis && pdfAnalysis.textType === 'csv-like' && (
                <div className="d-flex justify-content-center gap-2 mb-3">
                  <span className="badge bg-success">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="me-1"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    PDF with structured data — will use CSV parsing
                  </span>
                </div>
              )}

              {/* Bank hint input (PDF only) */}
              {isPdfSource && !isScannedPdf && (
                <Form.Group className="mb-3">
                  <Form.Label>
                    Bank / Statement Source{' '}
                    <span className="text-muted fw-normal">(optional — helps us parse correctly)</span>
                  </Form.Label>
                  <div className="d-flex gap-2">
                    <Form.Control
                      type="text"
                      placeholder="e.g. Chase Bank, Wells Fargo, Bank of America"
                      value={bankHint}
                      onChange={(e) => setBankHint(e.target.value)}
                    />
                    {detectedBank && detectedBank !== 'unknown' && (
                      <span className="badge bg-success align-self-center">
                        Detected: {detectedBank === 'chase' ? 'Chase' : detectedBank === 'wells-fargo' ? 'Wells Fargo' : detectedBank === 'bofa' ? 'Bank of America' : 'Capital One'}
                      </span>
                    )}
                  </div>
                  <Form.Text className="text-muted">
                    Type your bank name to help us use the right parsing rules. You can also leave it blank and we'll try to auto-detect it.
                  </Form.Text>
                </Form.Group>
              )}

              <div className="d-flex justify-content-center gap-2 mb-3">
                <Button variant="outline-secondary" onClick={handlePaste}>
                  <Clipboard size={16} className="me-1" />
                  Paste from clipboard
                </Button>
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Or paste your data below</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={6}
                  placeholder="Date,Amount,Description&#10;2024-01-01,100,Groceries&#10;2024-01-02,-50,Transfer"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />
              </Form.Group>
              <Button
                variant="primary"
                onClick={handleContinueFromUpload}
                disabled={!rawText.trim()}
              >
                Continue <ArrowRight size={16} className="ms-1" />
              </Button>
            </div>
          )}

          {step === 'map' && parsed && (
            <div>
              <Card.Title className="mb-3">Map your columns</Card.Title>
              <p className="text-muted mb-3">
                We auto-detected your columns. Adjust any mappings below if needed.
              </p>

              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label>Date Column</Form.Label>
                  <Form.Select
                    value={colMap?.date ?? -1}
                    onChange={(e) => handleMapChange('date', e.target.value === '-1' ? null : Number(e.target.value))}
                  >
                    <option value={-1}>— skip —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>Amount Column</Form.Label>
                  <Form.Select
                    value={colMap?.amount ?? -1}
                    onChange={(e) => handleMapChange('amount', e.target.value === '-1' ? null : Number(e.target.value))}
                  >
                    <option value={-1}>— skip —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label>Merchant / Payee Column</Form.Label>
                  <Form.Select
                    value={colMap?.merchant ?? -1}
                    onChange={(e) => handleMapChange('merchant', e.target.value === '-1' ? null : Number(e.target.value))}
                  >
                    <option value={-1}>— skip —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
                <Col md={6}>
                  <Form.Label>Category Column</Form.Label>
                  <Form.Select
                    value={colMap?.category ?? -1}
                    onChange={(e) => handleMapChange('category', e.target.value === '-1' ? null : Number(e.target.value))}
                  >
                    <option value={-1}>— skip —</option>
                    {parsed.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              {/* Preview of first 5 rows with current mapping */}
              <Card className="mb-3">
                <Card.Header>Preview (first 5 rows)</Card.Header>
                <Table striped responsive size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => {
                      const tx = rowsToTransactions([row], colMap!)[0]
                      return (
                        <tr key={i}>
                          <td>{tx.date || '-'}</td>
                          <td className={tx.type === 'expense' ? 'text-danger' : 'text-success'}>
                            {formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}
                          </td>
                          <td>{tx.merchant || '-'}</td>
                          <td>{tx.category || '-'}</td>
                          <td>
                            <span className={`badge bg-${tx.type === 'expense' ? 'danger' : 'success'}`}>
                              {tx.type}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </Card>

              <div className="d-flex justify-content-between">
                <Button variant="outline-secondary" onClick={() => { setStep('upload'); setIsPdfSource(false); setIsScannedPdf(false); setShowAllImportRows(false); }}>
                  <ArrowLeft size={16} className="me-1" />
                  Back
                </Button>
                <Button variant="primary" onClick={handleContinueFromMap}>
                  Continue <ArrowRight size={16} className="ms-1" />
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && mapped.length > 0 && (
            <div>
              <Card.Title className="mb-3">Preview imported transactions</Card.Title>

              {/* Summary */}
              <Row className="mb-3">
                <Col md={4}>
                  <Card className="text-center">
                    <Card.Body>
                      <Card.Title className="small text-muted">Total Income</Card.Title>
                      <Card.Text className="text-success fw-bold fs-5">{formatMoney(Math.round(totalIncome * 100))}</Card.Text>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={4}>
                  <Card className="text-center">
                    <Card.Body>
                      <Card.Title className="small text-muted">Total Expenses</Card.Title>
                      <Card.Text className="text-danger fw-bold fs-5">{formatMoney(Math.round(totalExpense * 100))}</Card.Text>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={4}>
                  <Card className="text-center">
                    <Card.Body>
                      <Card.Title className="small text-muted">Net</Card.Title>
                      <Card.Text className={`fw-bold fs-5 ${net >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatMoney(Math.round(net * 100))}
                      </Card.Text>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>

              {/* Duplicate warning */}
              {duplicates.length > 0 && (
                <div className="alert alert-info d-flex align-items-start gap-2 mb-3">
                  <ShieldAlert size={18} className="flex-shrink-0 mt-1" />
                  <div className="w-100">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-bold">
                        {duplicates.length} potential duplicate{duplicates.length !== 1 ? 's' : ''} detected
                      </span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => {
                          const allSkipped = new Set(duplicates.map((d) => d.mappedIndex))
                          setSkippedIndices((prev) => (prev.size === allSkipped.size ? new Set() : allSkipped))
                        }}
                      >
                        {skippedIndices.size === duplicates.length ? 'Unskip All' : 'Skip All'}
                      </Button>
                    </div>
                    <div className="small text-muted">
                      These rows match existing transactions by date, amount, or merchant. Click a row to skip it.
                    </div>
                  </div>
                </div>
              )}

              {/* Invalid rows warning */}
              {mapped.some((t) => !t.isValid) && (
                <div className="alert alert-warning d-flex align-items-center gap-2 mb-3">
                  <AlertTriangle size={18} />
                  <span>
                    {mapped.filter((t) => !t.isValid).length} row{mapped.filter((t) => !t.isValid).length !== 1 ? 's' : ''} could not be parsed.
                    Check the <code className="text-danger">error</code> column below.
                  </span>
                </div>
              )}

              {/* Transaction table */}
              <div className="table-responsive mb-3">
                <Table striped responsive size="sm">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((tx, i) => {
                      const dup = duplicates.find((d) => d.mappedIndex === i)
                      const isSkipped = skippedIndices.has(i)
                      return (
                        <tr
                          key={i}
                          className={
                            isSkipped
                              ? 'table-secondary'
                              : tx.isValid
                              ? ''
                              : 'table-danger'
                          }
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
                          style={{ cursor: dup ? 'pointer' : 'default' }}
                          title={dup ? `Click to ${isSkipped ? 'unskip' : 'skip'} — matches "${dup.duplicate.existingMerchant}" on ${dup.duplicate.existingDate}` : undefined}
                        >
                          <td>{tx.date || '-'}</td>
                          <td>{tx.merchant || '-'}</td>
                          <td>{tx.category || '-'}</td>
                          <td>
                            <span className={`badge bg-${tx.type === 'expense' ? 'danger' : 'success'}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className={tx.type === 'expense' ? 'text-danger' : 'text-success'}>
                            {formatMoney(Math.round((parseFloat(cleanAmount(tx.amount)) || 0) * 100))}
                          </td>
                          <td>
                            {isSkipped ? (
                              <span className="text-muted" title="Skipped">⊘</span>
                            ) : dup ? (
                              <span
                                className={`badge bg-${dup.duplicate.confidence === 'high' ? 'warning text-dark' : 'info'}`}
                                title={`Confidence: ${dup.duplicate.confidence}`}
                              >
                                {dup.duplicate.confidence === 'high' ? '⚠' : 'ℹ'} Duplicate
                              </span>
                            ) : tx.isValid ? (
                              <span className="text-success">✓</span>
                            ) : (
                              <span className="text-danger" title={tx.error}>✗</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>

              {mapped.length > 20 && (
                <div className="text-center mb-3">
                  <Button variant="outline-secondary" size="sm" onClick={() => setShowAllRows(!showAllRows)}>
                    {showAllRows ? 'Show fewer' : `Show all ${mapped.length} rows`}
                  </Button>
                </div>
              )}

              {/* Progress indicator during import */}
              {importing && (
                <div className="mb-3">
                  <div className="d-flex justify-content-between mb-1">
                    <span className="small text-muted">Importing transactions...</span>
                    <span className="small text-muted">{importProgress}%</span>
                  </div>
                  <ProgressBar now={importProgress} animated className="mb-1" />
                  <div className="text-center">
                    <Loader2 size={16} className="text-primary" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                </div>
              )}

              <div className="d-flex justify-content-between">
                <Button variant="outline-secondary" onClick={() => setStep('map')}>
                  <ArrowLeft size={16} className="me-1" />
                  Back to Mapping
                </Button>
                <Button variant="success" onClick={handleImport} disabled={importing}>
                  {importing ? 'Importing...' : 'Import Transactions'}
                </Button>
              </div>
            </div>
          )}

          {step === 'import' && (
            <div className="text-center">
              <CheckCircle size={64} className="text-success mb-3" />
              <Card.Title className="mb-3">Import Complete</Card.Title>

              <div className="mb-3">
                <p className="mb-1">
                  {importResults.filter((r) => r === 'success').length} imported successfully
                </p>
                {importResults.filter((r) => r === 'skipped').length > 0 && (
                  <p className="text-muted mb-0">
                    {importResults.filter((r) => r === 'skipped').length} skipped (duplicates)
                  </p>
                )}
                {importResults.filter((r) => r === 'error').length > 0 && (
                  <p className="text-danger mb-0">
                    {importResults.filter((r) => r === 'error').length} failed
                  </p>
                )}
              </div>

              {importError && (
                <div className="alert alert-danger mb-3" role="alert">
                  {importError}
                </div>
              )}

              <div className="d-flex justify-content-center gap-2">
                <Button variant="outline-primary" onClick={() => { setStep('upload'); setIsPdfSource(false); setIsScannedPdf(false); setShowAllImportRows(false); }}>
                  Import Another File
                </Button>
                <Button variant="outline-secondary" onClick={() => downloadCSV(allTransactions, undefined, 'budgeteer-export.csv')}>
                  Export CSV
                </Button>
                <Button variant="primary" onClick={() => (window.location.href = '/transactions')}>
                  View Transactions
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}

export default ImportView
