// Domain Models

export interface Transaction {
  id: string
  amount_cents: number
  type: 'income' | 'expense' | 'savings'
  category: string
  merchant: string
  date: string // ISO Date String (YYYY-MM-DD)
  description?: string
  goalId?: string // only for 'savings' type
}

export interface Income extends Transaction {
  type: 'income'
}

export interface Expense extends Transaction {
  type: 'expense'
}

export interface SavingsTransaction extends Transaction {
  type: 'savings'
  goalId: string
}

export interface SavingsGoal {
  id: string
  name: string
  target_amount_cents: number
  current_amount_cents: number
  deadline?: string // ISO Date String (optional)
  account?: string // e.g. "Fidelity 401k", "Chase Savings"
}

// Repository Interface

export interface DataRepository {
  getTransactions(): Promise<Transaction[]>
  addTransaction(t: Transaction): Promise<void>
  deleteTransaction(id: string): Promise<void>
  getGoals(): Promise<SavingsGoal[]>
  addGoal(g: SavingsGoal): Promise<void>
  updateGoal(g: SavingsGoal): Promise<void>
  deleteGoal(id: string): Promise<void>
  getMonthlySavings(month: string): Promise<{ goalId: string; name: string; amount_cents: number }[]>
}
