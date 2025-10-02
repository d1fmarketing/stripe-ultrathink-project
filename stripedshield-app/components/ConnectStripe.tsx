'use client'

export function ConnectStripe() {
  const start = () => {
    window.location.href = '/api/stripe/connect/start'
  }
  
  return (
    <button 
      onClick={start} 
      className="inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
    >
      Connect Stripe Account
    </button>
  )
}