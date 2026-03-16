import axios from 'axios'

const API_BASE_URL = '/api'

// Create axios instance with auth token handling
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Store token in localStorage
const TOKEN_KEY = 'mcp_dashboard_token'

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

export const setAuthToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token)
}

export const removeAuthToken = (): void => {
  localStorage.removeItem(TOKEN_KEY)
}

// Add auth token to requests if available
api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error)
    
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      // Clear invalid token
      removeAuthToken()
      
      // Only redirect if we're not already on a login page
      if (!window.location.pathname.includes('/login')) {
        // Dispatch custom event for login handling
        window.dispatchEvent(new CustomEvent('auth-required'))
      }
    }
    
    throw error
  }
)

// Authentication functions
export const checkAuthStatus = async (): Promise<{ requiresAuth: boolean; hasPassword: boolean }> => {
  try {
    const response = await axios.get('/auth/status')
    return response.data
  } catch (error) {
    console.error('Failed to check auth status:', error)
    return { requiresAuth: false, hasPassword: false }
  }
}

export const login = async (password: string): Promise<{ success: boolean; token?: string; message?: string }> => {
  try {
    const response = await axios.post('/auth/login', { password })
    
    if (response.data.success && response.data.token) {
      setAuthToken(response.data.token)
    }
    
    return response.data
  } catch (error) {
    console.error('Login failed:', error)
    return { 
      success: false, 
      message: error.response?.data?.message || 'Login failed' 
    }
  }
}

export const verifyToken = async (): Promise<boolean> => {
  const token = getAuthToken()
  if (!token) return false
  
  try {
    const response = await axios.get('/auth/verify', {
      headers: { Authorization: `Bearer ${token}` }
    })
    return response.data.success === true
  } catch (error) {
    return false
  }
}

