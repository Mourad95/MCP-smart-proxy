import { useEffect, useState } from 'react'
import { FiServer } from 'react-icons/fi'
import { fetchServerStatus, ServerStatus as ServerStatusType } from '../services/api'

const ServerStatus = () => {
  const [servers, setServers] = useState<ServerStatusType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchServerStatus()
        setServers(data)
        setError(null)
      } catch {
        setError('Failed to load server status')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading && servers.length === 0) {
    return <p className="text-gray-600">Loading server status...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <FiServer className="h-6 w-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MCP Server Status</h1>
          <p className="text-gray-600">
            Connection state and basic metrics for each configured MCP server.
          </p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Connected
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Requests
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Errors
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {servers.map((server) => (
              <tr key={server.name}>
                <td className="px-4 py-3 text-sm text-gray-900">{server.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{server.url}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      server.connected
                        ? 'bg-success-100 text-success-800'
                        : 'bg-danger-100 text-danger-800'
                    }`}
                  >
                    {server.connected ? 'Connected' : 'Disconnected'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{server.requests}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{server.errors}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {new Date(server.lastSeen).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ServerStatus

