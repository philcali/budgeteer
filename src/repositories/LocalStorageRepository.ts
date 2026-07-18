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
    await this.simulateLatency()
    return this.getItem<Transaction>(TRANSACTIONS_KEY)
  }

  async addTransaction(t: Transaction): Promise<void> {
    await this.simulateLatency()
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)
    this.setItem(TRANSACTIONS_KEY, [...transactions, t])
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.simulateLatency()
    const transactions = this.getItem<Transaction>(TRANSACTIONS_KEY)
    this.setItem(
      TRANSACTIONS_KEY,
      transactions.filter((t) => t.id !== id)
    )
  }

  async getGoals(): Promise<SavingsGoal[]> {
    await this.simulateLatency()
    return this.getItem<SavingsGoal>(GOALS_KEY)
  }

  async addGoal(g: SavingsGoal): Promise<void> {
    await this.simulateLatency()
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(GOALS_KEY, [...goals, g])
  }

  async updateGoal(g: SavingsGoal): Promise<void> {
    await this.simulateLatency()
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(
      GOALS_KEY,
      goals.map((goal) => (goal.id === g.id ? g : goal))
    )
  }

  async deleteGoal(id: string): Promise<void> {
    await this.simulateLatency()
    const goals = this.getItem<SavingsGoal>(GOALS_KEY)
    this.setItem(
      GOALS_KEY,
      goals.filter((g) => g.id !== id)
    )
  }

  private simulateLatency(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 300))
  }
}

export default LocalStorageRepository
