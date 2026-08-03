import { useState, useEffect, useMemo } from 'react'
import { Trash2, Edit, PiggyBank, Plus, ChevronDown } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'
import { formatMoney, getLocalDateString } from '../utils/formatting'
import { Dialog } from '../components/LayoutShell'

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
  const [showSavingsModal, setShowSavingsModal] = useState(false)
  const [selectedGoal, setSelectedGoal] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const allTransactions = useBudgetStore((state) => state.transactions)
  const goals = useBudgetStore((state) => state.goals)

  const transactions = useMemo(() => {
    if (!selectedMonth) return allTransactions
    return allTransactions.filter((t) => t.date.startsWith(selectedMonth))
  }, [allTransactions, selectedMonth])

  const addTransaction = useBudgetStore((state) => state.addTransaction)
  const deleteTransaction = useBudgetStore((state) => state.deleteTransaction)
  const addSavings = useBudgetStore((state) => state.addSavings)

  // Form state
  const [formAmount, setFormAmount] = useState('')
  const [formType, setFormType] = useState<'income' | 'expense'>('expense')
  const [formCategory, setFormCategory] = useState('')
  const [formMerchant, setFormMerchant] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savingsError, setSavingsError] = useState<string | null>(null)
  const [isSubmittingSavings, setIsSubmittingSavings] = useState(false)

  useEffect(() => {
    useBudgetStore.getState().fetchTransactions()
  }, [])

  useEffect(() => {
    useBudgetStore.getState().fetchGoals()
  }, [])

  useEffect(() => {
    if (!formDate) setFormDate(new Date().toISOString().split('T')[0])
  }, [formDate])

  const storeError = useBudgetStore((state) => state.error)
  useEffect(() => {
    if (showModal && storeError) setSubmitError(storeError)
  }, [showModal, storeError])

  const handleEditClick = (transaction: any) => {
    setEditingTransaction(transaction)
    setFormAmount((transaction.amount_cents / 100).toString())
    setFormType(transaction.type)
    setFormCategory(transaction.category)
    setFormMerchant(transaction.merchant)
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
      if (editingTransaction) await deleteTransaction(editingTransaction.id)
      await addTransaction({
        amount_cents: Math.round(parseFloat(formAmount) * 100),
        type: formType,
        category: formCategory || 'Uncategorized',
        merchant: formMerchant || 'Unknown',
        date: formDate,
        description: formDescription || undefined,
      })
      setShowModal(false)
      setFormAmount('')
      setFormCategory('')
      setFormMerchant('')
      setFormDescription('')
      setEditingTransaction(null)
    } catch {
      setSubmitError('Failed to save transaction. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSavingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingsError(null)
    setIsSubmittingSavings(true)
    try {
      if (!selectedGoal) {
        setSavingsError('Please select a savings goal.')
        return
      }
      await addSavings({
        amount_cents: Math.round(parseFloat(formAmount) * 100),
        category: 'Savings',
        merchant: goals.find((g) => g.id === selectedGoal)?.name || 'Savings',
        date: formDate,
        goalId: selectedGoal,
      })
      setShowSavingsModal(false)
      setSelectedGoal('')
      setFormAmount('')
      setFormDate(new Date().toISOString().split('T')[0])
    } catch {
      setSavingsError('Failed to add savings. Please try again.')
    } finally {
      setIsSubmittingSavings(false)
    }
  }

  const confirmDelete = () => {
    if (transactionToDelete) deleteTransaction(transactionToDelete)
    setTransactionToDelete(null)
    setShowDeleteModal(false)
  }

  const openAddModal = () => {
    setEditingTransaction(null)
    setFormAmount('')
    setFormCategory('')
    setFormMerchant('')
    setFormDate(new Date().toISOString().split('T')[0])
    setFormDescription('')
    setSubmitError(null)
    setShowModal(true)
  }

  const openSavingsModal = () => {
    setSelectedGoal('')
    setFormAmount('')
    setFormDate(new Date().toISOString().split('T')[0])
    setSavingsError(null)
    setShowSavingsModal(true)
  }

  const typeBadge = (type: string) => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium'
    if (type === 'income') return `${base} bg-emerald-100 text-emerald-700`
    if (type === 'expense') return `${base} bg-rose-100 text-rose-700`
    return `${base} bg-blue-100 text-blue-700`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="relative inline-block">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {monthsList.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Add
          </button>
          <button
            onClick={openSavingsModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <PiggyBank size={16} />
            Savings
          </button>
        </div>
      </div>

      {/* Empty state */}
      {transactions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h3 className="text-lg font-medium text-slate-500">No transactions for this period</h3>
          <p className="text-slate-400 text-sm mt-1 mb-4">Adjust your month filter or add a new transaction.</p>
          <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} />
            Add Transaction
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid sm:grid-cols-7 gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <div>Date</div>
            <div>Merchant</div>
            <div>Category</div>
            <div className="col-span-2">Description</div>
            <div>Type</div>
            <div>Amount</div>
            <div>Actions</div>
          </div>
          {/* Rows */}
          <div className="divide-y divide-slate-100">
            {transactions.map((t) => (
              <div key={t.id} className="grid sm:grid-cols-7 gap-2 sm:gap-4 px-5 py-3.5 items-center hover:bg-slate-50/50 transition-colors">
                <div className="text-sm text-slate-600 whitespace-nowrap">{getLocalDateString(t.date)}</div>
                <div className="text-sm text-slate-700 font-medium whitespace-nowrap">{t.merchant}</div>
                <div className="text-sm text-slate-500 whitespace-nowrap">{t.category}</div>
                <div className="text-sm text-slate-500 sm:col-span-2 truncate">{t.description || '-'}</div>
                <div className="whitespace-nowrap"><span className={typeBadge(t.type)}>{t.type}</span></div>
                <div className={`text-sm font-semibold whitespace-nowrap ${t.type === 'income' ? 'text-emerald-600' : t.type === 'expense' ? 'text-rose-600' : 'text-blue-600'}`}>
                  {formatMoney(t.amount_cents)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditClick(t)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => { setTransactionToDelete(t.id); setShowDeleteModal(true) }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Confirm Delete"
        footer={
          <>
            <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors">
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this transaction? This action cannot be undone.
        </p>
      </Dialog>

      {/* Add/Edit dialog */}
      <Dialog
        open={showModal}
        onClose={() => { setShowModal(false); setEditingTransaction(null); }}
        title={editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}
        footer={
          <>
            <button onClick={() => setShowModal(false)} disabled={isSubmitting} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => {}} disabled={isSubmitting} form="tx-form" type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
              {isSubmitting ? 'Saving...' : editingTransaction ? 'Update Transaction' : 'Add Transaction'}
            </button>
          </>
        }
      >
        <form id="tx-form" onSubmit={handleAddTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as 'income' | 'expense')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Merchant</label>
            <input
              type="text"
              placeholder="e.g., Groceries, Salary"
              value={formMerchant}
              onChange={(e) => setFormMerchant(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g., Food, Utilities"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              placeholder="Add notes..."
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {submitError && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
              {submitError}
            </div>
          )}
        </form>
      </Dialog>

      {/* Savings dialog */}
      <Dialog
        open={showSavingsModal}
        onClose={() => setShowSavingsModal(false)}
        title="Add Savings"
        footer={
          <>
            <button onClick={() => setShowSavingsModal(false)} disabled={isSubmittingSavings} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => {}} disabled={isSubmittingSavings} form="savings-form" type="submit" className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
              {isSubmittingSavings ? 'Adding...' : 'Add Savings'}
            </button>
          </>
        }
      >
        <form id="savings-form" onSubmit={handleSavingsSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Goal</label>
            <select
              value={selectedGoal}
              onChange={(e) => setSelectedGoal(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a goal...</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                  {goal.account ? ` (${goal.account})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {savingsError && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
              {savingsError}
            </div>
          )}
        </form>
      </Dialog>
    </div>
  )
}

export default TransactionsView
