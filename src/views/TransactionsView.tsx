import { useState, useEffect, useMemo } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Table from 'react-bootstrap/Table'
import Modal from 'react-bootstrap/Modal'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { Trash2, Edit } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'

// Generate list of months for the dropdown (last 12 months + current)
function getMonthsList() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    })
  }
  return months
}

const monthsList = getMonthsList()

function TransactionsView() {
  const [showModal, setShowModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<any>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null)
  // Month filter state - defaults to current month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const allTransactions = useBudgetStore((state) => state.transactions)

  // Filter transactions by selected month
  const transactions = useMemo(() => {
    if (!selectedMonth) return allTransactions
    return allTransactions.filter((t) => t.date.startsWith(selectedMonth))
  }, [allTransactions, selectedMonth])
  const addTransaction = useBudgetStore((state) => state.addTransaction)
  const deleteTransaction = useBudgetStore((state) => state.deleteTransaction)

  // Form state
  const [formAmount, setFormAmount] = useState('')
  const [formType, setFormType] = useState<'income' | 'expense'>('expense')
  const [formCategory, setFormCategory] = useState('')
  const [formMerchant, setFormMerchant] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formDescription, setFormDescription] = useState('')

  // Error display state
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    useBudgetStore.getState().fetchTransactions()
  }, [])

  // Initialize date to today in local timezone
  useEffect(() => {
    if (!formDate) {
      setFormDate(new Date().toISOString().split('T')[0])
    }
  }, [formDate])

  // Check store error whenever modal is open
  const storeError = useBudgetStore((state) => state.error)
  useEffect(() => {
    if (showModal && storeError) {
      setSubmitError(storeError)
    }
  }, [showModal, storeError])

  // Open edit modal with existing transaction data
  const handleEditClick = (transaction: any) => {
    setEditingTransaction(transaction)
    setFormAmount((transaction.amount_cents / 100).toString())
    setFormType(transaction.type)
    setFormCategory(transaction.category)
    setFormMerchant(transaction.merchant)
    // Convert UTC date to local date for display
    const localDate = new Date(transaction.date + 'T00:00:00')
    setFormDate(localDate.toISOString().split('T')[0])
    setFormDescription(transaction.description || '')
    setShowModal(true)
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      if (editingTransaction) {
        // Update existing transaction
        await deleteTransaction(editingTransaction.id)
      }

      await addTransaction({
        amount_cents: Math.round(parseFloat(formAmount) * 100),
        type: formType,
        category: formCategory || 'Uncategorized',
        merchant: formMerchant || 'Unknown',
        date: formDate,
        description: formDescription || undefined,
      })
      setShowModal(false)
      // Reset form
      setFormAmount('')
      setFormCategory('')
      setFormMerchant('')
      setFormDescription('')
      setEditingTransaction(null)
    } catch (error) {
      setSubmitError('Failed to save transaction. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDelete = () => {
    if (transactionToDelete) {
      deleteTransaction(transactionToDelete)
    }
    setTransactionToDelete(null)
    setShowDeleteModal(false)
  }

  // Helper to convert ISO date to local date string without UTC offset issue
  const getLocalDateString = (isoString: string) => {
    const date = new Date(isoString + 'T00:00:00')
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date)
  }

  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100)
  }

  return (
    <div>
      <Row className="align-items-center mb-4">
        <Col xs={6}>
          <h2>Transactions</h2>
        </Col>
        <Col xs={6} className="text-end">
          <Form.Label className="me-2 d-inline">Month:</Form.Label>
          <Form.Select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="d-inline w-auto"
          >
            {monthsList.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </Form.Select>
        </Col>
      </Row>

      {transactions.length === 0 ? (
        <Card className="text-center py-5">
          <Card.Body>
            <h4 className="text-muted">No transactions for this period</h4>
            <p className="text-secondary">Adjust your month filter or add a new transaction.</p>
            <Button variant="primary" onClick={() => setShowModal(true)}>
              Add Transaction
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <div className="table-responsive">
          <Table striped hover responsive>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th>Description</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td className="text-nowrap">{getLocalDateString(t.date)}</td>
                  <td className="text-nowrap">{t.merchant}</td>
                  <td className="text-nowrap">{t.category}</td>
                  <td>{t.description || '-'}</td>
                  <td className="text-nowrap">
                    <span className={`badge bg-${t.type === 'income' ? 'success' : 'danger'}`}>
                      {t.type}
                    </span>
                  </td>
                  <td
                    className={`text-nowrap ${t.type === 'income' ? 'text-success fw-bold' : 'text-danger fw-bold'} `}
                  >
                    {formatMoney(t.amount_cents)}
                  </td>
                  <td className="text-nowrap">
                    <div className="d-flex gap-1">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => handleEditClick(t)}
                        title="Edit transaction"
                      >
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => {
                          setTransactionToDelete(t.id)
                          setShowDeleteModal(true)
                        }}
                        title="Delete transaction"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this transaction? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Add/Edit Transaction Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={handleAddTransaction}>
          <Modal.Header closeButton>
            <Modal.Title>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="mb-3">
              <Col xs={6}>
                <Form.Label>Amount</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
              </Col>
              <Col xs={6}>
                <Form.Label>Type</Form.Label>
                <Form.Select value={formType} onChange={(e) => setFormType(e.target.value as 'income' | 'expense')}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </Form.Select>
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Merchant</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Groceries, Salary"
                value={formMerchant}
                onChange={(e) => setFormMerchant(e.target.value)}
                required
              />
            </Form.Group>

            <Row className="mb-3">
              <Col xs={6}>
                <Form.Label>Category</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="e.g., Food, Utilities"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  required
                />
              </Col>
              <Col xs={6}>
                <Form.Label>Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Description (Optional)</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                placeholder="Add notes..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </Form.Group>

            {submitError && (
              <div className="alert alert-danger mb-0" role="alert">
                {submitError}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingTransaction ? 'Update Transaction' : 'Add Transaction'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  )
}

export default TransactionsView
