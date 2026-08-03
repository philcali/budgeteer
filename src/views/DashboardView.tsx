import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useBudgetStore } from '../store/useBudgetStore'
import type { Transaction } from '../types'
import { formatMoney } from '../utils/formatting'
import { ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, ArrowRightLeft, ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

// Generate list of months for the dropdown (last 12 months + current)
function getMonthsList() {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    })
  }
  return months
}

const monthsList = getMonthsList()

function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  title: string
  value: string
  icon: LucideIcon
  accent: 'green' | 'red' | 'blue' | 'slate'
  sub?: string
}) {
  const accentMap = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-white text-slate-700 border-slate-200',
  }
  const iconBgMap = {
    green: 'bg-emerald-100 text-emerald-600',
    red: 'bg-rose-100 text-rose-600',
    blue: 'bg-blue-100 text-blue-600',
    slate: 'bg-slate-100 text-slate-500',
  }

  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBgMap[accent]}`}>
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium opacity-70">{title}</p>
          <p className="text-xl font-bold truncate">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function DashboardView() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const transactions = useBudgetStore((state) => state.transactions)
  const goals = useBudgetStore((state) => state.goals)

  useEffect(() => {
    useBudgetStore.getState().fetchTransactions()
  }, [])

  useEffect(() => {
    useBudgetStore.getState().fetchGoals()
  }, [])

  // Filter transactions to selected month
  const monthlyTransactions = useMemo(() => {
    return transactions.filter((t) => t.date.startsWith(selectedMonth))
  }, [transactions, selectedMonth])

  // Monthly calculations
  const monthlyIncome = monthlyTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const monthlyExpenses = monthlyTransactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Math.abs(t.amount_cents), 0)
  const monthlySavings = monthlyTransactions
    .filter((t) => t.type === 'savings')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const netFlow = monthlyIncome - monthlyExpenses

  // Savings breakdown per goal for the month
  const savingsByGoal = useMemo(() => {
    return monthlyTransactions
      .filter((t): t is Transaction & { goalId: string } => t.type === 'savings' && !!t.goalId)
      .reduce<Record<string, { name: string; amount_cents: number }>>((acc, t) => {
        const goal = goals.find((g) => g.id === t.goalId)
        const name = goal?.name || t.goalId || 'Unknown'
        acc[t.goalId] = { name, amount_cents: (acc[t.goalId]?.amount_cents || 0) + t.amount_cents }
        return acc
      }, {})
  }, [monthlyTransactions, goals])

  // Savings rate
  const savingsRate = monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : 0
  const availableToSave = netFlow

  // Chart data
  const chartData = useMemo(() => {
    const data = [
      { name: 'Income', value: monthlyIncome, color: '#10b981' },
      { name: 'Expenses', value: Math.abs(monthlyExpenses), color: '#f43f5e' },
      { name: 'Savings', value: monthlySavings, color: '#3b82f6' },
    ]
    return data.filter((d) => d.value > 0)
  }, [monthlyIncome, monthlyExpenses, monthlySavings])

  return (
    <div>
      {/* Header + month selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="relative inline-block w-48">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full appearance-none bg-white border border-slate-300 rounded-lg px-3 py-2 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {monthsList.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          title="Income"
          value={formatMoney(monthlyIncome)}
          icon={ArrowUpRight}
          accent="green"
          sub="this month"
        />
        <MetricCard
          title="Expenses"
          value={formatMoney(monthlyExpenses)}
          icon={ArrowDownRight}
          accent="red"
          sub="this month"
        />
        <MetricCard
          title="Net Flow"
          value={formatMoney(netFlow)}
          icon={ArrowRightLeft}
          accent={netFlow >= 0 ? 'green' : 'red'}
          sub={netFlow >= 0 ? 'on track' : 'overspent'}
        />
      </div>

      {/* Savings row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          title="Saved This Month"
          value={formatMoney(monthlySavings)}
          icon={PiggyBank}
          accent="blue"
          sub={`${savingsRate}% savings rate`}
        />
        <MetricCard
          title="Available to Save"
          value={formatMoney(availableToSave)}
          icon={Wallet}
          accent={availableToSave >= 0 ? 'slate' : 'red'}
          sub={availableToSave >= 0 ? 'remaining' : 'over-allocated'}
        />
      </div>

      {/* Where money went */}
      {monthlyIncome > 0 && chartData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Where Your Money Went</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: '#64748b' }} />
              <Tooltip
                formatter={(value: number) => formatMoney(value)}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Savings allocations */}
      {Object.keys(savingsByGoal).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Savings Allocations This Month</h2>
          <div className="space-y-3">
            {Object.entries(savingsByGoal).map(([goalId, { name, amount_cents }]) => (
              <div key={goalId} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{name}</span>
                <span className="text-sm font-semibold text-emerald-600">{formatMoney(amount_cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goal progress */}
      {goals.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Goal Progress</h2>
          <div className="space-y-5">
            {goals.map((goal) => {
              const progress = goal.target_amount_cents > 0
                ? Math.min((goal.current_amount_cents / goal.target_amount_cents) * 100, 100)
                : 0
              return (
                <div key={goal.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{goal.name}</span>
                    <span className="text-xs text-slate-500">
                      {formatMoney(goal.current_amount_cents)} / {formatMoney(goal.target_amount_cents)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">{Math.round(progress)}% complete</span>
                    {goal.account && <span className="text-xs text-slate-400">{goal.account}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link to="/transactions" className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <ArrowUpRight size={16} />
          Add Transaction
        </Link>
        <Link to="/transactions" className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
          <PiggyBank size={16} />
          Add Savings
        </Link>
        <Link to="/goals" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          Manage Goals
        </Link>
      </div>
    </div>
  )
}

export default DashboardView
