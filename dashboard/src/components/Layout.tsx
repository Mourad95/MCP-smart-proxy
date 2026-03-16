import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  FiHome, 
  FiBarChart2, 
  FiShield, 
  FiServer, 
  FiMenu, 
  FiX,
  FiActivity,
  FiDollarSign,
  FiClock
} from 'react-icons/fi'
import axios from 'axios'
import { api, getAuthToken } from '../services/api'

interface LayoutProps {
  children: ReactNode
}

function formatUptime(startTimeStr: string | undefined): string {
  if (!startTimeStr) return '—'
  const start = new Date(startTimeStr).getTime()
  const now = Date.now()
  const ms = Math.max(0, now - start)
  const h = Math.floor(ms / (1000 * 60 * 60))
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  return `${h}h ${m}m`
}

function formatRequests(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [sidebarStats, setSidebarStats] = useState<{
    uptime: string
    servers: string
    savings: string
    requests: string
  }>({ uptime: '—', servers: '—', savings: '—', requests: '—' })
  const [sidebarLastUpdated, setSidebarLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = getAuthToken()
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
        const [metricsRes, statsRes] = await Promise.all([
          axios.get<{
            optimization?: { totalRequests?: number; averageSavings?: number }
            servers?: { configured?: number; connected?: number }
          }>('/metrics', { headers: authHeaders }),
          api.get<{ raw?: { startTime?: string }; details?: { estimatedCostSaved?: string } }>('/stats').catch(() => null)
        ])
        if (cancelled) return
        const m = metricsRes.data
        const totalRequests = m?.optimization?.totalRequests ?? 0
        const connected = m?.servers?.connected ?? 0
        const configured = m?.servers?.configured ?? 0
        const averageSavings = m?.optimization?.averageSavings ?? 0
        const startTime = statsRes?.raw?.startTime
        setSidebarStats({
          uptime: formatUptime(startTime),
          servers: configured ? `${connected}/${configured}` : (connected ? String(connected) : '—'),
          savings: averageSavings > 0 ? `${averageSavings.toFixed(0)}%` : '—',
          requests: formatRequests(totalRequests)
        })
        setSidebarLastUpdated(new Date())
      } catch {
        if (!cancelled) setSidebarStats({ uptime: '—', servers: '—', savings: '—', requests: '—' })
      }
    }
    load()
    const t = setInterval(load, 30000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  const navigation = [
    { name: 'Dashboard', href: '/', icon: FiHome },
    { name: 'Optimization', href: '/optimization', icon: FiBarChart2 },
    { name: 'Security', href: '/security', icon: FiShield },
    { name: 'Servers', href: '/servers', icon: FiServer },
  ]

  const stats = [
    { label: 'Uptime', value: sidebarStats.uptime, icon: FiClock, color: 'text-primary-600' },
    { label: 'Active Servers', value: sidebarStats.servers, icon: FiServer, color: 'text-success-600' },
    { label: 'Token Savings', value: sidebarStats.savings, icon: FiDollarSign, color: 'text-warning-600' },
    { label: 'Requests', value: sidebarStats.requests, icon: FiActivity, color: 'text-danger-600' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64">
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white pt-5 pb-4">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sr-only">Close sidebar</span>
                <FiX className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center px-4">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
                  <FiActivity className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">MCP Proxy</span>
              </div>
            </div>
            <div className="mt-5 flex flex-1 flex-col overflow-y-auto">
              <nav className="flex-1 space-y-1 px-2 pb-4">
                {navigation.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'}`} />
                      {item.name}
                    </Link>
                  )
                })}
              </nav>
              <div className="border-t border-gray-200 p-4">
                <div className="space-y-3">
                  {stats.map((stat) => {
                    const Icon = stat.icon
                    return (
                      <div key={stat.label} className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Icon className={`h-4 w-4 ${stat.color} mr-2`} />
                          <span className="text-sm text-gray-600">{stat.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
                      </div>
                    )
                  })}
                </div>
                {sidebarLastUpdated && (
                  <p className="text-xs text-gray-500 mt-3">
                    Dernière MAJ {sidebarLastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-grow flex-col overflow-y-auto border-r border-gray-200 bg-white pt-5">
          <div className="flex flex-shrink-0 items-center px-4">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <FiActivity className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">MCP Proxy</span>
            </div>
          </div>
          <div className="mt-5 flex flex-1 flex-col">
            <nav className="flex-1 space-y-1 px-2 pb-4">
              {navigation.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className={`mr-3 h-5 w-5 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
            <div className="border-t border-gray-200 p-4">
              <div className="space-y-3">
                {stats.map((stat) => {
                  const Icon = stat.icon
                  return (
                    <div key={stat.label} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Icon className={`h-4 w-4 ${stat.color} mr-2`} />
                        <span className="text-sm text-gray-600">{stat.label}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{stat.value}</span>
                    </div>
                  )
                })}
              </div>
              {sidebarLastUpdated && (
                <p className="text-xs text-gray-500 mt-3">
                  Dernière MAJ {sidebarLastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 border-b border-gray-200 bg-white lg:hidden">
          <button
            type="button"
            className="border-r border-gray-200 px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <FiMenu className="h-6 w-6" />
          </button>
          <div className="flex flex-1 justify-between px-4">
            <div className="flex flex-1 items-center">
              <div className="flex items-center space-x-3">
                <div className="h-6 w-6 rounded-lg bg-primary-600 flex items-center justify-center">
                  <FiActivity className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-semibold text-gray-900">MCP Proxy</span>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout