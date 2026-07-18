import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LayoutShell from './components/LayoutShell'
import DashboardView from './views/DashboardView'
import TransactionsView from './views/TransactionsView'
import GoalsView from './views/GoalsView'
import LocalStorageRepository from './repositories/LocalStorageRepository'
import { useBudgetStore } from './store/useBudgetStore'

// Import CSS
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import './App.css'

// Initialize repository and load data
function AppInitializer({ children }: { children: React.ReactNode }) {
  const setRepository = useBudgetStore((state) => state.setRepository)
  const fetchTransactions = useBudgetStore((state) => state.fetchTransactions)
  const fetchGoals = useBudgetStore((state) => state.fetchGoals)

  React.useEffect(() => {
    // Set up the repository
    const repo = new LocalStorageRepository()
    setRepository(repo)

    // Pre-load data via store actions
    fetchTransactions()
    fetchGoals()
  }, [setRepository, fetchTransactions, fetchGoals])

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <LayoutShell>
        <AppInitializer>
          <Routes>
            <Route index element={<DashboardView />} />
            <Route path="transactions" element={<TransactionsView />} />
            <Route path="goals" element={<GoalsView />} />
          </Routes>
        </AppInitializer>
      </LayoutShell>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
