import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LayoutShell from './components/LayoutShell'
import DashboardView from './views/DashboardView'
import TransactionsView from './views/TransactionsView'
import GoalsView from './views/GoalsView'
import ImportView from './components/ImportView'
import LocalStorageRepository from './repositories/LocalStorageRepository'
import { useBudgetStore } from './store/useBudgetStore'
import { registerSW } from 'virtual:pwa-register'

// Import CSS
import './index.css'
import './App.css'

// Register the service worker with automatic updates
const updatePWA = registerSW({
  onNeedRefresh() {
    // A new service worker is available — prompt the user
    if (confirm('New version available. Reload?')) {
      updatePWA()
    }
  },
  onOfflineReady() {
    console.log('Budgeteer is ready to work offline.')
  },
})

// Initialize repository (data loading is handled per-view)
function AppInitializer({ children }: { children: React.ReactNode }) {
  const setRepository = useBudgetStore((state) => state.setRepository)

  React.useEffect(() => {
    const repo = new LocalStorageRepository()
    setRepository(repo)
  }, [setRepository])

  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <LayoutShell>
        <AppInitializer>
          <Routes>
            <Route index element={<DashboardView />} />
            <Route path="transactions" element={<TransactionsView />} />
            <Route path="goals" element={<GoalsView />} />
            <Route path="import" element={<ImportView />} />
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
