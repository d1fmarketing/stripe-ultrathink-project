'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false)
  
  const openPortal = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/billing/portal', { 
        method: 'POST' 
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          toast.error('No subscription found. Please subscribe first.')
        } else {
          throw new Error('Failed to open billing portal')
        }
        return
      }
      
      const { url } = await response.json()
      
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      console.error('Portal error:', error)
      toast.error('Failed to open billing portal. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <button 
      onClick={openPortal}
      disabled={loading}
      className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Loading...' : 'Manage Billing'}
    </button>
  )
}