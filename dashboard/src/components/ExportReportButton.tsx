import { useState } from 'react'
import { FiDownload, FiFileText, FiFile, FiCheck, FiAlertCircle } from 'react-icons/fi'

interface ExportReportButtonProps {
  onExport?: (format: string, period: string, includeDetails: boolean) => Promise<void>
}

const ExportReportButton = ({ onExport }: ExportReportButtonProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [exportConfig, setExportConfig] = useState({
    format: 'json',
    period: 'week',
    includeDetails: true
  })

  const formats = [
    { value: 'json', label: 'JSON', description: 'Structured data with full details' },
    { value: 'csv', label: 'CSV', description: 'Spreadsheet-friendly format' }
  ]

  const periods = [
    { value: 'day', label: 'Last 24 hours' },
    { value: 'week', label: 'Last 7 days' },
    { value: 'month', label: 'Last 30 days' },
    { value: 'all', label: 'All time' }
  ]

  const handleExport = async () => {
    if (isExporting) return

    setIsExporting(true)
    setExportStatus('idle')
    setErrorMessage('')

    try {
      if (onExport) {
        await onExport(exportConfig.format, exportConfig.period, exportConfig.includeDetails)
      } else {
        // Default implementation
        await exportReport(exportConfig.format, exportConfig.period, exportConfig.includeDetails)
      }
      
      setExportStatus('success')
      setTimeout(() => {
        setIsOpen(false)
        setExportStatus('idle')
      }, 2000)
    } catch (error) {
      console.error('Export failed:', error)
      setExportStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to export report')
    } finally {
      setIsExporting(false)
    }
  }

  const exportReport = async (format: string, period: string, includeDetails: boolean) => {
    const response = await fetch('/api/reports/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format, period, includeDetails })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Export failed')
    }

    const result = await response.json()
    
    // Trigger download
    if (result.report?.downloadUrl) {
      const link = document.createElement('a')
      link.href = result.report.downloadUrl
      link.download = result.report.path.split('/').pop() || `report.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-primary flex items-center"
        disabled={isExporting}
      >
        <FiDownload className="mr-2 h-4 w-4" />
        Export Report
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="absolute right-0 mt-2 w-80 z-50">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Export Report</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              {exportStatus === 'success' ? (
                <div className="text-center py-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-success-100 mb-4">
                    <FiCheck className="h-6 w-6 text-success-600" />
                  </div>
                  <p className="text-success-700 font-medium">Report exported successfully!</p>
                  <p className="text-gray-600 text-sm mt-1">Check your downloads folder</p>
                </div>
              ) : exportStatus === 'error' ? (
                <div className="mb-4">
                  <div className="rounded-md bg-danger-50 p-4">
                    <div className="flex">
                      <FiAlertCircle className="h-5 w-5 text-danger-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-danger-800">
                          Export Failed
                        </h3>
                        <div className="mt-2 text-sm text-danger-700">
                          <p>{errorMessage}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setExportStatus('idle')}
                    className="mt-2 text-sm text-primary-600 hover:text-primary-800"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  {/* Format Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Format
                    </label>
                    <div className="space-y-2">
                      {formats.map((format) => (
                        <label
                          key={format.value}
                          className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                            exportConfig.format === format.value
                              ? 'border-primary-500 bg-primary-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="format"
                            value={format.value}
                            checked={exportConfig.format === format.value}
                            onChange={(e) => setExportConfig({ ...exportConfig, format: e.target.value })}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500"
                          />
                          <div className="ml-3">
                            <div className="flex items-center">
                              {format.value === 'json' ? (
                                <FiFileText className="h-5 w-5 text-gray-400 mr-2" />
                              ) : (
                                <FiFile className="h-5 w-5 text-gray-400 mr-2" />
                              )}
                              <span className="font-medium text-gray-900">{format.label}</span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{format.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Period Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time Period
                    </label>
                    <select
                      value={exportConfig.period}
                      onChange={(e) => setExportConfig({ ...exportConfig, period: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      {periods.map((period) => (
                        <option key={period.value} value={period.value}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Include Details */}
                  <div className="mb-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={exportConfig.includeDetails}
                        onChange={(e) => setExportConfig({ ...exportConfig, includeDetails: e.target.checked })}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        Include detailed breakdown
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      Adds hourly statistics, top queries, and recommendations
                    </p>
                  </div>

                  {/* Export Button */}
                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="w-full btn-primary flex items-center justify-center"
                  >
                    {isExporting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Exporting...
                      </>
                    ) : (
                      <>
                        <FiDownload className="mr-2 h-4 w-4" />
                        Export Report
                      </>
                    )}
                  </button>

                  {/* File Size Estimate */}
                  <div className="mt-3 text-center">
                    <p className="text-xs text-gray-500">
                      Estimated size: {exportConfig.format === 'json' ? '~50-100KB' : '~20-50KB'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ExportReportButton