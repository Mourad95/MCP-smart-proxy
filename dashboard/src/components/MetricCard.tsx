import { IconType } from 'react-icons'
import { FiTrendingUp, FiTrendingDown } from 'react-icons/fi'

interface MetricCardProps {
  title: string
  value: string
  change: string
  icon: IconType
  color: 'primary' | 'success' | 'warning' | 'danger'
  description: string
}

const MetricCard = ({ title, value, change, icon: Icon, color, description }: MetricCardProps) => {
  const colorClasses = {
    primary: {
      bg: 'bg-primary-100',
      text: 'text-primary-600',
      border: 'border-primary-200'
    },
    success: {
      bg: 'bg-success-100',
      text: 'text-success-600',
      border: 'border-success-200'
    },
    warning: {
      bg: 'bg-warning-100',
      text: 'text-warning-600',
      border: 'border-warning-200'
    },
    danger: {
      bg: 'bg-danger-100',
      text: 'text-danger-600',
      border: 'border-danger-200'
    }
  }

  const isPositive = !change.includes('-') && !change.toLowerCase().includes('issues')

  return (
    <div className={`metric-card border-l-4 ${colorClasses[color].border}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <div className={`${colorClasses[color].bg} p-2 rounded-lg mr-3`}>
              <Icon className={`h-5 w-5 ${colorClasses[color].text}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <div className="flex items-center mt-1">
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <div className={`ml-3 flex items-center ${isPositive ? 'text-success-600' : 'text-danger-600'}`}>
                  {isPositive ? (
                    <FiTrendingUp className="h-4 w-4 mr-1" />
                  ) : (
                    <FiTrendingDown className="h-4 w-4 mr-1" />
                  )}
                  <span className="text-sm font-medium">{change}</span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-3">{description}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Last 24h</span>
          <span className="font-medium text-gray-900">+12.5%</span>
        </div>
      </div>
    </div>
  )
}

export default MetricCard