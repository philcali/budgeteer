import { DataRepository, Transaction, SavingsGoal } from '../types'

const TRANSACTIONS_KEY = 'budgeteer_transactions'
const GOALS_KEY = 'budgeteer_goals'

class LocalStorageRepository implements DataRepository {
  private getItem<T>(key: string): T[] {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : []
  }

  private setItem<T>(key: string, value: T[]): void {
    localStorage.setItem(key, JSON.stringify(value))
  }

  async getTransactions(): Promise<Transaction[]> {
    return this.getItem<Transaction>(TRANSACTIONS_KEY)
  }

  async addTransaction(t: Transaction): Promise<void> {
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)
    this.setItem(TRANSACTIONS_KEY, [...transactions, t])
  }

  async deleteTransaction(id: string): Promise<void> {
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)
    this.setItem(
      TRANSACTIONS_KEY,
      transactions.filter((t) => t.id !== id)
    )
  }

  async getGoals(): Promise<SavingsGoal[]> {
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)

    // Derive current_amount_cents from savings transactions linked to each goal
    return goals.map((goal) => {
      const savingsTotal = transactions
        .filter((t) => t.type === 'savings' && t.goalId === goal.id)
        .reduce((sum, t) => sum + t.amount_cents, 0)
      return { ...goal, current_amount_cents: savingsTotal }
    })
  }

  async addGoal(g: SavingsGoal): Promise<void> {
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(GOALS_KEY, [...goals, g])
  }

  async updateGoal(g: SavingsGoal): Promise<void> {
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(
      GOALS_KEY,
      goals.map((goal) => (goal.id === g.id ? g : goal))
    )
  }

  async deleteGoal(id: string): Promise<void> {
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(
      GOALS_KEY,
      goals.filter((g) => g.id !== id)
    )
  }

  async getMonthlySavings(month: string): Promise<{ goalId: string; name: string; amount_cents: number }[]> {
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    const goalMap = new Map(goals.map((g) => [g.id, g.name]))

    const monthly = transactions
      .filter((t): t is Transaction & { goalId: string } => t.type === 'savings' && !!t.goalId && t.date.startsWith(month))
      .reduce<Record<string, number>>((acc, t) => {
        acc[t.goalId] = (acc[t.goalId] || 0) + t.amount_cents
        return acc
      }, {})

    return Object.entries(monthly).map(([goalId, amount_cents]) => ({
      goalId,
      name: goalMap.get(goalId) || 'Unknown Goal',
      amount_cents,
    }))
  }
}

export default LocalStorageRepository
