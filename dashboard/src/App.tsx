import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import OptimizationStats from './pages/OptimizationStats'
import SecurityMonitoring from './pages/SecurityMonitoring'
import ServerStatus from './pages/ServerStatus'
import Layout from './components/Layout'
import AuthGuard from './components/AuthGuard'

function App() {
  return (
    <Router basename="/dashboard">
      <AuthGuard>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/optimization" element={<OptimizationStats />} />
            <Route path="/security" element={<SecurityMonitoring />} />
            <Route path="/servers" element={<ServerStatus />} />
          </Routes>
        </Layout>
      </AuthGuard>
    </Router>
  )
}

export default App