import React from 'react'
import Container from 'react-bootstrap/Container'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import Offcanvas from 'react-bootstrap/Offcanvas'
import { LayoutDashboard, ListTodo, Target } from 'lucide-react'
import { Link } from 'react-router-dom'

interface LayoutShellProps {
  children: React.ReactNode
}

function LayoutShell({ children }: LayoutShellProps) {
  const [show, setShow] = React.useState(false)

  return (
    <div className="layout-shell min-vh-100 d-flex flex-column">
      <Navbar bg="dark" data-bs-theme="dark" expand="sm" className="border-bottom">
        <Container fluid>
          <Navbar.Brand as={Link} to="/" className="fw-bold text-white">
            Budgeteer
          </Navbar.Brand>

          <Navbar.Toggle
            aria-controls="offcanvasNavbar-sm"
            onClick={() => setShow(true)}
          />

          <Navbar.Offcanvas
            id="offcanvasNavbar-sm"
            placement="end"
            show={show}
            onHide={() => setShow(false)}
            responsive="sm"
          >
            <Offcanvas.Header className="bg-dark text-white">
              <Offcanvas.Title className="text-white flex-grow-1">Menu</Offcanvas.Title>
              <button
                type="button"
                className="btn-close btn-close-white me-n2"
                aria-label="Close"
                onClick={() => setShow(false)}
              />
            </Offcanvas.Header>
            <Offcanvas.Body className="bg-dark">
              <Nav className="flex-column">
                <Nav.Link as={Link} to="/" onClick={() => setShow(false)} className="text-white">
                  <LayoutDashboard size={18} className="me-2" />
                  Dashboard
                </Nav.Link>
                <Nav.Link as={Link} to="/transactions" onClick={() => setShow(false)} className="text-white">
                  <ListTodo size={18} className="me-2" />
                  Transactions
                </Nav.Link>
                <Nav.Link as={Link} to="/goals" onClick={() => setShow(false)} className="text-white">
                  <Target size={18} className="me-2" />
                  Goals
                </Nav.Link>
              </Nav>
            </Offcanvas.Body>
          </Navbar.Offcanvas>
        </Container>
      </Navbar>

      <main className="flex-grow-1">
        <Container className="py-4">{children}</Container>
      </main>
    </div>
  )
}

export default LayoutShell
