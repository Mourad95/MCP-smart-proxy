import { FiShield } from 'react-icons/fi'

const SecurityMonitoring = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center">
          <FiShield className="h-6 w-6 text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Monitoring</h1>
          <p className="text-gray-600">
            Overview of secret masking and security-related events (placeholder view).
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-gray-700">
          Security monitoring UI is not fully implemented yet. The proxy already supports secret masking
          and basic metrics; this page will later surface those details in a dedicated view.
        </p>
      </div>
    </div>
  )
}

export default SecurityMonitoring

