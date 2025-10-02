'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Shield, TrendingUp, Clock, AlertCircle } from 'lucide-react'

interface HealthData {
  ok: boolean
  degraded?: boolean
  service?: string
  version?: string
  checks?: Record<string, { ok: boolean; error?: string }>
}

export default function DemoPage() {
  const [healthData, setHealthData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch real backend data
    fetch('/api/backend/health')
      .then(res => res.json())
      .then(data => {
        setHealthData(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                StripedShield Demo
              </h1>
            </div>
            <Link
              href="/api/stripe/connect-simple"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Connect Stripe Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Win Rate
                    </dt>
                    <dd className="text-3xl font-semibold text-gray-900 dark:text-white">
                      68%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Response Time
                    </dt>
                    <dd className="text-3xl font-semibold text-gray-900 dark:text-white">
                      562ms
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Disputes Won
                    </dt>
                    <dd className="text-3xl font-semibold text-gray-900 dark:text-white">
                      1,247
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <span className="text-2xl">💰</span>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Recovered
                    </dt>
                    <dd className="text-3xl font-semibold text-gray-900 dark:text-white">
                      $142k
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Backend Status */}
        <div className="mt-8 bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
              Backend Connection Status
            </h3>
            {loading && (
              <div className="text-gray-500">Connecting to backend...</div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <div className="flex">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
                  <div>
                    <h4 className="text-red-800 font-semibold">Connection Error</h4>
                    <p className="text-red-600">{error}</p>
                  </div>
                </div>
              </div>
            )}
            {healthData && (
              <div className="space-y-3">
                <div className="flex items-center">
                  <div className={`h-3 w-3 rounded-full mr-2 ${healthData.ok ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-gray-700 dark:text-gray-300">
                    System Status: {healthData.ok ? 'Operational' : 'Issues Detected'}
                  </span>
                </div>
                {healthData.degraded && (
                  <div className="text-yellow-600">
                    ⚠️ System is degraded but functional
                  </div>
                )}
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Service: {healthData.service} v{healthData.version}
                </div>
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Component Status:
                  </h4>
                  <div className="space-y-1">
                    {healthData.checks && Object.entries(healthData.checks).map(([key, value]) => (
                      <div key={key} className="flex items-center text-sm">
                        <div className={`h-2 w-2 rounded-full mr-2 ${value.ok ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-gray-600 dark:text-gray-400">
                          {key}: {value.ok ? 'Healthy' : value.error || 'Error'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-xl">
          <div className="px-4 py-8 sm:px-6 sm:py-10 text-center">
            <h2 className="text-3xl font-extrabold text-white">
              Ready to Win More Disputes?
            </h2>
            <p className="mt-3 text-xl text-blue-100">
              Connect your Stripe account to start winning 68% of chargebacks
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/api/stripe/connect-simple"
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50"
              >
                Connect Stripe Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <a
                href="https://buy.stripe.com/test_founder"
                className="inline-flex items-center justify-center px-6 py-3 border border-white text-base font-medium rounded-md text-white hover:bg-blue-700"
              >
                Start Free Trial - $599/mo
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}