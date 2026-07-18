import Card from 'react-bootstrap/Card'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { Link } from 'react-router-dom'
import { useBudgetStore } from '../store/useBudgetStore'
import { ArrowUpRight, ArrowDownRight, Wallet, TrendingUp } from 'lucide-react'

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

// Helper to convert ISO date to local date string without UTC offset issue
function getLocalDateString(isoString: string) {
  const date = new Date(isoString + 'T00:00:00')
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date)
}

function DashboardView() {
  const transactions = useBudgetStore((state) => state.transactions)
  const goals = useBudgetStore((state) => state.goals)

  // Calculate financial summary
  const income = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const expenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount_cents, 0)
  const balance = income - expenses

  // Format currency helper
  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100)
  }

  // Calculate total savings
  const currentSavings = goals.reduce((sum, g) => sum + g.current_amount_cents, 0)

  return (
    <div>
      <Row>
        <Col md={6}>
          <StatTile
            title="Total Balance"
            value={formatMoney(balance)}
            icon={Wallet}
            trend={balance >= 0 ? 'Positive' : 'Negative'}
          />
        </Col>
        <Col md={6}>
          <StatTile
            title="Monthly Income"
            value={formatMoney(income)}
            icon={ArrowUpRight}
            trend="+ this month"
          />
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <StatTile
            title="Monthly Expenses"
            value={formatMoney(expenses)}
            icon={ArrowDownRight}
            trend="- this month"
          />
        </Col>
        <Col md={6}>
          <StatTile
            title="Total Savings"
            value={formatMoney(currentSavings)}
            icon={TrendingUp}
          />
        </Col>
      </Row>

      {/* Quick Actions */}
      <Card className="mt-4">
        <Card.Body>
          <Card.Title>Quick Actions</Card.Title>
          <div className="d-flex flex-wrap gap-2">
            <Link to="/transactions" className="btn btn-primary me-2">
              Add Transaction
            </Link>
            <Link to="/goals" className="btn btn-outline-primary">
              Set Goal
            </Link>
          </div>
        </Card.Body>
      </Card>

      {/* Recent Transactions Preview */}
      <Card className="mt-4">
        <Card.Body>
          <Card.Title>Recent Transactions</Card.Title>
          {transactions.length === 0 ? (
            <p className="text-muted">No transactions yet. Add your first transaction!</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 5).map((t) => (
                    <tr key={t.id}>
                      <td className="text-nowrap">{getLocalDateString(t.date)}</td>
                      <td>{t.description || t.merchant}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}

export default DashboardView
