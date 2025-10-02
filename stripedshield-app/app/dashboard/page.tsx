'use client'

import { useEffect, useState } from 'react'
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Shield, TrendingUp, AlertCircle, CheckCircle, Clock, DollarSign } from 'lucide-react'
import { ConnectStripe } from '@/components/ConnectStripe'
import { BillingCTA } from '@/components/BillingCTA'
import { ManageBillingButton } from '@/components/ManageBillingButton'
import toast, { Toaster } from 'react-hot-toast'

interface Dispute {
  id: string
  caseId: string
  amount: number
  status: 'pending' | 'won' | 'lost' | 'processing'
  reason: string
  created: string
  createdAt: string
  currency: string
  evidence_score?: number
  win_probability?: number
  ce3?: boolean
}

interface Stats {
  totalDisputes: number
  wonDisputes: number
  winRate: number
  revenueRecovered: number
  pendingDisputes: number
}

export default function Dashboard() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [stats, setStats] = useState<Stats>({
    totalDisputes: 0,
    wonDisputes: 0,
    winRate: 0,
    revenueRecovered: 0,
    pendingDisputes: 0
  })
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [isTrialing, setIsTrialing] = useState(true)
  const [trialDaysLeft] = useState(14)
  
  useEffect(() => {
    // Check URL params for connection status
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected')) {
      setConnected(true)
      toast.success('Stripe account connected successfully!')
    }
    if (params.get('subscription') === 'success') {
      toast.success('Subscription activated! Welcome to StripedShield.')
      setIsTrialing(false)
    }
    if (params.get('open') === 'checkout') {
      // Auto-open checkout
      handleCheckout()
    }
    
    // Fetch data
    fetchData()
    
    // Real-time updates every 30 seconds
    const interval = setInterval(fetchData, 30000)
    
    return () => clearInterval(interval)
  }, [])
  
  const fetchData = async () => {
    setLoading(true)
    try {
      // Check health
      const healthRes = await fetch('/api/backend/health')
      const health = await healthRes.json()
      
      if (!health.ok) {
        toast.error('Backend is currently unavailable')
      }
      
      // Fetch cases
      const casesRes = await fetch('/api/backend/cases')
      const casesData = await casesRes.json()
      
      if (casesData.items) {
        setDisputes(casesData.items)
        
        // Calculate stats
        const total = casesData.items.length
        const won = casesData.items.filter((d: Dispute) => d.status === 'won').length
        const pending = casesData.items.filter((d: Dispute) => d.status === 'pending' || d.status === 'processing').length
        const recovered = casesData.items
          .filter((d: Dispute) => d.status === 'won')
          .reduce((sum: number, d: Dispute) => sum + (d.amount || 0), 0)
        
        setStats({
          totalDisputes: total,
          wonDisputes: won,
          winRate: total > 0 ? Math.round((won / total) * 100) : 0,
          revenueRecovered: recovered / 100, // Convert from cents
          pendingDisputes: pending
        })
      }
      
      // Check if Stripe is connected
      const cookies = document.cookie.split(';')
      const hasStripeAccount = cookies.some(c => c.trim().startsWith('ss_acct='))
      setConnected(hasStripeAccount)
      
    } catch (error) {
      console.error('Dashboard error:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }
  
  const handleCheckout = async () => {
    try {
      const res = await fetch('/api/billing/checkout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch (error) {
      toast.error('Failed to start checkout')
    }
  }
  
  // Chart data
  const winRateData = [
    { date: 'Mon', rate: 65 },
    { date: 'Tue', rate: 68 },
    { date: 'Wed', rate: 67 },
    { date: 'Thu', rate: 70 },
    { date: 'Fri', rate: 68 },
    { date: 'Sat', rate: 69 },
    { date: 'Sun', rate: 68 },
  ]
  
  const reasonData = [
    { reason: 'Fraudulent', amount: 12500 },
    { reason: 'Unrecognized', amount: 8900 },
    { reason: 'Not Received', amount: 6700 },
    { reason: 'Unacceptable', amount: 4300 },
    { reason: 'Other', amount: 2100 },
  ]
  
  if (loading && disputes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
              {connected && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Stripe Connected
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!connected && <ConnectStripe />}
              {connected && isTrialing && <BillingCTA />}
              {connected && !isTrialing && <ManageBillingButton />}
            </div>
          </div>
        </div>
      </header>
      
      {/* Trial Banner */}
      {isTrialing && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <span className="text-sm text-yellow-800 dark:text-yellow-200">
                  Trial Period: {trialDaysLeft} days remaining
                </span>
              </div>
              <button
                onClick={handleCheckout}
                className="text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:text-yellow-900 dark:hover:text-yellow-100"
              >
                Upgrade Now →
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Win Rate"
            value={`${stats.winRate}%`}
            icon={<TrendingUp className="h-6 w-6" />}
            color="green"
            subtitle="28% above industry"
          />
          <StatCard
            title="Revenue Recovered"
            value={`$${stats.revenueRecovered.toLocaleString()}`}
            icon={<DollarSign className="h-6 w-6" />}
            color="blue"
            subtitle="This month"
          />
          <StatCard
            title="Pending Disputes"
            value={stats.pendingDisputes}
            icon={<Clock className="h-6 w-6" />}
            color="yellow"
            subtitle="Being processed"
          />
          <StatCard
            title="Total Disputes"
            value={stats.totalDisputes}
            icon={<Shield className="h-6 w-6" />}
            color="purple"
            subtitle="All time"
          />
        </div>
      </div>
      
      {/* Charts */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Win Rate Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={winRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recovery by Reason</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reasonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="reason" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Bar dataKey="amount" fill="#8B5CF6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Disputes Table */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recent Disputes</h3>
            <DisputesTable disputes={disputes} />
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: 'green' | 'blue' | 'yellow' | 'purple'
  subtitle: string
}

function StatCard({ title, value, icon, color, subtitle }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">{title}</div>
      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{subtitle}</div>
    </div>
  )
}

function DisputesTable({ disputes }: { disputes: Dispute[] }) {
  const getStatusBadge = (status: string) => {
    const classes = {
      won: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      lost: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      processing: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    }
    return classes[status as keyof typeof classes] || classes.pending
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Case ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CE3.0</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {disputes.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                No disputes yet. Connect your Stripe account to start.
              </td>
            </tr>
          ) : (
            disputes.slice(0, 10).map((dispute) => (
              <tr key={dispute.id || dispute.caseId}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {dispute.caseId || dispute.id}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  ${((dispute.amount || 0) / 100).toLocaleString()} {dispute.currency?.toUpperCase() || 'USD'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(dispute.status)}`}>
                    {dispute.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {dispute.reason || 'Unknown'}
                </td>
                <td className="px-4 py-3">
                  {dispute.ce3 ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      Eligible
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  {new Date(dispute.createdAt || dispute.created).toLocaleDateString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}