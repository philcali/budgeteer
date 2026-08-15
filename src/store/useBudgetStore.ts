import { create } from 'zustand'
import { DataRepository, Transaction, SavingsGoal } from '../types'
import LocalStorageRepository from '../repositories/LocalStorageRepository'

type TransactionWithoutId = Omit<Transaction, 'id'>
type GoalWithoutId = Omit<SavingsGoal, 'id'>
type SavingsWithoutId = Omit<Transaction, 'id' | 'type'> & { goalId: string }

// Generate a unique ID - fallback for non-secure contexts where crypto.randomUUID() is unavailable
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: timestamp + random hex
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 15)
  return `id_${timestamp}_${randomPart}`
}

interface BudgetState {
  transactions: Transaction[]
  goals: SavingsGoal[]
  isLoading: boolean
  error: string | null

  // Actions
  setRepository: (repo: DataRepository) => void
  fetchTransactions: () => Promise<void>
  addTransaction: (transactionData: TransactionWithoutId) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  addSavings: (savingsData: SavingsWithoutId) => Promise<void>
  fetchGoals: () => Promise<void>
  addGoal: (goalData: GoalWithoutId) => Promise<void>
  updateGoal: (goal: SavingsGoal) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
}

let repository: DataRepository | null = null

function initRepository(): DataRepository {
  if (!repository) {
    repository = new LocalStorageRepository()
  }
  return repository
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  transactions: [],
  goals: [],
  isLoading: false,
  error: null,

  setRepository: (repo: DataRepository) => {
    repository = repo
  },

  fetchTransactions: async () => {
    initRepository()
    if (!repository) return
    set({ isLoading: true, error: null })
    try {
      const transactions = await repository.getTransactions()
      set({ transactions, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to load transactions', isLoading: false })
    }
  },

  addTransaction: async (transactionData: TransactionWithoutId) => {
    if (!repository) {
      set({ error: 'Repository not initialized', isLoading: false })
      throw new Error('Repository not initialized')
    }
    set({ isLoading: true, error: null })
    try {
      const newTransaction = {
        ...transactionData,
        id: generateId(),
      }
      await repository.addTransaction(newTransaction)
      await get().fetchTransactions()
    } catch (error) {
      set({ error: 'Failed to add transaction', isLoading: false })
      throw error
    }
  },

  deleteTransaction: async (id: string) => {
    if (!repository) {
      set({ error: 'Repository not initialized', isLoading: false })
      throw new Error('Repository not initialized')
    }
    set({ isLoading: true, error: null })
    try {
      await repository.deleteTransaction(id)
      await get().fetchTransactions()
      await get().fetchGoals()
    } catch (error) {
      set({ error: 'Failed to delete transaction', isLoading: false })
      throw error
    }
  },

  addSavings: async (savingsData: SavingsWithoutId) => {
    if (!repository) {
      set({ error: 'Repository not initialized', isLoading: false })
      throw new Error('Repository not initialized')
    }
    set({ isLoading: true, error: null })
    try {
      const newSavings: Transaction = {
        ...savingsData,
        id: generateId(),
        type: 'savings' as const,
      }
      await repository.addTransaction(newSavings)
      await get().fetchTransactions()
      await get().fetchGoals()
    } catch (error) {
      set({ error: 'Failed to add savings', isLoading: false })
      throw error
    }
  },

  fetchGoals: async () => {
    initRepository()
    if (!repository) return
    set({ isLoading: true, error: null })
    try {
      const goals = await repository.getGoals()
      set({ goals, isLoading: false })
    } catch (error) {
      set({ error: 'Failed to load goals', isLoading: false })
    }
  },

  addGoal: async (goalData: GoalWithoutId) => {
    if (!repository) return
    set({ isLoading: true, error: null })
    try {
      const newGoal = {
        ...goalData,
        id: generateId(),
      }
      await repository.addGoal(newGoal)
      await get().fetchGoals()
    } catch (error) {
      set({ error: 'Failed to add goal', isLoading: false })
    }
  },

  updateGoal: async (goal: SavingsGoal) => {
    if (!repository) return
    set({ isLoading: true, error: null })
    try {
      await repository.updateGoal(goal)
      await get().fetchGoals()
    } catch (error) {
      set({ error: 'Failed to update goal', isLoading: false })
    }
  },

  deleteGoal: async (id: string) => {
    if (!repository) return
    set({ isLoading: true, error: null })
    try {
      await repository.deleteGoal(id)
      await get().fetchGoals()
    } catch (error) {
      set({ error: 'Failed to delete goal', isLoading: false })
    }
  },
}))
