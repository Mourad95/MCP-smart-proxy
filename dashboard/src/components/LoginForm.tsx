import React, { useState } from 'react'
import { Lock, AlertCircle, CheckCircle } from 'react-icons/fa'

interface LoginFormProps {
  onLogin: (password: string) => Promise<boolean>
  isAuthRequired: boolean
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin, isAuthRequired }) => {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!password.trim()) {
      setError('Password is required')
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const result = await onLogin(password)
      if (result) {
        setSuccess(true)
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setError('Invalid password')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  // If authentication is not required, show info message
  if (!isAuthRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Dashboard Access
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Authentication is not required for this dashboard.
              <br />
              <span className="text-blue-600 font-medium">
                (DASHBOARD_PASSWORD is not set in environment)
              </span>
            </p>
          </div>
          <div className="mt-8 space-y-6">
            <div className="rounded-md bg-blue-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-blue-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Development Mode
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>
                      For production use, set the <code className="bg-blue-100 px-1 rounded">DASHBOARD_PASSWORD</code> environment variable.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <button
                onClick={() => window.location.reload()}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Continue to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            MCP Proxy Dashboard
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter the dashboard password to continue
          </p>
        </div>
        
        {success ? (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Login Successful!
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Redirecting to dashboard...</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      {error}
                    </h3>
                  </div>
                </div>
              </div>
            )}
            
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="password" className="sr-only">
                  Dashboard Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Dashboard Password"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    </span>
                    Signing in...
                  </>
                ) : (
                  <>
                    <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-blue-500 group-hover:text-blue-400" aria-hidden="true" />
                    </span>
                    Sign in
                  </>
                )}
              </button>
            </div>

            <div className="text-sm text-center text-gray-600">
              <p>
                The password is set via the <code className="bg-gray-100 px-1 rounded">DASHBOARD_PASSWORD</code> environment variable.
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default LoginForm