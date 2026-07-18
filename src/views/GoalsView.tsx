import { useState, useEffect } from 'react'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import ProgressBar from 'react-bootstrap/ProgressBar'
import Modal from 'react-bootstrap/Modal'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import { Plus, Trash2, Edit } from 'lucide-react'
import { useBudgetStore } from '../store/useBudgetStore'

interface Goal {
  id: string
  name: string
  target_amount_cents: number
  current_amount_cents: number
  deadline?: string
}

// Reusable Delete Confirmation Modal component
function DeleteConfirmationModal({
  show,
  itemName,
  onDelete,
  onHide
}: {
  show: boolean
  itemName: string
  onDelete: () => void
  onHide: () => void
}) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Delete {itemName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        Are you sure you want to delete <strong>{itemName}</strong>? This action cannot be undone.
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Delete
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function GoalCard({ goal, onDelete, onEdit }: { goal: Goal; onDelete: (id: string) => void; onEdit: (goal: Goal) => void }) {
  const progress = Math.min((goal.current_amount_cents / goal.target_amount_cents) * 100, 100)
  const formatMoney = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

  // Helper to convert ISO date to local date string without UTC offset issue
  const getLocalDateString = (isoString: string) => {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date)
  }

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleDelete = () => {
    onDelete(goal.id)
    setShowDeleteModal(false)
  }

  return (
    <>
      <Card className="mb-4 border-0 shadow-sm">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start mb-3">
            <h5 className="fw-bold m-0">{goal.name}</h5>
            <div className="d-flex gap-1">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => onEdit(goal)}
                title="Edit goal"
              >
                <Edit size={14} />
              </Button>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
                title="Delete goal"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>

          <ProgressBar
            now={progress}
            label={`${Math.round(progress)}%`}
            className="mb-3"
            style={{ height: '8px' }}
          />

          <Row className="align-items-center">
            <Col xs={6}>
              <small className="text-muted">Saved</small>
              <div className="fw-bold text-success">{formatMoney(goal.current_amount_cents)}</div>
            </Col>
            <Col xs={6} className="text-end">
              <small className="text-muted">Goal</small>
              <div className="fw-bold">{formatMoney(goal.target_amount_cents)}</div>
            </Col>
          </Row>

          {goal.deadline && (
            <div className="mt-3 small text-secondary">
              Deadline: {getLocalDateString(goal.deadline)}
            </div>
          )}

          <div className="mt-3 p-2 bg-light rounded">
            <small className="text-muted d-block">How to add savings:</small>
            <small className="text-body">
              Click the edit button above to update the current amount. Add money by increasing
              the <strong>Current Amount</strong> field with your additional savings.
            </small>
          </div>
        </Card.Body>
      </Card>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        show={showDeleteModal}
        itemName={goal.name}
        onDelete={handleDelete}
        onHide={() => setShowDeleteModal(false)}
      />
    </>
  )
}

function GoalsView() {
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)
  const goals = useBudgetStore((state) => state.goals)
  const addGoal = useBudgetStore((state) => state.addGoal)
  const updateGoal = useBudgetStore((state) => state.updateGoal)
  const deleteGoal = useBudgetStore((state) => state.deleteGoal)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTarget, setFormTarget] = useState('')
  const [formCurrent, setFormCurrent] = useState('0')
  const [formDeadline, setFormDeadline] = useState('')

  useEffect(() => {
    useBudgetStore.getState().fetchGoals()
  }, [])

  // Open edit modal with existing goal data
  const handleEditClick = (goal: Goal) => {
    setEditingGoal(goal)
    setFormName(goal.name)
    setFormTarget((goal.target_amount_cents / 100).toString())
    setFormCurrent((goal.current_amount_cents / 100).toString())
    setFormDeadline(goal.deadline || '')
    setShowModal(true)
  }

  // Handle save - either add or update
  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (editingGoal) {
      // Update existing goal
      updateGoal({
        id: editingGoal.id,
        name: formName,
        target_amount_cents: Math.round(parseFloat(formTarget) * 100),
        current_amount_cents: Math.round(parseFloat(formCurrent) * 100),
        deadline: formDeadline ? formDeadline : undefined,
      })
    } else {
      // Add new goal
      addGoal({
        name: formName,
        target_amount_cents: Math.round(parseFloat(formTarget) * 100),
        current_amount_cents: Math.round(parseFloat(formCurrent) * 100),
        deadline: formDeadline ? formDeadline : undefined,
      })
    }

    setShowModal(false)
    // Reset form
    setFormName('')
    setFormTarget('')
    setFormCurrent('0')
    setFormDeadline('')
    setEditingGoal(null)
  }

  return (
    <div>
      <Row className="align-items-center mb-4">
        <Col>
          <h2>Savings Goals</h2>
        </Col>
        <Col xs="auto">
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <Plus size={18} className="me-2" />
            Add Goal
          </Button>
        </Col>
      </Row>

      {goals.length === 0 ? (
        <Card className="text-center py-5">
          <Card.Body>
            <h4 className="text-muted">No savings goals yet</h4>
            <p className="text-secondary">Create your first savings goal to track your progress!</p>
            <Button variant="primary" onClick={() => setShowModal(true)}>
              Create First Goal
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
          {goals.map((goal: Goal) => (
            <div key={goal.id} className="col">
              <GoalCard
                goal={goal}
                onDelete={deleteGoal}
                onEdit={handleEditClick}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Goal Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={handleGoalSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>{editingGoal ? 'Edit Savings Goal' : 'Create New Savings Goal'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Goal Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g., Emergency Fund, Vacation"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </Form.Group>

            <Row className="mb-3">
              <Col xs={6}>
                <Form.Label>Target Amount</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  required
                />
              </Col>
              <Col xs={6}>
                <Form.Label>Current Amount</Form.Label>
                <Form.Control
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formCurrent}
                  onChange={(e) => setFormCurrent(e.target.value)}
                  required
                />
              </Col>
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Deadline (Optional)</Form.Label>
              <Form.Control type="date" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  )
}

export default GoalsView
