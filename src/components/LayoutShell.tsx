import React from 'react'
import Container from 'react-bootstrap/Container'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import Offcanvas from 'react-bootstrap/Offcanvas'
import { LayoutDashboard, ListTodo, Target, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'

interface LayoutShellProps {
  children: React.ReactNode
}

function LayoutShell({ children }: LayoutShellProps) {
  const [show, setShow] = React.useState(false)

  return (
    <div className="layout-shell min-vh-100 d-flex flex-column">
      <Navbar bg="dark" data-bs-theme="dark" expand="lg" className="border-bottom">
        <Container fluid>
          <Navbar.Brand as={Link} to="/" className="fw-bold text-white">
            Budgeteer
          </Navbar.Brand>

          <Navbar.Toggle
            aria-controls="offcanvasNavbar-lg"
            onClick={() => setShow(true)}
          />

          <Navbar.Offcanvas
            id="offcanvasNavbar-lg"
            placement="end"
            show={show}
            onHide={() => setShow(false)}
            responsive="lg"
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
              <Nav className="justify-content-end flex-grow-1 pe-3">
                <Nav.Link as={Link} to="/" onClick={() => setShow(false)} className="text-white">
                  <LayoutDashboard size={18} className="me-1" />
                  Dashboard
                </Nav.Link>
                <Nav.Link as={Link} to="/transactions" onClick={() => setShow(false)} className="text-white">
                  <ListTodo size={18} className="me-1" />
                  Transactions
                </Nav.Link>
                <Nav.Link as={Link} to="/goals" onClick={() => setShow(false)} className="text-white">
                  <Target size={18} className="me-1" />
                  Goals
                </Nav.Link>
                <Nav.Link as={Link} to="/import" onClick={() => setShow(false)} className="text-white">
                  <Upload size={18} className="me-1" />
                  Import
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
