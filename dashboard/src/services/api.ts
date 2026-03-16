import axios from 'axios'

const API_BASE_URL = '/api'

// Create axios instance with auth token handling
const api = axios.create({
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
    // In a real implementation, this would fetch from the proxy API
    // For now, return mock data that matches the expected structure
    
    // Generate mock hourly data for the last 24 hours
    const hourlyStats = Array.from({ length: 24 }, (_, i) => {
      const hour = new Date()
      hour.setHours(hour.getHours() - (23 - i))
      return {
        hour: hour.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        requests: Math.floor(Math.random() * 50) + 20,
        savings: Math.floor(Math.random() * 10000) + 5000
      }
    })

    // Generate mock recent requests
    const recentRequests = Array.from({ length: 10 }, (_, i) => {
      const queries = [
        'Read file example.txt',
        'Search for documentation',
        'List GitHub repositories',
        'Create new file',
        'Analyze code structure',
        'Search web for information',
        'Get weather forecast',
        'Translate text to French',
        'Calculate mathematical expression',
        'Generate code snippet'
      ]
      return {
        query: queries[i % queries.length],
        savingsPercent: Math.random() * 50 + 30, // 30-80%
        responseTime: Math.floor(Math.random() * 200) + 50, // 50-250ms
        timestamp: new Date(Date.now() - i * 60000).toISOString() // Last 10 minutes
      }
    })

    // Generate mock top tools
    const topTools = [
      { tool: 'read_file', count: 142 },
      { tool: 'search_files', count: 98 },
      { tool: 'github_repos', count: 76 },
      { tool: 'web_search', count: 54 },
      { tool: 'write_file', count: 43 }
    ]

    return {
      optimization: {
        totalRequests: 1242,
        averageSavings: 68.5,
        cache: {
          size: 342,
          hitRate: 72.3
        }
      },
      servers: {
        configured: 3,
        connected: 3
      },
      recentRequests,
      hourlyStats,
      topTools
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    throw error
  }
}

export const fetchOptimizationStats = async (): Promise<OptimizationStats> => {
  try {
    // Mock data for optimization stats
    const hoursRunning = 48.5
    const totalRequests = 1242
    const totalTokensSaved = 125800
    
    return {
      summary: `Optimization Statistics:
• Total Requests: 1,242
• Total Tokens In: 183,500
• Total Tokens Out: 57,700
• Total Tokens Saved: 125,800 (68.5%)
• Estimated Cost Saved: $1.26
• Running Since: ${new Date(Date.now() - 48.5 * 60 * 60 * 1000).toLocaleString()}
• Requests/Hour: 25.6
• Tokens Saved/Hour: 2,593`,
      details: {
        hoursRunning: hoursRunning.toFixed(1),
        requestsPerHour: (totalRequests / hoursRunning).toFixed(1),
        tokensSavedPerHour: Math.round(totalTokensSaved / hoursRunning),
        estimatedCostSaved: '1.26',
        topTools: [
          { tool: 'read_file', count: 142 },
          { tool: 'search_files', count: 98 },
          { tool: 'github_repos', count: 76 },
          { tool: 'web_search', count: 54 },
          { tool: 'write_file', count: 43 }
        ],
        topQueriesBySavings: [
          { query: 'Analyze large codebase', savingsPercent: 82.5, count: 12 },
          { query: 'Search documentation', savingsPercent: 78.3, count: 24 },
          { query: 'Read configuration files', savingsPercent: 75.6, count: 18 },
          { query: 'GitHub repository analysis', savingsPercent: 72.1, count: 15 },
          { query: 'Web search results', savingsPercent: 68.9, count: 22 }
        ],
        hourlyBreakdown: {
          requests: Array.from({ length: 24 }, (_, i) => [
            `${i}:00`,
            Math.floor(Math.random() * 30) + 10
          ]),
          savings: Array.from({ length: 24 }, (_, i) => [
            `${i}:00`,
            Math.floor(Math.random() * 8000) + 2000
          ])
        }
      },
      raw: {
        totalRequests,
        totalTokensIn: 183500,
        totalTokensOut: 57700,
        totalTokensSaved,
        averageSavingsPercent: 68.5,
        startTime: new Date(Date.now() - 48.5 * 60 * 60 * 1000).toISOString(),
        lastUpdate: new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('Failed to fetch optimization stats:', error)
    throw error
  }
}

export const fetchSecurityMetrics = async (): Promise<SecurityMetrics> => {
  try {
    // Mock security metrics
    return {
      secretsDetected: 42,
      rateLimitViolations: 3,
      securityErrors: 1,
      recentSecurityEvents: [
        {
          type: 'secret_detection',
          message: 'API key detected and masked in response',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          severity: 'medium'
        },
        {
          type: 'rate_limit',
          message: 'Rate limit exceeded for IP 192.168.1.100',
          timestamp: new Date(Date.now() - 900000).toISOString(),
          severity: 'low'
        },
        {
          type: 'secret_detection',
          message: 'Database URL detected and masked',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          severity: 'high'
        },
        {
          type: 'security_error',
          message: 'Invalid authentication attempt',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          severity: 'medium'
        }
      ],
      secretTypes: [
        { type: 'api_key', count: 28, lastDetected: new Date().toISOString() },
        { type: 'database_url', count: 8, lastDetected: new Date(Date.now() - 1800000).toISOString() },
        { type: 'jwt_token', count: 4, lastDetected: new Date(Date.now() - 3600000).toISOString() },
        { type: 'email', count: 2, lastDetected: new Date(Date.now() - 7200000).toISOString() }
      ]
    }
  } catch (error) {
    console.error('Failed to fetch security metrics:', error)
    throw error
  }
}

export const fetchServerStatus = async (): Promise<ServerStatus[]> => {
  try {
    // Mock server status
    return [
      {
        name: 'filesystem',
        url: 'ws://localhost:8080',
        connected: true,
        lastSeen: new Date().toISOString(),
        requests: 542,
        errors: 2,
        responseTime: 45,
        tools: [
          { name: 'read_file', description: 'Read contents of a file' },
          { name: 'write_file', description: 'Write content to a file' },
          { name: 'list_directory', description: 'List files in a directory' },
          { name: 'search_files', description: 'Search for files by pattern' }
        ]
      },
      {
        name: 'github',
        url: 'ws://localhost:8081',
        connected: true,
        lastSeen: new Date(Date.now() - 60000).toISOString(),
        requests: 324,
        errors: 0,
        responseTime: 120,
        tools: [
          { name: 'list_repos', description: 'List GitHub repositories' },
          { name: 'read_file', description: 'Read file from GitHub repository' },
          { name: 'search_code', description: 'Search code in repositories' },
          { name: 'create_issue', description: 'Create a new issue' }
        ]
      },
      {
        name: 'search',
        url: 'ws://localhost:8082',
        connected: false,
        lastSeen: new Date(Date.now() - 300000).toISOString(),
        requests: 0,
        errors: 5,
        responseTime: 0,
        tools: []
      }
    ]
  } catch (error) {
    console.error('Failed to fetch server status:', error)
    throw error
  }
}

export const exportOptimizationData = async (format: string = 'json'): Promise<{ success: boolean; url?: string }> => {
  try {
    // In a real implementation, this would trigger a download
    console.log(`Exporting optimization data in ${format} format`)
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    return {
      success: true,
      url: `/api/export/optimization-${Date.now()}.${format}`
    }
  } catch (error) {
    console.error('Failed to export optimization data:', error)
    throw error
  }
}

export const resetStatistics = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // In a real implementation, this would call the proxy API
    console.log('Resetting statistics')
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    
    return {
      success: true,
      message: 'Statistics have been reset successfully'
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