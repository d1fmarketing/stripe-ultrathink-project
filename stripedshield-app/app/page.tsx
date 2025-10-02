import Link from 'next/link'
import { ROICalculator } from '@/components/ROICalculator'
import { Shield, TrendingUp, Clock, CheckCircle, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="absolute inset-0 bg-grid-gray-100 dark:bg-grid-gray-800 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium animate-pulse">
              🚀 Founder Program Open – 10 Spots at $599/mo
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 dark:text-white">
              Win <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">68%</span> of Stripe Disputes
              <br />
              <span className="text-3xl sm:text-4xl lg:text-5xl text-gray-600 dark:text-gray-400">Automatically</span>
            </h1>
            
            <p className="max-w-3xl mx-auto text-xl text-gray-600 dark:text-gray-400">
              Stop losing money to chargebacks. Our AI-powered system achieves a 68% win rate 
              (vs 40% industry average) and processes disputes in under 1 second.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/demo"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
              >
                Try Live Demo
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                View Dashboard
              </Link>
            </div>
            
            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">562ms</div>
                <div className="text-gray-600 dark:text-gray-400">Response Time</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">100%</div>
                <div className="text-gray-600 dark:text-gray-400">Test Pass Rate</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">554%</div>
                <div className="text-gray-600 dark:text-gray-400">Average ROI</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* ROI Calculator Section */}
      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                See Your Potential Savings
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
                For a merchant processing 100 disputes per month, StripedShield generates an 
                additional $3,920 in monthly recovery. That&apos;s a 554% ROI on our $599 founder price.
              </p>
              <div className="space-y-4">
                <div className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-green-500 mr-3 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">68% Win Rate</h3>
                    <p className="text-gray-600 dark:text-gray-400">28% better than industry average</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-green-500 mr-3 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">CE3.0 Detection</h3>
                    <p className="text-gray-600 dark:text-gray-400">95% win rate on eligible disputes</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <CheckCircle className="h-6 w-6 text-green-500 mr-3 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Fully Automated</h3>
                    <p className="text-gray-600 dark:text-gray-400">Zero manual intervention required</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <ROICalculator />
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-24 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Why StripedShield Wins More Disputes
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Powered by GPT-5 AI and VISA CE3.0 detection
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-6">
                <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                GPT-5 AI Analysis
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Exclusive access to advanced AI that analyzes patterns and generates compelling evidence narratives.
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-6">
                <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                CE3.0 Auto-Detection
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Automatically identifies VISA CE3.0 eligible disputes with 95% win rate on qualifying transactions.
              </p>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-xl p-8 shadow-lg">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-6">
                <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Sub-Second Processing
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                562ms average response time. 150,000x faster than manual processing. Never miss a deadline.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* Pricing Section */}
      <section className="py-24 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              No percentage of recovery. No hidden fees. Just results.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Founder Plan */}
            <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-8 shadow-xl border-2 border-blue-500">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  LIMITED TIME
                </span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Founder</h3>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                $599<span className="text-lg font-normal text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Lifetime price lock for first 10 customers
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">68% win rate guarantee</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">Unlimited disputes</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">CE3.0 automation</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">Priority support</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">14-day free trial</span>
                </li>
              </ul>
              <Link
                href="/demo"
                className="block w-full text-center px-6 py-3 text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                Claim Founder Spot
              </Link>
            </div>
            
            {/* Growth Plan */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Growth</h3>
              <div className="text-4xl font-bold text-gray-900 dark:text-white mb-6">
                $1,299<span className="text-lg font-normal text-gray-600 dark:text-gray-400">/month</span>
              </div>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                For established businesses
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">Everything in Founder</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">API access</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">Custom integrations</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">Dedicated success manager</span>
                </li>
                <li className="flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
                  <span className="text-gray-700 dark:text-gray-300">SLA guarantee</span>
                </li>
              </ul>
              <button className="block w-full text-center px-6 py-3 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-white mb-6">
            Start Winning More Disputes Today
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join the first 10 founders and lock in $599/mo pricing forever.
            No setup fees. Cancel anytime.
          </p>
          <Link
            href="/demo"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-blue-600 bg-white hover:bg-gray-100 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
          >
            Start Your Free Trial
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>
    </main>
  )
}