export const logout = async (): Promise<void> => {
  const token = getAuthToken()
  if (token) {
    try {
      await axios.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }
  removeAuthToken()
}

export interface DashboardData {
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
  /** From /api/stats when available */
  estimatedCostSaved?: string
  startTime?: string
}

export interface OptimizationStats {
  summary: string
  details: {
    hoursRunning: string
    requestsPerHour: string
    tokensSavedPerHour: number
    estimatedCostSaved: string
    topTools: Array<{ tool: string; count: number }>
    topQueriesBySavings: Array<{ query: string; savingsPercent: number; count: number }>
    hourlyBreakdown: {
      requests: Array<[string, number]>
      savings: Array<[string, number]>
    }
  }
  raw: {
    totalRequests: number
    totalTokensIn: number
    totalTokensOut: number
    totalTokensSaved: number
    averageSavingsPercent: number
    startTime: string
    lastUpdate: string
  }
}

export interface SecurityMetrics {
  secretsDetected: number
  rateLimitViolations: number
  securityErrors: number
  recentSecurityEvents: Array<{
    type: string
    message: string
    timestamp: string
    severity: 'low' | 'medium' | 'high'
  }>
  secretTypes: Array<{
    type: string
    count: number
    lastDetected: string
  }>
}

export interface ServerStatus {
  name: string
  url: string
  connected: boolean
  lastSeen: string
  requests: number
  errors: number
  responseTime: number
  tools: Array<{
    name: string
    description: string
  }>
}

export const fetchDashboardData = async (): Promise<DashboardData> => {
  try {
    const token = getAuthToken()
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    const [metricsRes, statsRes] = await Promise.all([
      axios.get<{
        optimization: { totalRequests: number; averageSavings: number; cache: { size: number; hitRate: number } }
        servers: { configured: number; connected: number }
        recentRequests: Array<{ query: string; savingsPercent: number; responseTime: number; timestamp: string; toolsUsed?: string[] }>
      }>('/metrics', { headers: authHeaders }),
      api.get<{ summary: string; details: Record<string, unknown>; raw: Record<string, unknown> }>('/stats').catch(() => null)
    ])

    const metrics = metricsRes.data
    const recentRequests = (metrics.recentRequests || []).map((m) => ({
      query: m.query || '',
      savingsPercent: m.savingsPercent ?? 0,
      responseTime: m.responseTime ?? 0,
      timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date(m.timestamp as number).toISOString()
    }))

    let hourlyStats: Array<{ hour: string; requests: number; savings: number }> = []
    let topTools: Array<{ tool: string; count: number }> = []

    let estimatedCostSaved: string | undefined
    let startTime: string | undefined
    if (statsRes && statsRes.details) {
      const details = statsRes.details as {
        topTools?: Array<{ tool: string; count: number }>
        hourlyBreakdown?: { requests: Array<[string, number]>; savings: Array<[string, number]> }
        estimatedCostSaved?: string
      }
      if (details.topTools?.length) {
        topTools = details.topTools.slice(0, 5)
      }
      if (details.estimatedCostSaved != null) {
        estimatedCostSaved = String(details.estimatedCostSaved)
      }
    }
    if (statsRes?.raw && typeof (statsRes.raw as { startTime?: string }).startTime === 'string') {
      startTime = (statsRes.raw as { startTime: string }).startTime
    }
    if (statsRes && statsRes.details) {
      const details = statsRes.details as {
        hourlyBreakdown?: { requests: Array<[string, number]>; savings: Array<[string, number]> }
      }
      const hb = details.hourlyBreakdown
      if (hb?.requests && hb?.savings) {
        const byHour = new Map<string, { requests: number; savings: number }>()
        hb.requests.forEach(([hour, count]) => {
          byHour.set(hour, { requests: count, savings: 0 })
        })
        hb.savings.forEach(([hour, val]) => {
          const cur = byHour.get(hour) || { requests: 0, savings: 0 }
          cur.savings = val
          byHour.set(hour, cur)
        })
        hourlyStats = Array.from(byHour.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-24)
          .map(([hour, { requests, savings }]) => ({
            hour: hour.length > 10 ? hour.slice(11, 16) : hour,
            requests,
            savings
          }))
      }
    }

    return {
      optimization: {
        totalRequests: metrics.optimization?.totalRequests ?? 0,
        averageSavings: metrics.optimization?.averageSavings ?? 0,
        cache: {
          size: metrics.optimization?.cache?.size ?? 0,
          hitRate: metrics.optimization?.cache?.hitRate ?? 0
        }
      },
      servers: {
        configured: metrics.servers?.configured ?? 0,
        connected: metrics.servers?.connected ?? 0
      },
      recentRequests,
      hourlyStats,
      topTools,
      estimatedCostSaved,
      startTime
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    throw error
  }
}

export const fetchOptimizationStats = async (): Promise<OptimizationStats> => {
  try {
    const data = await api.get<{
      summary: string
      details: Record<string, unknown>
      raw: Record<string, unknown>
    }>('/stats')

    const raw = data.raw || {}
    const details = (data.details || {}) as Record<string, unknown>

    return {
      summary: data.summary || 'No statistics yet.',
      details: {
        hoursRunning: String(details.hoursRunning ?? '0'),
        requestsPerHour: String(details.requestsPerHour ?? '0'),
        tokensSavedPerHour: Number(details.tokensSavedPerHour ?? 0),
        estimatedCostSaved: String(details.estimatedCostSaved ?? '0'),
        topTools: Array.isArray(details.topTools) ? details.topTools as Array<{ tool: string; count: number }> : [],
        topQueriesBySavings: Array.isArray(details.topQueriesBySavings) ? details.topQueriesBySavings as Array<{ query: string; savingsPercent: number; count: number }> : [],
        hourlyBreakdown: {
          requests: Array.isArray((details.hourlyBreakdown as { requests?: unknown[] })?.requests) ? (details.hourlyBreakdown as { requests: Array<[string, number]> }).requests : [],
          savings: Array.isArray((details.hourlyBreakdown as { savings?: unknown[] })?.savings) ? (details.hourlyBreakdown as { savings: Array<[string, number]> }).savings : []
        }
      },
      raw: {
        totalRequests: Number(raw.totalRequests ?? 0),
        totalTokensIn: Number(raw.totalTokensIn ?? 0),
        totalTokensOut: Number(raw.totalTokensOut ?? 0),
        totalTokensSaved: Number(raw.totalTokensSaved ?? 0),
        averageSavingsPercent: Number(raw.averageSavingsPercent ?? 0),
        startTime: typeof raw.startTime === 'string' ? raw.startTime : new Date().toISOString(),
        lastUpdate: typeof raw.lastUpdate === 'string' ? raw.lastUpdate : new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('Failed to fetch optimization stats:', error)
    throw error
  }
}

export const fetchSecurityMetrics = async (): Promise<SecurityMetrics> => {
  try {
    // No security metrics endpoint yet; return empty structure so UI shows real state
    return {
      secretsDetected: 0,
      rateLimitViolations: 0,
      securityErrors: 0,
      recentSecurityEvents: [],
      secretTypes: []
    }
  } catch (error) {
    console.error('Failed to fetch security metrics:', error)
    throw error
  }
}

export const fetchServerStatus = async (): Promise<ServerStatus[]> => {
  try {
    const servers = await api.get<Array<{
      name: string
      url: string
      connected: boolean
      lastSeen: string
      requests: number
      errors: number
      responseTime: number
      tools: Array<{ name: string; description: string }>
    }>>('/servers')
    return Array.isArray(servers) ? servers : []
  } catch (error) {
    console.error('Failed to fetch server status:', error)
    throw error
  }
}

export const exportOptimizationData = async (
  format: string = 'json',
  period: string = 'week',
  includeDetails: boolean = true
): Promise<{ success: boolean; url?: string }> => {
  try {
    const token = getAuthToken()
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

    const res = await axios.post<{
      success: boolean
      report?: { path: string; downloadUrl: string; size?: number }
    }>(
      '/api/reports/export',
      { format, period, includeDetails },
      { headers: { 'Content-Type': 'application/json', ...authHeaders } }
    )

    if (!res.data.success || !res.data.report?.downloadUrl) {
      return { success: false }
    }

    const downloadUrl = res.data.report.downloadUrl
    const filename = res.data.report.path.split('/').pop() || `optimization-report.${format}`

    const fileRes = await axios.get(downloadUrl, {
      responseType: 'blob',
      headers: authHeaders
    })

    const blob = new Blob([fileRes.data])
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    return { success: true, url: downloadUrl }
  } catch (error) {
    console.error('Failed to export optimization data:', error)
    throw error
  }
}

export const resetStatistics = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const data = await api.post<{ success: boolean; message?: string }>('/stats/reset')
    return {
      success: data.success === true,
      message: data.message ?? (data.success ? 'Statistics have been reset successfully' : 'Reset failed')
    }
  } catch (error) {
    console.error('Failed to reset statistics:', error)
    throw error
  }
}

export default {
  fetchDashboardData,
  fetchOptimizationStats,
  fetchSecurityMetrics,
  fetchServerStatus,
  exportOptimizationData,
  resetStatistics
}