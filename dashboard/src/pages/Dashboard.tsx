import React, { useState, useEffect } from 'react'
import { 
  FiActivity, 
  FiDollarSign, 
  FiClock, 
  FiServer, 
  FiShield, 
  FiTrendingUp,
  FiAlertCircle,
  FiRefreshCw,
  FiDownload
} from 'react-icons/fi'
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts'
import MetricCard from '../components/MetricCard'
import ExportReportButton from '../components/ExportReportButton'
import { fetchDashboardData, exportOptimizationData } from '../services/api'

interface DashboardData {
  optimization: {
    totalRequests: number
    averageSavings: number
    cache: {
      size: number
      hitRate: number
    }
  }
  servers: {
    configured: number
    connected: number
  }
  recentRequests: Array<{
    query: string
    savingsPercent: number
    responseTime: number
    timestamp: string
  }>
  hourlyStats: Array<{
    hour: string
    requests: number
    savings: number
  }>
  topTools: Array<{
    tool: string
    count: number
  }>
  estimatedCostSaved?: string
  startTime?: string
}

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const loadData = async () => {
    try {
      setLoading(true)
      const result = await fetchDashboardData()
      setData(result)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const metrics = [
    {
      title: 'Total Requests',
      value: data?.optimization.totalRequests.toLocaleString() ?? '0',
      icon: FiActivity,
      color: 'primary' as const,
      description: 'Total MCP requests processed'
    },
    {
      title: 'Average Savings',
      value: data ? `${data.optimization.averageSavings.toFixed(1)}%` : '0%',
      icon: FiDollarSign,
      color: 'success' as const,
      description: 'Average token savings per request'
    },
    {
      title: 'Cache Hit Rate',
      value: data ? `${data.optimization.cache.hitRate.toFixed(1)}%` : '0%',
      icon: FiTrendingUp,
      color: 'warning' as const,
      description: 'Percentage of cached responses'
    },
    {
      title: 'Connected Servers',
      value: data != null
        ? `${data.servers.connected}/${data.servers.configured}`
        : '—',
      change: data && data.servers.configured > 0
        ? (data.servers.connected === data.servers.configured ? 'All OK' : 'Issues')
        : undefined,
      icon: FiServer,
      color: (data && data.servers.configured > 0 && data.servers.connected === data.servers.configured ? 'success' : 'danger') as 'success' | 'danger',
      description: 'MCP servers status'
    }
  ]

  const hourlyData = data?.hourlyStats.slice(-24) || []
  const topToolsData = data?.topTools.slice(0, 5) || []

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <FiRefreshCw className="h-8 w-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <FiAlertCircle className="h-12 w-12 text-danger-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Data</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Real-time monitoring of MCP Smart Proxy performance
          </p>
        </div>
        <div className="flex items-center space-x-4 mt-4 sm:mt-0">
          <div className="text-sm text-gray-500">
            Dernière MAJ {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <ExportReportButton 
            onExport={async (format, period, includeDetails) => {
              await exportOptimizationData(format, period, includeDetails)
            }}
          />
          <button
            onClick={loadData}
            className="btn-secondary flex items-center"
          >
            <FiRefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <MetricCard key={index} {...metric} />
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests & Savings Over Time */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Requests & Savings (24h)</h3>
              <p className="text-gray-600 text-sm">Hourly breakdown of activity</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="hour" 
                  stroke="#6b7280"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="requests" 
                  name="Requests" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="savings" 
                  name="Tokens Saved" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Tools Usage */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Top Tools Usage</h3>
              <p className="text-gray-600 text-sm">Most frequently used MCP tools</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={topToolsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="tool"
                >
                  {topToolsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [`${value} uses`, 'Count']}
                  contentStyle={{ 
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <p className="text-gray-600 text-sm">Latest MCP requests and optimizations</p>
          </div>
          <div className="flex items-center space-x-2">
            <FiClock className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-600">Last 10 requests</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Savings
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Response Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data?.recentRequests.map((request, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {new Date(request.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                    {request.query}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      request.savingsPercent > 70 
                        ? 'bg-success-100 text-success-800'
                        : request.savingsPercent > 40
                        ? 'bg-warning-100 text-warning-800'
                        : 'bg-danger-100 text-danger-800'
                    }`}>
                      {request.savingsPercent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {request.responseTime}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center">
                <FiShield className="h-6 w-6 text-primary-600" />
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">Security Status</h4>
              <p className="text-2xl font-semibold text-gray-900 mt-1">Active</p>
              <p className="text-sm text-gray-600">Secret masking enabled</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-lg bg-success-100 flex items-center justify-center">
                <FiDollarSign className="h-6 w-6 text-success-600" />
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">Estimated Savings</h4>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {data?.estimatedCostSaved != null && data.estimatedCostSaved !== ''
                  ? `$${data.estimatedCostSaved}`
                  : '$0.00'}
              </p>
              <p className="text-sm text-gray-600">Based on token usage</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-12 w-12 rounded-lg bg-warning-100 flex items-center justify-center">
                <FiClock className="h-6 w-6 text-warning-600" />
              </div>
            </div>
            <div className="ml-4">
              <h4 className="text-sm font-medium text-gray-900">Uptime</h4>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {data?.startTime
                  ? (() => {
                      const start = new Date(data.startTime).getTime()
                      const ms = Math.max(0, Date.now() - start)
                      const h = Math.floor(ms / (1000 * 60 * 60))
                      const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
                      if (h >= 24) {
                        const d = Math.floor(h / 24)
                        return `${d}d ${h % 24}h`
                      }
                      return `${h}h ${m}m`
                    })()
                  : '—'}
              </p>
              <p className="text-sm text-gray-600">
                {data?.startTime ? 'Since start' : 'No data yet'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard