import { ReactNode, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { FiLock, FiAlertCircle } from 'react-icons/fi'
import { checkAuthStatus, login, verifyToken, logout, getAuthToken } from '../services/api'

interface AuthGuardProps {
  children: ReactNode
}

const AuthGuard = ({ children }: AuthGuardProps) => {
  const [authState, setAuthState] = useState<{
    isAuthenticated: boolean | null
    requiresAuth: boolean | null
    error: string
    loading: boolean
  }>({
    isAuthenticated: null,
    requiresAuth: null,
    error: '',
    loading: false
  })
  
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  // Check authentication status
  const checkAuth = async () => {
    try {
      const { requiresAuth, hasPassword } = await checkAuthStatus()
      
      // If no auth required, allow access
      if (!requiresAuth) {
        setAuthState({
          isAuthenticated: true,
          requiresAuth: false,
          error: '',
          loading: false
        })
        return
      }

      // Check if we have a valid token
      const token = getAuthToken()
      if (token) {
        const isValid = await verifyToken()
        if (isValid) {
          setAuthState({
            isAuthenticated: true,
            requiresAuth: true,
            error: '',
            loading: false
          })
          return
        }
      }

      // No valid token, show login
      setAuthState({
        isAuthenticated: false,
        requiresAuth: true,
        error: '',
        loading: false
      })
      
    } catch (error) {
      console.error('Auth check failed:', error)
      // In development, allow access even if API fails
      if (import.meta.env.DEV) {
        setAuthState({
          isAuthenticated: true,
          requiresAuth: false,
          error: '',
          loading: false
        })
      } else {
        setAuthState({
          isAuthenticated: false,
          requiresAuth: true,
          error: 'Failed to check authentication status',
          loading: false
        })
      }
    }
  }

  useEffect(() => {
    checkAuth()
    
    // Listen for auth-required events from API interceptor
    const handleAuthRequired = () => {
      setAuthState(prev => ({
        ...prev,
        isAuthenticated: false,
        error: 'Your session has expired. Please login again.'
      }))
    }
    
    window.addEventListener('auth-required', handleAuthRequired)
    return () => window.removeEventListener('auth-required', handleAuthRequired)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthState(prev => ({ ...prev, loading: true, error: '' }))
    
    try {
      const result = await login(password)
      
      if (result.success) {
        setAuthState({
          isAuthenticated: true,
          requiresAuth: true,
          error: '',
          loading: false
        })
        navigate(location.pathname, { replace: true })
      } else {
        setAuthState(prev => ({
          ...prev,
          error: result.message || 'Authentication failed',
          loading: false
        }))
      }
    } catch (err) {
      setAuthState(prev => ({
        ...prev,
        error: 'Network error. Please try again.',
        loading: false
      }))
      console.error('Login error:', err)
    }
  }

  const handleLogout = async () => {
    await logout()
    setAuthState({
      isAuthenticated: false,
      requiresAuth: true,
      error: '',
      loading: false
    })
    navigate('/')
  }

  // Show loading state
  if (authState.isAuthenticated === null || authState.requiresAuth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Show login form if not authenticated but auth is required
  if (!authState.isAuthenticated && authState.requiresAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
              <FiLock className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-gray-900">MCP Proxy Dashboard</h2>
            <p className="mt-2 text-gray-600">
              Enter the dashboard password to continue
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Dashboard password"
                  disabled={authState.loading}
                />
              </div>
            </div>

            {authState.error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <FiAlertCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Authentication Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{authState.error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={authState.loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authState.loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Authenticating...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                The password is set via the <code className="bg-gray-100 px-1 rounded">DASHBOARD_PASSWORD</code> environment variable.
              </p>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // If auth is not required, show info message
  if (!authState.requiresAuth) {
    return (
      <div className="relative">
        {/* Info banner when auth is not required */}
        <div className="bg-blue-50 border-b border-blue-200 p-3 text-center">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Development Mode:</span> Authentication is not required. 
            Set <code className="bg-blue-100 px-1 rounded">DASHBOARD_PASSWORD</code> in production.
          </p>
        </div>
        {children}
      </div>
    )
  }

  // Render children with auth context (authenticated and auth required)
  return (
    <div className="relative">
      {/* Logout button in top right */}
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={handleLogout}
          className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Logout"
        >
          <FiLock className="h-4 w-4 mr-2" />
          Logout
        </button>
      </div>
      {children}
    </div>
  )
}

export default AuthGuard