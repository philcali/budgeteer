// Domain Models

export interface Transaction {
  id: string
  amount_cents: number
  type: 'income' | 'expense'
  category: string
  merchant: string
  date: string // ISO Date String
  description?: string
}

export interface Income extends Transaction {
  type: 'income'
}

export interface Expense extends Transaction {
  type: 'expense'
}

export interface SavingsGoal {
  id: string
  name: string
  target_amount_cents: number
  current_amount_cents: number
  deadline?: string // ISO Date String (optional)
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
}
