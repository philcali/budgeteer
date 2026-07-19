import { useState, useMemo } from 'react'
import Card from 'react-bootstrap/Card'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import { Link } from 'react-router-dom'
import { useBudgetStore } from '../store/useBudgetStore'
import type { Transaction } from '../types'
import { formatMoney } from '../utils/formatting'
import { ArrowUpRight, ArrowDownRight, Wallet, PiggyBank, ArrowRightLeft } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

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

function StatTile({ title, value, icon: Icon, trend }: { title: string; value: string; icon: any; trend?: string }) {
  return (
    <Card className="mb-4 border-0 shadow-sm">
      <Card.Body>
        <Row className="align-items-center">
          <Col xs={3} className="text-primary">
            <Icon size={32} />
          </Col>
          <Col xs={9}>
            <Card.Text className="text-muted mb-1">{title}</Card.Text>
            <Card.Title className="h4 mb-0">{value}</Card.Title>
            {trend && <small className={`text-${trend.startsWith('+') ? 'success' : 'danger'}`}>{trend}</small>}
          </Col>
        </Row>
      </Card.Body>
    </Card>
  )
}

function DashboardView() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const transactions = useBudgetStore((state) => state.transactions)
  const goals = useBudgetStore((state) => state.goals)

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
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const monthlySavings = monthlyTransactions
    .filter((t) => t.type === 'savings')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const netFlow = monthlyIncome - monthlyExpenses

  // Savings breakdown for the pie chart
  const chartData = useMemo(() => {
    const data = [
      { name: 'Income', value: monthlyIncome, color: '#198754' },
      { name: 'Expenses', value: monthlyExpenses, color: '#dc3545' },
      { name: 'Savings', value: monthlySavings, color: '#0d6efd' },
    ]
    // Only show non-zero slices
    return data.filter((d) => d.value > 0)
  }, [monthlyIncome, monthlyExpenses, monthlySavings])

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

  return (
    <div>
      {/* Month selector */}
      <Row className="align-items-center mb-4">
        <Col>
          <h2>Dashboard</h2>
        </Col>
        <Col xs="auto">
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

      {/* Monthly stats row */}
      <Row>
        <Col md={4}>
          <StatTile
            title="Monthly Income"
            value={formatMoney(monthlyIncome)}
            icon={ArrowUpRight}
            trend="+ this month"
          />
        </Col>
        <Col md={4}>
          <StatTile
            title="Monthly Expenses"
            value={formatMoney(monthlyExpenses)}
            icon={ArrowDownRight}
            trend="- this month"
          />
        </Col>
        <Col md={4}>
          <StatTile
            title="Net Flow"
            value={formatMoney(netFlow)}
            icon={ArrowRightLeft}
            trend={netFlow >= 0 ? '+ on track' : '- overspent'}
          />
        </Col>
      </Row>

      {/* Savings summary */}
      <Row>
        <Col md={6}>
          <StatTile
            title="Saved This Month"
            value={formatMoney(monthlySavings)}
            icon={PiggyBank}
            trend={`${savingsRate}% savings rate`}
          />
        </Col>
        <Col md={6}>
          <StatTile
            title="Available to Save"
            value={formatMoney(netFlow - monthlySavings)}
            icon={Wallet}
            trend={netFlow - monthlySavings >= 0 ? 'remaining' : 'over-allocated'}
          />
        </Col>
      </Row>

      {/* Pie chart */}
      {monthlyIncome > 0 && chartData.length > 0 && (
        <Card className="mt-4 border-0 shadow-sm">
          <Card.Body>
            <Card.Title>Where Your Money Went</Card.Title>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card.Body>
        </Card>
      )}

      {/* Savings breakdown per goal */}
      {Object.keys(savingsByGoal).length > 0 && (
        <Card className="mt-4 border-0 shadow-sm">
          <Card.Body>
            <Card.Title>Savings Allocations This Month</Card.Title>
            <div className="row g-3">
              {Object.entries(savingsByGoal).map(([goalId, { name, amount_cents }]) => (
                <Col xs={12} sm={6} key={goalId}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <strong>{name}</strong>
                    </div>
                    <div className="text-success fw-bold">{formatMoney(amount_cents)}</div>
                  </div>
                </Col>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Goal progress overview */}
      {goals.length > 0 && (
        <Card className="mt-4 border-0 shadow-sm">
          <Card.Body>
            <Card.Title>Goal Progress</Card.Title>
            <div className="row g-3">
              {goals.map((goal) => {
                const progress = goal.target_amount_cents > 0
                  ? Math.min((goal.current_amount_cents / goal.target_amount_cents) * 100, 100)
                  : 0
                return (
                  <Col xs={12} sm={6} key={goal.id}>
                    <div className="mb-2 d-flex justify-content-between">
                      <strong>{goal.name}</strong>
                      <span className="text-muted">{formatMoney(goal.current_amount_cents)} / {formatMoney(goal.target_amount_cents)}</span>
                    </div>
                    <div className="progress" style={{ height: '8px' }}>
                      <div
                        className="progress-bar bg-success"
                        role="progressbar"
                        style={{ width: `${progress}%` }}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                    <small className="text-muted">{Math.round(progress)}% complete</small>
                    {goal.account && <small className="text-secondary d-block mt-1">Account: {goal.account}</small>}
                  </Col>
                )
              })}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="mt-4 border-0 shadow-sm">
        <Card.Body>
          <Card.Title>Quick Actions</Card.Title>
          <div className="d-flex flex-wrap gap-2">
            <Link to="/transactions" className="btn btn-primary me-2">
              Add Transaction
            </Link>
            <Link to="/transactions" className="btn btn-success me-2">
              Add Savings
            </Link>
            <Link to="/goals" className="btn btn-outline-primary">
              Manage Goals
            </Link>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

export default DashboardView
