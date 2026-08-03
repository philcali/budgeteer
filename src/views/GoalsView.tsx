import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'
import { formatMoney, getLocalDateString } from '../utils/formatting'
import { Dialog } from '../components/LayoutShell'
import type { SavingsGoal } from '../types'

function GoalCard({ goal, onDelete, onEdit }: { goal: SavingsGoal; onDelete: (id: string) => void; onEdit: (goal: SavingsGoal) => void }) {
  const [showDelete, setShowDelete] = useState(false)
  const progress = Math.min((goal.current_amount_cents / goal.target_amount_cents) * 100, 100)

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-full hover:shadow-sm transition-shadow">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 truncate">{goal.name}</h3>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(goal)}
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <Edit size={14} />
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-slate-500">Saved</p>
            <p className="text-lg font-bold text-emerald-600">{formatMoney(goal.current_amount_cents)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">Goal</p>
            <p className="text-lg font-bold text-slate-900">{formatMoney(goal.target_amount_cents)}</p>
          </div>
        </div>

        <div className="mt-auto space-y-1 text-xs text-slate-400">
          {goal.account && <p>Account: {goal.account}</p>}
          {goal.deadline && <p>Deadline: {getLocalDateString(goal.deadline)}</p>}
        </div>
      </div>

      <Dialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        title="Delete Goal"
        footer={
          <>
            <button onClick={() => setShowDelete(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={() => { onDelete(goal.id); setShowDelete(false); }} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors">
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete <strong>{goal.name}</strong>? This action cannot be undone.
        </p>
      </Dialog>
    </>
  )
}

function GoalsView() {
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const goals = useBudgetStore((state) => state.goals)
  const addGoal = useBudgetStore((state) => state.addGoal)
  const updateGoal = useBudgetStore((state) => state.updateGoal)
  const deleteGoal = useBudgetStore((state) => state.deleteGoal)

  const [formName, setFormName] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [formCurrent, setFormCurrent] = useState('')
  const [formDeadline, setFormDeadline] = useState('')
  const [formAccount, setFormAccount] = useState('')

  useEffect(() => {
    useBudgetStore.getState().fetchGoals()
  }, [])

  const openEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal)
    setFormName(goal.name)
    setFormTarget((goal.target_amount_cents / 100).toString())
    setFormCurrent((goal.current_amount_cents / 100).toString())
    setFormDeadline(goal.deadline || '')
    setFormAccount(goal.account || '')
    setShowModal(true)
  }

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingGoal) {
      updateGoal({
        id: editingGoal.id,
        name: formName,
        target_amount_cents: Math.round(parseFloat(formTarget) * 100),
        current_amount_cents: Math.round(parseFloat(formCurrent) * 100),
        deadline: formDeadline ? formDeadline : undefined,
        account: formAccount || undefined,
      })
    } else {
      addGoal({
        name: formName,
        target_amount_cents: Math.round(parseFloat(formTarget) * 100),
        current_amount_cents: Math.round(parseFloat(formCurrent || '0') * 100),
        deadline: formDeadline ? formDeadline : undefined,
        account: formAccount || undefined,
      })
    }
    setShowModal(false)
    setFormName('')
    setFormTarget('')
    setFormCurrent('')
    setFormDeadline('')
    setFormAccount('')
    setEditingGoal(null)
  }

  const openAddModal = () => {
    setEditingGoal(null)
    setFormName('')
    setFormTarget('')
    setFormCurrent('')
    setFormDeadline('')
    setFormAccount('')
    setShowModal(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Savings Goals</h1>
        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h3 className="text-lg font-medium text-slate-500">No savings goals yet</h3>
          <p className="text-slate-400 text-sm mt-1 mb-4">Create your first savings goal to track your progress!</p>
          <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} />
            Create First Goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onDelete={deleteGoal} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Dialog
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingGoal ? 'Edit Savings Goal' : 'Create New Savings Goal'}
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={() => {}} form="goal-form" type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </>
        }
      >
        <form id="goal-form" onSubmit={handleGoalSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Goal Name</label>
            <input
              type="text"
              placeholder="e.g., Emergency Fund, Vacation"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account (Optional)</label>
            <input
              type="text"
              placeholder="e.g., Fidelity 401k, Chase Savings"
              value={formAccount}
              onChange={(e) => setFormAccount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formTarget}
                onChange={(e) => setFormTarget(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Current</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formCurrent}
                onChange={(e) => setFormCurrent(e.target.value)}
                required={!!editingGoal}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
              <input
                type="date"
                value={formDeadline}
                onChange={(e) => setFormDeadline(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {editingGoal && (
            <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <strong>Current:</strong> {formatMoney(editingGoal.current_amount_cents)} — updated automatically from savings transactions.
            </div>
          )}
        </form>
      </Dialog>
    </div>
  )
}

export default GoalsView
