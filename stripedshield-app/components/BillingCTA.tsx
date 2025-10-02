'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

export function BillingCTA() {
  const [loading, setLoading] = useState(false)
  
  const checkout = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/billing/checkout', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_FOUNDER_PRICE_ID
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to create checkout session')
      }
      
      const { url } = await response.json()
      
      if (url) {
        window.location.href = url
      } else {
        throw new Error('No checkout URL received')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error('Failed to start checkout. Please try again.')
      setLoading(false)
    }
  }
  
  return (
    <button 
      onClick={checkout}
      disabled={loading}
      className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Loading...' : 'Start Founder Plan – $599/mo'}
    </button>
  )
}