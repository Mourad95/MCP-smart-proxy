import { useEffect, useState } from 'react'
import { FiBarChart2 } from 'react-icons/fi'
import { fetchOptimizationStats, OptimizationStats as OptimizationStatsType } from '../services/api'

const OptimizationStats = () => {
  const [stats, setStats] = useState<OptimizationStatsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchOptimizationStats()
        setStats(data)
        setError(null)
      } catch {
        setError('Failed to load optimization statistics')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading && !stats) {
    return <p className="text-gray-600">Loading optimization statistics...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <FiBarChart2 className="h-6 w-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Optimization Statistics</h1>
          <p className="text-gray-600">
            Token savings, cache efficiency and optimization performance over time.
          </p>
        </div>
      </div>

      <div className="card whitespace-pre-line text-sm text-gray-800">
        {stats.summary}
      </div>

      {/* Detailed charts could go here; for now we only show the summary text */}
    </div>
  )
}

export default OptimizationStats

