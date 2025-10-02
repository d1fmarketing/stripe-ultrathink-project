'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

export function ROICalculator() {
  const [monthlyChargebacks, setMonthlyChargebacks] = useState(25000)
  const [currentRecovery, setCurrentRecovery] = useState(40)
  
  const ourRecovery = monthlyChargebacks * 0.68
  const currentRecoveryAmount = monthlyChargebacks * (currentRecovery / 100)
  const additionalRecovery = ourRecovery - currentRecoveryAmount
  const monthlyROI = additionalRecovery > 599 ? ((additionalRecovery - 599) / 599) * 100 : 0
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-900 p-8 rounded-2xl shadow-xl"
    >
      <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Calculate Your ROI</h3>
      
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-400">Monthly Chargebacks ($)</label>
          <input
            type="number"
            value={monthlyChargebacks}
            onChange={(e) => setMonthlyChargebacks(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-400">Current Recovery Rate (%)</label>
          <input
            type="range"
            min="0"
            max="100"
            value={currentRecovery}
            onChange={(e) => setCurrentRecovery(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-center text-lg font-semibold text-gray-700 dark:text-gray-300">{currentRecovery}%</div>
        </div>
      </div>
      
      <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-inner">
        <div className="flex justify-between py-2 border-b dark:border-gray-700">
          <span className="text-gray-600 dark:text-gray-400">You Currently Recover:</span>
          <span className="font-semibold text-gray-900 dark:text-white">${currentRecoveryAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between py-2 text-green-600 dark:text-green-400 border-b dark:border-gray-700">
          <span>With StripedShield (68%):</span>
          <span className="font-bold">${ourRecovery.toLocaleString()}</span>
        </div>
        <div className="flex justify-between py-2 text-blue-600 dark:text-blue-400 text-lg">
          <span>Additional Recovery:</span>
          <span className="font-bold">+${additionalRecovery.toLocaleString()}</span>
        </div>
        <div className="border-t dark:border-gray-700 mt-4 pt-4">
          <div className="flex justify-between text-xl">
            <span className="text-gray-900 dark:text-white">Monthly ROI:</span>
            <span className="font-bold text-green-600 dark:text-green-400">{monthlyROI.toFixed(0)}%</span>
          </div>
        </div>
      </div>
      
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 rounded-lg font-semibold text-lg shadow-lg"
        onClick={() => window.location.href = '/dashboard'}
      >
        Start Free 14-Day Trial →
      </motion.button>
    </motion.div>
  )
}